import type { Delivery, Turn } from "./types";

// Multi-word fillers first so "you know" isn't also counted as nothing.
const FILLERS = ["you know", "i mean", "kind of", "sort of", "um", "uh", "erm", "hmm", "like", "basically", "actually", "literally"];

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function countFillers(text: string): Map<string, number> {
  let rest = ` ${text.toLowerCase().replace(/[^a-z' ]+/g, " ")} `;
  const counts = new Map<string, number>();
  for (const filler of FILLERS) {
    const pattern = new RegExp(` ${filler}(?= )`, "g");
    const n = rest.match(pattern)?.length ?? 0;
    if (n) {
      counts.set(filler, n);
      rest = rest.replace(pattern, " ");
    }
  }
  return counts;
}

export function measureDelivery(turns: Turn[]): Delivery {
  const spoken = turns.filter((t) => t.speaker === "candidate" && t.spoken && t.durationSec);
  const words = spoken.reduce((sum, t) => sum + countWords(t.text), 0);
  const seconds = spoken.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

  const totals = new Map<string, number>();
  for (const t of spoken) {
    for (const [word, n] of countFillers(t.text)) totals.set(word, (totals.get(word) ?? 0) + n);
  }
  const fillerCount = [...totals.values()].reduce((a, b) => a + b, 0);

  return {
    spokenAnswers: spoken.length,
    words,
    avgWpm: seconds > 5 ? Math.round(words / (seconds / 60)) : null,
    fillerCount,
    fillersPer100: words > 0 ? Math.round((fillerCount / words) * 1000) / 10 : null,
    topFillers: [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word, count]) => ({ word, count })),
  };
}

export function describeDelivery(d: Delivery): string {
  if (!d.spokenAnswers) return "All answers were typed, so there is no speaking data.";
  const parts = [`${d.spokenAnswers} spoken answers, ${d.words} words in total.`];
  if (d.avgWpm) parts.push(`Average pace ${d.avgWpm} words per minute (comfortable range is about 120-160).`);
  parts.push(`${d.fillerCount} filler words (${d.fillersPer100 ?? 0} per 100 words).`);
  if (d.topFillers.length) parts.push(`Most used: ${d.topFillers.map((f) => `"${f.word}" x${f.count}`).join(", ")}.`);
  return parts.join(" ");
}

export function paceLabel(wpm: number | null): string {
  if (wpm === null) return "—";
  if (wpm < 110) return "A bit slow";
  if (wpm > 170) return "A bit fast";
  return "Good pace";
}
