// Pocket Interviewer API: a small Cloudflare Worker that keeps the Gemini key
// off the client. It exposes three fixed tasks (transcribe, next turn, report)
// rather than a general-purpose proxy, so the key can't be reused for anything else.

export interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS: string; // comma-separated
  TEXT_MODELS: string; // comma-separated, tried in order
  AUDIO_MODELS: string; // comma-separated, tried in order
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_AUDIO_B64 = 8_000_000; // ~6 MB of WAV, a little over 3 minutes at 16 kHz
const MAX_TEXT = 12_000;
const MAX_TURNS = 40;

// Best-effort per-IP limit. Isolates are short-lived, so this only blunts bursts;
// the free Gemini quota is the real ceiling and costs nothing when hit.
const hits = new Map<string, { count: number; reset: number }>();
const LIMIT_PER_MINUTE = 30;

type Turn = { speaker: "interviewer" | "candidate"; text: string };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const cors = corsHeaders(allowed.includes(origin) ? origin : allowed[0]);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ ok: true }, 200, cors);
      if (request.method !== "POST") throw new HttpError(405, "Use POST");
      if (origin && !allowed.includes(origin)) throw new HttpError(403, "Origin not allowed");
      rateLimit(request.headers.get("CF-Connecting-IP") ?? "unknown");

      const body = await readJson(request);
      switch (url.pathname) {
        case "/api/transcribe":
          return json(await transcribe(env, body), 200, cors);
        case "/api/turn":
          return json(await nextTurn(env, body), 200, cors);
        case "/api/report":
          return json(await report(env, body), 200, cors);
        default:
          throw new HttpError(404, "Not found");
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : "Unexpected error";
      console.error(status, message);
      return json({ error: message }, status, cors);
    }
  },
};

// ---------- tasks ----------

async function transcribe(env: Env, body: Record<string, unknown>) {
  const audio = str(body.audio, MAX_AUDIO_B64, "audio");
  const text = await callGemini(env, env.AUDIO_MODELS, {
    input: [
      {
        type: "text",
        text:
          "Transcribe this spoken job-interview answer word for word. Keep filler words " +
          "(um, uh, like, you know) and repeated words exactly as spoken. Do not fix grammar. " +
          "Return only the transcript text. If there is no speech, return an empty string.",
      },
      { type: "audio", data: audio, mime_type: "audio/wav" },
    ],
  });
  return { text: text.trim() };
}

async function nextTurn(env: Env, body: Record<string, unknown>) {
  const setup = readSetup(body);
  const history = readTurns(body.history);
  const mainAsked = Number(body.mainAsked) || 0;
  const canFollowUp = body.canFollowUp === true;

  const remaining = setup.totalQuestions - mainAsked;
  const instruction =
    history.length === 0
      ? "Open the interview: greet the candidate in one short sentence, then ask main question 1."
      : remaining <= 0
        ? "All main questions are done. Briefly thank the candidate and close the interview (kind = closing)."
        : canFollowUp
          ? `Decide: if the candidate's last answer was vague, missing a result, or missing specifics, ask ONE short follow-up that digs into it (kind = followup). Otherwise briefly acknowledge it and ask main question ${mainAsked + 1} of ${setup.totalQuestions} (kind = question).`
          : `Briefly acknowledge the last answer (a few words, no praise inflation) and ask main question ${mainAsked + 1} of ${setup.totalQuestions} (kind = question).`;

  const raw = await callGemini(env, env.TEXT_MODELS, {
    system_instruction: interviewerPersona(setup),
    input: `${transcriptText(history)}\n\nYOUR NEXT MOVE: ${instruction}`,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          say: { type: "string", description: "Exactly what the interviewer says aloud. 1-3 sentences." },
          kind: { type: "string", enum: ["question", "followup", "closing"] },
        },
        required: ["say", "kind"],
      },
    },
  });
  const parsed = parseJson(raw) as { say?: string; kind?: string };
  if (!parsed.say) throw new HttpError(502, "AI returned an empty reply");
  const kind = parsed.kind === "followup" || parsed.kind === "closing" ? parsed.kind : "question";
  return { say: parsed.say, kind };
}

async function report(env: Env, body: Record<string, unknown>) {
  const setup = readSetup(body);
  const history = readTurns(body.history);
  const metrics = typeof body.metrics === "string" ? body.metrics.slice(0, 2000) : "";

  const raw = await callGemini(env, env.TEXT_MODELS, {
    system_instruction:
      "You are an experienced, fair interview coach for university co-op and new-grad candidates. " +
      "Write feedback in plain, encouraging language a non-expert can follow. Be specific: quote or " +
      "point to what the candidate actually said. Never invent experience the candidate did not mention; " +
      "in example answers, use clearly marked placeholders like [your result] where details are missing.",
    input:
      `ROLE: ${setup.role}\nINTERVIEW TYPE: ${setup.type}\nDIFFICULTY: ${setup.difficulty}\n` +
      (setup.jobPosting ? `JOB POSTING:\n${setup.jobPosting}\n` : "") +
      (metrics ? `DELIVERY METRICS (measured on device):\n${metrics}\n` : "") +
      `\nTRANSCRIPT:\n${transcriptText(history)}\n\n` +
      "Score the interview. Group each main question with its follow-up as one item. Scores: overall 0-100, " +
      "categories and per-question 0-10. Categories must be exactly: STAR Structure, Clarity, Relevance, Confidence.",
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          overallScore: { type: "integer" },
          headline: { type: "string", description: "One-sentence verdict." },
          summary: { type: "string", description: "2-3 sentences." },
          categories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                score: { type: "integer" },
                comment: { type: "string" },
              },
              required: ["name", "score", "comment"],
            },
          },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                score: { type: "integer" },
                strengths: { type: "array", items: { type: "string" } },
                improvements: { type: "array", items: { type: "string" } },
                betterAnswer: { type: "string", description: "A stronger STAR-style answer, 60-110 words." },
              },
              required: ["question", "score", "strengths", "improvements", "betterAnswer"],
            },
          },
          topTips: { type: "array", items: { type: "string" }, description: "Exactly 3 tips." },
        },
        required: ["overallScore", "headline", "summary", "categories", "questions", "topTips"],
      },
    },
  });
  return parseJson(raw);
}

// ---------- prompt helpers ----------

type Setup = { role: string; type: string; difficulty: string; totalQuestions: number; jobPosting: string };

function readSetup(body: Record<string, unknown>): Setup {
  const totalQuestions = Math.min(Math.max(Number(body.totalQuestions) || 5, 1), 10);
  return {
    role: str(body.role, 120, "role"),
    type: str(body.type, 40, "type"),
    difficulty: str(body.difficulty, 40, "difficulty"),
    totalQuestions,
    jobPosting: typeof body.jobPosting === "string" ? body.jobPosting.slice(0, 6000) : "",
  };
}

function readTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_TURNS).map((t) => {
    const turn = t as Record<string, unknown>;
    return {
      speaker: turn.speaker === "candidate" ? "candidate" : "interviewer",
      text: String(turn.text ?? "").slice(0, 3000),
    };
  });
}

function interviewerPersona(s: Setup): string {
  return (
    `You are a friendly but professional interviewer running a ${s.difficulty.toLowerCase()} ` +
    `${s.type.toLowerCase()} interview for a "${s.role}" co-op / internship position. ` +
    `The interview has ${s.totalQuestions} main questions. Speak naturally, as on a phone screen: short ` +
    "sentences, no lists, no markdown, no emojis. Ask exactly one question at a time. Do not give feedback " +
    "or scores during the interview. Behavioral questions should invite STAR answers (situation, task, " +
    "action, result). Technical questions should be answerable verbally without code." +
    (s.jobPosting ? `\n\nBase your questions on this job posting:\n${s.jobPosting}` : "")
  );
}

function transcriptText(history: Turn[]): string {
  if (history.length === 0) return "TRANSCRIPT SO FAR: (none, the interview has not started)";
  return (
    "TRANSCRIPT SO FAR:\n" +
    history.map((t) => `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`).join("\n")
  );
}

// ---------- Gemini ----------

async function callGemini(env: Env, models: string, request: Record<string, unknown>): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new HttpError(500, "Server is missing GEMINI_API_KEY");
  let lastError = "No model configured";

  // Fall through the model list so a retired or rate-limited model doesn't break the app.
  for (const model of models.split(",").map((m) => m.trim()).filter(Boolean)) {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ model, store: false, ...request }),
    });
    if (res.ok) {
      const text = extractText(await res.json());
      if (text !== null) return text;
      lastError = `${model}: response had no text`;
      continue;
    }
    const detail = (await res.text()).slice(0, 300);
    lastError = `${model}: HTTP ${res.status} ${detail}`;
    // Only retry on errors another model might not have.
    if (![400, 404, 429, 500, 503].includes(res.status)) break;
  }
  console.error(lastError);
  if (lastError.includes("429")) throw new HttpError(429, "The free AI quota is busy. Wait a minute and try again.");
  throw new HttpError(502, "The AI service failed. Please try again.");
}

// Interactions API responses carry text in steps[].content[]; older shapes are
// handled too so a response-format change degrades gracefully.
function extractText(data: unknown): string | null {
  const d = data as Record<string, any>;
  if (typeof d?.output_text === "string") return d.output_text;
  const pieces: string[] = [];
  for (const step of d?.steps ?? d?.outputs ?? []) {
    if (step?.type && step.type !== "model_output" && step.type !== "text") continue;
    if (typeof step?.text === "string") pieces.push(step.text);
    for (const c of step?.content ?? []) if (typeof c?.text === "string") pieces.push(c.text);
  }
  if (pieces.length) return pieces.join("");
  const parts = d?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => p?.text ?? "").join("");
  return null;
}

function parseJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, "AI returned malformed data. Please try again.");
  }
}

// ---------- plumbing ----------

function rateLimit(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return;
  }
  if (++entry.count > LIMIT_PER_MINUTE) throw new HttpError(429, "Too many requests. Slow down for a minute.");
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Body must be JSON");
}

function str(value: unknown, max: number, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Missing ${name}`);
  if (value.length > max) throw new HttpError(413, `${name} is too long`);
  return value;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
