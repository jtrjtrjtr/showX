import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import type { SyncStatus } from './types.js';

export interface SyncClient {
  doc: Y.Doc;
  readonly status: SyncStatus;
  onStatusChange(cb: (s: SyncStatus) => void): () => void;
  destroy(): void;
}

export function createSyncClient(opts: {
  docName: string;
  host: string;
  port: number;
  token: string;
  awareness?: { user: string };
}): SyncClient {
  const doc = new Y.Doc();
  const idb = new IndexeddbPersistence(opts.docName, doc);
  const wsUrl = `ws://${opts.host}:${opts.port}/yjs`;
  const status: SyncStatus = { state: 'connecting', attempts: 0 };
  const listeners = new Set<(s: SyncStatus) => void>();

  let provider: WebsocketProvider | null = null;
  let backoffMs = 1000;
  let stopped = false;

  function emit() {
    for (const l of listeners) l({ ...status });
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, 30_000);
    setTimeout(() => {
      if (stopped) return;
      provider?.destroy();
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;
    status.state = status.attempts === 0 ? 'connecting' : 'reconnecting';
    emit();
    provider = new WebsocketProvider(wsUrl, opts.docName, doc, {
      params: { token: opts.token },
      connect: true,
    });
    provider.on('status', (e: { status: string }) => {
      if (e.status === 'connected') {
        status.state = 'connected';
        backoffMs = 1000;
        status.attempts = 0;
        emit();
      } else if (e.status === 'disconnected') {
        status.state = 'reconnecting';
        status.attempts += 1;
        emit();
        scheduleReconnect();
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).on('connection-error', (e: unknown) => {
      status.lastError = e instanceof Error ? e.message : String(e);
      emit();
    });
  }

  connect();

  return {
    doc,
    get status() { return { ...status }; },
    onStatusChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      stopped = true;
      provider?.destroy();
      idb.destroy();
      doc.destroy();
      listeners.clear();
    },
  };
}
