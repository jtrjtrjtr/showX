// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { saveSession, loadSession, listSessions, clearSession } from '../../../pwa/src/lib/auth.js';
import type { PairedSession } from '../../../pwa/src/lib/types.js';

const s1: PairedSession = {
  host: '192.168.1.10',
  port: 8088,
  token: 'tok-abc',
  display_name: 'LX Op',
  device_id: 'dev-1',
  paired_at: 1000,
};

const s2: PairedSession = {
  host: '10.0.0.5',
  port: 8088,
  token: 'tok-def',
  display_name: 'SM',
  device_id: 'dev-2',
  paired_at: 2000,
};

describe('auth', () => {
  it('saveSession + loadSession round-trip', async () => {
    await saveSession(s1);
    const loaded = await loadSession(s1.host);
    expect(loaded).toEqual(s1);
  });

  it('loadSession for unknown host returns null', async () => {
    const result = await loadSession('999.999.999.999');
    expect(result).toBeNull();
  });

  it('listSessions returns all saved sessions', async () => {
    await saveSession(s1);
    await saveSession(s2);
    const sessions = await listSessions();
    const hosts = sessions.map((s) => s.host);
    expect(hosts).toContain(s1.host);
    expect(hosts).toContain(s2.host);
  });

  it('clearSession removes one session', async () => {
    await saveSession(s1);
    await saveSession(s2);
    await clearSession(s1.host);
    const after = await loadSession(s1.host);
    expect(after).toBeNull();
    const s2after = await loadSession(s2.host);
    expect(s2after).toEqual(s2);
  });
});
