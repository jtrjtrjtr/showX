import * as Y from 'yjs';
import { WebSocketServer, type WebSocket } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { Logger } from '../Logger.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export interface PersistenceHook {
  load(doc: Y.Doc): Promise<void>;
  save(doc: Y.Doc, update: Uint8Array): Promise<void>;
}

export interface YDocEntry {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  persistence?: PersistenceHook;
}

export class YWebsocketAdapter {
  private docs = new Map<string, YDocEntry>();
  private wss: WebSocketServer;

  constructor(private readonly log?: Logger) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  handleUpgrade(req: object, socket: object, head: Buffer, docName: string): void {
    this.wss.handleUpgrade(
      req as Parameters<WebSocketServer['handleUpgrade']>[0],
      socket as Parameters<WebSocketServer['handleUpgrade']>[1],
      head,
      (ws) => {
        (ws as WebSocket & { _showxDocName?: string })._showxDocName = docName;
        this.wss.emit('connection', ws, req);
      },
    );
  }

  registerPersistence(name: string, hook: PersistenceHook): void {
    const entry = this.getOrCreateDoc(name);
    entry.persistence = hook;
  }

  openDocument(name: string): YDocEntry {
    return this.getOrCreateDoc(name);
  }

  closeDocument(name: string): void {
    const entry = this.docs.get(name);
    if (!entry) return;
    for (const ws of entry.conns) {
      try { ws.close(1000, 'doc_closed'); } catch { /* ignore */ }
    }
    entry.doc.destroy();
    this.docs.delete(name);
  }

  private getOrCreateDoc(name: string): YDocEntry {
    const existing = this.docs.get(name);
    if (existing) return existing;

    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const entry: YDocEntry = { name, doc, awareness, conns: new Set() };
    this.docs.set(name, entry);

    // hydrate on first open
    Promise.resolve().then(async () => {
      try {
        await entry.persistence?.load(doc);
      } catch (err) {
        this.log?.error('y-doc load failed', { name, error: String(err) });
      }
    });

    // throttled persistence on update (250ms window)
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingUpdate: Uint8Array | null = null;
    doc.on('update', (update: Uint8Array) => {
      pendingUpdate = pendingUpdate ? Y.mergeUpdates([pendingUpdate, update]) : update;
      if (timer) return;
      timer = setTimeout(async () => {
        const u = pendingUpdate!;
        pendingUpdate = null;
        timer = null;
        try {
          await entry.persistence?.save(doc, u);
        } catch (err) {
          this.log?.error('y-doc save failed', { name, error: String(err) });
        }
      }, 250);
    });

    return entry;
  }

  private onConnection(ws: WebSocket, _req: object): void {
    const docName = (ws as WebSocket & { _showxDocName?: string })._showxDocName ?? '';
    const entry = this.getOrCreateDoc(docName);
    entry.conns.add(ws);

    // initial sync step 1
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, entry.doc);
    ws.send(encoding.toUint8Array(enc));

    ws.on('message', (data: Buffer) => {
      try {
        const dec = decoding.createDecoder(new Uint8Array(data));
        const type = decoding.readVarUint(dec);
        if (type === MSG_SYNC) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MSG_SYNC);
          syncProtocol.readSyncMessage(dec, reply, entry.doc, ws);
          if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            entry.awareness,
            decoding.readVarUint8Array(dec),
            ws,
          );
        }
      } catch (err) {
        this.log?.error('y-doc message error', { docName, error: String(err) });
      }
    });

    // broadcast doc updates to other conns
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === ws) return;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, update);
      const out = encoding.toUint8Array(e);
      for (const peer of entry.conns) {
        if (peer !== ws && peer.readyState === 1 /* OPEN */) peer.send(out);
      }
    };
    entry.doc.on('update', updateHandler);

    const awHandler = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = [...added, ...updated, ...removed];
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        e,
        awarenessProtocol.encodeAwarenessUpdate(entry.awareness, changed),
      );
      const out = encoding.toUint8Array(e);
      for (const peer of entry.conns) {
        if (peer.readyState === 1 /* OPEN */) peer.send(out);
      }
    };
    entry.awareness.on('update', awHandler);

    ws.on('close', () => {
      entry.conns.delete(ws);
      entry.doc.off('update', updateHandler);
      entry.awareness.off('update', awHandler);
      awarenessProtocol.removeAwarenessStates(entry.awareness, [entry.doc.clientID], ws);
    });
  }
}
