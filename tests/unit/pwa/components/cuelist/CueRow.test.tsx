// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { Cue } from 'showx-shared';
import { CueRow } from '../../../../../pwa/src/components/cuelist/CueRow.js';
import { tokens } from '../../../../../pwa/src/components/cuelist/tokens.js';
import type { StationAwareness } from '../../../../../pwa/src/lib/awareness.js';

afterEach(() => cleanup());

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'q1',
    label: 'Scene 1',
    description: 'Opening scene',
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

function makeStation(id: string, cueId: string): StationAwareness {
  return {
    operator_id: id,
    station_id: id,
    display_name: `Op ${id}`,
    owned_departments: [],
    watched_departments: [],
    current_view: { cuelist_id: '', focus_cue_id: null },
    presence_color: '#0FA298',
    cursor: { cue_id: cueId, field: null },
    last_heartbeat_at: new Date().toISOString(),
  };
}

describe('CueRow', () => {
  it('renders cue label with large font size (24px)', () => {
    const cue = makeCue({ label: 'ACT 1 OPEN' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const label = screen.getByTestId('cue-label');
    expect(label.style.fontSize).toBe('24px');
    expect(label.style.fontWeight).toBe('700');
  });

  it('cue label has explicit ink color', () => {
    const cue = makeCue({ label: 'ACT 1 OPEN' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const label = screen.getByTestId('cue-label');
    expect(label.style.color).toBeTruthy();
  });

  it('renders department chips for each department', () => {
    const cue = makeCue({ department: ['LX', 'SX'] });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByText('LX')).toBeInTheDocument();
    expect(screen.getByText('SX')).toBeInTheDocument();
  });

  it('compound cue with two departments renders multi-stripe sidebar with title per dept', () => {
    const cue = makeCue({ department: ['LX', 'SX'] });
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    // sidebar stripes have title attributes matching department names
    expect(container.querySelector('[title="LX"]')).toBeTruthy();
    expect(container.querySelector('[title="SX"]')).toBeTruthy();
    // Both are sibling divs within the sidebar column
    const lxEl = container.querySelector('[title="LX"]') as HTMLElement;
    const sxEl = container.querySelector('[title="SX"]') as HTMLElement;
    expect(lxEl.parentElement).toBe(sxEl.parentElement);
  });

  it('CueTypeBadge shows ⏵ for manual trigger', () => {
    const cue = makeCue({ trigger: { kind: 'manual' } });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const badge = screen.getByTitle('Manual');
    expect(badge).toHaveTextContent('⏵');
    expect(badge).toHaveAttribute('aria-label', 'Manual');
  });

  it('playhead row renders with playhead_bg background', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveStyle({ background: tokens.color.playhead_bg });
  });

  it('firing row renders with green background', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={true}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveStyle({ background: tokens.color.green });
  });

  it('armed row renders with red left border edge', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={true}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveStyle({ borderLeftColor: tokens.color.red });
  });

  it('renders presence dots for stations at this cue', () => {
    const cue = makeCue({ id: 'q-focus' });
    const stations = [makeStation('op1', 'q-focus'), makeStation('op2', 'q-focus')];
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={stations}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTitle('Op op1')).toBeInTheDocument();
    expect(screen.getByTitle('Op op2')).toBeInTheDocument();
  });

  it('shows lock icon in show mode', () => {
    const cue = makeCue();
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="show"
      />,
    );
    expect(screen.getByLabelText('Payload locked')).toBeInTheDocument();
  });

  it('no lock icon in rehearsal mode', () => {
    const cue = makeCue();
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.queryByLabelText('Payload locked')).toBeNull();
  });

  it('click calls onSelect but not onEdit', () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={onSelect}
        onEdit={onEdit}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('second click of dblclick (detail=2) does not call onSelect', () => {
    const onSelect = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={onSelect}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.click(row, { detail: 2 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('double click in rehearsal mode calls onEdit', () => {
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        onEdit={onEdit}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.dblClick(row);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('double click in show mode does NOT call onEdit', () => {
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        onEdit={onEdit}
        stations={[]}
        mode="show"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.dblClick(row);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('touch long-press ≥500ms calls onEdit in rehearsal mode', () => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        onEdit={onEdit}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onEdit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('touch long-press does NOT call onEdit in show mode', () => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        onEdit={onEdit}
        stations={[]}
        mode="show"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onEdit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('touch released before 500ms does NOT call onEdit', () => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={() => {}}
        onEdit={onEdit}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.touchEnd(row);
    act(() => { vi.advanceTimersByTime(200); });
    expect(onEdit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('long-press does not also fire onSelect via subsequent click', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isArmed={false}
        isFiring={false}
        onSelect={onSelect}
        onEdit={onEdit}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(row);
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
