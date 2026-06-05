import * as Y from 'yjs';
import type { DepartmentTag, Trigger } from 'showx-shared';
import { detectDialect, type Dialect } from './csvDialects.js';
import { qlabToCues, eosToCues, genericToCues } from './csvHeuristics.js';
import { addCue, removeCue } from '../document/cue.js';
import { addPayload } from '../document/payload.js';
import { makeCompoundCue } from '../cue/compoundCue.js';
import { getCuelist, getCues } from '../document/cuelist.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CsvImportOpts {
  dialect?: 'auto' | Dialect;
  /** Merge rows with same label into compound cue. Default: false. */
  mergeDuplicates?: boolean;
  /** Remove existing cues before import. Default: false. */
  clearFirst?: boolean;
  /** Default lx device id when creating lx_ref payloads. */
  defaultLxDevice?: string;
  /** Fallback department when a row has no dept column. */
  defaultDepartment?: string;
  createdBy: string;
}

export interface CsvWarning {
  row: number;
  message: string;
}

export interface CsvImportResult {
  added: number;
  skipped: number;
  warnings: CsvWarning[];
  dialect: Dialect;
}

// Internal shape shared by heuristics
export interface CueSpec {
  row: number;
  cueOpts: {
    label: string;
    description: string;
    department: string[];
    standby_note: string;
    trigger: Trigger;
    created_by: string;
  };
  payloads: Array<Record<string, unknown>>;
}

// ── Pure-TS RFC-4180 CSV parser ───────────────────────────────────────────────

/**
 * Minimal RFC-4180 CSV parser.
 * Handles: quoted fields, embedded commas, embedded quotes (""), CRLF + LF.
 * Returns array of row arrays; first row is treated as header by parseCsvWithHeader.
 */
function parseCsvRaw(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let pos = 0;
  const len = lines.length;

  while (pos < len) {
    const row: string[] = [];
    // Parse one row
    while (pos < len && lines[pos] !== '\n') {
      let field = '';
      if (lines[pos] === '"') {
        // Quoted field
        pos++; // skip opening quote
        while (pos < len) {
          if (lines[pos] === '"') {
            if (pos + 1 < len && lines[pos + 1] === '"') {
              field += '"';
              pos += 2;
            } else {
              pos++; // skip closing quote
              break;
            }
          } else {
            field += lines[pos++];
          }
        }
        // Skip to comma or newline
        while (pos < len && lines[pos] !== ',' && lines[pos] !== '\n') pos++;
      } else {
        // Unquoted field — read until comma or newline
        const start = pos;
        while (pos < len && lines[pos] !== ',' && lines[pos] !== '\n') pos++;
        field = lines.slice(start, pos).trim();
      }
      row.push(field);
      if (pos < len && lines[pos] === ',') pos++; // skip comma
    }
    if (pos < len && lines[pos] === '\n') pos++; // skip newline

    // Skip completely empty rows
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }
  return rows;
}

export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsvRaw(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const result: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = rows[i][j] ?? '';
    }
    result.push(record);
  }
  return result;
}

// ── Compound merge ─────────────────────────────────────────────────────────────

function mergeByCueLabel(specs: CueSpec[]): CueSpec[] {
  const byLabel = new Map<string, CueSpec>();
  for (const spec of specs) {
    const existing = byLabel.get(spec.cueOpts.label);
    if (existing) {
      existing.cueOpts.department = [
        ...new Set([...existing.cueOpts.department, ...spec.cueOpts.department]),
      ];
      existing.payloads.push(...spec.payloads);
    } else {
      byLabel.set(spec.cueOpts.label, { ...spec, payloads: [...spec.payloads] });
    }
  }
  return [...byLabel.values()];
}

// ── Main entry ─────────────────────────────────────────────────────────────────

export async function importCsv(
  doc: Y.Doc,
  cuelistId: string,
  csvText: string,
  opts: CsvImportOpts,
): Promise<CsvImportResult> {
  const records = parseCsvWithHeader(csvText);
  const dialect: Dialect =
    opts.dialect === 'auto' || !opts.dialect ? detectDialect(records) : opts.dialect;
  const warnings: CsvWarning[] = [];

  if (opts.clearFirst) {
    const cuelist = getCuelist(doc, cuelistId);
    if (cuelist) {
      const ids = getCues(cuelist)
        .toArray()
        .map((c) => c.get('id') as string);
      for (const id of ids) {
        removeCue(doc, cuelistId, id);
      }
    }
  }

  let rawSpecs: CueSpec[];
  switch (dialect) {
    case 'qlab':
      rawSpecs = qlabToCues(records, opts, warnings);
      break;
    case 'eos':
      rawSpecs = eosToCues(records, opts, warnings);
      break;
    default:
      rawSpecs = genericToCues(records, opts, warnings);
  }

  // Rows that the heuristic silently dropped (e.g. invalid Eos cue numbers)
  const heuristicSkips = records.length - rawSpecs.length;

  const cueSpecs = opts.mergeDuplicates ? mergeByCueLabel(rawSpecs) : rawSpecs;

  let added = 0;
  let innerSkipped = 0;
  for (const spec of cueSpecs) {
    try {
      const dept = spec.cueOpts.department as DepartmentTag[];
      if (dept.length === 0) {
        warnings.push({ row: spec.row, message: 'No department — skipped' });
        innerSkipped++;
        continue;
      }
      if (dept.length > 1) {
        makeCompoundCue(doc, cuelistId, {
          label: spec.cueOpts.label,
          description: spec.cueOpts.description,
          departments: dept,
          standby_note: spec.cueOpts.standby_note,
          trigger: spec.cueOpts.trigger,
          payloads: spec.payloads as Parameters<typeof makeCompoundCue>[2]['payloads'],
          created_by: spec.cueOpts.created_by,
        });
      } else {
        const cueId = addCue(doc, cuelistId, {
          label: spec.cueOpts.label,
          description: spec.cueOpts.description,
          department: dept,
          standby_note: spec.cueOpts.standby_note,
          trigger: spec.cueOpts.trigger,
          created_by: spec.cueOpts.created_by,
        });
        for (const p of spec.payloads) {
          addPayload(
            doc,
            cuelistId,
            cueId,
            p as Parameters<typeof addPayload>[3],
          );
        }
      }
      added++;
    } catch (err) {
      warnings.push({ row: spec.row, message: String(err) });
      innerSkipped++;
    }
  }

  return { added, skipped: heuristicSkips + innerSkipped, warnings, dialect };
}
