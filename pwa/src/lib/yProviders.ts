import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

export interface ProviderStackOpts {
  doc: Y.Doc;
  wsUrl: string;
  showId: string;
  pairingToken: string;
}

export interface ProviderStack {
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  destroy(): void;
}

export async function createProviderStack(opts: ProviderStackOpts): Promise<ProviderStack> {
  const { doc, wsUrl, showId, pairingToken } = opts;

  const persistence = new IndexeddbPersistence(`show:${showId}`, doc);
  await persistence.whenSynced;

  const urlWithToken = `${wsUrl}?token=${encodeURIComponent(pairingToken)}`;
  const provider = new WebsocketProvider(urlWithToken, '', doc, { connect: true });

  return {
    provider,
    persistence,
    destroy() {
      provider.disconnect();
      persistence.destroy();
    },
  };
}
