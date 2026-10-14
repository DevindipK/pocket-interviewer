import type { Report, Setup, Turn } from "./types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

// With no API configured the app runs on canned data, so the whole flow can be
// tried (and developed) without a Gemini key.
export const isDemo = !API_URL;

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(data.error ?? `Server error (${res.status})`);
  return data;
}

const plainTurns = (turns: Turn[]) => turns.map(({ speaker, text }) => ({ speaker, text }));

export async function transcribe(base64Wav: string): Promise<string> {
  if (isDemo) {
    await wait(700);
    return DEMO_ANSWER;
  }
  return (await post<{ text: string }>("/api/transcribe", { audio: base64Wav })).text;
}

export type NextTurn = { say: string; kind: "question" | "followup" | "closing" };

export async function nextTurn(
  setup: Setup,
  history: Turn[],
  mainAsked: number,
  canFollowUp: boolean,
): Promise<NextTurn> {
  if (isDemo) return demoTurn(setup, history, mainAsked, canFollowUp);
  return post<NextTurn>("/api/turn", { ...setup, history: plainTurns(history), mainAsked, canFollowUp });
}

export async function getReport(setup: Setup, history: Turn[], metrics: string): Promise<Report> {
  if (isDemo) {
    await wait(1200);
    return demoReport(history);
  }
  const report = await post<Report>("/api/report", { ...setup, history: plainTurns(history), metrics });
  return normalizeReport(report);
}

// Clamp and fill anything the model left out so the report screen never breaks.
function normalizeReport(r: Partial<Report>): Report {
  const clamp = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  return {
    overallScore: clamp(r.overallScore, 100),
    headline: r.headline ?? "",
    summary: r.summary ?? "",
    categories: (r.categories ?? []).map((c) => ({ ...c, score: clamp(c.score, 10) })),
    questions: (r.questions ?? []).map((q) => ({
      ...q,
      score: clamp(q.score, 10),
      strengths: q.strengths ?? [],
      improvements: q.improvements ?? [],
    })),
    topTips: r.topTips ?? [],
  };
}

// ---------- demo data ----------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_ANSWER =
  "Um, so at my internship I noticed we were testing a lot of web endpoints by hand, like every release. " +
  "I wrote Python scripts with Burp Suite to automate the checks, and it cut our manual testing time by about ten percent.";

const DEMO_QUESTIONS: Record<string, string[]> = {
  Behavioral: [
    "Tell me about a time you found a better way to do a repetitive task.",
    "Describe a situation where you had to learn a new tool quickly.",
    "Tell me about a time you disagreed with a teammate. How did you handle it?",
    "Give me an example of a mistake you made and what you learned from it.",
    "Tell me about a project you're proud of and your specific role in it.",
  ],
  Technical: [
    "How would you explain the difference between authentication and authorization?",
    "Walk me through what happens when you type a URL into a browser.",
    "How would you find out why a web page is loading slowly?",
    "What is SQL injection, and how do you prevent it?",
    "How do you decide what to test first in a new feature?",
  ],
};

async function demoTurn(setup: Setup, history: Turn[], mainAsked: number, canFollowUp: boolean): Promise<NextTurn> {
  await wait(600);
  if (history.length === 0) {
    return { say: `Hi, thanks for joining. Let's get started. ${pickQuestion(setup, 0)}`, kind: "question" };
  }
  if (mainAsked >= setup.totalQuestions) {
    return { say: "That's all my questions. Thanks for your time today, I'll put your feedback together now.", kind: "closing" };
  }
  if (canFollowUp && mainAsked === 1) {
    return { say: "You mentioned a ten percent improvement. How did you measure that?", kind: "followup" };
  }
  return { say: `Thanks. Next question. ${pickQuestion(setup, mainAsked)}`, kind: "question" };
}

function pickQuestion(setup: Setup, index: number): string {
  const pool =
    setup.type === "Mixed"
      ? DEMO_QUESTIONS.Behavioral.flatMap((q, i) => [q, DEMO_QUESTIONS.Technical[i]])
      : DEMO_QUESTIONS[setup.type];
  return pool[index % pool.length];
}

function demoReport(history: Turn[]): Report {
  const asked = history.filter((t) => t.speaker === "interviewer" && t.kind === "question").map((t) => t.text);
  return {
    overallScore: 72,
    headline: "Solid examples with real numbers. Tighten the endings so the result lands.",
    summary:
      "You picked relevant examples and backed them with a measurable result, which interviewers love. " +
      "Your answers started slowly with filler words and sometimes skipped what you personally did versus the team.",
    categories: [
      { name: "STAR Structure", score: 7, comment: "Situation and result are clear; the Action step needs more detail." },
      { name: "Clarity", score: 7, comment: "Easy to follow, but a few long sentences ran together." },
      { name: "Relevance", score: 8, comment: "Examples matched the role well." },
      { name: "Confidence", score: 6, comment: "Frequent 'um' and 'like' at the start of answers." },
    ],
    questions: asked.map((question, i) => ({
      question: question.replace(/^(Hi, thanks for joining\. Let's get started\.|Thanks\. Next question\.)\s*/, ""),
      score: [8, 7, 6, 7, 7][i % 5],
      strengths: ["Used a concrete number (10%) to show impact.", "Example is relevant to the role."],
      improvements: ["Say what YOU did step by step before the result.", "Drop the 'um, so' opener and start with the situation."],
      betterAnswer:
        "At my internship, our team tested over 22 web endpoints by hand every release, which slowed us down (Situation). " +
        "I was asked to help speed this up (Task). I wrote Python scripts that ran our Burp Suite checks automatically and " +
        "documented how to use them (Action). That cut manual testing time by about 10%, and the team kept using the scripts (Result).",
    })),
    topTips: [
      "Pause for one second instead of saying 'um' before you start.",
      "Name your own actions with 'I', not 'we'.",
      "End every answer with the result and what it meant for the team.",
    ],
  };
}
