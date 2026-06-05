import { describe, it, expect, vi } from 'vitest';
import { compileActions, type ShowXActionInstance } from '../../../../external/companion-module-showx/src/actions.js';

function makeMockConn() {
  return {
    vars: { connected: 1, current_cue_label: '', armed_cue_label: 'CUE 5', last_fired_label: '', mode: 'rehearsal', stations_online: 2 },
    sendGoArmed: vi.fn(),
    sendStandbyNext: vi.fn(),
    sendStop: vi.fn(),
    sendPause: vi.fn(),
    sendResume: vi.fn(),
    sendGoto: vi.fn(),
    sendGo: vi.fn(),
    sendStandby: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isOpen: vi.fn(() => true),
    getLastCuelistId: vi.fn(() => ''),
    getLastArmedCueId: vi.fn(() => ''),
  };
}

function makeInstance(): ShowXActionInstance & { conn: ReturnType<typeof makeMockConn> } {
  const conn = makeMockConn();
  return {
    conn,
    config: {
      host: 'showx.local',
      port: 5300,
      showId: 'show-1',
      cuelistId: 'cl-1',
      pairingToken: 'tok',
    },
  };
}

describe('compileActions', () => {
  // Test 9: compileActions returns 7 action handlers
  it('returns exactly 7 action keys', () => {
    const actions = compileActions(makeInstance());
    expect(Object.keys(actions)).toHaveLength(7);
    expect(Object.keys(actions)).toEqual(
      expect.arrayContaining(['go', 'go_override', 'standby_next', 'stop', 'pause', 'resume', 'goto']),
    );
  });

  // Test 10: go action callback invokes conn.sendGoArmed
  it('go action callback invokes conn.sendGoArmed(false)', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['go'].callback({ options: {} });

    expect(instance.conn.sendGoArmed).toHaveBeenCalledWith(false);
  });

  it('go_override action callback invokes conn.sendGoArmed(true)', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['go_override'].callback({ options: {} });

    expect(instance.conn.sendGoArmed).toHaveBeenCalledWith(true);
  });

  it('standby_next action callback invokes conn.sendStandbyNext()', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['standby_next'].callback({ options: {} });

    expect(instance.conn.sendStandbyNext).toHaveBeenCalled();
  });

  it('stop action callback invokes conn.sendStop with cuelistId', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['stop'].callback({ options: {} });

    expect(instance.conn.sendStop).toHaveBeenCalledWith('cl-1');
  });

  it('goto action callback invokes conn.sendGoto with cueRef from options', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['goto'].callback({ options: { cueRef: 'CUE 15' } });

    expect(instance.conn.sendGoto).toHaveBeenCalledWith('cl-1', 'CUE 15');
  });

  it('goto action with empty cueRef does not call sendGoto', () => {
    const instance = makeInstance();
    const actions = compileActions(instance);

    actions['goto'].callback({ options: { cueRef: '' } });

    expect(instance.conn.sendGoto).not.toHaveBeenCalled();
  });

  it('all actions have name and options array', () => {
    const actions = compileActions(makeInstance());
    for (const [id, def] of Object.entries(actions)) {
      expect(def.name, `${id}.name`).toBeTruthy();
      expect(Array.isArray(def.options), `${id}.options`).toBe(true);
    }
  });
});
