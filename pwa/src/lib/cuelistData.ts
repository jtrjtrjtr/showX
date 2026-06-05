import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { SideChannelClient } from './sideChannel.js';
import type { StationAwareness, LocalStationOpts } from './awareness.js';
import { makeInitialAwarenessState } from './awareness.js';

export interface ConnectOpts extends LocalStationOpts {
  /** Full ws URL including show_id path segment, e.g. ws://showx.local:5300/yjs/<show_id> */
  wsUrl: string;
  /** Full ws URL for side-channel, e.g. ws://showx.local:5300/events/<show_id> */
  sideChannelUrl: string;
  show_id: string;
  pairingToken: string;
  /** Injected for tests — overrides Y-websocket construction */
  _providerFactory?: (
    url: string,
    room: string,
    doc: Y.Doc,
    opts: { connect: boolean },
  ) => WebsocketProvider;
  /** Injected for tests — overrides IndexeddbPersistence construction */
  _persistenceFactory?: (name: string, doc: Y.Doc) => IndexeddbPersistence;
}

export interface Connection {
  doc: Y.Doc;
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  awareness: WebsocketProvider['awareness'];
  sideChannel: SideChannelClient;
  disconnect(): void;
}

export async function connectToShow(opts: ConnectOpts): Promise<Connection> {
  const doc = new Y.Doc();

  const persistenceFactory = opts._persistenceFactory ??
    ((name, d) => new IndexeddbPersistence(name, d));
  const persistence = persistenceFactory(`show:${opts.show_id}`, doc);
  await persistence.whenSynced;

  const urlWithToken = `${opts.wsUrl}?token=${encodeURIComponent(opts.pairingToken)}`;
  const providerFactory = opts._providerFactory ??
    ((url, room, d, pOpts) => new WebsocketProvider(url, room, d, pOpts));
  const provider = providerFactory(urlWithToken, '', doc, { connect: true });
  const { awareness } = provider;

  const initialState: StationAwareness = makeInitialAwarenessState(opts);
  awareness.setLocalState(initialState as unknown as Record<string, unknown>);

  const sideChannel = new SideChannelClient({
    url: `${opts.sideChannelUrl}?token=${encodeURIComponent(opts.pairingToken)}`,
    showId: opts.show_id,
    stationId: opts.station_id,
    operatorId: opts.operator_id,
  });
  await sideChannel.connect();

  const hbInterval = setInterval(() => {
    awareness.setLocalStateField('last_heartbeat_at', new Date().toISOString());
  }, 1000);

  return {
    doc,
    provider,
    persistence,
    awareness,
    sideChannel,
    disconnect() {
      clearInterval(hbInterval);
      sideChannel.disconnect();
      provider.disconnect();
      persistence.destroy();
    },
  };
}
