import type { ParityScenario, ParityResult, ParityOutput, ParityDiff, ParityEvent } from './types.js';
import assert from 'node:assert';

export interface ParityTargets {
  showx: ParityTarget;
  /** If null, BridgeX comparison is skipped. */
  bridgex?: ParityTarget | null;
}

export interface ParityTarget {
  name: string;
  send(event: ParityEvent): Promise<void>;
  drain(): Promise<ParityOutput[]>;
  reset(): Promise<void>;
}

export async function runScenario(scenario: ParityScenario, targets: ParityTargets): Promise<ParityResult> {
  await targets.showx.reset();
  if (targets.bridgex) await targets.bridgex.reset();

  const startedAt = Date.now();

  // Dispatch events in chronological order, sleeping until each at_ms offset.
  for (const ev of [...scenario.input_events].sort((a, b) => a.at_ms - b.at_ms)) {
    await sleepUntil(startedAt + ev.at_ms);
    await targets.showx.send(ev);
    if (targets.bridgex) await targets.bridgex.send(ev);
  }
  await sleepUntil(startedAt + scenario.duration_ms);

  const showxOutputs = await targets.showx.drain();
  const bridgexOutputs = targets.bridgex ? await targets.bridgex.drain() : undefined;

  const diffs = compareOutputs(scenario.expected_outputs, showxOutputs);
  if (bridgexOutputs) {
    diffs.push(...compareOutputs(bridgexOutputs, showxOutputs, { label: 'bridgex_vs_showx' }));
  }

  return {
    scenario: scenario.name,
    passed: diffs.length === 0,
    diffs,
    showx_outputs: showxOutputs,
    bridgex_outputs: bridgexOutputs,
    notes: bridgexOutputs
      ? []
      : ['bridgex target not provided — comparison limited to expected_outputs'],
  };
}

/**
 * Greedy match: sort both lists by at_ms, then for each expected find the
 * first unmatched actual within the tolerance window. Greedy pick means
 * scenarios should use unambiguous at_ms values when multiple outputs share
 * a transport type (ShowX-2 authors: design scenarios so each expected entry
 * maps to exactly one actual within its window).
 */
function compareOutputs(
  expected: ParityOutput[],
  actual: ParityOutput[],
  opts?: { label?: string },
): ParityDiff[] {
  const label = opts?.label ?? 'expected_vs_showx';
  const sorted_expected = [...expected].sort((a, b) => a.at_ms - b.at_ms);
  const sorted_actual = [...actual].sort((a, b) => a.at_ms - b.at_ms);
  const matched = new Set<number>();
  const diffs: ParityDiff[] = [];

  for (const exp of sorted_expected) {
    const tol = exp.tolerance_ms ?? 5;

    // Find first unmatched actual within timing window with same transport.
    const timingMatch = sorted_actual.findIndex(
      (act, i) =>
        !matched.has(i) &&
        act.transport === exp.transport &&
        Math.abs(act.at_ms - exp.at_ms) <= tol,
    );

    if (timingMatch !== -1) {
      matched.add(timingMatch);
      const act = sorted_actual[timingMatch];
      // Check payload equality using node:assert deepStrictEqual semantics.
      let payloadEqual = false;
      try {
        assert.deepStrictEqual(act.payload, exp.payload);
        payloadEqual = true;
      } catch {
        // payload differs
      }
      if (!payloadEqual) {
        diffs.push({
          kind: 'payload_mismatch',
          expected: exp,
          actual: act,
          detail: `[${label}] transport=${exp.transport} at_ms=${exp.at_ms} payload mismatch`,
        });
      }
      continue;
    }

    // No timing match — look for payload match outside window (timing_drift).
    const payloadMatch = sorted_actual.findIndex((act, i) => {
      if (matched.has(i) || act.transport !== exp.transport) return false;
      try {
        assert.deepStrictEqual(act.payload, exp.payload);
        return true;
      } catch {
        return false;
      }
    });

    if (payloadMatch !== -1) {
      matched.add(payloadMatch);
      const act = sorted_actual[payloadMatch];
      diffs.push({
        kind: 'timing_drift',
        expected: exp,
        actual: act,
        detail: `[${label}] transport=${exp.transport} payload matched but at_ms drift: expected=${exp.at_ms} actual=${act.at_ms} tolerance=${tol}ms`,
      });
    } else {
      diffs.push({
        kind: 'missing_expected',
        expected: exp,
        detail: `[${label}] transport=${exp.transport} at_ms=${exp.at_ms} not emitted`,
      });
    }
  }

  // Unmatched actuals are unexpected.
  sorted_actual.forEach((act, i) => {
    if (!matched.has(i)) {
      diffs.push({
        kind: 'unexpected_emitted',
        actual: act,
        detail: `[${label}] transport=${act.transport} at_ms=${act.at_ms} unexpected output`,
      });
    }
  });

  return diffs;
}

async function sleepUntil(targetMs: number): Promise<void> {
  const d = targetMs - Date.now();
  if (d > 0) await new Promise<void>((r) => setTimeout(r, d));
}
