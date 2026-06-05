import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── WebSocket mock (must be declared before vi.mock is hoisted) ───────────────

const { MockWsClass, getMockInstances, resetMockInstances } = vi.hoisted(() => {
  interface WsHandlers {
    open?: () => void;
    message?: (data: Buffer) => void;
    close?: () => void;
    error?: (err: Error) => void;
  }

  const instances: InstanceType<typeof MockWsClass>[] = [];

  class MockWsClass {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;

    readyState = MockWsClass.OPEN;
    url: string;
    sentMessages: string[] = [];
    private handlers: WsHandlers = {};

    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
      (this.handlers as Record<string, unknown>)[event] = handler;
      return this;
    }

    send(data: string): void {
      this.sentMessages.push(data);
    }

    close(): void {
      this.readyState = MockWsClass.CLOSED;
      this.handlers.close?.();
    }

    triggerOpen(): void { this.handlers.open?.(); }
    triggerMessage(data: string): void {
      this.handlers.message?.(Buffer.from(data));
    }
    triggerClose(): void {
      this.readyState = MockWsClass.CLOSED;
      this.handlers.close?.();
    }
    triggerError(err = new Error('ws error')): void {
      this.handlers.error?.(err);
    }
  }

  return {
    MockWsClass,
    getMockInstances: () => instances,
    resetMockInstances: () => { instances.length = 0; },
  };
});

vi.mock('ws', () => ({ default: MockWsClass }));

// ── Import under test (after mock is registered) ──────────────────────────────

import { ShowXConnection, type ConnOpts } from '../../../../external/companion-module-showx/src/connection.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOpts(overrides: Partial<ConnOpts> = {}): ConnOpts {
  return {
    host: 'showx.local',
    port: 5300,
    showId: 'show-123',
    pairingToken: 'tok-abc',
    onStatusChange: vi.fn(),
    onVariablesUpdate: vi.fn(),
    onFeedbacksUpdate: vi.fn(),
    ...overrides,
  };
}

function makeConn(overrides: Partial<ConnOpts> = {}): ShowXConnection {
  return new ShowXConnection(makeOpts(overrides));
}

function lastWs() {
  const instances = getMockInstances();
  return instances[instances.length - 1];
}

function envelope(topic: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ topic, seq: 1, ts: Date.now(), payload });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShowXConnection', () => {
  beforeEach(() => {
    resetMockInstances();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: connect() opens WSS to correct URL with token query
  it('connect() opens WS to correct URL with show ID and token query params', () => {
    const conn = makeConn();
    conn.connect();

    expect(lastWs().url).toBe('ws://showx.local:5300/events/show-123?token=tok-abc');
  });

  // Test 2: open event sets vars.connected = 1
  it('open event sets vars.connected = 1 and calls onStatusChange + onVariablesUpdate', () => {
    const onStatusChange = vi.fn();
    const onVariablesUpdate = vi.fn();
    const conn = makeConn({ onStatusChange, onVariablesUpdate });
    conn.connect();

    lastWs().triggerOpen();

    expect(conn.vars.connected).toBe(1);
    expect(onStatusChange).toHaveBeenCalledWith('ok');
    expect(onVariablesUpdate).toHaveBeenCalledWith(expect.objectContaining({ connected: 1 }));
  });

  // Test 3: go.dispatched event updates last_fired_label var
  it('go.dispatched event updates last_fired_label and current_cue_label', () => {
    const onVariablesUpdate = vi.fn();
    const conn = makeConn({ onVariablesUpdate });
    conn.connect();
    lastWs().triggerOpen();

    lastWs().triggerMessage(envelope('go.dispatched', { cue_label: 'Cue 10 — Opening', cue_id: 'cue-abc' }));

    expect(conn.vars.last_fired_label).toBe('Cue 10 — Opening');
    expect(conn.vars.current_cue_label).toBe('Cue 10 — Opening');
    expect(onVariablesUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ last_fired_label: 'Cue 10 — Opening' }),
    );
  });

  // Test 3b: go.dispatched falls back to cue_id when cue_label absent
  it('go.dispatched falls back to cue_id when cue_label is absent', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    lastWs().triggerMessage(envelope('go.dispatched', { cue_id: 'cue-xyz' }));

    expect(conn.vars.last_fired_label).toBe('cue-xyz');
  });

  // Test 4: mode.transition event updates mode var
  it('mode.transition event updates mode var and triggers feedbacks update', () => {
    const onFeedbacksUpdate = vi.fn();
    const conn = makeConn({ onFeedbacksUpdate });
    conn.connect();
    lastWs().triggerOpen();
    onFeedbacksUpdate.mockClear();

    lastWs().triggerMessage(
      envelope('mode.transition', { from: 'rehearsal', to: 'show', by_operator_id: 'op-1' }),
    );

    expect(conn.vars.mode).toBe('show');
    expect(onFeedbacksUpdate).toHaveBeenCalled();
  });

  // Test 4b: arm.broadcast updates armed_cue_label
  it('arm.broadcast event updates armed_cue_label', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    lastWs().triggerMessage(envelope('arm.broadcast', { cuelist_id: 'cl-1', cue_id: 'cue-5', standby_note: 'Ready' }));

    expect(conn.vars.armed_cue_label).toBe('cue-5');
    expect(conn.getLastCuelistId()).toBe('cl-1');
    expect(conn.getLastArmedCueId()).toBe('cue-5');
  });

  // Test 5: Reconnect on close — setTimeout with exponential backoff
  it('reconnects with exponential backoff on WS close', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    lastWs().triggerClose();
    // First reconnect scheduled at 1000ms
    expect(getMockInstances().length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(getMockInstances().length).toBe(2);

    // Second close → reconnect at 2000ms
    getMockInstances()[1].triggerClose();
    vi.advanceTimersByTime(1999);
    expect(getMockInstances().length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(getMockInstances().length).toBe(3);
  });

  // Test 6: disconnect() prevents reconnect
  it('disconnect() sets stopped=true so no reconnect fires after close', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    conn.disconnect();
    vi.advanceTimersByTime(10_000);

    expect(getMockInstances().length).toBe(1);
  });

  // Test 7: sendGo() produces valid JSON envelope with unique request_id
  it('sendGo() sends valid go.request JSON with unique request_id per call', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    conn.sendGo('cl-1', 'cue-1');
    conn.sendGo('cl-1', 'cue-2');

    const ws = lastWs();
    expect(ws.sentMessages.length).toBe(2);
    const msg1 = JSON.parse(ws.sentMessages[0]);
    const msg2 = JSON.parse(ws.sentMessages[1]);

    expect(msg1.topic).toBe('go.request');
    expect(msg1.cuelist_id).toBe('cl-1');
    expect(msg1.cue_id).toBe('cue-1');
    expect(msg1.station_id).toBe('companion');
    expect(msg1.override).toBe(false);
    expect(typeof msg1.request_id).toBe('string');
    expect(msg1.request_id.length).toBeGreaterThan(0);
    expect(msg1.request_id).not.toBe(msg2.request_id);
  });

  // Test 7b: sendGo() with override=true
  it('sendGo() with override=true sets override flag in envelope', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    conn.sendGo('cl-1', 'cue-1', true);

    const msg = JSON.parse(lastWs().sentMessages[0]);
    expect(msg.override).toBe(true);
  });

  // Test 8: sendStandby() produces valid arm.request envelope
  it('sendStandby() sends valid arm.request envelope', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    conn.sendStandby('cl-abc', 'cue-7');

    const ws = lastWs();
    expect(ws.sentMessages.length).toBe(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.topic).toBe('arm.request');
    expect(msg.cuelist_id).toBe('cl-abc');
    expect(msg.cue_id).toBe('cue-7');
    expect(msg.station_id).toBe('companion');
  });

  // Extra: sendGo no-op when closed
  it('sendGo() is a no-op when WS is not open', () => {
    const conn = makeConn();
    conn.connect();
    const ws = lastWs();
    ws.readyState = MockWsClass.CLOSED;

    conn.sendGo('cl-1', 'cue-1');

    expect(ws.sentMessages.length).toBe(0);
  });

  // Extra: error event triggers onStatusChange
  it('error event calls onStatusChange with connection_failure', () => {
    const onStatusChange = vi.fn();
    const conn = makeConn({ onStatusChange });
    conn.connect();
    lastWs().triggerOpen();
    onStatusChange.mockClear();

    lastWs().triggerError();

    expect(onStatusChange).toHaveBeenCalledWith('connection_failure');
  });

  // Extra: heartbeat updates stations_online
  it('heartbeat event updates stations_online variable', () => {
    const onVariablesUpdate = vi.fn();
    const conn = makeConn({ onVariablesUpdate });
    conn.connect();
    lastWs().triggerOpen();

    lastWs().triggerMessage(envelope('heartbeat', { stations_online: 4 }));

    expect(conn.vars.stations_online).toBe(4);
    expect(onVariablesUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ stations_online: 4 }),
    );
  });

  // Extra: malformed JSON silently ignored
  it('malformed JSON message is silently ignored', () => {
    const conn = makeConn();
    conn.connect();
    lastWs().triggerOpen();

    expect(() => lastWs().triggerMessage('not-valid-json')).not.toThrow();
    expect(conn.vars.connected).toBe(1);
  });
});
