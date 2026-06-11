// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSession, loadSession, clearSession } from '../../../pwa/src/lib/session.js';
import type { PairedSession } from '../../../pwa/src/lib/types.js';

// jsdom in this project setup does not expose functional localStorage.
// Provide an in-memory Storage implementation for session tests.
function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
}

const BASE_SESSION: PairedSession = {
  host: '192.168.1.10',
  port: 5300,
  token: 'tok-test-abc',
  display_name: 'LX Op',
  device_id: 'dev-001',
  paired_at: 1_700_000_000_000,
  role: 'operator',
  show_id: 'show-xyz',
  owned_departments: ['LX'],
  watched_departments: ['SND'],
};

describe('session.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadSession returns null when nothing stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('saveSession + loadSession round-trips the full PairedSession', () => {
    saveSession(BASE_SESSION);
    const loaded = loadSession();
    expect(loaded).toEqual(BASE_SESSION);
  });

  it('clearSession removes the stored session', () => {
    saveSession(BASE_SESSION);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('saveSession overwrites an existing session', () => {
    saveSession(BASE_SESSION);
    const updated: PairedSession = { ...BASE_SESSION, display_name: 'SND Op', show_id: 'show-2' };
    saveSession(updated);
    const loaded = loadSession();
    expect(loaded?.display_name).toBe('SND Op');
    expect(loaded?.show_id).toBe('show-2');
  });

  it('loadSession returns null when stored value is corrupt JSON', () => {
    localStorage.setItem('showx_session_v1', '{not valid json{{');
    expect(loadSession()).toBeNull();
  });

  it('uses key showx_session_v1', () => {
    saveSession(BASE_SESSION);
    expect(localStorage.getItem('showx_session_v1')).not.toBeNull();
  });
});
