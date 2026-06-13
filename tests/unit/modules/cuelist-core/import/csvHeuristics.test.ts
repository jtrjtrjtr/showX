import { describe, it, expect } from 'vitest';
import { qlabToCues, eosToCues, genericToCues } from '../../../../../src/modules/cuelist-core/src/import/csvHeuristics.js';
import type { CsvImportOpts, CsvWarning } from '../../../../../src/modules/cuelist-core/src/import/csvImport.js';

const baseOpts: CsvImportOpts = { createdBy: 'op1' };

// ── qlabToCues ────────────────────────────────────────────────────────────────

describe('qlabToCues', () => {
  it('Audio type → SX dept + osc payload pointing to qlab device (test 16)', () => {
    const records = [{ Number: 'Q1', Name: 'House lights', Type: 'Audio', Notes: '', 'Pre-wait': '0', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs).toHaveLength(1);
    expect(specs[0].cueOpts.department).toEqual(['SX']);
    expect(specs[0].payloads[0]).toMatchObject({ type: 'osc', tag: 'SX' });
  });

  it('Video type → VIDEO dept + osc payload', () => {
    const records = [{ Number: 'Q1', Name: 'Video sting', Type: 'Video', Notes: '', 'Pre-wait': '0', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.department).toEqual(['VIDEO']);
    expect(specs[0].payloads[0]).toMatchObject({ type: 'osc', tag: 'VIDEO' });
  });

  it('Pre-wait column sets pre_wait_ms; trigger stays manual when no preceding row', () => {
    const records = [{ Number: 'Q1', Name: '', Type: 'Audio', Notes: '', 'Pre-wait': '1.5', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.pre_wait_ms).toBe(1500);
    expect(specs[0].cueOpts.trigger).toEqual({ kind: 'manual' });
  });

  it('Continue=auto-continue on row N sets auto_continue trigger on row N+1', () => {
    const records = [
      { Number: 'Q1', Name: '', Type: 'Audio', Notes: '', 'Pre-wait': '0', Continue: 'Auto-continue' },
      { Number: 'Q2', Name: '', Type: 'Audio', Notes: '', 'Pre-wait': '0', Continue: '' },
    ];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.trigger).toEqual({ kind: 'manual' });
    expect(specs[1].cueOpts.trigger).toEqual({ kind: 'auto_continue', delay_ms: 0 });
  });

  it('Pre Wait + Post Wait + Continue=Auto → pre_wait_ms on cue; next cue auto_continue delay_ms', () => {
    // Task spec test plan: Pre Wait 2.0, Post Wait 1.5, Continue=Auto → pre_wait_ms=2000; next cue auto_continue 1500
    const records = [
      { Number: 'Q1', Name: '', Type: 'Audio', Notes: '', 'Pre Wait': '2.0', 'Post Wait': '1.5', Continue: 'Auto-continue' },
      { Number: 'Q2', Name: '', Type: 'Audio', Notes: '', 'Pre Wait': '0', 'Post Wait': '0', Continue: '' },
    ];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.pre_wait_ms).toBe(2000);
    expect(specs[0].cueOpts.trigger).toEqual({ kind: 'manual' });
    expect(specs[1].cueOpts.trigger).toEqual({ kind: 'auto_continue', delay_ms: 1500 });
    expect(specs[1].cueOpts.pre_wait_ms).toBeUndefined();
  });

  it('Pre Wait only → pre_wait_ms set, no spurious trigger on next cue', () => {
    const records = [
      { Number: 'Q1', Name: '', Type: 'Audio', Notes: '', 'Pre Wait': '2', 'Post Wait': '', Continue: '' },
      { Number: 'Q2', Name: '', Type: 'Audio', Notes: '', 'Pre Wait': '0', 'Post Wait': '', Continue: '' },
    ];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.pre_wait_ms).toBe(2000);
    expect(specs[1].cueOpts.trigger).toEqual({ kind: 'manual' });
  });

  it('no pre-wait + no Continue → manual trigger', () => {
    const records = [{ Number: 'Q1', Name: '', Type: 'Audio', Notes: '', 'Pre-wait': '0', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.trigger).toEqual({ kind: 'manual' });
  });

  it('OSC type → osc payload with address from column', () => {
    const records = [{ Number: 'Q1', Name: '', Type: 'OSC', 'OSC Address': '/cue/test/start', Notes: '', 'Pre-wait': '0', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].payloads[0]).toMatchObject({ type: 'osc', address: '/cue/test/start' });
  });

  it('Wait type → wait payload', () => {
    const records = [{ Number: 'Q1', Name: '', Type: 'Wait', Notes: '', 'Pre-wait': '2', Continue: '' }];
    const warnings: CsvWarning[] = [];
    const specs = qlabToCues(records, baseOpts, warnings);
    expect(specs[0].payloads[0]).toMatchObject({ type: 'wait' });
  });
});

// ── eosToCues ─────────────────────────────────────────────────────────────────

describe('eosToCues', () => {
  it('fractional cue number 1.5 is accepted (test 17)', () => {
    const records = [{ Cue: '1.5', Label: 'House out', FollowTime: '0', Notes: '' }];
    const warnings: CsvWarning[] = [];
    const specs = eosToCues(records, baseOpts, warnings);
    expect(specs).toHaveLength(1);
    const payload = specs[0].payloads[0] as Record<string, unknown>;
    expect(payload['cue_number']).toBe(1.5);
  });

  it('non-numeric Cue → warning + skip', () => {
    const records = [{ Cue: 'INVALID', Label: 'Bad', FollowTime: '0', Notes: '' }];
    const warnings: CsvWarning[] = [];
    const specs = eosToCues(records, baseOpts, warnings);
    expect(specs).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('uses defaultLxDevice from opts (test 20)', () => {
    const records = [{ Cue: '1', Label: 'Test', FollowTime: '0', Notes: '' }];
    const warnings: CsvWarning[] = [];
    const opts: CsvImportOpts = { createdBy: 'op1', defaultLxDevice: 'dev_strand' };
    const specs = eosToCues(records, opts, warnings);
    const payload = specs[0].payloads[0] as Record<string, unknown>;
    expect(payload['device_id']).toBe('dev_strand');
  });

  it('FollowTime=0 → manual trigger', () => {
    const records = [{ Cue: '1', Label: 'Test', FollowTime: '0', Notes: '' }];
    const warnings: CsvWarning[] = [];
    const specs = eosToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.trigger).toEqual({ kind: 'manual' });
  });
});

// ── genericToCues ─────────────────────────────────────────────────────────────

describe('genericToCues', () => {
  it('Department="LX,SX" → dept=["LX","SX"] (test 18)', () => {
    const records = [{ 'Q#': 'Q1', Label: 'Test', Department: 'LX,SX', 'LX-cue': '', 'OSC-address': '', Standby: '' }];
    const warnings: CsvWarning[] = [];
    const specs = genericToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.department).toEqual(['LX', 'SX']);
  });

  it('OSC-address column → osc payload (test 19)', () => {
    const records = [{ 'Q#': 'Q1', Label: '', Department: 'SX', 'LX-cue': '', 'OSC-address': '/cue/fx/start', Standby: '' }];
    const warnings: CsvWarning[] = [];
    const specs = genericToCues(records, baseOpts, warnings);
    expect(specs[0].payloads.find((p) => (p as Record<string, unknown>)['type'] === 'osc')).toBeDefined();
    const osc = specs[0].payloads.find((p) => (p as Record<string, unknown>)['type'] === 'osc') as Record<string, unknown>;
    expect(osc['address']).toBe('/cue/fx/start');
  });

  it('LX-cue column → lx_ref payload', () => {
    const records = [{ 'Q#': 'Q1', Label: '', Department: 'LX', 'LX-cue': '5', 'OSC-address': '', Standby: '' }];
    const warnings: CsvWarning[] = [];
    const specs = genericToCues(records, baseOpts, warnings);
    expect(specs[0].payloads.find((p) => (p as Record<string, unknown>)['type'] === 'lx_ref')).toBeDefined();
  });

  it('Department separator pipe | splits correctly', () => {
    const records = [{ 'Q#': 'Q1', Label: '', Department: 'LX|VIDEO', 'LX-cue': '', 'OSC-address': '', Standby: '' }];
    const warnings: CsvWarning[] = [];
    const specs = genericToCues(records, baseOpts, warnings);
    expect(specs[0].cueOpts.department).toEqual(['LX', 'VIDEO']);
  });

  it('defaultDepartment used when no dept column', () => {
    const records = [{ 'Q#': 'Q1', Label: '', 'LX-cue': '', 'OSC-address': '', Standby: '' }];
    const warnings: CsvWarning[] = [];
    const opts: CsvImportOpts = { createdBy: 'op1', defaultDepartment: 'LX' };
    const specs = genericToCues(records, opts, warnings);
    expect(specs[0].cueOpts.department).toEqual(['LX']);
  });
});
