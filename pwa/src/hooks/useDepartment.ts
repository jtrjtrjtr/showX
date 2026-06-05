import { useMemo } from 'react';
import type { Cue, DepartmentTag } from 'showx-shared';
import { useCuelist } from './useCuelist.js';

export interface FilterContext {
  owned: ReadonlySet<DepartmentTag>;
  watched: ReadonlySet<DepartmentTag>;
}

export interface DepartmentView {
  visible: Cue[];
  actionable: Set<string>;
  ctx: FilterContext;
}

// Inline filter functions — pure, no Yjs dependency.
// Candidates for future re-export from showx-shared/views.
function visibleCues(cues: readonly Cue[], ctx: FilterContext): Cue[] {
  const lens = new Set([...ctx.owned, ...ctx.watched]);
  if (lens.size === 0) return [];
  return (cues as Cue[]).filter((c) =>
    c.department.some((d) => lens.has(d as DepartmentTag)),
  );
}

function isActionable(cue: Cue, owned: ReadonlySet<DepartmentTag>): boolean {
  if (owned.size === 0) return false;
  return cue.department.some((d) => owned.has(d as DepartmentTag));
}

export function useDepartment(cuelistId: string, ctx: FilterContext): DepartmentView {
  const { cues } = useCuelist(cuelistId);

  return useMemo(() => {
    const visible = visibleCues(cues, ctx);
    const actionable = new Set(
      visible.filter((c) => isActionable(c, ctx.owned)).map((c) => c.id),
    );
    return { visible, actionable, ctx };
    // Stable primitive deps derived from Sets via serialisation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues, [...ctx.owned].sort().join(','), [...ctx.watched].sort().join(',')]);
}
