import { describe, it, expect } from 'vitest';
import type { OscPayload, MscPayload, LxRefPayload, MidiPayload, WebhookPayload, WaitPayload, GroupPayload } from 'showx-shared';
import { summarizePayload } from '../../../../../src/modules/cuelist-core/src/catalog/summarize.js';

const BASE = { id: 'p1', tag: null, note: '' } as const;

describe('summarizePayload', () => {
  // 1. OSC
  it('osc: contains address, device_id, and arg count', () => {
    const p: OscPayload = {
      ...BASE,
      type: 'osc',
      device_id: 'dev_eos',
      address: '/eos/cue/1/fire',
      args: [{ type: 'int', value: 1 }, { type: 'float', value: 0.5 }],
    };
    const s = summarizePayload(p);
    expect(s).toContain('/eos/cue/1/fire');
    expect(s).toContain('dev_eos');
    expect(s).toContain('2');
  });

  // 2. MSC GO
  it('msc go: contains GO, cue number, list, device', () => {
    const p: MscPayload = {
      ...BASE,
      type: 'msc',
      device_id: 'dev_eos',
      command: 'go',
      cue_list: '1',
      cue_number: '11',
      device_id_msc: 1,
    };
    const s = summarizePayload(p);
    expect(s).toContain('GO');
    expect(s).toContain('11');
    expect(s).toContain('1');
    expect(s).toContain('dev_eos');
  });

  // 3. LXRef
  it('lx_ref: matches Eos/MA cue list X, cue Y → device', () => {
    const p: LxRefPayload = {
      ...BASE,
      type: 'lx_ref',
      device_id: 'dev_ma',
      cue_list: 3,
      cue_number: 47,
    };
    const s = summarizePayload(p);
    expect(s).toContain('Eos/MA cue list 3, cue 47');
    expect(s).toContain('dev_ma');
  });

  // 4. MIDI note_on: full message detail
  it('midi note_on: includes channel, note, velocity, device', () => {
    const p: MidiPayload = {
      ...BASE,
      type: 'midi',
      device_id: 'dev_midi',
      message: { kind: 'note_on', channel: 1, note: 60, velocity: 127 },
    };
    const s = summarizePayload(p);
    expect(s).toContain('note_on');
    expect(s).toContain('ch 1');
    expect(s).toContain('60');
    expect(s).toContain('127');
    expect(s).toContain('dev_midi');
  });

  // 5. MIDI CC: controller + value
  it('midi cc: includes controller and value', () => {
    const p: MidiPayload = {
      ...BASE,
      type: 'midi',
      device_id: 'dev_midi',
      message: { kind: 'cc', channel: 2, controller: 7, value: 100 },
    };
    const s = summarizePayload(p);
    expect(s).toContain('CC');
    expect(s).toContain('7');
    expect(s).toContain('100');
  });

  // 6. MIDI raw: byte count
  it('midi raw: includes byte count', () => {
    const p: MidiPayload = {
      ...BASE,
      type: 'midi',
      device_id: 'dev_midi',
      message: { kind: 'raw', bytes: [0x90, 0x3C, 0x7F] },
    };
    const s = summarizePayload(p);
    expect(s).toContain('raw');
    expect(s).toContain('3');
    expect(s).toContain('bytes');
  });

  // Extra MIDI variant: note_off
  it('midi note_off: includes channel and note', () => {
    const p: MidiPayload = {
      ...BASE,
      type: 'midi',
      device_id: 'dev_midi',
      message: { kind: 'note_off', channel: 1, note: 60, velocity: 0 },
    };
    const s = summarizePayload(p);
    expect(s).toContain('note_off');
    expect(s).toContain('60');
  });

  // Extra MIDI variant: program_change
  it('midi program_change: includes channel and program', () => {
    const p: MidiPayload = {
      ...BASE,
      type: 'midi',
      device_id: 'dev_midi',
      message: { kind: 'program_change', channel: 3, program: 12 },
    };
    const s = summarizePayload(p);
    expect(s).toContain('PC');
    expect(s).toContain('3');
    expect(s).toContain('12');
  });

  // 7. Webhook: method + URL
  it('webhook: includes method and URL', () => {
    const p: WebhookPayload = {
      ...BASE,
      type: 'webhook',
      url: 'https://example.com/fire',
      method: 'POST',
      headers: {},
      body: null,
      timeout_ms: 5000,
    };
    const s = summarizePayload(p);
    expect(s).toContain('POST');
    expect(s).toContain('https://example.com/fire');
  });

  // 8. Wait: duration_ms
  it('wait: includes duration', () => {
    const p: WaitPayload = {
      ...BASE,
      type: 'wait',
      duration_ms: 500,
    };
    const s = summarizePayload(p);
    expect(s).toContain('500ms');
  });

  // 9. Group: count + fire mode
  it('group: includes cue count and fire mode', () => {
    const p: GroupPayload = {
      ...BASE,
      type: 'group',
      child_cue_ids: ['c1', 'c2', 'c3'],
      fire_mode: 'parallel',
    };
    const s = summarizePayload(p);
    expect(s).toContain('3');
    expect(s).toContain('parallel');
  });

  // 10. Unknown type: graceful fallback
  it('unknown payload type: returns graceful fallback string', () => {
    const p = { id: 'p-bad', type: 'future_type', tag: null } as unknown as import('showx-shared').Payload;
    const s = summarizePayload(p);
    expect(s).toContain('future_type');
  });
});
