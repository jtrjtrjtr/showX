// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
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
  it('saveSession + loadSession round-trip returns plaintext token', async () => {
    await saveSession(s1);
    const loaded = await loadSession(s1.host);
    expect(loaded).toEqual(s1);
  });

  it('stored token is encrypted — raw IDB bytes are not plaintext', async () => {
    await saveSession(s1);
    const raw = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = indexedDB.open('showx-auth', 2);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('tokens')) db.createObjectStore('tokens');
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('tokens', 'readonly');
        const r = tx.objectStore('tokens').get(s1.host);
        r.onsuccess = () => resolve(r.result as Record<string, unknown>);
        r.onerror = () => reject(r.error);
      };
      req.onerror = () => reject(req.error);
    });
    // Stored object must NOT have a plaintext 'token' field
    expect(raw).not.toHaveProperty('token');
    // Must have iv + cipher fields
    expect(raw).toHaveProperty('token_iv');
    expect(raw).toHaveProperty('token_cipher');
    // Cipher bytes must differ from the plaintext token string
    expect(raw['token_cipher']).not.toBe(s1.token);
  });

  it('loadSession for unknown host returns null', async () => {
    const result = await loadSession('999.999.999.999');
    expect(result).toBeNull();
  });

  it('listSessions returns all saved sessions with plaintext tokens', async () => {
    await saveSession(s1);
    await saveSession(s2);
    const sessions = await listSessions();
    const hosts = sessions.map((s) => s.host);
    expect(hosts).toContain(s1.host);
    expect(hosts).toContain(s2.host);
    const found1 = sessions.find((s) => s.host === s1.host);
    expect(found1?.token).toBe(s1.token);
  });

  it('clearSession removes one session', async () => {
    await saveSession(s1);
    await saveSession(s2);
    await clearSession(s1.host);
    const after = await loadSession(s1.host);
    expect(after).toBeNull();
    const s2after = await loadSession(s2.host);
    expect(s2after?.token).toBe(s2.token);
  });
});
