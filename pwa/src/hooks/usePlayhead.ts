import { useState, useEffect, useRef, useCallback } from 'react';
import { useConnection } from '../lib/ConnectionProvider.js';
import { useCuelist } from './useCuelist.js';
import {
  getPlayheadAuthorityClientId,
  getPlayheadState,
  isSmPresent,
  type PlayheadAwareness,
} from '../lib/awareness.js';

export class NotAuthorityError extends Error {
  constructor() {
    super('Only SM can write playhead state');
    this.name = 'NotAuthorityError';
  }
}

export interface PlayheadResult {
  playhead: PlayheadAwareness | null;
  /** Convenience alias for playhead?.cue_id ?? null */
  playheadCueId: string | null;
  /** Convenience alias for playhead?.armed_cue_id ?? null */
  armedCueId: string | null;
  setPlayhead(cueId: string): void;
  advance(): void;
  retreat(): void;
  arm(cueId: string): void;
  unarm(): void;
  /** True when local station is the playhead authority (SM or lowest clientID fallback) */
  isAuthority: boolean;
  /** True when playhead was updated within the last 30s */
  smOnline: boolean;
}

/** Max awareness write rate: 10 Hz */
const RATE_LIMIT_MS = 100;

type AwarenessLike = Parameters<typeof getPlayheadState>[0];

export function usePlayhead(cuelistId: string): PlayheadResult {
  const conn = useConnection();
  const { cues } = useCuelist(cuelistId);
  const { awareness } = conn;
  // Use doc.clientID — same as awareness.clientID in Yjs, and available on the mock too
  const localClientId = conn.doc.clientID;

  const aw = awareness as unknown as AwarenessLike;

  const [playhead, setPlayheadState] = useState<PlayheadAwareness | null>(() =>
    getPlayheadState(aw),
  );
  const [isAuthority, setIsAuthority] = useState<boolean>(
    () => getPlayheadAuthorityClientId(aw) === localClientId,
  );
  const [smOnline, setSmOnline] = useState<boolean>(() => isSmPresent(aw));

  // Rate-limit state for writes
  const pendingRef = useRef<PlayheadAwareness | null>(null);
  const scheduledRef = useRef(false);

  const flushPending = useCallback(() => {
    if (pendingRef.current) {
      awareness.setLocalStateField('playhead', pendingRef.current as unknown as Record<string, unknown>);
    }
    pendingRef.current = null;
    scheduledRef.current = false;
  }, [awareness]);

  const writePlayhead = useCallback(
    (patch: Partial<Omit<PlayheadAwareness, 'updated_at' | 'updated_by'>>) => {
      const current: PlayheadAwareness = pendingRef.current ?? {
        cuelist_id: cuelistId,
        cue_id: null,
        armed_cue_id: null,
        updated_at: new Date().toISOString(),
        updated_by: String(localClientId),
      };
      pendingRef.current = {
        ...current,
        ...patch,
        cuelist_id: cuelistId,
        updated_at: new Date().toISOString(),
        updated_by: String(localClientId),
      };
      if (!scheduledRef.current) {
        scheduledRef.current = true;
        setTimeout(flushPending, RATE_LIMIT_MS);
      }
    },
    [localClientId, cuelistId, flushPending],
  );

  // Subscribe to awareness changes
  useEffect(() => {
    const onAwarenessChange = () => {
      setPlayheadState(getPlayheadState(aw));
      setIsAuthority(getPlayheadAuthorityClientId(aw) === localClientId);
      setSmOnline(isSmPresent(aw));
    };
    awareness.on('change', onAwarenessChange);
    onAwarenessChange();
    return () => awareness.off('change', onAwarenessChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness, localClientId]);

  const assertAuthority = useCallback(() => {
    if (!isAuthority) throw new NotAuthorityError();
  }, [isAuthority]);

  const setPlayhead = useCallback(
    (cueId: string) => {
      assertAuthority();
      writePlayhead({ cue_id: cueId });
    },
    [assertAuthority, writePlayhead],
  );

  const advance = useCallback(() => {
    assertAuthority();
    if (cues.length === 0) return;
    const currentId = pendingRef.current?.cue_id ?? playhead?.cue_id ?? null;
    const idx = cues.findIndex((c) => c.id === currentId);
    const next = idx >= 0 && idx < cues.length - 1 ? cues[idx + 1] : cues[0];
    if (next) writePlayhead({ cue_id: next.id });
  }, [assertAuthority, cues, playhead, writePlayhead]);

  const retreat = useCallback(() => {
    assertAuthority();
    if (cues.length === 0) return;
    const currentId = pendingRef.current?.cue_id ?? playhead?.cue_id ?? null;
    const idx = cues.findIndex((c) => c.id === currentId);
    const prev = idx > 0 ? cues[idx - 1] : cues[cues.length - 1];
    if (prev) writePlayhead({ cue_id: prev.id });
  }, [assertAuthority, cues, playhead, writePlayhead]);

  const arm = useCallback(
    (cueId: string) => {
      assertAuthority();
      writePlayhead({ armed_cue_id: cueId });
    },
    [assertAuthority, writePlayhead],
  );

  const unarm = useCallback(() => {
    assertAuthority();
    writePlayhead({ armed_cue_id: null });
  }, [assertAuthority, writePlayhead]);

  return {
    playhead,
    playheadCueId: playhead?.cue_id ?? null,
    armedCueId: playhead?.armed_cue_id ?? null,
    setPlayhead,
    advance,
    retreat,
    arm,
    unarm,
    isAuthority,
    smOnline,
  };
}
