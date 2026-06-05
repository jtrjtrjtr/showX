import type { MidiPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import { resolveDeviceTransport } from '../resolveRouting.js';
import type { RoutingEntry, MidiTransport } from '../resolveRouting.js';

function buildMidiBytes(msg: MidiPayload['message']): number[] {
  switch (msg.kind) {
    case 'note_on':
      return [0x90 | ((msg.channel - 1) & 0x0f), msg.note & 0x7f, msg.velocity & 0x7f];
    case 'note_off':
      return [0x80 | ((msg.channel - 1) & 0x0f), msg.note & 0x7f, msg.velocity & 0x7f];
    case 'cc':
      return [0xb0 | ((msg.channel - 1) & 0x0f), msg.controller & 0x7f, msg.value & 0x7f];
    case 'program_change':
      return [0xc0 | ((msg.channel - 1) & 0x0f), msg.program & 0x7f];
    case 'raw':
      return msg.bytes.slice();
  }
}

export async function dispatchMidi(
  payload: MidiPayload,
  routing: Record<string, RoutingEntry>,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const transport = resolveDeviceTransport(payload.device_id, 'midi', routing);
  if (!transport || transport.kind !== 'midi') {
    return { ok: false, error: `no midi routing for device ${payload.device_id}` };
  }
  const midi = transport as MidiTransport;
  const result = await deps.output.send({
    transport: 'midi',
    midiPortName: midi.port_name,
    bytes: buildMidiBytes(payload.message),
  });
  return { ok: result.ok, error: result.error };
}
