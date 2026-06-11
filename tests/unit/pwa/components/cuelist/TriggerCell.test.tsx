// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Cue } from 'showx-shared';
import { TriggerCell } from '../../../../../pwa/src/components/cuelist/TriggerCell.js';

afterEach(() => cleanup());

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'q1',
    label: 'Scene 1',
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

function makeCues(count = 3): Cue[] {
  return Array.from({ length: count }, (_, i) =>
    makeCue({ id: `q${i + 1}`, label: `Scene ${i + 1}` }),
  );
}

describe('TriggerCell', () => {
  it('renders with data-testid trigger-cell', () => {
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('trigger-cell')).toBeInTheDocument();
  });

  it('displays GO glyph + text for manual trigger', () => {
    render(
      <TriggerCell
        cue={makeCue({ trigger: { kind: 'manual' } })}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('⏵');
    expect(btn).toHaveTextContent('GO');
  });

  it('displays auto_continue glyph and delay text', () => {
    render(
      <TriggerCell
        cue={makeCue({ trigger: { kind: 'auto_continue', delay_ms: 2000 } })}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('⏩');
    expect(btn).toHaveTextContent('+2.0s');
  });

  it('displays auto_follow glyph and prev cue label', () => {
    const cues = makeCues(3);
    render(
      <TriggerCell
        cue={makeCue({ id: 'q2', trigger: { kind: 'auto_follow', prev_cue_id: 'q1' } })}
        cues={cues}
        mode="rehearsal"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('→');
    expect(btn).toHaveTextContent('follow Scene 1');
  });

  it('clicking opens popover in rehearsal + editable mode', () => {
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking does NOT open popover in show mode', () => {
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="show"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking does NOT open popover when editable=false', () => {
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="rehearsal"
        editable={false}
        onUpdate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancel button closes popover without calling onUpdate', () => {
    const onUpdate = vi.fn();
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Set button calls onUpdate with manual trigger', () => {
    const onUpdate = vi.fn();
    render(
      <TriggerCell
        cue={makeCue({ trigger: { kind: 'manual' } })}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByTestId('trigger-cell-save'));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'manual' });
  });

  it('switching to auto_continue and saving calls onUpdate with delay_ms', () => {
    const onUpdate = vi.fn();
    render(
      <TriggerCell
        cue={makeCue({ trigger: { kind: 'manual' } })}
        cues={makeCues()}
        mode="rehearsal"
        editable={true}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByLabelText('Trigger kind'), { target: { value: 'auto_continue' } });
    fireEvent.change(screen.getByLabelText('Delay seconds'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('trigger-cell-save'));
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'auto_continue', delay_ms: 3000 });
  });

  it('switching to auto_follow pre-populates previous cue in list order', () => {
    const cues = [
      makeCue({ id: 'q1', label: 'Scene 1' }),
      makeCue({ id: 'q2', label: 'Scene 2' }),
      makeCue({ id: 'q3', label: 'Scene 3' }),
    ];
    const onUpdate = vi.fn();
    render(
      <TriggerCell
        cue={cues[2]}
        cues={cues}
        mode="rehearsal"
        editable={true}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByLabelText('Trigger kind'), { target: { value: 'auto_follow' } });
    // Previous cue (q2) should be pre-selected in the dropdown
    const select = screen.getByLabelText('Previous cue') as HTMLSelectElement;
    expect(select.value).toBe('q2');
  });

  it('show mode shows lock icon', () => {
    render(
      <TriggerCell
        cue={makeCue()}
        cues={makeCues()}
        mode="show"
        editable={true}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });
});
