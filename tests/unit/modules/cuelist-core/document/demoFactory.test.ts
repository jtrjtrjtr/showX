import { describe, it, expect } from 'vitest';
import { createDemoShow, DEMO_DEVICES } from '../../../../../src/modules/cuelist-core/src/document/demoFactory.js';

describe('createDemoShow', () => {
  it('returns a package with all required fields', () => {
    const pkg = createDemoShow();
    expect(pkg).toHaveProperty('show');
    expect(pkg).toHaveProperty('cuelist');
    expect(pkg).toHaveProperty('routing');
    expect(pkg).toHaveProperty('operators');
    expect(pkg).toHaveProperty('devices');
    expect(pkg).toHaveProperty('historyLines');
  });

  it('show has correct schema version and format', () => {
    const { show } = createDemoShow();
    expect(show.schema_version).toBe(1);
    expect(show.format_version).toBe('1.0');
    expect(show.$schema).toContain('showx.xlab.cz');
    expect(show.meta.title).toBe('Demo Show');
    expect(show.meta.venue).toBe('Demo Venue');
    expect(show.meta.departments).toEqual(['LX', 'SX', 'VIDEO']);
  });

  it('cuelist has exactly 25 cues', () => {
    const { cuelist } = createDemoShow();
    expect(cuelist.cues).toHaveLength(25);
  });

  it('cue IDs are all unique', () => {
    const { cuelist } = createDemoShow();
    const ids = cuelist.cues.map((c) => c.id);
    expect(new Set(ids).size).toBe(25);
  });

  it('has 3 demo devices', () => {
    const { devices } = createDemoShow();
    expect(devices).toHaveLength(3);
    const deviceIds = devices.map((d) => d.device_id);
    expect(deviceIds).toContain('lx_eos');
    expect(deviceIds).toContain('sx_qlab');
    expect(deviceIds).toContain('video_disguise');
  });

  it('has 4 routing rules', () => {
    const { routing } = createDemoShow();
    expect(routing.entries).toHaveLength(4);
  });

  it('routing rules cover lx_ref, SX tag, VIDEO tag, and fallback', () => {
    const { routing } = createDemoShow();
    const matches = routing.entries.map((e) => e.match);
    expect(matches.some((m) => (m as Record<string, unknown>)['payload_type'] === 'lx_ref')).toBe(true);
    expect(matches.some((m) => (m as Record<string, unknown>)['tag_pattern'] === 'SX')).toBe(true);
    expect(matches.some((m) => (m as Record<string, unknown>)['tag_pattern'] === 'VIDEO')).toBe(true);
    const fallback = routing.entries.find(
      (e) => Object.keys(e.match).length === 0,
    );
    expect(fallback).toBeDefined();
    expect(fallback?.target_device_id).toBe('lx_eos');
  });

  it('has 2 operators', () => {
    const { operators } = createDemoShow();
    expect(operators.operators).toHaveLength(2);
    const roles = operators.operators.map((o) => o.role);
    expect(roles).toContain('sm');
    expect(roles).toContain('operator');
  });

  it('has 3 history lines', () => {
    const { historyLines } = createDemoShow();
    expect(historyLines).toHaveLength(3);
    historyLines.forEach((line) => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('history lines include show_opened, mode_transition, and cue_fired kinds', () => {
    const { historyLines } = createDemoShow();
    const events = historyLines.map((l) => (JSON.parse(l) as { kind: string }).kind);
    expect(events).toContain('show_opened');
    expect(events).toContain('mode_transition');
    expect(events).toContain('cue_fired');
  });

  it('cues cover all 3 departments', () => {
    const { cuelist } = createDemoShow();
    const depts = new Set(cuelist.cues.flatMap((c) => c.department));
    expect(depts.has('LX')).toBe(true);
    expect(depts.has('SX')).toBe(true);
    expect(depts.has('VIDEO')).toBe(true);
  });

  it('includes compound cue (Q11 Storm starts) with multi-dept LX+SX', () => {
    const { cuelist } = createDemoShow();
    const compound = cuelist.cues.find((c) => c.label === 'Storm starts');
    expect(compound).toBeDefined();
    expect(compound?.department).toContain('LX');
    expect(compound?.department).toContain('SX');
    expect(compound?.payloads.length).toBeGreaterThanOrEqual(2);
  });

  it('includes group cue (Q14 Battle climax) with group payload', () => {
    const { cuelist } = createDemoShow();
    const group = cuelist.cues.find((c) => c.label === 'Battle climax');
    expect(group).toBeDefined();
    const groupPayload = group?.payloads.find((p) => p.type === 'group');
    expect(groupPayload).toBeDefined();
    const childIds = (groupPayload as { child_cue_ids?: string[] } | undefined)?.child_cue_ids;
    expect(Array.isArray(childIds) && childIds.length >= 3).toBe(true);
  });

  it('includes auto_follow triggers', () => {
    const { cuelist } = createDemoShow();
    const autoFollow = cuelist.cues.filter(
      (c) => (c.trigger as { kind: string }).kind === 'auto_follow',
    );
    expect(autoFollow.length).toBeGreaterThan(0);
  });

  it('includes auto_continue triggers with delay_ms', () => {
    const { cuelist } = createDemoShow();
    const autoContinue = cuelist.cues.filter(
      (c) => (c.trigger as { kind: string }).kind === 'auto_continue',
    );
    expect(autoContinue.length).toBeGreaterThan(0);
    autoContinue.forEach((c) => {
      expect((c.trigger as { delay_ms?: number }).delay_ms).toBeGreaterThan(0);
    });
  });

  it('is byte-stable: calling twice returns identical cue IDs and labels', () => {
    const a = createDemoShow();
    const b = createDemoShow();
    const aIds = a.cuelist.cues.map((c) => c.id);
    const bIds = b.cuelist.cues.map((c) => c.id);
    expect(aIds).toEqual(bIds);
    const aLabels = a.cuelist.cues.map((c) => c.label);
    const bLabels = b.cuelist.cues.map((c) => c.label);
    expect(aLabels).toEqual(bLabels);
  });

  it('is byte-stable: routing rule IDs are identical on two calls', () => {
    const a = createDemoShow();
    const b = createDemoShow();
    const aRuleIds = a.routing.entries.map((e) => e.rule_id);
    const bRuleIds = b.routing.entries.map((e) => e.rule_id);
    expect(aRuleIds).toEqual(bRuleIds);
  });
});

describe('DEMO_DEVICES', () => {
  it('exports 3 devices', () => {
    expect(DEMO_DEVICES).toHaveLength(3);
  });

  it('each device has required fields', () => {
    for (const d of DEMO_DEVICES) {
      expect(typeof d.device_id).toBe('string');
      expect(typeof d.label).toBe('string');
      expect(typeof d.transport).toBe('string');
    }
  });

  it('lx_eos is on port 8000', () => {
    const eos = DEMO_DEVICES.find((d) => d.device_id === 'lx_eos');
    expect(eos?.port).toBe(8000);
  });

  it('sx_qlab is on port 53000', () => {
    const qlab = DEMO_DEVICES.find((d) => d.device_id === 'sx_qlab');
    expect(qlab?.port).toBe(53000);
  });

  it('video_disguise is on port 9000', () => {
    const disguise = DEMO_DEVICES.find((d) => d.device_id === 'video_disguise');
    expect(disguise?.port).toBe(9000);
  });
});
