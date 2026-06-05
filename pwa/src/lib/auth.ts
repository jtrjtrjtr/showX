import type { PairedSession } from './types.js';

const DB_NAME = 'showx-auth';
const STORE = 'tokens';
const KEYS_STORE = 'keys';
const VERSION = 2;

// Stored shape in IDB — token replaced by encrypted iv+cipher pair
interface StoredSession {
  host: string;
  port: number;
  display_name: string;
  device_id: string;
  paired_at: number;
  token_iv: string;    // base64-encoded 12-byte AES-GCM IV
  token_cipher: string; // base64-encoded AES-GCM ciphertext
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(KEYS_STORE)) db.createObjectStore(KEYS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function unb64(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const db = await openDb();
  const jwkStr = await idbGet<string>(db, KEYS_STORE, '__device_key__');
  if (jwkStr) {
    const jwk = JSON.parse(jwkStr) as JsonWebKey;
    return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('jwk', key);
  await idbPut(db, KEYS_STORE, JSON.stringify(exported), '__device_key__');
  return key;
}

async function encryptToken(token: string): Promise<{ iv: string; cipher: string }> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return { iv: b64(iv.buffer as ArrayBuffer), cipher: b64(enc) };
}

async function decryptToken(iv: string, cipher: string): Promise<string> {
  const key = await getOrCreateDeviceKey();
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(cipher));
  return new TextDecoder().decode(dec);
}

export async function getOrCreateClientPubkey(): Promise<string> {
  const db = await openDb();
  const existing = await idbGet<string>(db, KEYS_STORE, '__client_pubkey__');
  if (existing) return existing;
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pubkeyB64 = b64(spki);
  await idbPut(db, KEYS_STORE, pubkeyB64, '__client_pubkey__');
  return pubkeyB64;
}

export async function saveSession(s: PairedSession): Promise<void> {
  const { iv, cipher } = await encryptToken(s.token);
  const stored: StoredSession = {
    host: s.host,
    port: s.port,
    display_name: s.display_name,
    device_id: s.device_id,
    paired_at: s.paired_at,
    token_iv: iv,
    token_cipher: cipher,
  };
  const db = await openDb();
  await idbPut(db, STORE, stored, s.host);
}

export async function loadSession(host: string): Promise<PairedSession | null> {
  const db = await openDb();
  const stored = await idbGet<StoredSession>(db, STORE, host);
  if (!stored || !('token_iv' in stored)) return null;
  const token = await decryptToken(stored.token_iv, stored.token_cipher);
  return {
    host: stored.host,
    port: stored.port,
    display_name: stored.display_name,
    device_id: stored.device_id,
    paired_at: stored.paired_at,
    token,
  };
}

export async function listSessions(): Promise<PairedSession[]> {
  const db = await openDb();
  const stored = await idbGetAll<StoredSession>(db, STORE);
  const sessions = await Promise.all(
    stored
      .filter((s): s is StoredSession => 'token_iv' in s)
      .map(async (s) => {
        const token = await decryptToken(s.token_iv, s.token_cipher);
        return { host: s.host, port: s.port, display_name: s.display_name, device_id: s.device_id, paired_at: s.paired_at, token } satisfies PairedSession;
      }),
  );
  return sessions;
}

export async function clearSession(host: string): Promise<void> {
  const db = await openDb();
  await idbDelete(db, STORE, host);
}
