import { describe, it, expectTypeOf } from 'vitest';
import type {
  Module,
  ModuleManifest,
  ModuleContext,
  ModuleState,
  Transport,
  TransportMessage,
  OscMessage,
  MidiMessage,
  Payload,
  OscPayload,
  ShowxEvent,
  CueFiredEvent,
  Logger,
  EventBus,
  OutputDispatcher,
  DispatchResult,
} from 'showx-shared';

describe('module types', () => {
  it('ModuleManifest requires slug + entry', () => {
    expectTypeOf<ModuleManifest>().toHaveProperty('slug').toBeString();
    expectTypeOf<ModuleManifest>().toHaveProperty('entry');
  });

  it('ModuleState includes all lifecycle phases', () => {
    expectTypeOf<ModuleState>().toEqualTypeOf<
      | 'discovered'
      | 'validated'
      | 'gated'
      | 'init'
      | 'started'
      | 'stopping'
      | 'stopped'
      | 'torn_down'
      | 'failed'
      | 'unloadable'
    >();
  });

  it('Module interface has lifecycle methods', () => {
    expectTypeOf<Module>().toHaveProperty('init').toBeFunction();
    expectTypeOf<Module>().toHaveProperty('start').toBeFunction();
    expectTypeOf<Module>().toHaveProperty('stop').toBeFunction();
    expectTypeOf<Module>().toHaveProperty('teardown').toBeFunction();
  });
});

describe('transport types', () => {
  it('TransportMessage narrows by transport field', () => {
    const msg = {} as TransportMessage;
    if (msg.transport === 'osc') expectTypeOf(msg).toEqualTypeOf<OscMessage>();
    if (msg.transport === 'midi') expectTypeOf(msg).toEqualTypeOf<MidiMessage>();
  });

  it('Transport union is closed', () => {
    expectTypeOf<Transport>().toEqualTypeOf<
      'osc' | 'midi' | 'msc' | 'dmx-artnet' | 'dmx-sacn' | 'webhook'
    >();
  });

  it('OscMessage has required fields', () => {
    expectTypeOf<OscMessage>().toHaveProperty('address').toBeString();
    expectTypeOf<OscMessage>().toHaveProperty('host').toBeString();
    expectTypeOf<OscMessage>().toHaveProperty('port').toBeNumber();
  });
});

describe('payload types', () => {
  it('Payload narrows by kind', () => {
    const p = {} as Payload;
    if (p.kind === 'osc') expectTypeOf(p).toEqualTypeOf<OscPayload>();
  });

  it('OscPayload has required fields', () => {
    expectTypeOf<OscPayload>().toHaveProperty('kind');
    expectTypeOf<OscPayload>().toHaveProperty('address').toBeString();
  });
});

describe('event bus types', () => {
  it('ShowxEvent narrows by type', () => {
    const e = {} as ShowxEvent;
    if (e.type === 'cue-fired') expectTypeOf(e).toEqualTypeOf<CueFiredEvent>();
  });

  it('CueFiredEvent has required fields', () => {
    expectTypeOf<CueFiredEvent>().toHaveProperty('showId').toBeString();
    expectTypeOf<CueFiredEvent>().toHaveProperty('cueId').toBeString();
    expectTypeOf<CueFiredEvent>().toHaveProperty('firedAt').toBeNumber();
  });
});

describe('service interfaces', () => {
  it('Logger has all level methods', () => {
    expectTypeOf<Logger>().toHaveProperty('debug').toBeFunction();
    expectTypeOf<Logger>().toHaveProperty('info').toBeFunction();
    expectTypeOf<Logger>().toHaveProperty('warn').toBeFunction();
    expectTypeOf<Logger>().toHaveProperty('error').toBeFunction();
    expectTypeOf<Logger>().toHaveProperty('child').toBeFunction();
  });

  it('EventBus.publish accepts only ShowxEvent', () => {
    type Pub = EventBus['publish'];
    expectTypeOf<Pub>().parameter(0).toMatchTypeOf<ShowxEvent>();
  });

  it('OutputDispatcher.send returns Promise<DispatchResult>', () => {
    expectTypeOf<OutputDispatcher['send']>().returns.toMatchTypeOf<Promise<DispatchResult>>();
  });

  it('OutputDispatcher.send returns Promise with ok field', () => {
    expectTypeOf<OutputDispatcher['send']>().returns.toMatchTypeOf<Promise<{ ok: boolean }>>();
  });
});

describe('ModuleContext', () => {
  it('exposes all required services', () => {
    expectTypeOf<ModuleContext>().toHaveProperty('output');
    expectTypeOf<ModuleContext>().toHaveProperty('input');
    expectTypeOf<ModuleContext>().toHaveProperty('sync');
    expectTypeOf<ModuleContext>().toHaveProperty('persisted');
    expectTypeOf<ModuleContext>().toHaveProperty('secrets');
    expectTypeOf<ModuleContext>().toHaveProperty('log');
    expectTypeOf<ModuleContext>().toHaveProperty('events');
    expectTypeOf<ModuleContext>().toHaveProperty('health');
    expectTypeOf<ModuleContext>().toHaveProperty('abortSignal').toEqualTypeOf<AbortSignal>();
  });
});
