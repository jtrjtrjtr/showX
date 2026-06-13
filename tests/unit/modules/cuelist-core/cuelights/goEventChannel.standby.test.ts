import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventBus, Logger, Subscription, ShowxEvent } from 'showx-shared';
import { GoEventChannel } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import type { GoChannelDeps, StandbyRequest, OperatorAcknowledge } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import * as Y from 'yjs';

function makeMockBus() {
  const handlers = new Map<string, Array<(e: ShowxEvent) => void>>();
  const bus: EventBus = {
    publish<T extends ShowxEvent>(event: T): void {
      const arr = handlers.get(event.type) ?? [];
      const wildcards = handlers.get('*') ?? [];
      for (const h of [...arr, ...wildcards]) h(event);
    },
    subscribe<T extends ShowxEvent>(type: T['type'] | T['type'][] | '*', handler: (e: T) => void): Subscription {
      const types: string[] = type === '*' ? ['*'] : Array.isArray(type) ? type : [type as string];
      for (const t of types) {
        if (!handlers.has(t)) handlers.set(t, []);
        handlers.get(t)!.push(handler as (e: ShowxEvent) => void);
      }
      return {
        id: String(Math.random()),
        unsubscribe() {
          for (const t of types) {
            const arr = handlers.get(t);
            if (!arr) continue;
            arr.splice(arr.indexOf(handler as (e: ShowxEvent) => void), 1);
          }
        },
      };
    },
    subscribePattern(_: string, handler: (e: ShowxEvent) => void): Subscription {
      return bus.subscribe('*', handler);
    },
  };
  return bus;
}

function makeMockLog(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: function () { return this; },
  };
}

function makeChannel() {
  const doc = new Y.Doc();
  doc.getMap('meta').set('show_id', 'show-1');

  const handlers = new Map<string, Array<(msg: object) => void>>();
  const broadcasts: object[] = [];
  const stationMessages: Array<{ station_id: string; msg: object }> = [];

  const deps: GoChannelDeps = {
    doc,
    events: makeMockBus(),
    log: makeMockLog(),
    publishToStation: (station_id, msg) => stationMessages.push({ station_id, msg }),
    broadcast: (msg) => broadcasts.push(msg),
    subscribe: (topic, handler) => {
      if (!handlers.has(topic)) handlers.set(topic, []);
      handlers.get(topic)!.push(handler);
      return () => {
        const arr = handlers.get(topic);
        if (arr) arr.splice(arr.indexOf(handler), 1);
      };
    },
  };

  const ch = new GoEventChannel(deps);
  ch.start();

  function deliver(topic: string, msg: object) {
    for (const h of handlers.get(topic) ?? []) h(msg);
  }

  return { ch, broadcasts, stationMessages, deliver };
}

describe('GoEventChannel — standby protocol', () => {
  let ctx: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    ctx = makeChannel();
  });

  describe('onStandbyRequest', () => {
    it('updates cueLights state and broadcasts standby.broadcast', () => {
      const req: StandbyRequest = {
        topic: 'standby.request',
        cue_id: 'cue-1',
        cuelist_id: 'cl-1',
        departments: ['LX', 'SX'],
        standby: true,
        station_id: 'sm-station',
        operator_id: 'op-1',
      };
      ctx.deliver('standby.request', req);

      expect(ctx.ch.cueLights.getState('cue-1')).toMatchObject({ LX: 'standby', SX: 'standby' });

      expect(ctx.broadcasts).toHaveLength(1);
      const msg = ctx.broadcasts[0] as { topic: string; payload: object };
      expect(msg.topic).toBe('standby.broadcast');
      const payload = msg.payload as { cue_id: string; departments: string[]; standby: boolean };
      expect(payload.cue_id).toBe('cue-1');
      expect(payload.departments).toEqual(['LX', 'SX']);
      expect(payload.standby).toBe(true);
    });

    it('broadcasts standby.broadcast with standby=false to clear', () => {
      const setReq: StandbyRequest = {
        topic: 'standby.request',
        cue_id: 'cue-1',
        cuelist_id: 'cl-1',
        departments: ['LX'],
        standby: true,
        station_id: 'sm-station',
        operator_id: 'op-1',
      };
      ctx.deliver('standby.request', setReq);

      const clearReq: StandbyRequest = { ...setReq, standby: false };
      ctx.deliver('standby.request', clearReq);

      expect(ctx.ch.cueLights.getState('cue-1')['LX']).toBe('idle');
      const lastBcast = ctx.broadcasts[ctx.broadcasts.length - 1] as { topic: string; payload: { standby: boolean } };
      expect(lastBcast.payload.standby).toBe(false);
    });
  });

  describe('onOperatorAcknowledge', () => {
    it('advances cueLights state to acknowledged and re-broadcasts', () => {
      const setReq: StandbyRequest = {
        topic: 'standby.request',
        cue_id: 'cue-1',
        cuelist_id: 'cl-1',
        departments: ['LX'],
        standby: true,
        station_id: 'sm-station',
        operator_id: 'op-sm',
      };
      ctx.deliver('standby.request', setReq);
      ctx.broadcasts.length = 0;

      const ackReq: OperatorAcknowledge = {
        topic: 'operator.acknowledge',
        cue_id: 'cue-1',
        cuelist_id: 'cl-1',
        department: 'LX',
        station_id: 'lx-station',
        operator_id: 'op-lx',
      };
      ctx.deliver('operator.acknowledge', ackReq);

      expect(ctx.ch.cueLights.getState('cue-1')['LX']).toBe('acknowledged');
      expect(ctx.broadcasts).toHaveLength(1);
      const msg = ctx.broadcasts[0] as { topic: string };
      expect(msg.topic).toBe('operator.acknowledge');
    });

    it('ignores ack for dept not in standby', () => {
      const ackReq: OperatorAcknowledge = {
        topic: 'operator.acknowledge',
        cue_id: 'cue-1',
        cuelist_id: 'cl-1',
        department: 'LX',
        station_id: 'lx-station',
        operator_id: 'op-lx',
      };
      ctx.deliver('operator.acknowledge', ackReq);
      expect(ctx.ch.cueLights.getState('cue-1')).toEqual({});
    });
  });

  describe('multi-department aggregation', () => {
    it('tracks multiple depts — partial ack does not satisfy isFullyAcknowledged', () => {
      ctx.deliver('standby.request', {
        topic: 'standby.request',
        cue_id: 'cue-5',
        cuelist_id: 'cl-1',
        departments: ['LX', 'SX', 'VIDEO'],
        standby: true,
        station_id: 'sm',
        operator_id: 'op-sm',
      } satisfies StandbyRequest);

      ctx.deliver('operator.acknowledge', {
        topic: 'operator.acknowledge',
        cue_id: 'cue-5',
        cuelist_id: 'cl-1',
        department: 'LX',
        station_id: 'lx',
        operator_id: 'op-lx',
      } satisfies OperatorAcknowledge);

      expect(ctx.ch.cueLights.isFullyAcknowledged('cue-5')).toBe(false);

      ctx.deliver('operator.acknowledge', {
        topic: 'operator.acknowledge',
        cue_id: 'cue-5',
        cuelist_id: 'cl-1',
        department: 'SX',
        station_id: 'sx',
        operator_id: 'op-sx',
      } satisfies OperatorAcknowledge);
      ctx.deliver('operator.acknowledge', {
        topic: 'operator.acknowledge',
        cue_id: 'cue-5',
        cuelist_id: 'cl-1',
        department: 'VIDEO',
        station_id: 'vid',
        operator_id: 'op-vid',
      } satisfies OperatorAcknowledge);

      expect(ctx.ch.cueLights.isFullyAcknowledged('cue-5')).toBe(true);
    });
  });

  describe('topic serialization', () => {
    it('standby.broadcast payload has correct topic field', () => {
      ctx.deliver('standby.request', {
        topic: 'standby.request',
        cue_id: 'cue-x',
        cuelist_id: 'cl-1',
        departments: ['SM'],
        standby: true,
        station_id: 'sm',
        operator_id: 'sm-op',
      } satisfies StandbyRequest);

      const msg = ctx.broadcasts[0] as { topic: string; payload: { topic: string } };
      expect(msg.topic).toBe('standby.broadcast');
      expect(msg.payload.topic).toBe('standby.broadcast');
    });

    it('operator.acknowledge re-broadcast preserves original payload', () => {
      ctx.deliver('standby.request', {
        topic: 'standby.request',
        cue_id: 'cue-y',
        cuelist_id: 'cl-1',
        departments: ['LX'],
        standby: true,
        station_id: 'sm',
        operator_id: 'sm-op',
      } satisfies StandbyRequest);
      ctx.broadcasts.length = 0;

      const ack: OperatorAcknowledge = {
        topic: 'operator.acknowledge',
        cue_id: 'cue-y',
        cuelist_id: 'cl-1',
        department: 'LX',
        station_id: 'lx-sta',
        operator_id: 'op-lx',
      };
      ctx.deliver('operator.acknowledge', ack);

      const msg = ctx.broadcasts[0] as { topic: string; payload: OperatorAcknowledge };
      expect(msg.topic).toBe('operator.acknowledge');
      expect(msg.payload.department).toBe('LX');
      expect(msg.payload.station_id).toBe('lx-sta');
    });
  });
});
