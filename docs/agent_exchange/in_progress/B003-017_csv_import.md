---
id: "B003-017"
title: "CSV import — QLab / Eos / generic cue list ingestion"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
depends_on: ["B003-006"]
target_files:
  - "src/modules/cuelist-core/src/import/csvImport.ts"
  - "src/modules/cuelist-core/src/import/csvDialects.ts"
  - "src/modules/cuelist-core/src/import/csvHeuristics.ts"
  - "src/modules/cuelist-core/src/import/index.ts"
  - "tests/unit/modules/cuelist-core/import/csvImport.test.ts"
  - "tests/unit/modules/cuelist-core/import/csvDialects.test.ts"
  - "tests/fixtures/csv/qlab_export_minimal.csv"
  - "tests/fixtures/csv/eos_export_minimal.csv"
  - "tests/fixtures/csv/generic_cuelist.csv"
  - "tests/fixtures/csv/qlab_export_compound.csv"
acceptance_criteria:
  - "`importCsv(doc, cuelistId, csvText, opts: CsvImportOpts): Promise<{added: number; skipped: number; warnings: string[]}>` parses CSV via csv-parse library (or pure-TS lightweight parser), creates cues via B003-002 / B003-006 mutators"
  - "Auto-detect dialect: QLab (columns: Number, Name, Type, Notes, Pre-wait, Duration, Continue), Eos (columns: Cue, Label, LinkCue, FollowTime, etc.), Generic (Q#, Label, Department, LX-cue, Sound-cue, etc.)"
  - "QLab dialect: cue type → department inference (Audio→SX, Video→VIDEO, OSC→infer from address, Network→OSC payload); pre-wait → trigger.auto_continue.delay_ms; Continue→auto_continue/auto_follow"
  - "Eos dialect: each row becomes a cue with one lx_ref payload; cue_list defaults to 1; cue_number from Cue column; FollowTime → trigger"
  - "Generic dialect: column heuristic — Department CSV column → dept[]; LX-cue column → lx_ref payload (Eos by default); OSC-address column → osc payload; Notes → standby_note"
  - "Compound cue inference: rows with same Q# / Number / Cue → merged into single compound cue with multiple payloads (heuristic, opt-in via opts.mergeDuplicates)"
  - "Validation errors per row collected, NOT thrown — return as warnings; rows that fail validation skipped + counted"
  - "Sample fixtures: 4 CSVs in `tests/fixtures/csv/` — minimal QLab export (3 cues), minimal Eos export (3 cues), generic (3 cues), QLab compound (1 compound cue across 2 rows)"
  - "Empty cells handled gracefully (default values per schema)"
  - "Imported cues append to existing cuelist; do NOT clear existing cues; option `opts.clearFirst: boolean` for full replace"
  - "Trigger inference: QLab pre-wait > 0 → auto_continue with delay_ms; Continue field truthy → auto_follow with prev_cue_id"
  - "PWA file picker integration deferred to a follow-up task; this task is core logic + tests only"
  - "20+ vitest tests covering each dialect, compound inference, malformed rows, empty cells, fixture roundtrips"
---

## Context

CSV import is a non-negotiable adoption affordance — every theatre and corporate AV venue has existing cue lists in QLab / Eos / Excel. Without import, ShowX requires re-entering hundreds of cues, which is a non-starter.

This task implements the parsing + heuristic logic; UI integration (file picker, preview, apply button) is a small follow-up wiring task in PWA. Forge focuses on correctness + robustness against malformed input.

## Implementation notes

### Public API

```ts
// src/modules/cuelist-core/src/import/csvImport.ts
import * as Y from 'yjs';
import { parse } from 'csv-parse/sync';
import { detectDialect } from './csvDialects';
import { qlabToCues, eosToCues, genericToCues } from './csvHeuristics';
import { addCue, addPayload } from '../document/cue';
import { makeCompoundCue } from '../cue/compoundCue';

export interface CsvImportOpts {
  dialect?: 'auto' | 'qlab' | 'eos' | 'generic';
  mergeDuplicates?: boolean;     // merge rows with same Q# into compound cue
  clearFirst?: boolean;
  defaultLxDevice?: string;      // e.g. 'dev_eos' — used when creating lx_ref payloads
  defaultDepartment?: string;    // fallback when row has no dept column
  createdBy: string;
}

export interface CsvImportResult {
  added: number;
  skipped: number;
  warnings: Array<{ row: number; message: string }>;
  dialect: 'qlab' | 'eos' | 'generic';
}

export async function importCsv(
  doc: Y.Doc, cuelistId: string, csvText: string, opts: CsvImportOpts,
): Promise<CsvImportResult> {
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  const dialect = opts.dialect === 'auto' || !opts.dialect ? detectDialect(records) : opts.dialect;
  const warnings: Array<{ row: number; message: string }> = [];

  if (opts.clearFirst) {
    // Clear existing cues (B003-002 mutator; outside Y.Doc transact via removeAllCues helper)
    // Implementation: iterate and removeCue.
  }

  let cueSpecs: Array<{ row: number; cueOpts: any; payloads: any[] }>;
  switch (dialect) {
    case 'qlab': cueSpecs = qlabToCues(records, opts, warnings); break;
    case 'eos': cueSpecs = eosToCues(records, opts, warnings); break;
    case 'generic': cueSpecs = genericToCues(records, opts, warnings); break;
  }

  if (opts.mergeDuplicates) {
    cueSpecs = mergeByCueNumber(cueSpecs);
  }

  let added = 0;
  for (const spec of cueSpecs) {
    try {
      doc.transact(() => {
        let cueId: string;
        if (spec.cueOpts.department.length > 1) {
          cueId = makeCompoundCue(doc, cuelistId, { ...spec.cueOpts, payloads: spec.payloads });
        } else {
          cueId = addCue(doc, cuelistId, spec.cueOpts);
          for (const p of spec.payloads) addPayload(doc, cuelistId, cueId, p);
        }
      });
      added++;
    } catch (err) {
      warnings.push({ row: spec.row, message: String(err) });
    }
  }

  return { added, skipped: records.length - added, warnings, dialect };
}
```

### Dialect detection

```ts
// src/modules/cuelist-core/src/import/csvDialects.ts
export function detectDialect(records: Record<string, string>[]): 'qlab' | 'eos' | 'generic' {
  if (records.length === 0) return 'generic';
  const cols = new Set(Object.keys(records[0]).map(k => k.toLowerCase()));
  if (cols.has('pre-wait') && (cols.has('number') || cols.has('q#'))) return 'qlab';
  if (cols.has('cue') && (cols.has('label') || cols.has('linkcue') || cols.has('followtime'))) return 'eos';
  return 'generic';
}
```

### QLab heuristic

```ts
// src/modules/cuelist-core/src/import/csvHeuristics.ts
export function qlabToCues(records: any[], opts: CsvImportOpts, warnings: any[]) {
  return records.map((r, idx) => {
    const row = idx + 1;
    const label = r['Number'] || r['Q#'] || `Q${row}`;
    const name = r['Name'] || '';
    const type = (r['Type'] ?? '').toLowerCase();
    const dept = inferQlabDepartment(type);
    const preWait = parseFloat(r['Pre-wait'] ?? '0') || 0;
    const cont = (r['Continue'] ?? '').toLowerCase();
    const notes = r['Notes'] ?? '';

    const payloads: any[] = [];
    if (type === 'audio') payloads.push({ type: 'osc', tag: 'SX', note: name, device_id: 'dev_qlab', address: `/cue/${label}/start`, args: [] });
    else if (type === 'video') payloads.push({ type: 'osc', tag: 'VIDEO', note: name, device_id: 'dev_qlab', address: `/cue/${label}/start`, args: [] });
    else if (type === 'osc' || type === 'network') {
      payloads.push({ type: 'osc', tag: null, note: name, device_id: 'dev_qlab', address: r['OSC Address'] ?? '/cue/start', args: [] });
    }
    // ... handle 'wait' type → wait payload; 'group' → group payload; etc.

    let trigger: any = { kind: 'manual' };
    if (preWait > 0) trigger = { kind: 'auto_continue', delay_ms: Math.round(preWait * 1000) };
    if (cont === 'auto-continue' || cont === 'continue') trigger = { kind: 'auto_continue', delay_ms: 0 };

    return {
      row,
      cueOpts: { label, description: name, department: [dept], standby_note: notes, trigger, created_by: opts.createdBy },
      payloads,
    };
  });
}

function inferQlabDepartment(type: string): string {
  if (type === 'audio') return 'SX';
  if (type === 'video') return 'VIDEO';
  if (type === 'osc' || type === 'network') return 'OTHER'; // user remaps later
  if (type === 'group') return 'OTHER';
  return 'OTHER';
}
```

### Eos heuristic

```ts
export function eosToCues(records: any[], opts: CsvImportOpts, warnings: any[]) {
  const defaultDevice = opts.defaultLxDevice ?? 'dev_eos';
  return records.map((r, idx) => {
    const row = idx + 1;
    const cueNumber = parseFloat(r['Cue'] ?? '');
    if (Number.isNaN(cueNumber)) {
      warnings.push({ row, message: `Invalid Eos cue number ${r['Cue']}` });
      return null;
    }
    const label = r['Label'] || `Q${cueNumber}`;
    const followTime = parseFloat(r['FollowTime'] ?? '0') || 0;
    const trigger = followTime > 0 ? { kind: 'auto_continue' as const, delay_ms: Math.round(followTime * 1000) } : { kind: 'manual' as const };
    return {
      row,
      cueOpts: {
        label, description: label, department: ['LX' as const], standby_note: '',
        trigger, created_by: opts.createdBy,
      },
      payloads: [{ type: 'lx_ref' as const, tag: 'LX', note: label, device_id: defaultDevice, cue_list: 1, cue_number: cueNumber }],
    };
  }).filter(Boolean) as any[];
}
```

### Generic heuristic

```ts
export function genericToCues(records: any[], opts: CsvImportOpts, warnings: any[]) {
  return records.map((r, idx) => {
    const row = idx + 1;
    const label = r['Q#'] || r['Cue'] || r['Number'] || `Q${row}`;
    const description = r['Label'] || r['Name'] || '';
    const deptStr = r['Department'] || r['Dept'] || opts.defaultDepartment || 'OTHER';
    const departments = deptStr.split(/[,;|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    const standby = r['Standby'] || r['Notes'] || '';
    const payloads: any[] = [];
    if (r['LX-cue'] || r['Eos']) {
      const cueNumber = parseFloat(r['LX-cue'] ?? r['Eos']);
      if (!Number.isNaN(cueNumber)) payloads.push({ type: 'lx_ref', tag: 'LX', note: '', device_id: opts.defaultLxDevice ?? 'dev_eos', cue_list: 1, cue_number: cueNumber });
    }
    if (r['OSC-address'] || r['OSC']) {
      payloads.push({ type: 'osc', tag: null, note: '', device_id: 'dev_qlab', address: r['OSC-address'] ?? r['OSC'], args: [] });
    }
    return {
      row,
      cueOpts: { label, description, department: departments, standby_note: standby, trigger: { kind: 'manual' as const }, created_by: opts.createdBy },
      payloads,
    };
  });
}
```

### Compound merge

```ts
function mergeByCueNumber(specs: any[]): any[] {
  const byLabel = new Map<string, any>();
  for (const spec of specs) {
    const existing = byLabel.get(spec.cueOpts.label);
    if (existing) {
      existing.cueOpts.department = [...new Set([...existing.cueOpts.department, ...spec.cueOpts.department])];
      existing.payloads.push(...spec.payloads);
    } else {
      byLabel.set(spec.cueOpts.label, { ...spec });
    }
  }
  return [...byLabel.values()];
}
```

### Fixtures

```
# tests/fixtures/csv/qlab_export_minimal.csv
Number,Name,Type,Notes,Pre-wait,Continue
Q1,House lights down,Audio,House lights and pre-show fade,0,
Q2,Music up,Audio,Pre-show music,0.5,Auto-continue
Q3,Curtain rise,Video,Video sting,0,
```

```
# tests/fixtures/csv/eos_export_minimal.csv
Cue,Label,FollowTime,Notes
1,House half,0,House lights to half
1.5,House out,2,House lights out
2,Spot 1 up,0,Followspot 1 on actor
```

```
# tests/fixtures/csv/generic_cuelist.csv
Q#,Label,Department,LX-cue,OSC-address,Standby
Q1,House down,LX,1,,House lights pre-show
Q2,Music up,SX,,/cue/preshow/start,Pre-show music
Q3,Curtain,"LX,VIDEO",2,/cue/curtain/up,Curtain rise
```

## Test plan

### `csvDialects.test.ts`

1. detectDialect for QLab columns: 'qlab'.
2. detectDialect for Eos columns: 'eos'.
3. detectDialect for generic: 'generic'.
4. Empty records: 'generic'.

### `csvImport.test.ts`

5. QLab fixture import: 3 cues added; departments inferred (Audio→SX, Video→VIDEO).
6. Eos fixture import: 3 cues, each with 1 lx_ref payload.
7. Generic fixture import: cues with mixed payloads.
8. Generic compound (Q3 with dept='LX,VIDEO'): cue created with 2 depts + 2 payloads.
9. Malformed row (Eos with non-numeric Cue): skipped + warning logged.
10. Empty cells handled — default values used.
11. mergeDuplicates: 2 rows with same Q1 → merged into 1 compound cue.
12. clearFirst: existing cues removed before import.
13. Pre-wait > 0 → auto_continue trigger with correct delay_ms.
14. Continue=Auto-continue → auto_continue trigger.
15. FollowTime > 0 in Eos → auto_continue.

### `csvHeuristics.test.ts`

16. qlabToCues: Audio type → SX dept + osc payload.
17. eosToCues: cue_number 1.5 fractional accepted.
18. genericToCues: Department='LX,SX' → dept=['LX','SX'].
19. genericToCues: OSC-address column → osc payload.
20. Default LX device used when opts provided.

## Out of scope

- USITT ASCII import (ShowX-4, defer).
- QLab .qlab binary import (defer).
- Excel native (.xlsx) — convert to CSV manually for MVP.
- PWA file picker UI (small follow-up task).
- Preview-before-import UI (PWA wiring follow-up).
- Round-trip export → import (covered separately by B003-018 export).
- Cue catalog re-publish (handled by B003-010 on Y.Doc change).
- Migration of imported cues to first-class payload.department (Q4 / 0.2).

## Notes for Critic

- Verify CSV parser handles quoted fields with commas (e.g. dept "LX,VIDEO").
- Confirm validation errors per-row don't abort the whole import — collect as warnings.
- Verify dialect detection prefers QLab when 'Pre-wait' present (avoid false-positives on generic that happens to have 'Number').
- Confirm department inference for QLab is documented and defensible (Audio→SX is conventional).
- Verify Eos cue_number accepts fractional (1.5 — Eos convention).
- Verify mergeDuplicates is opt-in (default off — preserves explicit row-per-payload).
- Confirm fixtures exist + are tested.
- Verify `addCue` and `makeCompoundCue` used correctly based on dept count.
- Watch for double-Y.Doc-transact — wrap once per cue, not nested.
