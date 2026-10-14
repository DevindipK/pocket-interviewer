import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getReport, isDemo, nextTurn, transcribe } from "../lib/api";
import { describeDelivery, measureDelivery } from "../lib/metrics";
import { WavRecorder } from "../lib/recorder";
import { speak, stopSpeaking } from "../lib/speech";
import { saveSession } from "../lib/storage";
import type { Session, Setup, Turn } from "../lib/types";
import { MicGlyph } from "./Home";

const MAX_ANSWER_SEC = 180;

type Phase = "thinking" | "speaking" | "ready" | "recording" | "transcribing" | "reporting" | "error";

type Props = { setup: Setup; onQuit: () => void; onFinish: (s: Session) => void };

export default function InterviewScreen({ setup, onQuit, onFinish }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [error, setError] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  // Refs mirror state that async steps read, so they never see stale values.
  const turnsRef = useRef<Turn[]>([]);
  const mainAsked = useRef(0);
  const followUpUsed = useRef(false);
  const voiceRef = useRef(true);
  const retry = useRef<() => void>(() => {});
  const recorder = useRef<WavRecorder | null>(null);
  const started = useRef(false);
  const finishing = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = (turn: Turn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  };

  const fail = (err: unknown, again: () => void) => {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    retry.current = again;
    setPhase("error");
  };

  // The report request starts immediately; the closing line (if any) plays at
  // the same time instead of blocking it.
  const finish = useCallback(async (closingLine?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    setPhase("reporting");
    const speech = closingLine && voiceRef.current ? speak(closingLine) : (stopSpeaking(), Promise.resolve());
    const history = turnsRef.current;
    const delivery = measureDelivery(history);
    try {
      const report = await getReport(setup, history, describeDelivery(delivery));
      await speech;
      const session: Session = {
        id: crypto.randomUUID?.() ?? String(Date.now()),
        date: new Date().toISOString(),
        setup,
        turns: history,
        report,
        delivery,
        demo: isDemo,
      };
      saveSession(session);
      onFinish(session);
    } catch (err) {
      finishing.current = false;
      fail(err, () => void finish());
    }
  }, [setup, onFinish]);

  const askNext = useCallback(async () => {
    setPhase("thinking");
    const history = turnsRef.current;
    const last = history[history.length - 1];
    // One follow-up per main question, never after the closing.
    const canFollowUp = last?.speaker === "candidate" && !followUpUsed.current;
    const allAsked = mainAsked.current >= setup.totalQuestions;
    try {
      const reply = await nextTurn(setup, history, mainAsked.current, canFollowUp);
      let kind = reply.kind;
      if (allAsked) kind = "closing";
      else if (kind === "followup" && !canFollowUp) kind = "question";
      else if (kind === "closing") kind = "question"; // model ended early; keep going

      if (kind === "question") {
        mainAsked.current += 1;
        followUpUsed.current = false;
      } else if (kind === "followup") {
        followUpUsed.current = true;
      }
      push({ speaker: "interviewer", text: reply.say, kind });

      if (kind === "closing") {
        void finish(reply.say);
        return;
      }
      if (voiceRef.current) {
        setPhase("speaking");
        await speak(reply.say);
      }
      // The user may have tapped the mic mid-question; don't clobber that.
      setPhase((p) => (p === "speaking" ? "ready" : p));
    } catch (err) {
      fail(err, () => void askNext());
    }
  }, [setup, finish]);

  const submitAnswer = useCallback(
    (text: string, spoken: boolean, durationSec?: number) => {
      push({ speaker: "candidate", text, spoken, durationSec });
      void askNext();
    },
    [askNext],
  );

  // Kick off once (StrictMode mounts twice in development).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void askNext();
  }, [askNext]);

  useEffect(
    () => () => {
      stopSpeaking();
      recorder.current?.cancel();
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, phase]);

  // Recording timer + auto-stop.
  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(sec);
      if (sec >= MAX_ANSWER_SEC) void stopRecording();
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startRecording = async () => {
    stopSpeaking();
    const rec = new WavRecorder();
    rec.onLevel = (l) => setLevel(l);
    try {
      await rec.start();
    } catch {
      setError("Microphone access was blocked. Allow it in Settings, or type your answer instead.");
      retry.current = () => setPhase("ready");
      setPhase("error");
      return;
    }
    recorder.current = rec;
    setElapsed(0);
    setPhase("recording");
  };

  const stopRecording = async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setPhase("transcribing");
    const { base64, durationSec } = await rec.stop();
    if (durationSec < 1.5) {
      setError("That was very short. Tap the mic, answer, then tap again to finish.");
      retry.current = () => setPhase("ready");
      setPhase("error");
      return;
    }
    const send = async () => {
      setPhase("transcribing");
      try {
        const text = await transcribe(base64);
        if (!text) {
          setError("I couldn't hear anything. Check your mic and try again.");
          retry.current = () => setPhase("ready");
          setPhase("error");
          return;
        }
        submitAnswer(text, true, durationSec);
      } catch (err) {
        fail(err, () => void send());
      }
    };
    await send();
  };

  const sendTyped = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    submitAnswer(text, false);
  };

  const replay = () => {
    const lastQ = [...turnsRef.current].reverse().find((t) => t.speaker === "interviewer");
    if (lastQ) void speak(lastQ.text);
  };

  const candidateAnswers = turns.filter((t) => t.speaker === "candidate").length;
  const progress = Math.min(mainAsked.current, setup.totalQuestions);

  return (
    <main className="page interview">
      <nav className="topbar">
        <button
          className="link"
          onClick={() => {
            if (candidateAnswers === 0 || confirm("Leave this interview? Your answers so far won't be saved.")) {
              stopSpeaking();
              recorder.current?.cancel();
              onQuit();
            }
          }}
        >
          ‹ Quit
        </button>
        <span className="topbar-title">
          Question {Math.max(progress, 1)} of {setup.totalQuestions}
        </span>
        <button
          className="link"
          aria-pressed={!voiceOn}
          onClick={() => {
            voiceRef.current = !voiceOn;
            setVoiceOn(!voiceOn);
            if (voiceOn) stopSpeaking();
          }}
        >
          {voiceOn ? "Mute" : "Unmute"}
        </button>
      </nav>
      <div className="progress" aria-hidden>
        <div style={{ width: `${(progress / setup.totalQuestions) * 100}%` }} />
      </div>

      <div className="chat" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.speaker}`}>
            {t.speaker === "interviewer" && t.kind === "followup" && <span className="tag">Follow-up</span>}
            {t.text}
            {t.spoken && t.durationSec ? <span className="bubble-meta">{Math.round(t.durationSec)}s · spoken</span> : null}
          </div>
        ))}
        {(phase === "thinking" || phase === "transcribing") && (
          <div className={`bubble ${phase === "thinking" ? "interviewer" : "candidate"} typing`} aria-label="Working">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="dock">
        {phase === "error" && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button className="btn" onClick={() => retry.current()}>
              Try again
            </button>
          </div>
        )}

        {phase === "reporting" && (
          <div className="reporting">
            <div className="spinner" aria-hidden />
            <p>Writing your feedback report…</p>
          </div>
        )}

        {(phase === "ready" || phase === "speaking" || phase === "recording" || phase === "transcribing" || phase === "thinking") &&
          (typing ? (
            <div className="type-box">
              <textarea
                className="input"
                rows={3}
                placeholder="Type your answer…"
                value={draft}
                maxLength={3000}
                disabled={phase !== "ready" && phase !== "speaking"}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="row-between">
                <button className="link" onClick={() => setTyping(false)}>
                  Use voice
                </button>
                <button className="btn primary" disabled={!draft.trim() || (phase !== "ready" && phase !== "speaking")} onClick={sendTyped}>
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="mic-area">
              <button
                className={`mic ${phase === "recording" ? "live" : ""}`}
                style={{ ["--level" as string]: level }}
                disabled={phase !== "ready" && phase !== "speaking" && phase !== "recording"}
                aria-label={phase === "recording" ? "Stop and send answer" : "Start answering"}
                onClick={() => (phase === "recording" ? void stopRecording() : void startRecording())}
              >
                {phase === "recording" ? <span className="stop-square" /> : <MicGlyph />}
              </button>
              <p className="mic-hint">
                {phase === "recording"
                  ? `Listening… ${elapsed}s · tap to finish`
                  : phase === "speaking"
                    ? "Interviewer is speaking. Tap the mic to answer."
                    : phase === "ready"
                      ? "Tap the mic and answer out loud"
                      : phase === "transcribing"
                        ? "Getting your words down…"
                        : "Interviewer is thinking…"}
              </p>
              <div className="mic-actions">
                <button className="link" onClick={replay} disabled={phase === "recording"}>
                  Repeat question
                </button>
                <button className="link" onClick={() => setTyping(true)} disabled={phase === "recording"}>
                  Type instead
                </button>
                {candidateAnswers > 0 && (
                  <button className="link" onClick={() => void finish()} disabled={phase === "recording" || phase === "transcribing" || phase === "thinking"}>
                    End & get report
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </main>
  );
}
