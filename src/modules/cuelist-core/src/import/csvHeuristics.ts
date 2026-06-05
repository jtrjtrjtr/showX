import type { CsvImportOpts, CsvWarning, CueSpec } from './csvImport.js';

// ── QLab heuristic ────────────────────────────────────────────────────────────

function inferQlabDepartment(type: string): string {
  if (type === 'audio') return 'SX';
  if (type === 'video') return 'VIDEO';
  return 'OTHER';
}

export function qlabToCues(
  records: Record<string, string>[],
  opts: CsvImportOpts,
  warnings: CsvWarning[],
): CueSpec[] {
  return records.map((r, idx) => {
    const row = idx + 1;
    const label = r['Number'] ?? r['Q#'] ?? `Q${row}`;
    const name = r['Name'] ?? '';
    const type = (r['Type'] ?? '').toLowerCase().trim();
    const dept = inferQlabDepartment(type);
    const preWait = parseFloat(r['Pre-wait'] ?? '0') || 0;
    const cont = (r['Continue'] ?? '').toLowerCase().trim();
    const notes = r['Notes'] ?? '';

    const payloads: CueSpec['payloads'] = [];
    if (type === 'audio') {
      payloads.push({
        type: 'osc',
        tag: 'SX',
        note: name,
        device_id: 'dev_qlab',
        address: `/cue/${label}/start`,
        args: [],
      });
    } else if (type === 'video') {
      payloads.push({
        type: 'osc',
        tag: 'VIDEO',
        note: name,
        device_id: 'dev_qlab',
        address: `/cue/${label}/start`,
        args: [],
      });
    } else if (type === 'osc' || type === 'network') {
      const address = r['OSC Address'] ?? '/cue/start';
      payloads.push({
        type: 'osc',
        tag: null,
        note: name,
        device_id: 'dev_qlab',
        address: address.startsWith('/') ? address : `/${address}`,
        args: [],
      });
    } else if (type === 'wait') {
      const waitMs = Math.round(preWait * 1000);
      payloads.push({ type: 'wait', tag: null, note: name, duration_ms: waitMs >= 0 ? waitMs : 0 });
    }

    let trigger: CueSpec['cueOpts']['trigger'];
    if (cont === 'auto-continue' || cont === 'continue' || cont === 'auto continue') {
      // Continue field: use pre-wait as delay_ms when present, otherwise 0
      trigger = { kind: 'auto_continue', delay_ms: preWait > 0 ? Math.round(preWait * 1000) : 0 };
    } else if (preWait > 0) {
      trigger = { kind: 'auto_continue', delay_ms: Math.round(preWait * 1000) };
    } else {
      trigger = { kind: 'manual' };
    }

    return {
      row,
      cueOpts: {
        label: label.trim() || `Q${row}`,
        description: name,
        department: [dept],
        standby_note: notes.trim(),
        trigger,
        created_by: opts.createdBy,
      },
      payloads,
    };
  });
}

// ── Eos heuristic ─────────────────────────────────────────────────────────────

export function eosToCues(
  records: Record<string, string>[],
  opts: CsvImportOpts,
  warnings: CsvWarning[],
): CueSpec[] {
  const defaultDevice = opts.defaultLxDevice ?? 'dev_eos';
  const result: CueSpec[] = [];
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const row = idx + 1;
    const rawCue = r['Cue'] ?? '';
    const cueNumber = parseFloat(rawCue);
    if (Number.isNaN(cueNumber)) {
      warnings.push({ row, message: `Invalid Eos cue number "${rawCue}"` });
      continue;
    }
    const label = (r['Label'] ?? '').trim() || `Q${cueNumber}`;
    const followTime = parseFloat(r['FollowTime'] ?? '0') || 0;
    const trigger: CueSpec['cueOpts']['trigger'] =
      followTime > 0
        ? { kind: 'auto_continue', delay_ms: Math.round(followTime * 1000) }
        : { kind: 'manual' };

    result.push({
      row,
      cueOpts: {
        label,
        description: label,
        department: ['LX'],
        standby_note: (r['Notes'] ?? '').trim(),
        trigger,
        created_by: opts.createdBy,
      },
      payloads: [
        {
          type: 'lx_ref',
          tag: 'LX',
          note: label,
          device_id: defaultDevice,
          cue_list: 1,
          cue_number: cueNumber,
        },
      ],
    });
  }
  return result;
}

// ── Generic heuristic ─────────────────────────────────────────────────────────

export function genericToCues(
  records: Record<string, string>[],
  opts: CsvImportOpts,
  warnings: CsvWarning[],
): CueSpec[] {
  return records.map((r, idx) => {
    const row = idx + 1;
    const label =
      (r['Q#'] ?? r['Cue'] ?? r['Number'] ?? '').trim() || `Q${row}`;
    const description = (r['Label'] ?? r['Name'] ?? '').trim();
    const deptStr =
      (r['Department'] ?? r['Dept'] ?? opts.defaultDepartment ?? 'OTHER').trim();
    const departments = deptStr
      .split(/[,;|]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (departments.length === 0) departments.push('OTHER');
    const standby = (r['Standby'] ?? r['Notes'] ?? '').trim();
    const payloads: CueSpec['payloads'] = [];

    const lxRaw = r['LX-cue'] ?? r['Eos'] ?? '';
    if (lxRaw.trim()) {
      const cueNumber = parseFloat(lxRaw);
      if (!Number.isNaN(cueNumber)) {
        payloads.push({
          type: 'lx_ref',
          tag: 'LX',
          note: '',
          device_id: opts.defaultLxDevice ?? 'dev_eos',
          cue_list: 1,
          cue_number: cueNumber,
        });
      } else {
        warnings.push({ row, message: `Cannot parse LX cue number "${lxRaw}"` });
      }
    }

    const oscRaw = r['OSC-address'] ?? r['OSC'] ?? '';
    if (oscRaw.trim()) {
      const address = oscRaw.trim().startsWith('/') ? oscRaw.trim() : `/${oscRaw.trim()}`;
      payloads.push({
        type: 'osc',
        tag: null,
        note: '',
        device_id: 'dev_qlab',
        address,
        args: [],
      });
    }

    return {
      row,
      cueOpts: {
        label,
        description,
        department: departments,
        standby_note: standby,
        trigger: { kind: 'manual' as const },
        created_by: opts.createdBy,
      },
      payloads,
    };
  });
}
