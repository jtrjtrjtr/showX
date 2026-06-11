import type { PairedSession } from './types.js';

const SESSION_KEY = 'showx_session_v1';

export function saveSession(s: PairedSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function loadSession(): PairedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PairedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
