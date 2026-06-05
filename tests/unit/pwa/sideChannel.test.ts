// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SideChannelClient } from '../../../pwa/src/lib/sideChannel.js';
import type { GoDispatched } from '../../../pwa/src/lib/sideChannel.js';

// ── Minimal WebSocket mock ────────────────────────────────────────────────────

class MockWS {
  static instances: MockWS[] = [];
  readonly url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  triggerOpen() {
    this.onopen?.();
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  triggerClose() {
    this.onclose?.();
  }
}

function makeClient(overrides?: Partial<ConstructorParameters<typeof SideChannelClient>[0]>) {
  return new SideChannelClient({
    url: 'ws://host:3001/events/show1?token=abc123',
    showId: 'show1',
    stationId: 'st1',
    operatorId: 'op1',
    _WebSocket: MockWS as unknown as typeof WebSocket,
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SideChannelClient', () => {
  beforeEach(() => {
    MockWS.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('WSS URL passes through token query param to WebSocket constructor', async () => {
    const client = makeClient({ url: 'ws://host:3001/events/show1?token=mysecrettoken' });
    await client.connect();
    expect(MockWS.instances.length).toBe(1);
    expect(MockWS.instances[0].url).toContain('token=mysecrettoken');
  });

  it('sendGoRequest returns unique IDs and emits go.request payload over socket', async () => {
    const client = makeClient();
    await client.connect();
    const ws = MockWS.instances[0];
    ws.triggerOpen();

    const id1 = client.sendGoRequest('cl1', 'cue1');
    const id2 = client.sendGoRequest('cl1', 'cue2');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(ws.sent.length).toBe(2);

    const msg1 = JSON.parse(ws.sent[0]) as Record<string, unknown>;
    expect(msg1['topic']).toBe('go.request');
    expect(msg1['request_id']).toBe(id1);
    expect(msg1['cue_id']).toBe('cue1');
    expect(msg1['cuelist_id']).toBe('cl1');
    expect(msg1['station_id']).toBe('st1');
    expect(msg1['operator_id']).toBe('op1');
  });

  it('onclose schedules reconnects with backoff delays [1000, 2000, 5000, 10000, 30000, 30000]', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    await client.connect();

    const expectedDelays = [1000, 2000, 5000, 10000, 30000, 30000];

    for (let i = 0; i < expectedDelays.length; i++) {
      const countBefore = MockWS.instances.length;
      MockWS.instances[i].triggerClose();

      // Should NOT reconnect before the delay expires
      vi.advanceTimersByTime(expectedDelays[i] - 1);
      expect(MockWS.instances.length).toBe(countBefore);

      // Should reconnect exactly at the delay
      vi.advanceTimersByTime(1);
      expect(MockWS.instances.length).toBe(countBefore + 1);
    }
  });

  it('on reconnect, resume frame is sent per tracked topic with since_seq', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    await client.connect();
    const ws0 = MockWS.instances[0];
    ws0.triggerOpen();

    // Receive a sequenced message to establish lastSeq
    ws0.triggerMessage({
      topic: 'arm.broadcast',
      seq: 42,
      payload: { cuelist_id: 'cl1', cue_id: 'q1', standby_note: '' },
    });

    // First close → wait for reconnect
    ws0.triggerClose();
    vi.advanceTimersByTime(1000);
    const ws1 = MockWS.instances[1];
    ws1.triggerOpen();

    const resumeFrames = ws1.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const armResume = resumeFrames.find((m) => m['type'] === 'resume' && m['topic'] === 'arm.broadcast');
    expect(armResume).toBeDefined();
    expect(armResume!['since_seq']).toBe(42);
  });

  it('go.dispatched with dispatched_at older than 5s is flagged historic:true', async () => {
    const client = makeClient();
    await client.connect();
    const ws = MockWS.instances[0];
    ws.triggerOpen();

    const events: GoDispatched[] = [];
    client.on('go.dispatched', (e) => events.push(e));

    // Old event: 10s ago
    ws.triggerMessage({
      topic: 'go.dispatched',
      seq: 1,
      payload: {
        request_id: 'r1',
        cue_id: 'q1',
        cuelist_id: 'cl1',
        sequence: 1,
        dispatched_at: new Date(Date.now() - 10_000).toISOString(),
        payloads_dispatched: 1,
        payloads_failed: [],
        fired_by: { station_id: 'st1', operator_id: 'op1' },
      },
    });
    expect(events[0].historic).toBe(true);

    // Recent event: 1s ago
    ws.triggerMessage({
      topic: 'go.dispatched',
      seq: 2,
      payload: {
        request_id: 'r2',
        cue_id: 'q2',
        cuelist_id: 'cl1',
        sequence: 2,
        dispatched_at: new Date(Date.now() - 1_000).toISOString(),
        payloads_dispatched: 1,
        payloads_failed: [],
        fired_by: { station_id: 'st1', operator_id: 'op1' },
      },
    });
    expect(events[1].historic).toBe(false);
  });

  it('disconnect() sets stopped=true so onclose no longer schedules reconnect', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    await client.connect();
    const ws = MockWS.instances[0];
    ws.triggerOpen();

    // Disconnect, then simulate a server-side close arriving after our disconnect
    client.disconnect();
    // disconnect() itself calls ws.close() → triggers onclose (stopped=true, no timer)
    // Simulate an extra server-initiated close for belt-and-suspenders
    ws.triggerClose();

    vi.advanceTimersByTime(60_000);
    expect(MockWS.instances.length).toBe(1); // no reconnect attempts
  });
});
