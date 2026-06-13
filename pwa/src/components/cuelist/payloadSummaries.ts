import type { Cue, Payload, OscPayload, MidiPayload } from 'showx-shared';
import { isCanonicalDepartment } from 'showx-shared';

export function summarizePayload(p: Payload): string {
  switch (p.type) {
    case 'lx_ref':
      return `Eos ${p.cue_list}/${p.cue_number}`;
    case 'osc':
      return p.address;
    case 'msc':
      return `MSC ${p.command}${p.cue_number ? ` ${p.cue_number}` : ''}`;
    case 'midi':
      return `MIDI ${p.message.kind}`;
    case 'dmx':
      return `DMX u${p.universe} ${p.channels.length}ch`;
    case 'webhook':
      return 'HTTP';
    case 'wait':
      return `Wait ${p.duration_ms}ms`;
    case 'group':
      return 'Group';
  }
}

export function lxConsoleSummary(cue: Cue): string {
  const lxRef = cue.payloads.find((p) => p.type === 'lx_ref');
  if (lxRef && lxRef.type === 'lx_ref') return `Cue ${lxRef.cue_list}/${lxRef.cue_number}`;
  return '—';
}

export function videoAssetSummary(cue: Cue): string {
  const osc = cue.payloads.find((p) => p.type === 'osc') as OscPayload | undefined;
  if (osc) {
    const parts = osc.address.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? osc.address;
  }
  return '—';
}

export function videoTimingHint(cue: Cue): string {
  if (cue.duration_hint_ms != null) {
    return `${Math.round(cue.duration_hint_ms / 1000)}s`;
  }
  return '';
}

export function soundPayloadSummary(cue: Cue): string {
  const osc = cue.payloads.find((p) => p.type === 'osc') as OscPayload | undefined;
  if (osc) return osc.address;
  const midi = cue.payloads.find((p) => p.type === 'midi') as MidiPayload | undefined;
  if (midi) return `MIDI ${midi.message.kind}`;
  return '—';
}

export function automationPosSummary(cue: Cue): string {
  const osc = cue.payloads.find(
    (p) => p.type === 'osc' && /pos|move|fly/i.test((p as OscPayload).address),
  ) as OscPayload | undefined;
  return osc ? osc.address : '—';
}

export function pyroChargeRef(cue: Cue): string {
  const osc = cue.payloads.find((p) => p.type === 'osc') as OscPayload | undefined;
  return osc ? osc.address : cue.label;
}

export function fsPositionSummary(cue: Cue): string {
  const osc = cue.payloads.find((p) => p.type === 'osc') as OscPayload | undefined;
  return osc ? osc.address : '—';
}

export function getPayloadSummaryForDept(cue: Cue, dept: string): string {
  const tagged = cue.payloads.find((p) => p.tag === dept);
  if (tagged) return summarizePayload(tagged);
  if (cue.payloads.length > 0) return summarizePayload(cue.payloads[0]);
  return '—';
}

export function highlightedPayloads(cue: Cue, owned: ReadonlySet<string>): Set<string> {
  const ownedHasAny = cue.department.some((d) => owned.has(d));
  const result = new Set<string>();
  if (!ownedHasAny) return result;
  const isCompound = cue.department.length > 1;
  for (const p of cue.payloads) {
    const ptag = p.tag ?? '';
    if (isCompound && isCanonicalDepartment(ptag)) {
      if (owned.has(ptag)) result.add(p.id);
    } else {
      result.add(p.id);
    }
  }
  return result;
}
