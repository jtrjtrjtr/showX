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
  _warnings: CsvWarning[],
): CueSpec[] {
  return records.map((r, idx) => {
    const row = idx + 1;
    const label = r['Number'] ?? r['Q#'] ?? `Q${row}`;
    const name = r['Name'] ?? '';
    const type = (r['Type'] ?? '').toLowerCase().trim();
    const dept = inferQlabDepartment(type);
    const notes = r['Notes'] ?? '';

    // Pre Wait → this cue's pre_wait_ms (delay between trigger fire and action dispatch).
    // Support both QLab column name variants: "Pre Wait" (space) and "Pre-wait" (hyphen).
    const preWaitRaw = parseFloat(r['Pre Wait'] ?? r['Pre-wait'] ?? '0') || 0;
    const preWaitMs = preWaitRaw > 0 ? Math.round(preWaitRaw * 1000) : 0;

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
      // For QLab Wait cue type, the pre-wait column encodes the wait duration.
      const waitMs = Math.round(preWaitRaw * 1000);
      payloads.push({ type: 'wait', tag: null, note: name, duration_ms: waitMs >= 0 ? waitMs : 0 });
    }

    // Trigger: ShowX uses backward-pointing triggers — each cue declares how it
    // fires relative to its predecessor. In QLab, the PREVIOUS row's Post Wait +
    // Continue determines what triggers this cue.
    let trigger: CueSpec['cueOpts']['trigger'] = { kind: 'manual' };
    if (idx > 0) {
      const prev = records[idx - 1];
      const prevCont = (prev['Continue'] ?? '').toLowerCase().trim();
      const prevPostWaitRaw = parseFloat(prev['Post Wait'] ?? prev['Post-wait'] ?? '0') || 0;

      if (prevCont === 'auto-continue' || prevCont === 'continue' || prevCont === 'auto continue') {
        trigger = { kind: 'auto_continue', delay_ms: Math.round(prevPostWaitRaw * 1000) };
      }
      // auto_follow requires prev_cue_id which is unavailable at parse time → manual fallback.
      // Other Continue values (empty, "do not continue") → manual.
    }

    return {
      row,
      cueOpts: {
        label: label.trim() || `Q${row}`,
        description: name,
        department: [dept],
        standby_note: notes.trim(),
        trigger,
        pre_wait_ms: preWaitMs > 0 ? preWaitMs : undefined,
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
