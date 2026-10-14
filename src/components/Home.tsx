import { useEffect, useState } from "react";
import { isDemo } from "../lib/api";
import { deleteSession, loadSessions } from "../lib/storage";
import { englishVoices, saveVoiceName, savedVoiceName, speak, speechSupported } from "../lib/speech";
import type { Session } from "../lib/types";
import { scoreTone } from "./ui";

type Props = { onStart: () => void; onOpen: (s: Session) => void };

export default function Home({ onStart, onOpen }: Props) {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [showSettings, setShowSettings] = useState(false);

  const best = sessions.length ? Math.max(...sessions.map((s) => s.report.overallScore)) : null;
  const recent = sessions.slice(0, 5).map((s) => s.report.overallScore).reverse();

  return (
    <main className="page">
      <header className="home-hero">
        <div className="app-mark" aria-hidden>
          <MicGlyph />
        </div>
        <h1>Pocket Interviewer</h1>
        <p className="lede">Practice a real interview out loud. Get an honest feedback report in minutes.</p>
        <button className="btn primary big" onClick={onStart}>
          Start a mock interview
        </button>
        {isDemo && (
          <p className="note">Demo mode: sample questions and a sample report. Connect the AI server for real feedback.</p>
        )}
      </header>

      <InstallHint />

      {sessions.length > 0 && (
        <section className="card">
          <div className="row-between">
            <h2>Your progress</h2>
            <span className="muted small">{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span>
          </div>
          <div className="stats">
            <div>
              <span className="stat-value">{best}</span>
              <span className="stat-label">Best score</span>
            </div>
            <div>
              <span className="stat-value">{sessions[0].report.overallScore}</span>
              <span className="stat-label">Last score</span>
            </div>
            <Sparkline values={recent} />
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section>
          <h2 className="section-title">Past interviews</h2>
          <ul className="history">
            {sessions.map((s) => (
              <li key={s.id}>
                <button className="history-item" onClick={() => onOpen(s)}>
                  <span className={`score-pill ${scoreTone(s.report.overallScore, 100)}`}>{s.report.overallScore}</span>
                  <span className="history-text">
                    <strong>{s.setup.role}</strong>
                    <span className="muted small">
                      {s.setup.type} · {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {s.demo ? " · demo" : ""}
                    </span>
                  </span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </button>
                <button
                  className="icon-btn subtle"
                  aria-label={`Delete ${s.setup.role} interview`}
                  onClick={() => {
                    deleteSession(s.id);
                    setSessions(loadSessions());
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessions.length === 0 && (
        <section className="card how">
          <h2>How it works</h2>
          <ol>
            <li>Pick a role, or paste a real job posting.</li>
            <li>The interviewer asks questions out loud. Answer by talking (or typing).</li>
            <li>It asks follow-ups when your answer is vague, like a real interviewer.</li>
            <li>Get a report: STAR structure, clarity, filler words, pace, and stronger example answers.</li>
          </ol>
        </section>
      )}

      {speechSupported() && (
        <section className="settings">
          <button className="link" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Hide" : "Interviewer voice"} settings
          </button>
          {showSettings && <VoicePicker />}
        </section>
      )}

      <footer className="footer muted small">
        Answers are sent to Google Gemini for transcription and feedback and may be used to improve Google's AI. Don't
        share private information. Your history stays on this device.
      </footer>
    </main>
  );
}

function VoicePicker() {
  const [voices, setVoices] = useState(englishVoices);
  const [selected, setSelected] = useState(savedVoiceName() ?? voices[0]?.name ?? "");

  // Voices load asynchronously on most browsers.
  useEffect(() => {
    const update = () => setVoices(englishVoices());
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  return (
    <div className="voice-picker">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          saveVoiceName(e.target.value);
        }}
      >
        {voices.map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      <button className="btn" onClick={() => void speak("Hi! Tell me about yourself.")}>
        Test
      </button>
      <p className="muted small">On iPhone, better voices can be downloaded in Settings › Accessibility › Spoken Content › Voices.</p>
    </div>
  );
}

function InstallHint() {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pi.installHint") === "1";
    } catch {
      return false;
    }
  });
  if (!isIos || standalone || dismissed) return null;
  return (
    <div className="install-hint">
      <span>
        Install on your iPhone: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
      </span>
      <button
        className="icon-btn subtle"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("pi.installHint", "1");
          } catch {
            /* ignore */
          }
        }}
      >
        ×
      </button>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="spark-empty muted small">Do 2+ interviews to see your trend</div>;
  const w = 120;
  const h = 40;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * (h - 6) - 3}`)
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Recent scores: ${values.join(", ")}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
