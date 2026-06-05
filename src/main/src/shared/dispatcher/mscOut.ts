import type { MscMessage, DispatchResult } from 'showx-shared';
import type { MidiOutPool } from './midiOut.js';

/**
 * MSC SysEx frame: F0 7F <deviceId> 02 <commandFormat> <command> <data...> F7
 * All bytes in positions 2–6+ MUST be masked to 7 bits (0x7F) per MIDI spec.
 */
export function encodeMsc(msg: MscMessage): number[] {
  const frame: number[] = [];
  frame.push(0xf0);
  frame.push(0x7f);
  frame.push(msg.deviceId & 0x7f);
  frame.push(0x02);
  frame.push(msg.commandFormat & 0x7f);
  frame.push(msg.command & 0x7f);
  for (const b of msg.data) frame.push(b & 0x7f);
  frame.push(0xf7);
  return frame;
}

export class MscOut {
  constructor(private readonly midi: MidiOutPool) {}

  /**
   * MSC claims + releases the MIDI port per call.
   * This is intentionally simple for MVP — MSC fires are infrequent (one per cue).
   */
  async send(msg: MscMessage, ownerSlug: string): Promise<DispatchResult> {
    const claim = this.midi.claim(msg.midiPortName, ownerSlug);
    if (!claim.ok) {
      return { ok: false, transport: 'msc', latencyMs: 0, error: `port_owned_by_${claim.ownerSlug}` };
    }
    try {
      const bytes = encodeMsc(msg);
      const r = await claim.send({ transport: 'midi', midiPortName: msg.midiPortName, bytes });
      return { ...r, transport: 'msc' };
    } finally {
      claim.release();
    }
  }
}
