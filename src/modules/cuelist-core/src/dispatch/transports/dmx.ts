import type { DmxPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import { resolveDeviceTransport } from '../resolveRouting.js';
import type { RoutingEntry, DmxTransport } from '../resolveRouting.js';
import { getRoutingRules } from '../../document/routing.js';
import type * as Y from 'yjs';

/**
 * Build a flat 512-element channel data array from sparse channel/value pairs.
 * channel is 1-based; data[i] = value for channel i+1.
 */
export function buildDmxData(channels: DmxPayload['channels']): number[] {
  const data = new Array<number>(512).fill(0);
  for (const { channel, value } of channels) {
    data[channel - 1] = value;
  }
  return data;
}

/**
 * Resolve the DMX wire protocol (artnet vs sacn) for the logical device_id.
 * Checks the target device's `dmx_protocol` field via routing rules.
 * Defaults to 'artnet' when not specified.
 */
function resolveDmxProtocol(deviceId: string, doc: Y.Doc): 'artnet' | 'sacn' {
  const rules = getRoutingRules(doc);
  const devicesRaw = doc.getMap('devices').toJSON() as Record<string, Record<string, unknown>>;

  for (const rule of rules) {
    if (rule.match.device_id === deviceId) {
      const device = devicesRaw[rule.target_device_id];
      if (device?.['dmx_protocol'] === 'sacn') return 'sacn';
      if (device?.['dmx_protocol'] === 'artnet') return 'artnet';
    }
  }

  // Also check direct device lookup (device_id IS the hardware device key)
  const direct = devicesRaw[deviceId];
  if (direct?.['dmx_protocol'] === 'sacn') return 'sacn';

  return 'artnet';
}

export async function dispatchDmx(
  payload: DmxPayload,
  routing: Record<string, RoutingEntry>,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const transport = resolveDeviceTransport(payload.device_id, 'dmx', routing);
  if (!transport) {
    return { ok: false, error: 'no_route' };
  }
  if (transport.kind !== 'dmx') {
    return { ok: false, error: `device ${payload.device_id} not mapped to dmx transport (got ${transport.kind})` };
  }
  const dmx = transport as DmxTransport;
  const protocol = resolveDmxProtocol(payload.device_id, deps.doc);
  const data = buildDmxData(payload.channels);

  const result = await deps.output.send(
    protocol === 'sacn'
      ? { transport: 'dmx-sacn', universe: dmx.universe, data }
      : { transport: 'dmx-artnet', universe: dmx.universe, data, host: '255.255.255.255' },
  );
  return { ok: result.ok, error: result.error };
}
