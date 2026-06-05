// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { Cue, Trigger } from 'showx-shared';
import { TriggerEditor } from '../../../../../pwa/src/components/cuelist/TriggerEditor.js';

afterEach(() => cleanup());

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'q1',
    label: 'Cue 1',
    description: '',
    department: ['SM'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'test',
    modified_at: '2026-01-01T00:00:00Z',
    modified_by: 'test',
    ...overrides,
  };
}

describe('TriggerEditor', () => {
  it('manual trigger — select shows manual, no extra fields', () => {
    const cue = makeCue({ trigger: { kind: 'manual' } });
    render(<TriggerEditor cuelistId="cl1" cue={cue} cues={[cue]} onChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: /trigger kind/i });
    expect(select).toHaveValue('manual');
    expect(screen.queryByRole('spinbutton', { name: /delay/i })).toBeNull();
  });

  it('switching to auto_continue calls onChange with delay_ms:0 and shows delay field', async () => {
    const onChange = vi.fn();
    const cue = makeCue({ trigger: { kind: 'manual' } });
    render(<TriggerEditor cuelistId="cl1" cue={cue} cues={[cue]} onChange={onChange} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /trigger kind/i }), { target: { value: 'auto_continue' } });
    });

    expect(onChange).toHaveBeenCalledWith({ kind: 'auto_continue', delay_ms: 0 });
  });

  it('auto_continue with delay field visible — updating calls onChange', async () => {
    const onChange = vi.fn();
    const cue = makeCue({ trigger: { kind: 'auto_continue', delay_ms: 500 } });
    render(<TriggerEditor cuelistId="cl1" cue={cue} cues={[cue]} onChange={onChange} />);

    const delayInput = screen.getByRole('spinbutton', { name: /delay/i });
    expect(delayInput).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(delayInput, { target: { value: '1000' } });
    });

    expect(onChange).toHaveBeenCalledWith({ kind: 'auto_continue', delay_ms: 1000 });
  });

  it('switching to auto_follow calls onChange with prev_cue_id', async () => {
    const onChange = vi.fn();
    const cue1: Cue = makeCue({ id: 'q1', label: 'Cue 1', trigger: { kind: 'manual' } });
    const cue2: Cue = makeCue({ id: 'q2', label: 'Cue 2', trigger: { kind: 'manual' } });
    render(<TriggerEditor cuelistId="cl1" cue={cue2} cues={[cue1, cue2]} onChange={onChange} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /trigger kind/i }), { target: { value: 'auto_follow' } });
    });

    // Should set prev_cue_id to the previous cue (q1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auto_follow', prev_cue_id: 'q1' }));
  });

  it('timecode option is disabled and shows deferred message when selected', async () => {
    const cue = makeCue({ trigger: { kind: 'timecode', time_ms: 0, source: 'internal' } });
    render(<TriggerEditor cuelistId="cl1" cue={cue} cues={[cue]} onChange={() => {}} />);

    // Timecode deferred message shown
    expect(screen.getByRole('status')).toHaveTextContent(/deferred.*0\.2/i);

    // The timecode option exists in the select but is disabled
    const timecodeOption = screen.getByRole('option', { name: /timecode/i });
    expect(timecodeOption).toBeDisabled();
  });
});
