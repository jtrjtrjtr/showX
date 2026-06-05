// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import { useGoChannel } from '../../../pwa/src/hooks/useGoChannel.js';
import type { GoChannelState } from '../../../pwa/src/hooks/useGoChannel.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';
import type { GoDispatched } from '../../../pwa/src/lib/sideChannel.js';

afterEach(() => cleanup());

function getGoDispatchedCallback(
  mockFn: ReturnType<typeof vi.fn>,
): ((e: GoDispatched) => void) | undefined {
  const call = (mockFn.mock.calls as Array<[string, unknown]>).find(([event]) => event === 'go.dispatched');
  return call?.[1] as ((e: GoDispatched) => void) | undefined;
}

function GoCapture({
  cuelistId,
  onState,
}: {
  cuelistId: string;
  onState: (s: GoChannelState) => void;
}) {
  const state = useGoChannel(cuelistId);
  onState(state);
  return null;
}

const makeDispatchedEvent = (overrides: Partial<GoDispatched> = {}): GoDispatched => ({
  topic: 'go.dispatched',
  request_id: 'r1',
  cue_id: 'q1',
  cuelist_id: 'cl1',
  sequence: 1,
  dispatched_at: new Date().toISOString(),
  payloads_dispatched: 1,
  payloads_failed: [],
  fired_by: { station_id: 'st1', operator_id: 'op1' },
  historic: false,
  ...overrides,
});

describe('useGoChannel', () => {
  it('go() calls sendGoRequest with cuelistId + cueId and returns the request ID', () => {
    const conn = makeTestConnection();
    let captured: GoChannelState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <GoCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );
    const id = captured!.go('cue1');
    expect(id).toBeTruthy();
    expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'cue1', false);
  });

  it('historic go.dispatched event does not update lastDispatched', async () => {
    const conn = makeTestConnection();
    let captured: GoChannelState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <GoCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );

    const cb = getGoDispatchedCallback(conn.sideChannel.on as ReturnType<typeof vi.fn>);
    expect(cb).toBeDefined();

    await act(async () => {
      cb!(makeDispatchedEvent({ historic: true, cue_id: 'q-historic' }));
    });

    expect(captured!.lastDispatched).toBeNull();
  });

  it('non-historic go.dispatched event updates lastDispatched', async () => {
    const conn = makeTestConnection();
    let captured: GoChannelState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <GoCapture cuelistId="cl1" onState={(s) => { captured = s; }} />
      </ConnectionContext.Provider>,
    );

    const cb = getGoDispatchedCallback(conn.sideChannel.on as ReturnType<typeof vi.fn>);
    expect(cb).toBeDefined();

    const event = makeDispatchedEvent({ request_id: 'req-live', cue_id: 'q-live', historic: false });
    await act(async () => {
      cb!(event);
    });

    expect(captured!.lastDispatched?.request_id).toBe('req-live');
    expect(captured!.lastDispatched?.cue_id).toBe('q-live');
  });
});
