import { describe, it, expect } from 'vitest';
import { runScenario } from './harness.js';
import type { ParityScenario, ParityOutput, ParityEvent } from './types.js';
import type { ParityTarget } from './harness.js';

class FakeTarget implements ParityTarget {
  name = 'fake';
  emitted: ParityOutput[] = [];
  scriptedOnSend: (ev: ParityEvent) => ParityOutput[] = () => [];

  async send(ev: ParityEvent): Promise<void> {
    this.emitted.push(...this.scriptedOnSend(ev));
  }
  async drain(): Promise<ParityOutput[]> {
    return [...this.emitted];
  }
  async reset(): Promise<void> {
    this.emitted = [];
  }
}

describe('parity harness', () => {
  it('passes when scripted target emits exactly the expected outputs', async () => {
    const showx = new FakeTarget();
    showx.scriptedOnSend = (ev) => [
      { transport: 'osc', at_ms: ev.at_ms, payload: { address: '/showx/cue', args: [1] } },
    ];

    const scenario: ParityScenario = {
      name: 'happy',
      duration_ms: 200,
      input_events: [{ source: 'eventx_supabase', at_ms: 50, payload: { row_id: 'r1' } }],
      expected_outputs: [
        { transport: 'osc', at_ms: 50, tolerance_ms: 10, payload: { address: '/showx/cue', args: [1] } },
      ],
    };

    const res = await runScenario(scenario, { showx });
    expect(res.passed).toBe(true);
    expect(res.diffs).toEqual([]);
  });

  it('reports missing_expected when target emits nothing', async () => {
    const showx = new FakeTarget();

    const scenario: ParityScenario = {
      name: 'missing',
      duration_ms: 100,
      input_events: [{ source: 'osc_in', at_ms: 10, payload: { address: '/cue' } }],
      expected_outputs: [
        { transport: 'osc', at_ms: 10, payload: { address: '/showx/cue', args: [1] } },
      ],
    };

    const res = await runScenario(scenario, { showx });
    expect(res.passed).toBe(false);
    expect(res.diffs).toHaveLength(1);
    expect(res.diffs[0].kind).toBe('missing_expected');
  });

  it('reports payload_mismatch when payload differs', async () => {
    const showx = new FakeTarget();
    showx.scriptedOnSend = (ev) => [
      { transport: 'osc', at_ms: ev.at_ms, payload: { address: '/showx/cue', args: [99] } },
    ];

    const scenario: ParityScenario = {
      name: 'payload-mismatch',
      duration_ms: 100,
      input_events: [{ source: 'eventx_supabase', at_ms: 20, payload: { row_id: 'r2' } }],
      expected_outputs: [
        { transport: 'osc', at_ms: 20, tolerance_ms: 10, payload: { address: '/showx/cue', args: [1] } },
      ],
    };

    const res = await runScenario(scenario, { showx });
    expect(res.passed).toBe(false);
    expect(res.diffs[0].kind).toBe('payload_mismatch');
  });

  it('handles missing bridgex target gracefully', async () => {
    const showx = new FakeTarget();
    showx.scriptedOnSend = (ev) => [
      { transport: 'midi', at_ms: ev.at_ms, payload: { channel: 1, note: 60, velocity: 127 } },
    ];

    const scenario: ParityScenario = {
      name: 'no-bridgex',
      duration_ms: 100,
      input_events: [{ source: 'midi_in', at_ms: 30, payload: { note: 60 } }],
      expected_outputs: [
        { transport: 'midi', at_ms: 30, payload: { channel: 1, note: 60, velocity: 127 } },
      ],
    };

    // bridgex explicitly null — should not throw
    const res = await runScenario(scenario, { showx, bridgex: null });
    expect(res.passed).toBe(true);
    expect(res.bridgex_outputs).toBeUndefined();
    expect(res.notes).toContain('bridgex target not provided — comparison limited to expected_outputs');
  });

  it('matches within tolerance window', async () => {
    const showx = new FakeTarget();
    // Emit 3ms later than expected — within 5ms default tolerance.
    showx.scriptedOnSend = (ev) => [
      { transport: 'osc', at_ms: ev.at_ms + 3, payload: { address: '/showx/go' } },
    ];

    const scenario: ParityScenario = {
      name: 'tolerance',
      duration_ms: 150,
      input_events: [{ source: 'eventx_supabase', at_ms: 40, payload: { id: 'e1' } }],
      expected_outputs: [
        // default tolerance_ms = 5, so at_ms=40 ± 5 should match actual at_ms=43
        { transport: 'osc', at_ms: 40, payload: { address: '/showx/go' } },
      ],
    };

    const res = await runScenario(scenario, { showx });
    expect(res.passed).toBe(true);
    expect(res.diffs).toEqual([]);
  });
});
