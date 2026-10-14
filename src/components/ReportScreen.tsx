import { useState } from "react";
import { paceLabel } from "../lib/metrics";
import type { Session } from "../lib/types";
import { ScoreRing, scoreTone } from "./ui";

type Props = { session: Session; fresh: boolean; onHome: () => void; onAgain: () => void };

export default function ReportScreen({ session, fresh, onHome, onAgain }: Props) {
  const { report, delivery, setup, turns } = session;
  const [open, setOpen] = useState<number | null>(0);
  const [showTranscript, setShowTranscript] = useState(false);

  const share = async () => {
    const text =
      `My Pocket Interviewer score: ${report.overallScore}/100 for a ${setup.type.toLowerCase()} ${setup.role} interview.\n` +
      `${report.headline}\n\nTop tips:\n${report.topTips.map((t) => `• ${t}`).join("\n")}`;
    try {
      if (navigator.share) await navigator.share({ title: "Interview feedback", text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user cancelled the share sheet */
    }
  };

  return (
    <main className="page report">
      <nav className="topbar">
        <button className="link" onClick={onHome}>
          ‹ Home
        </button>
        <span className="topbar-title">Feedback report</span>
        <button className="link" onClick={() => void share()}>
          Share
        </button>
      </nav>

      <header className="report-hero">
        <ScoreRing score={report.overallScore} />
        <div>
          <p className="muted small">
            {setup.role} · {setup.type} · {new Date(session.date).toLocaleDateString()}
            {session.demo ? " · demo" : ""}
          </p>
          <h1 className="headline">{report.headline}</h1>
        </div>
      </header>
      <p className="summary">{report.summary}</p>

      <section className="card">
        <h2>Scores</h2>
        <ul className="bars">
          {report.categories.map((c) => (
            <li key={c.name}>
              <div className="row-between">
                <strong>{c.name}</strong>
                <span className={`score-text ${scoreTone(c.score, 10)}`}>{c.score}/10</span>
              </div>
              <div className="bar">
                <div className={scoreTone(c.score, 10)} style={{ width: `${c.score * 10}%` }} />
              </div>
              <p className="muted small">{c.comment}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>How you sounded</h2>
        {delivery.spokenAnswers === 0 ? (
          <p className="muted">You typed every answer, so there's no speaking data. Try answering out loud next time.</p>
        ) : (
          <div className="stats three">
            <div>
              <span className="stat-value">{delivery.avgWpm ?? "—"}</span>
              <span className="stat-label">words / min</span>
              <span className="stat-sub">{paceLabel(delivery.avgWpm)}</span>
            </div>
            <div>
              <span className="stat-value">{delivery.fillerCount}</span>
              <span className="stat-label">filler words</span>
              <span className="stat-sub">{delivery.fillersPer100 ?? 0} per 100 words</span>
            </div>
            <div>
              <span className="stat-value">{delivery.words}</span>
              <span className="stat-label">words spoken</span>
              <span className="stat-sub">{delivery.spokenAnswers} answers</span>
            </div>
          </div>
        )}
        {delivery.topFillers.length > 0 && (
          <p className="muted small">
            Most used: {delivery.topFillers.map((f) => `"${f.word}" ×${f.count}`).join(", ")}
          </p>
        )}
      </section>

      <section className="card tips">
        <h2>Top 3 things to work on</h2>
        <ol>
          {report.topTips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title">Question by question</h2>
        {report.questions.map((q, i) => (
          <div key={i} className={`qcard ${open === i ? "open" : ""}`}>
            <button className="qhead" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className={`score-pill ${scoreTone(q.score, 10)}`}>{q.score}</span>
              <span className="qtitle">{q.question}</span>
              <span className="chev" aria-hidden>
                {open === i ? "−" : "+"}
              </span>
            </button>
            {open === i && (
              <div className="qbody">
                {q.strengths.length > 0 && (
                  <>
                    <h3 className="good-text">What worked</h3>
                    <ul>
                      {q.strengths.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {q.improvements.length > 0 && (
                  <>
                    <h3 className="ok-text">To improve</h3>
                    <ul>
                      {q.improvements.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                <h3>A stronger answer</h3>
                <blockquote>{q.betterAnswer}</blockquote>
              </div>
            )}
          </div>
        ))}
      </section>

      <section>
        <button className="link" onClick={() => setShowTranscript((v) => !v)}>
          {showTranscript ? "Hide" : "Show"} full transcript
        </button>
        {showTranscript && (
          <div className="transcript">
            {turns.map((t, i) => (
              <p key={i}>
                <strong>{t.speaker === "interviewer" ? "Interviewer" : "You"}:</strong> {t.text}
              </p>
            ))}
          </div>
        )}
      </section>

      <div className="sticky-cta">
        <button className="btn primary big" onClick={onAgain}>
          {fresh ? "Practice again" : "Retry this interview"}
        </button>
      </div>
    </main>
  );
}
