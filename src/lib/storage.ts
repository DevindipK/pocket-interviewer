import type { Session, Setup } from "./types";

const SESSIONS_KEY = "pi.sessions";
const SETUP_KEY = "pi.lastSetup";
const MAX_SESSIONS = 30;

// Storage can throw (private mode, blocked site data); the app keeps working
// without history in that case.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const loadSessions = (): Session[] => read<Session[]>(SESSIONS_KEY, []);

export function saveSession(session: Session): void {
  write(SESSIONS_KEY, [session, ...loadSessions().filter((s) => s.id !== session.id)].slice(0, MAX_SESSIONS));
}

export function deleteSession(id: string): void {
  write(SESSIONS_KEY, loadSessions().filter((s) => s.id !== id));
}

export const loadLastSetup = (): Setup | null => read<Setup | null>(SETUP_KEY, null);
export const saveLastSetup = (setup: Setup): void => write(SETUP_KEY, setup);
