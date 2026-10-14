// Interviewer voice via the device's built-in speech engine (free, offline).

const VOICE_KEY = "pi.voice";
// If speech hasn't started by then, iOS has silently refused it; carry on without it.
const START_TIMEOUT_MS = 2000;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}

// Prefer the higher-quality voices iOS and desktop browsers ship.
function rank(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  let score = 0;
  if (/premium|enhanced|natural|neural/.test(name)) score += 3;
  if (/samantha|ava|zoe|evan|nathan|google us english/.test(name)) score += 2;
  if (v.lang === "en-US" || v.lang === "en-CA") score += 1;
  return score;
}

export function savedVoiceName(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceName(name: string): void {
  try {
    localStorage.setItem(VOICE_KEY, name);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}

/**
 * Speaks text and resolves when done. Never hangs: iOS Safari sometimes drops
 * an utterance without firing any event, so this also resolves if speech never
 * starts, or runs well past its expected length.
 */
export function speak(text: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve();

    let settled = false;
    const timers: number[] = [];
    const done = () => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      resolve();
    };

    // cancel() immediately followed by speak() can swallow the new utterance on
    // iOS, so only cancel when something is actually queued.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = englishVoices();
    const wanted = savedVoiceName();
    utterance.voice = voices.find((v) => v.name === wanted) ?? voices[0] ?? null;
    utterance.rate = rate;
    utterance.onend = done;
    utterance.onerror = done;

    const words = text.split(/\s+/).length;
    const expectedMs = (words / (2.6 * rate)) * 1000;
    utterance.onstart = () => {
      timers.push(window.setTimeout(done, expectedMs * 1.6 + 2000));
    };
    timers.push(
      window.setTimeout(() => {
        if (!speechSynthesis.speaking) done();
      }, START_TIMEOUT_MS),
    );
    // Absolute cap in case onstart never fires but speaking stays true.
    timers.push(window.setTimeout(done, expectedMs * 2 + 4000));

    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (speechSupported()) speechSynthesis.cancel();
}

// iOS only allows speech that starts from a tap. Speaking an empty utterance
// inside the "Start" tap unlocks it for the rest of the session.
export function unlockSpeech(): void {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}
