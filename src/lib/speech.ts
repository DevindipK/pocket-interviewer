// Interviewer voice via the device's built-in speech engine (free, offline).

const VOICE_KEY = "pi.voice";

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

export function speak(text: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = englishVoices();
    const wanted = savedVoiceName();
    utterance.voice = voices.find((v) => v.name === wanted) ?? voices[0] ?? null;
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    // iOS sometimes never fires onend; don't let that freeze the interview.
    setTimeout(resolve, 2000 + text.length * 90);
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
