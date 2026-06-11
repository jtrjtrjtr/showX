// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { usePlayhead, NotAuthorityError, type PlayheadResult } from '../../../../pwa/src/hooks/usePlayhead.js';
import { ConnectionContext } from '../helpers/connectionContext.js';
import type { Connection } from '../../../../pwa/src/lib/cuelistData.js';
import type { SideChannelClient } from '../../../../pwa/src/lib/sideChannel.js';
import type { PlayheadAwareness } from '../../../../pwa/src/lib/awareness.js';

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Awareness mock — stores states map + fires 'change' listeners on writes
// ---------------------------------------------------------------------------

type AwarenessListener = () => void;

function createAwareness(clientID: number) {
  const states = new Map<number, Record<string, unknown>>();
  const listeners = new Map<string, Set<AwarenessListener>>();

  function fire(event: string) {
    listeners.get(event)?.forEach((fn) => fn());
  }

  const awareness = {
    clientID,
    states,
    getStates: () => states,
    on: vi.fn((event: string, cb: AwarenessListener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: AwarenessListener) => {
      listeners.get(event)?.delete(cb);
    }),
    setLocalState: vi.fn((state: Record<string, unknown>) => {
      states.set(clientID, state);
      fire('change');
    }),
    setLocalStateField: vi.fn(<K extends string>(field: K, value: unknown) => {
      const cur = states.get(clientID) ?? {};
      states.set(clientID, { ...cur, [field]: value });
      fire('change');
    }),
    /** Test helper: simulate an awareness change without calling setLocalStateField */
    _triggerChange() { fire('change'); },
  };

  return awareness;
}

type MockAwareness = ReturnType<typeof createAwareness>;

function makeMockSideChannel(): SideChannelClient {
  return {
    on: vi.fn(() => () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    sendGoRequest: vi.fn(() => 'req-id'),
    sendArmRequest: vi.fn(),
  } as unknown as SideChannelClient;
}

/** Build a Connection with a REAL Y.Doc so doc.clientID is available */
function makeConnWithDoc(
  doc: Y.Doc,
  awareness: MockAwareness,
): Connection {
  return {
    doc,
    provider: {} as Connection['provider'],
    persistence: {} as Connection['persistence'],
    awareness: awareness as unknown as Connection['awareness'],
    sideChannel: makeMockSideChannel(),
    disconnect: vi.fn(),
  };
}

function addCuelist(doc: Y.Doc, id: string): void {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, clId: string, cueId: string, label: string): void {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === clId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', cueId);
  cue.set('label', label);
  cue.set('department', ['SM']);
  cue.set('payloads', []);
  cue.set('description', '');
  cue.set('standby_note', '');
  cue.set('trigger', { kind: 'manual' });
  cue.set('notes', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

/**
 * SM station: local station is the authority.
 * Using doc.clientID so localClientId in the hook matches.
 */
function makeSmSetup() {
  const doc = new Y.Doc();
  const awareness = createAwareness(doc.clientID);
  const conn = makeConnWithDoc(doc, awareness);
  // Register local station as SM in states (doc.clientID = awareness.clientID)
  awareness.states.set(doc.clientID, { role: 'sm', operator_id: 'sm-op' });
  return { awareness, conn, doc };
}

/**
 * Operator station: a different SM station is the authority.
 * Local clientID = doc.clientID; SM has arbitrary higher ID.
 */
function makeOperatorSetup() {
  const doc = new Y.Doc();
  const awareness = createAwareness(doc.clientID);
  const conn = makeConnWithDoc(doc, awareness);

  const smClientId = doc.clientID + 10000; // guaranteed different

  // SM station has playhead at q3
  awareness.states.set(smClientId, {
    role: 'sm',
    operator_id: 'sm-op',
    playhead: {
      cuelist_id: 'cl1',
      cue_id: 'q3',
      armed_cue_id: null,
      updated_at: new Date().toISOString(),
      updated_by: String(smClientId),
    } as PlayheadAwareness,
  });
  // Local operator station
  awareness.states.set(doc.clientID, { role: 'operator', operator_id: 'op1' });

  return { awareness, conn, doc, smClientId };
}

function PlayheadCapture({
  cuelistId,
  onState,
}: {
  cuelistId: string;
  onState: (s: PlayheadResult) => void;
}) {
  const state = usePlayhead(cuelistId);
  onState(state);
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlayhead — authority (SM station)', () => {
  it('isAuthority is true when local station is SM', async () => {
    const { conn } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.isAuthority).toBe(true);
  });

  it('setPlayhead calls awareness.setLocalStateField with cue_id after rate-limit flush', async () => {
    const { conn, awareness } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      captured!.setPlayhead('q1');
      await new Promise((r) => setTimeout(r, 150)); // flush rate-limit window
    });

    expect(awareness.setLocalStateField).toHaveBeenCalledWith('playhead', expect.objectContaining({
      cue_id: 'q1',
      cuelist_id: 'cl1',
    }));
  });

  it('arm calls awareness.setLocalStateField with armed_cue_id', async () => {
    const { conn, awareness } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      captured!.arm('q2');
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(awareness.setLocalStateField).toHaveBeenCalledWith('playhead', expect.objectContaining({
      armed_cue_id: 'q2',
    }));
  });

  it('advance writes next cue_id via setLocalStateField', async () => {
    const { conn, awareness } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn.doc, 'cl1', 'q2', 'Cue 2');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      captured!.advance();
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(awareness.setLocalStateField).toHaveBeenCalledWith('playhead', expect.objectContaining({
      cue_id: 'q1', // null → advance → first cue
    }));
  });

  it('retreat from first cue wraps to last cue', async () => {
    const { conn, awareness, doc } = makeSmSetup();
    addCuelist(doc, 'cl1');
    addCue(doc, 'cl1', 'q1', 'Cue 1');
    addCue(doc, 'cl1', 'q2', 'Cue 2');

    // Set playhead at q1 in SM awareness state
    awareness.states.set(doc.clientID, {
      role: 'sm',
      playhead: {
        cuelist_id: 'cl1', cue_id: 'q1', armed_cue_id: null,
        updated_at: new Date().toISOString(), updated_by: String(doc.clientID),
      } as PlayheadAwareness,
    });

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      captured!.retreat();
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(awareness.setLocalStateField).toHaveBeenCalledWith('playhead', expect.objectContaining({
      cue_id: 'q2', // retreat from q1 (idx=0) → wraps to last = q2
    }));
  });
});

describe('usePlayhead — operator (non-authority)', () => {
  it('isAuthority is false for operator when SM is connected', async () => {
    const { conn } = makeOperatorSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.isAuthority).toBe(false);
  });

  it('playhead reads SM awareness state', async () => {
    const { conn } = makeOperatorSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.playheadCueId).toBe('q3');
  });

  it('setPlayhead throws NotAuthorityError on operator', async () => {
    const { conn } = makeOperatorSetup();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(() => captured!.setPlayhead('q1')).toThrow(NotAuthorityError);
  });

  it('arm throws NotAuthorityError on operator', async () => {
    const { conn } = makeOperatorSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(() => captured!.arm('q1')).toThrow(NotAuthorityError);
  });

  it('unarm throws NotAuthorityError on operator', async () => {
    const { conn } = makeOperatorSetup();
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(() => captured!.unarm()).toThrow(NotAuthorityError);
  });
});

describe('usePlayhead — rate limiting', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('multiple rapid writes produce only one awareness update per 100ms window', async () => {
    vi.useRealTimers(); // Use real timers for render/waitFor
    const { conn, awareness } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn.doc, 'cl1', 'q2', 'Cue 2');
    addCue(conn.doc, 'cl1', 'q3', 'Cue 3');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    vi.useFakeTimers({ shouldAdvanceTime: false });

    // 5 rapid writes within the same rate-limit window
    act(() => {
      captured!.setPlayhead('q1');
      captured!.setPlayhead('q2');
      captured!.setPlayhead('q3');
      captured!.setPlayhead('q1');
      captured!.setPlayhead('q2');
    });

    // No write yet (timer pending)
    expect(awareness.setLocalStateField).not.toHaveBeenCalled();

    // Advance time to flush
    act(() => { vi.advanceTimersByTime(100); });

    // Only one awareness write despite 5 calls; last value wins
    expect(awareness.setLocalStateField).toHaveBeenCalledTimes(1);
    expect(awareness.setLocalStateField).toHaveBeenCalledWith('playhead', expect.objectContaining({
      cue_id: 'q2',
    }));
  });

  it('a second burst after flush window produces a second write', async () => {
    vi.useRealTimers();
    const { conn, awareness } = makeSmSetup();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());

    vi.useFakeTimers({ shouldAdvanceTime: false });

    act(() => { captured!.setPlayhead('q1'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(awareness.setLocalStateField).toHaveBeenCalledTimes(1);

    act(() => { captured!.setPlayhead('q1'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(awareness.setLocalStateField).toHaveBeenCalledTimes(2);
  });
});

describe('usePlayhead — authority fallback', () => {
  it('isAuthority becomes true when SM disconnects and local is lowest clientID', async () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc.clientID);
    const conn = makeConnWithDoc(doc, awareness);
    addCuelist(doc, 'cl1');

    const smId = doc.clientID + 10000;
    // SM connected
    awareness.states.set(smId, { role: 'sm' });
    awareness.states.set(doc.clientID, { role: 'operator' });

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.isAuthority).toBe(false);

    // SM disconnects
    await act(async () => {
      awareness.states.delete(smId);
      awareness._triggerChange();
    });

    await waitFor(() => expect(captured!.isAuthority).toBe(true));
  });
});

describe('usePlayhead — smOnline', () => {
  it('smOnline is true when SM is present in awareness (even with no playhead written)', async () => {
    const { conn } = makeSmSetup();
    // makeSmSetup seeds { role: 'sm' } for the local station
    addCuelist(conn.doc, 'cl1');

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.smOnline).toBe(true);
  });

  it('smOnline is true when SM is present and idle 60s (no time-based logic)', async () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc.clientID);
    const conn = makeConnWithDoc(doc, awareness);
    addCuelist(doc, 'cl1');

    const smId = doc.clientID + 10000;
    // SM present but has not written a playhead — simulates idle SM in awareness
    awareness.states.set(smId, { role: 'sm' });
    awareness.states.set(doc.clientID, { role: 'operator' });

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.smOnline).toBe(true);
  });

  it('smOnline is false when no role=sm in awareness states', async () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc.clientID);
    const conn = makeConnWithDoc(doc, awareness);
    addCuelist(doc, 'cl1');

    awareness.states.set(doc.clientID, { role: 'operator' });
    awareness.states.set(doc.clientID + 1000, { role: 'operator' });

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.smOnline).toBe(false);
  });

  it('smOnline becomes false when SM disconnects from awareness', async () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc.clientID);
    const conn = makeConnWithDoc(doc, awareness);
    addCuelist(doc, 'cl1');

    const smId = doc.clientID + 10000;
    awareness.states.set(smId, { role: 'sm' });
    awareness.states.set(doc.clientID, { role: 'operator' });

    let captured: PlayheadResult | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.smOnline).toBe(true);

    await act(async () => {
      awareness.states.delete(smId);
      awareness._triggerChange();
    });

    await waitFor(() => expect(captured!.smOnline).toBe(false));
  });
});
