import * as Y from 'yjs';
import { uuidv7 } from './uuid.js';
import { getDevices, getRouting } from './show.js';
import { ValidationError } from './payload.js';
import { assertEditAllowed } from '../mode/lockGuards.js';

export type DeviceTransport = 'osc' | 'midi' | 'msc' | 'dmx';
export type DeviceDriver = 'eos' | 'ma3' | 'hog4' | 'chamsys' | 'qlab' | 'generic';

export interface Device {
  device_id: string;
  label: string;
  transport: DeviceTransport;
  host?: string;
  port?: number;
  driver?: DeviceDriver;
  midi_port?: string;
  dmx_universe?: number;
  notes?: string;
}

export interface ActorCtx {
  actorId: string;
}

export class DeviceInUseError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly dependentRuleIds: string[],
  ) {
    super(`device '${deviceId}' is referenced by routing rules: ${dependentRuleIds.join(', ')}`);
    this.name = 'DeviceInUseError';
  }
}

export class DuplicateDeviceError extends Error {
  constructor(public readonly deviceId: string) {
    super(`device '${deviceId}' already exists`);
    this.name = 'DuplicateDeviceError';
  }
}

const DEVICE_ID_RE = /^[a-z0-9_-]+$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidHost(host: string): boolean {
  return IPV4_RE.test(host) || HOSTNAME_RE.test(host);
}

export function validateDevice(init: Device): void {
  if (!init.device_id || !DEVICE_ID_RE.test(init.device_id)) {
    throw new ValidationError('device_id must match [a-z0-9_-]+', 'device_id');
  }
  if (!init.label || init.label.trim().length === 0) {
    throw new ValidationError('label is required', 'label');
  }
  if (!['osc', 'midi', 'msc', 'dmx'].includes(init.transport)) {
    throw new ValidationError('transport must be osc | midi | msc | dmx', 'transport');
  }
  if (init.host !== undefined && !isValidHost(init.host)) {
    throw new ValidationError('host must be a valid IPv4 or hostname', 'host');
  }
  if (init.port !== undefined && (init.port < 1 || init.port > 65535)) {
    throw new ValidationError('port must be 1..65535', 'port');
  }
  if (init.driver !== undefined && init.transport !== 'osc') {
    throw new ValidationError('driver is only valid for transport=osc', 'driver');
  }
  if (
    init.driver !== undefined &&
    !['eos', 'ma3', 'hog4', 'chamsys', 'qlab', 'generic'].includes(init.driver)
  ) {
    throw new ValidationError(
      'driver must be eos | ma3 | hog4 | chamsys | qlab | generic',
      'driver',
    );
  }
  if (init.dmx_universe !== undefined && init.transport !== 'dmx') {
    throw new ValidationError('dmx_universe is only valid for transport=dmx', 'dmx_universe');
  }
}

function deviceMapToPlain(m: Y.Map<unknown>): Device {
  const obj = m.toJSON();
  // Strip internal metadata fields before returning
  const { added_by: _a, added_at: _b, modified_by: _c, modified_at: _d, ...rest } = obj as Record<string, unknown>;
  return rest as unknown as Device;
}

export function getDevicesList(doc: Y.Doc): Device[] {
  const devices = getDevices(doc);
  const result: Device[] = [];
  devices.forEach((m) => result.push(deviceMapToPlain(m as Y.Map<unknown>)));
  return result;
}

export function getDevice(doc: Y.Doc, id: string): Device | undefined {
  const m = getDevices(doc).get(id);
  if (!m) return undefined;
  return deviceMapToPlain(m as Y.Map<unknown>);
}

function findDependentRuleIds(doc: Y.Doc, deviceId: string): string[] {
  const routing = getRouting(doc);
  const deps: string[] = [];
  routing.forEach((ruleMap, ruleId) => {
    const targetDeviceId = ruleMap.get('target_device_id') as string | undefined;
    const match = ruleMap.get('match') as { device_id?: string } | undefined;
    if (targetDeviceId === deviceId || match?.device_id === deviceId) {
      deps.push(ruleId);
    }
  });
  return deps;
}

function transportToPayloadType(transport: DeviceTransport): string | undefined {
  switch (transport) {
    case 'osc': return 'osc';
    case 'midi': return 'midi';
    case 'msc': return 'msc';
    case 'dmx': return undefined;
  }
}

export function addDevice(doc: Y.Doc, init: Device, ctx: ActorCtx): Device {
  assertEditAllowed(doc, 'structure');
  validateDevice(init);
  const devices = getDevices(doc);
  if (devices.has(init.device_id)) {
    throw new DuplicateDeviceError(init.device_id);
  }

  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(init)) {
    if (v !== undefined) m.set(k, v);
  }
  m.set('added_by', ctx.actorId);
  m.set('added_at', new Date().toISOString());

  doc.transact(() => {
    devices.set(init.device_id, m);

    // Auto-create a default routing rule for the new device
    const payloadType = transportToPayloadType(init.transport);
    const routing = getRouting(doc);
    const ruleId = uuidv7();
    const rule = new Y.Map<unknown>();
    rule.set('rule_id', ruleId);
    rule.set('sort_key', (routing.size + 1) * 1000);
    const match: Record<string, string> = {};
    if (payloadType) match.payload_type = payloadType;
    rule.set('match', match);
    rule.set('target_device_id', init.device_id);
    rule.set('notes', `Auto-created for ${init.device_id}`);
    rule.set('added_by', ctx.actorId);
    rule.set('added_at', new Date().toISOString());
    routing.set(ruleId, rule);
  });

  return init;
}

export function updateDevice(
  doc: Y.Doc,
  id: string,
  patch: Partial<Omit<Device, 'device_id'>>,
  ctx: ActorCtx,
): void {
  assertEditAllowed(doc, 'structure');
  const devices = getDevices(doc);
  const m = devices.get(id) as Y.Map<unknown> | undefined;
  if (!m) throw new Error(`device '${id}' not found`);

  const current = deviceMapToPlain(m);
  const merged = { ...current, ...patch };
  validateDevice(merged);

  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        m.delete(k);
      } else {
        m.set(k, v as unknown);
      }
    }
    m.set('modified_by', ctx.actorId);
    m.set('modified_at', new Date().toISOString());
  });
}

export function removeDevice(
  doc: Y.Doc,
  id: string,
  opts: { force?: boolean } = {},
  _ctx: ActorCtx,
): void {
  assertEditAllowed(doc, 'structure');
  const devices = getDevices(doc);
  if (!devices.has(id)) throw new Error(`device '${id}' not found`);

  const deps = findDependentRuleIds(doc, id);
  if (deps.length > 0 && !opts.force) {
    throw new DeviceInUseError(id, deps);
  }

  doc.transact(() => {
    if (opts.force) {
      const routing = getRouting(doc);
      for (const ruleId of deps) routing.delete(ruleId);
    }
    devices.delete(id);
  });
}
