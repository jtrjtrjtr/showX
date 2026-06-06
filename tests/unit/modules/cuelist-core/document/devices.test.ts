import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { initShowDoc, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  addDevice,
  updateDevice,
  removeDevice,
  getDevice,
  getDevicesList,
  validateDevice,
  DuplicateDeviceError,
  DeviceInUseError,
  type Device,
  type ActorCtx,
} from '../../../../../src/modules/cuelist-core/src/document/devices.js';
import { ValidationError } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { LockedError } from '../../../../../src/modules/cuelist-core/src/mode/lockGuards.js';
import { getRoutingRules } from '../../../../../src/modules/cuelist-core/src/document/routing.js';

function makeDoc(): Y.Doc {
  return initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
}

const ctx: ActorCtx = { actorId: 'op1' };

const oscDevice: Device = {
  device_id: 'lx_eos',
  label: 'ETC Eos',
  transport: 'osc',
  host: '192.168.1.100',
  port: 8000,
  driver: 'eos',
};

const midiDevice: Device = {
  device_id: 'midi_console',
  label: 'MIDI Console',
  transport: 'midi',
  midi_port: 'IAC Driver Bus 1',
};

describe('validateDevice', () => {
  it('accepts a valid OSC device', () => {
    expect(() => validateDevice(oscDevice)).not.toThrow();
  });

  it('accepts a valid MIDI device', () => {
    expect(() => validateDevice(midiDevice)).not.toThrow();
  });

  it('accepts a valid DMX device', () => {
    expect(() => validateDevice({ device_id: 'dmx_1', label: 'DMX Universe 1', transport: 'dmx', dmx_universe: 1 })).not.toThrow();
  });

  it('rejects device_id with uppercase letters', () => {
    expect(() => validateDevice({ ...oscDevice, device_id: 'LX_Eos' })).toThrow(ValidationError);
  });

  it('rejects device_id with spaces', () => {
    expect(() => validateDevice({ ...oscDevice, device_id: 'lx eos' })).toThrow(ValidationError);
  });

  it('rejects empty label', () => {
    expect(() => validateDevice({ ...oscDevice, label: '  ' })).toThrow(ValidationError);
  });

  it('rejects invalid host', () => {
    expect(() => validateDevice({ ...oscDevice, host: 'not a host!' })).toThrow(ValidationError);
  });

  it('accepts IPv4 host', () => {
    expect(() => validateDevice({ ...oscDevice, host: '192.168.1.1' })).not.toThrow();
  });

  it('accepts hostname', () => {
    expect(() => validateDevice({ ...oscDevice, host: 'eos-console.local' })).not.toThrow();
  });

  it('rejects port 0', () => {
    expect(() => validateDevice({ ...oscDevice, port: 0 })).toThrow(ValidationError);
  });

  it('rejects port 65536', () => {
    expect(() => validateDevice({ ...oscDevice, port: 65536 })).toThrow(ValidationError);
  });

  it('accepts port 65535', () => {
    expect(() => validateDevice({ ...oscDevice, port: 65535 })).not.toThrow();
  });

  it('rejects driver on non-OSC transport', () => {
    expect(() => validateDevice({ ...midiDevice, driver: 'eos' })).toThrow(ValidationError);
  });

  it('rejects dmx_universe on non-DMX transport', () => {
    expect(() => validateDevice({ ...oscDevice, dmx_universe: 1 })).toThrow(ValidationError);
  });
});

describe('addDevice', () => {
  let doc: Y.Doc;
  beforeEach(() => { doc = makeDoc(); });

  it('adds device to doc', () => {
    addDevice(doc, oscDevice, ctx);
    const d = getDevice(doc, 'lx_eos');
    expect(d).toBeDefined();
    expect(d!.label).toBe('ETC Eos');
    expect(d!.transport).toBe('osc');
  });

  it('getDevicesList returns added device', () => {
    addDevice(doc, oscDevice, ctx);
    const list = getDevicesList(doc);
    expect(list).toHaveLength(1);
    expect(list[0].device_id).toBe('lx_eos');
  });

  it('auto-creates default routing rule', () => {
    addDevice(doc, oscDevice, ctx);
    const rules = getRoutingRules(doc);
    expect(rules).toHaveLength(1);
    expect(rules[0].target_device_id).toBe('lx_eos');
    expect(rules[0].match.payload_type).toBe('osc');
  });

  it('auto-rule for DMX device has no payload_type (no DMX payload type)', () => {
    const dmxDev: Device = { device_id: 'dmx_1', label: 'DMX', transport: 'dmx', dmx_universe: 1 };
    addDevice(doc, dmxDev, ctx);
    const rules = getRoutingRules(doc);
    expect(rules).toHaveLength(1);
    expect(rules[0].match.payload_type).toBeUndefined();
  });

  it('throws DuplicateDeviceError on duplicate device_id', () => {
    addDevice(doc, oscDevice, ctx);
    expect(() => addDevice(doc, oscDevice, ctx)).toThrow(DuplicateDeviceError);
  });

  it('throws ValidationError for invalid device', () => {
    expect(() => addDevice(doc, { ...oscDevice, device_id: 'INVALID ID' }, ctx)).toThrow(ValidationError);
  });

  it('throws LockedError in SHOW mode', () => {
    setMode(doc, 'show');
    expect(() => addDevice(doc, oscDevice, ctx)).toThrow(LockedError);
  });

  it('does not strip valid fields from the device', () => {
    addDevice(doc, oscDevice, ctx);
    const d = getDevice(doc, 'lx_eos');
    expect(d!.host).toBe('192.168.1.100');
    expect(d!.port).toBe(8000);
    expect(d!.driver).toBe('eos');
  });
});

describe('updateDevice', () => {
  let doc: Y.Doc;
  beforeEach(() => {
    doc = makeDoc();
    addDevice(doc, oscDevice, ctx);
  });

  it('updates label', () => {
    updateDevice(doc, 'lx_eos', { label: 'Eos Ti' }, ctx);
    expect(getDevice(doc, 'lx_eos')!.label).toBe('Eos Ti');
  });

  it('updates port', () => {
    updateDevice(doc, 'lx_eos', { port: 9000 }, ctx);
    expect(getDevice(doc, 'lx_eos')!.port).toBe(9000);
  });

  it('throws for unknown device', () => {
    expect(() => updateDevice(doc, 'nonexistent', { label: 'x' }, ctx)).toThrow(/not found/);
  });

  it('throws LockedError in SHOW mode', () => {
    setMode(doc, 'show');
    expect(() => updateDevice(doc, 'lx_eos', { label: 'x' }, ctx)).toThrow(LockedError);
  });

  it('throws ValidationError for invalid patch', () => {
    expect(() => updateDevice(doc, 'lx_eos', { port: 99999 }, ctx)).toThrow(ValidationError);
  });
});

describe('removeDevice', () => {
  let doc: Y.Doc;
  beforeEach(() => {
    doc = makeDoc();
    addDevice(doc, oscDevice, ctx);
  });

  it('removes device from doc', () => {
    // The auto-created routing rule references the device — need force
    removeDevice(doc, 'lx_eos', { force: true }, ctx);
    expect(getDevice(doc, 'lx_eos')).toBeUndefined();
    expect(getDevicesList(doc)).toHaveLength(0);
  });

  it('throws DeviceInUseError when routing rules reference device', () => {
    // Auto-rule was created on addDevice
    expect(() => removeDevice(doc, 'lx_eos', {}, ctx)).toThrow(DeviceInUseError);
  });

  it('DeviceInUseError includes dependent rule ids', () => {
    try {
      removeDevice(doc, 'lx_eos', {}, ctx);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DeviceInUseError);
      expect((e as DeviceInUseError).dependentRuleIds.length).toBeGreaterThan(0);
    }
  });

  it('cascade-delete removes dependent routing rules', () => {
    const rulesBefore = getRoutingRules(doc);
    expect(rulesBefore.length).toBeGreaterThan(0);
    removeDevice(doc, 'lx_eos', { force: true }, ctx);
    const rulesAfter = getRoutingRules(doc);
    expect(rulesAfter).toHaveLength(0);
  });

  it('throws LockedError in SHOW mode', () => {
    setMode(doc, 'show');
    expect(() => removeDevice(doc, 'lx_eos', {}, ctx)).toThrow(LockedError);
  });

  it('throws for unknown device', () => {
    expect(() => removeDevice(doc, 'nonexistent', {}, ctx)).toThrow(/not found/);
  });
});

describe('multiple devices', () => {
  it('can add multiple devices', () => {
    const doc = makeDoc();
    addDevice(doc, oscDevice, ctx);
    addDevice(doc, midiDevice, ctx);
    expect(getDevicesList(doc)).toHaveLength(2);
  });

  it('each gets their own auto-routing rule', () => {
    const doc = makeDoc();
    addDevice(doc, oscDevice, ctx);
    addDevice(doc, midiDevice, ctx);
    const rules = getRoutingRules(doc);
    expect(rules).toHaveLength(2);
    const targets = rules.map((r) => r.target_device_id);
    expect(targets).toContain('lx_eos');
    expect(targets).toContain('midi_console');
  });
});
