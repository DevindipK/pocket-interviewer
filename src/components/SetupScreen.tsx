import { useState } from "react";
import { loadLastSetup, saveLastSetup } from "../lib/storage";
import { unlockSpeech } from "../lib/speech";
import type { Difficulty, InterviewType, Setup } from "../lib/types";
import { Segmented } from "./ui";

const ROLES = [
  "Cybersecurity Analyst",
  "Software Developer",
  "Data / AI Analyst",
  "IT Support",
  "Business Analyst",
  "QA / Test Automation",
];
const TYPES: InterviewType[] = ["Behavioral", "Technical", "Mixed"];
const DIFFICULTIES: Difficulty[] = ["Friendly", "Standard", "Tough"];
const COUNTS = [3, 5, 8] as const;

type Props = { onBack: () => void; onStart: (setup: Setup) => void };

export default function SetupScreen({ onBack, onStart }: Props) {
  const last = loadLastSetup();
  const [role, setRole] = useState(last?.role ?? ROLES[0]);
  const [type, setType] = useState<InterviewType>(last?.type ?? "Behavioral");
  const [difficulty, setDifficulty] = useState<Difficulty>(last?.difficulty ?? "Standard");
  const [count, setCount] = useState<number>(last?.totalQuestions ?? 5);
  const [jobPosting, setJobPosting] = useState(last?.jobPosting ?? "");
  const [showPosting, setShowPosting] = useState(Boolean(last?.jobPosting));
  const custom = !ROLES.includes(role);

  const start = () => {
    const setup: Setup = { role: role.trim() || "Software Developer", type, difficulty, totalQuestions: count, jobPosting: jobPosting.trim() };
    saveLastSetup(setup);
    unlockSpeech(); // must happen inside this tap for iPhone to allow speech later
    onStart(setup);
  };

  return (
    <main className="page">
      <nav className="topbar">
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
        <span className="topbar-title">New interview</span>
        <span />
      </nav>

      <section className="field">
        <label className="field-label">Role</label>
        <div className="chips">
          {ROLES.map((r) => (
            <button key={r} className={`chip ${role === r ? "active" : ""}`} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
          <button className={`chip ${custom ? "active" : ""}`} onClick={() => setRole(custom ? role : "")}>
            Other…
          </button>
        </div>
        {custom && (
          <input
            className="input"
            placeholder="e.g. Cloud Engineer Intern"
            value={role}
            maxLength={80}
            autoFocus
            onChange={(e) => setRole(e.target.value)}
          />
        )}
      </section>

      <section className="field">
        <label className="field-label">Interview type</label>
        <Segmented options={TYPES} value={type} onChange={setType} label="Interview type" />
      </section>

      <section className="field">
        <label className="field-label">Interviewer</label>
        <Segmented options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} label="Difficulty" />
      </section>

      <section className="field">
        <label className="field-label">Questions</label>
        <Segmented options={COUNTS} value={count as (typeof COUNTS)[number]} onChange={setCount} label="Number of questions" format={(n) => `${n} · ~${n * 2} min`} />
      </section>

      <section className="field">
        {!showPosting ? (
          <button className="link" onClick={() => setShowPosting(true)}>
            + Paste a real job posting (optional)
          </button>
        ) : (
          <>
            <label className="field-label" htmlFor="posting">
              Job posting <span className="muted">(questions will be based on it)</span>
            </label>
            <textarea
              id="posting"
              className="input"
              rows={6}
              maxLength={6000}
              placeholder="Paste the job description here"
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
            />
          </>
        )}
      </section>

      <div className="sticky-cta">
        <button className="btn primary big" onClick={start} disabled={!role.trim()}>
          Start interview
        </button>
        <p className="muted small center">Find a quiet spot. The interviewer will speak, so turn your volume up.</p>
      </div>
    </main>
  );
}
