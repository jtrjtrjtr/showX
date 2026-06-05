import type { Cue } from 'showx-shared';
import type { DepartmentTag, CanonicalDepartmentTag } from 'showx-shared';
import type { Subscription } from 'showx-shared';
import * as Y from 'yjs';
import { getCuelist, getCues } from '../document/cuelist.js';

export interface FilterContext {
  owned: ReadonlySet<DepartmentTag>;
  watched: ReadonlySet<DepartmentTag>;
}

export interface FilterChange {
  full: Cue[];
  added: Cue[];
  removed: string[];
  changed: Cue[];
}

// ── Memoization ───────────────────────────────────────────────────────────────

const visibleCuesCache = new WeakMap<readonly Cue[], Map<string, Cue[]>>();
const highlightedCache = new WeakMap<Cue, Map<string, Set<string>>>();

function ctxKey(ctx: FilterContext): string {
  const o = [...ctx.owned].sort().join(',');
  const w = [...ctx.watched].sort().join(',');
  return `${o}|${w}`;
}

function ownedKey(owned: ReadonlySet<DepartmentTag>): string {
  return [...owned].sort().join(',');
}

// ── Pure filter functions ─────────────────────────────────────────────────────

/** Visible cues: cue.department ∩ (owned ∪ watched) ≠ ∅. Pure — no Y.Doc reads. */
export function visibleCues(cues: readonly Cue[], ctx: FilterContext): Cue[] {
  let ctxMap = visibleCuesCache.get(cues);
  if (!ctxMap) {
    ctxMap = new Map();
    visibleCuesCache.set(cues, ctxMap);
  }
  const key = ctxKey(ctx);
  if (ctxMap.has(key)) return ctxMap.get(key)!;

  const lens = new Set([...ctx.owned, ...ctx.watched]);
  const result = lens.size === 0 ? [] : (cues as Cue[]).filter(
    (c) => c.department.some((d) => lens.has(d as CanonicalDepartmentTag)),
  );
  ctxMap.set(key, result);
  return result;
}

/** Actionable: operator can GO/edit — cue.department ∩ owned ≠ ∅. Pure. */
export function isActionable(cue: Cue, owned: ReadonlySet<DepartmentTag>): boolean {
  if (owned.size === 0) return false;
  return cue.department.some((d) => owned.has(d));
}

/** Context-only: visible but not actionable (watched dept only). Pure. */
export function isContextOnly(cue: Cue, ctx: FilterContext): boolean {
  return !isActionable(cue, ctx.owned) && cue.department.some((d) => ctx.watched.has(d));
}

// ── Reactive subscription ─────────────────────────────────────────────────────

/**
 * Subscribes to a cuelist in a Y.Doc, recomputes the filtered view on every
 * mutation, and invokes handler with diff hints for efficient UI re-render.
 *
 * Note: handler fires for every structural change to cues, including additions
 * of cues that fall outside the filter lens (added array will be empty in that
 * case — this is intentional; callers should not assume handler=fire means visible change).
 */
export function subscribeFilteredCuelist(
  doc: Y.Doc,
  cuelistId: string,
  ctx: FilterContext,
  handler: (change: FilterChange) => void,
): Subscription {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);

  let prevVisible = new Map<string, Cue>();

  const recompute = () => {
    const all = cues.toArray().map((m) => m.toJSON() as Cue);
    const filtered = visibleCues(all, ctx);
    const newMap = new Map(filtered.map((c) => [c.id, c]));
    const added: Cue[] = [];
    const changed: Cue[] = [];
    for (const c of filtered) {
      const prev = prevVisible.get(c.id);
      if (!prev) {
        added.push(c);
      } else if (JSON.stringify(prev) !== JSON.stringify(c)) {
        changed.push(c);
      }
    }
    const removed = [...prevVisible.keys()].filter((id) => !newMap.has(id));
    prevVisible = newMap;
    handler({ full: filtered, added, removed, changed });
  };

  const observer = () => recompute();
  cues.observeDeep(observer);
  recompute();

  return {
    id: `filter-${cuelistId}`,
    unsubscribe: () => cues.unobserveDeep(observer),
  };
}

// ── Highlighted payloads (memoized, called from highlights module) ─────────────

import { isCanonicalDepartment } from 'showx-shared';

/**
 * Returns ids of payloads highlighted for this operator's owned departments.
 * Memoized on (cue, ownedKey) — same reference + same owned → same Set reference.
 *
 * MVP heuristic per data_model.md §6.3 + Q4:
 * - Single-dept cue + owned: all payloads highlighted.
 * - Compound cue: payload highlighted when payload.tag is a canonical dept that is owned.
 *   Payloads without canonical dept tag are highlighted (rule-of-least-surprise).
 */
export function computeHighlightedPayloads(
  cue: Cue,
  owned: ReadonlySet<DepartmentTag>,
): Set<string> {
  let ctxMap = highlightedCache.get(cue);
  if (!ctxMap) {
    ctxMap = new Map();
    highlightedCache.set(cue, ctxMap);
  }
  const key = ownedKey(owned);
  if (ctxMap.has(key)) return ctxMap.get(key)!;

  const result = new Set<string>();
  const ownedHasAny = cue.department.some((d) => owned.has(d));
  if (ownedHasAny) {
    const isCompound = cue.department.length > 1;
    for (const p of cue.payloads) {
      const ptag = p.tag ?? '';
      if (isCompound && isCanonicalDepartment(ptag)) {
        if (owned.has(ptag)) result.add(p.id);
      } else {
        result.add(p.id);
      }
    }
  }

  ctxMap.set(key, result);
  return result;
}
