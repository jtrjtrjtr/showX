import type { MscPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import { resolveDeviceTransport } from '../resolveRouting.js';
import type { RoutingEntry, MscTransport } from '../resolveRouting.js';

const MSC_COMMAND_MAP: Record<MscPayload['command'], number> = {
  go: 0x01,
  stop: 0x02,
  resume: 0x03,
  load: 0x05,
  set: 0x0b,
  fire: 0x0c,
  all_off: 0x09,
};

/**
 * Build MSC SysEx bytes per protocol_dictionary.md §4.5.
 * Format: F0 7F <device_id> 02 <command_format=01> <command> [<cue_number_ascii> 00] [<cue_list_ascii> 00] F7
 *
 * Example: go, list=1, number=11 → F0 7F 01 02 01 01 31 31 00 31 00 F7
 * (Exposed for testing; the actual send call uses MscMessage format)
 */
export function buildMscSysEx(p: MscPayload, deviceId: number): number[] {
  const out: number[] = [0xf0, 0x7f, deviceId & 0x7f, 0x02, 0x01, MSC_COMMAND_MAP[p.command]];
  if (p.cue_number) {
    for (const c of p.cue_number) out.push(c.charCodeAt(0));
    out.push(0x00);
  }
  if (p.cue_list) {
    for (const c of p.cue_list) out.push(c.charCodeAt(0));
    out.push(0x00);
  }
  out.push(0xf7);
  return out;
}

/** Build the data bytes (payload after command byte, before F7) for use in MscMessage.data */
function buildMscData(p: MscPayload): number[] {
  const data: number[] = [];
  if (p.cue_number) {
    for (const c of p.cue_number) data.push(c.charCodeAt(0));
    data.push(0x00);
  }
  if (p.cue_list) {
    for (const c of p.cue_list) data.push(c.charCodeAt(0));
    data.push(0x00);
  }
  return data;
}

export async function dispatchMsc(
  payload: MscPayload,
  routing: Record<string, RoutingEntry>,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const transport = resolveDeviceTransport(payload.device_id, 'msc', routing);
  if (!transport || transport.kind !== 'msc') {
    return { ok: false, error: `no msc routing for device ${payload.device_id}` };
  }
  const msc = transport as MscTransport;
  // Routing device_id_msc overrides payload-level device_id_msc; 0x7F = all-call
  const deviceId = msc.device_id_msc ?? payload.device_id_msc;
  const result = await deps.output.send({
    transport: 'msc',
    midiPortName: msc.port_name,
    deviceId: deviceId & 0x7f,
    commandFormat: 0x01, // lighting
    command: MSC_COMMAND_MAP[payload.command],
    data: buildMscData(payload),
  });
  return { ok: result.ok, error: result.error };
}
