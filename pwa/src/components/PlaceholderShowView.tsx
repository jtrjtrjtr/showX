import { useEffect, useRef, useState } from 'react';
import { createSyncClient, type SyncClient } from '../lib/syncClient.js';
import { createSideChannel } from '../lib/sideChannel.js';
import { clearSession } from '../lib/auth.js';
import type { PairedSession, SyncStatus } from '../lib/types.js';

interface Props {
  session: PairedSession;
  onSignOut?: () => void;
}

interface GoEvent {
  cue_id: string;
  timestamp: number;
}

function useSyncClient(s: PairedSession) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'connecting', attempts: 0 });
  const clientRef = useRef<SyncClient | null>(null);
  useEffect(() => {
    const c = createSyncClient({ docName: 'default', host: s.host, port: s.port, token: s.token });
    clientRef.current = c;
    const unsub = c.onStatusChange(setStatus);
    return () => { unsub(); c.destroy(); };
  }, [s.host, s.port, s.token]);
  return { client: clientRef.current, status };
}

const stateIcon: Record<SyncStatus['state'], string> = {
  connected: '●',
  connecting: '◌',
  reconnecting: '◌',
  disconnected: '×',
};

export function PlaceholderShowView({ session, onSignOut }: Props) {
  const { client, status } = useSyncClient(session);
  const [goEvent, setGoEvent] = useState<GoEvent | null>(null);

  useEffect(() => {
    const channel = createSideChannel({
      host: session.host,
      port: session.port,
      showId: 'default',
      token: session.token,
    });
    const unsub = channel.onEvent((e) => {
      if (e.type === 'go') setGoEvent({ cue_id: e.cue_id, timestamp: e.timestamp });
    });
    return () => { unsub(); channel.destroy(); };
  }, [session.host, session.port, session.token]);

  async function handleSignOut() {
    await clearSession(session.host);
    onSignOut?.();
    window.location.reload();
  }

  function handleForceReconnect() {
    client?.destroy();
    window.location.reload();
  }

  const docSize = client?.doc ? Object.keys(client.doc.getMap('root').toJSON()).length : 0;

  return (
    <div className="show-view">
      <h2>Connected to {session.host}:{session.port}</h2>
      <p>Display name: {session.display_name}</p>
      <p>
        Sync status: {stateIcon[status.state]} {status.state}
        {status.attempts > 0 && ` (attempt ${status.attempts})`}
      </p>
      <p>Doc size: {docSize} keys</p>
      <p>
        {goEvent
          ? `Last GO: cue ${goEvent.cue_id} at ${new Date(goEvent.timestamp).toISOString()}`
          : 'No GO yet'}
      </p>
      <button onClick={handleSignOut}>Sign out</button>
      <button onClick={handleForceReconnect} style={{ marginLeft: '0.5rem' }}>Force reconnect</button>
    </div>
  );
}
