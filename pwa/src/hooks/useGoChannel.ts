import { useEffect, useState } from 'react';
import type { GoDispatched, AuditionResult } from '../lib/sideChannel.js';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface PreWaitState {
  cue_id: string;
  cuelist_id: string;
  /** Absolute ms timestamp when the pre-wait expires. */
  waiting_until: number;
}

export interface GoChannelState {
  go: (cueId: string, override?: boolean) => string;
  standby: (cueId: string) => void;
  /** Trigger audition (dry-run) for a specific cue. Returns request_id. SM only. */
  audition: (cueId: string) => string;
  lastDispatched: GoDispatched | null;
  lastHistoric: GoDispatched | null;
  /** Timestamp of the first live GO in this session; null until first GO fires. */
  firstGoAt: number | null;
  /** Active pre-wait state (cue armed-waiting); null when no pre-wait in progress. */
  preWait: PreWaitState | null;
  /** Last audition result received from the shell; null until first audition fires. */
  lastAuditioned: AuditionResult | null;
}

export function useGoChannel(cuelistId: string): GoChannelState {
  const conn = useConnection();
  const [lastDispatched, setLastDispatched] = useState<GoDispatched | null>(null);
  const [lastHistoric, setLastHistoric] = useState<GoDispatched | null>(null);
  const [firstGoAt, setFirstGoAt] = useState<number | null>(null);
  const [preWait, setPreWait] = useState<PreWaitState | null>(null);
  const [lastAuditioned, setLastAuditioned] = useState<AuditionResult | null>(null);

  useEffect(() => {
    return conn.sideChannel.on('go.dispatched', (event) => {
      if (event.cuelist_id !== cuelistId) return;
      if (event.historic) {
        setLastHistoric(event);
        return;
      }
      setLastDispatched(event);
      setFirstGoAt((prev) => (prev === null ? new Date(event.dispatched_at).getTime() : prev));
      // Pre-wait ends when cue dispatches
      setPreWait((prev) => (prev?.cue_id === event.cue_id ? null : prev));
    });
  }, [conn.sideChannel, cuelistId]);

  useEffect(() => {
    return conn.sideChannel.on('go.prewait', (event) => {
      if (event.cuelist_id !== cuelistId) return;
      setPreWait({ cue_id: event.cue_id, cuelist_id: event.cuelist_id, waiting_until: event.waiting_until_ts });
    });
  }, [conn.sideChannel, cuelistId]);

  useEffect(() => {
    return conn.sideChannel.on('audition.result', (event) => {
      if (event.cuelist_id !== cuelistId) return;
      setLastAuditioned(event);
    });
  }, [conn.sideChannel, cuelistId]);

  return {
    go: (cueId, override = false) =>
      conn.sideChannel.sendGoRequest(cuelistId, cueId, override),
    standby: (cueId) => conn.sideChannel.sendArmRequest(cuelistId, cueId),
    audition: (cueId) => conn.sideChannel.sendAuditionRequest(cuelistId, cueId),
    lastDispatched,
    lastHistoric,
    firstGoAt,
    preWait,
    lastAuditioned,
  };
}
