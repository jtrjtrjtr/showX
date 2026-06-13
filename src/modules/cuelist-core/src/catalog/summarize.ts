import type { Payload, MidiPayload } from 'showx-shared';

export function summarizePayload(p: Payload): string {
  switch (p.type) {
    case 'osc':
      return `OSC ${p.address} → ${p.device_id} (${p.args.length} args)`;
    case 'msc': {
      const list = p.cue_list ?? 'current';
      const num = p.cue_number ?? 'current';
      return `MSC ${p.command.toUpperCase()} cue ${num} list ${list} → ${p.device_id}`;
    }
    case 'lx_ref':
      return `Eos/MA cue list ${p.cue_list}, cue ${p.cue_number} → ${p.device_id}`;
    case 'midi':
      return summarizeMidi(p);
    case 'dmx':
      return `DMX u${p.universe} ${p.channels.length}ch → ${p.device_id}`;
    case 'webhook':
      return `${p.method} ${p.url}`;
    case 'wait':
      return `Wait ${p.duration_ms}ms`;
    case 'group':
      return `Group fire ${p.child_cue_ids.length} cues ${p.fire_mode}`;
    default: {
      const exhaustive: never = p;
      return `Unknown payload type ${(exhaustive as { type: string }).type}`;
    }
  }
}

function summarizeMidi(p: MidiPayload): string {
  const msg = p.message;
  switch (msg.kind) {
    case 'note_on':
      return `MIDI note_on ch ${msg.channel} n ${msg.note} v ${msg.velocity} → ${p.device_id}`;
    case 'note_off':
      return `MIDI note_off ch ${msg.channel} n ${msg.note} → ${p.device_id}`;
    case 'cc':
      return `MIDI CC ch ${msg.channel} #${msg.controller}=${msg.value} → ${p.device_id}`;
    case 'program_change':
      return `MIDI PC ch ${msg.channel} prog ${msg.program} → ${p.device_id}`;
    case 'raw':
      return `MIDI raw ${msg.bytes.length} bytes → ${p.device_id}`;
    default: {
      const exhaustive: never = msg;
      return `MIDI → ${p.device_id} (kind: ${(exhaustive as { kind: string }).kind})`;
    }
  }
}
