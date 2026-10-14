export function scoreTone(score: number, max: number): "good" | "ok" | "low" {
  const pct = score / max;
  if (pct >= 0.75) return "good";
  if (pct >= 0.5) return "ok";
  return "low";
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o)}
          role="radio"
          aria-checked={o === value}
          className={o === value ? "active" : ""}
          onClick={() => onChange(o)}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${scoreTone(score, 100)}`}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring-label">
        <span className="ring-score">{score}</span>
        <span className="ring-max">/100</span>
      </div>
    </div>
  );
}
