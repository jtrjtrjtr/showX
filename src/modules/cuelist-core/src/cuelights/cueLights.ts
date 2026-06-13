// ── Cue Lights state machine — per-cue, per-department (B006-007) ─────────────
//
// Pure, testable. Updated by SM standby actions + inbound operator acknowledges.
// No side effects — all I/O lives in GoEventChannel.

export type CueLightState = 'idle' | 'standby' | 'acknowledged';

export interface CueLightSnapshot {
  [department: string]: CueLightState;
}

export class CueLights {
  private state = new Map<string, Map<string, CueLightState>>();

  /**
   * Set or clear standby for a set of departments on a cue.
   * standby=true → 'standby'; standby=false → 'idle'.
   * Acknowledged departments are preserved when going standby=true again.
   */
  setStandby(cueId: string, departments: string[], on: boolean): void {
    if (!this.state.has(cueId)) this.state.set(cueId, new Map());
    const deptMap = this.state.get(cueId)!;
    for (const dept of departments) {
      if (on) {
        const current = deptMap.get(dept) ?? 'idle';
        if (current === 'idle') deptMap.set(dept, 'standby');
      } else {
        deptMap.set(dept, 'idle');
      }
    }
  }

  /** Transition a department from 'standby' → 'acknowledged'. Ignored if not in standby. */
  acknowledge(cueId: string, department: string): void {
    const deptMap = this.state.get(cueId);
    if (!deptMap) return;
    if (deptMap.get(department) === 'standby') {
      deptMap.set(department, 'acknowledged');
    }
  }

  /** Reset all department states for a cue to idle (called on GO or explicit clear). */
  clear(cueId: string): void {
    this.state.delete(cueId);
  }

  /** Reset all state across all cues. */
  clearAll(): void {
    this.state.clear();
  }

  /** Return a snapshot of per-department states for a cue. Empty object if no state recorded. */
  getState(cueId: string): CueLightSnapshot {
    const deptMap = this.state.get(cueId);
    if (!deptMap) return {};
    return Object.fromEntries(deptMap) as CueLightSnapshot;
  }

  /** True when all departments for a cue are 'acknowledged' (and at least one exists). */
  isFullyAcknowledged(cueId: string): boolean {
    const deptMap = this.state.get(cueId);
    if (!deptMap || deptMap.size === 0) return false;
    for (const s of deptMap.values()) {
      if (s !== 'acknowledged') return false;
    }
    return true;
  }

  /** True when any department for a cue is in 'standby' or 'acknowledged'. */
  hasActiveStandby(cueId: string): boolean {
    const deptMap = this.state.get(cueId);
    if (!deptMap) return false;
    for (const s of deptMap.values()) {
      if (s !== 'idle') return true;
    }
    return false;
  }
}
