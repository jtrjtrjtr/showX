// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { Cue } from 'showx-shared';
import { CueRow } from '../../../../../pwa/src/components/cuelist/CueRow.js';
import { tokens } from '../../../../../pwa/src/components/cuelist/tokens.js';
import type { StationAwareness } from '../../../../../pwa/src/lib/awareness.js';

afterEach(() => cleanup());

const BASE_NOW = 1_000_000;

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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(container.querySelector('[title="LX"]')).toBeTruthy();
    expect(container.querySelector('[title="SX"]')).toBeTruthy();
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={true}
        firedAt={BASE_NOW - 100}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={true}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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

  it('duration cell shows em-dash when duration_hint_ms is null', () => {
    const cue = makeCue({ duration_hint_ms: null });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('duration-cell')).toHaveTextContent('—');
  });

  it('duration cell formats M:SS.t correctly', () => {
    const cue = makeCue({ duration_hint_ms: 5000 });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('duration-cell')).toHaveTextContent('0:05.0');
  });

  it('duration cell formats 90500ms as 1:30.5', () => {
    const cue = makeCue({ duration_hint_ms: 90500 });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('duration-cell')).toHaveTextContent('1:30.5');
  });

  it('trigger-cell is rendered with data-testid', () => {
    const cue = makeCue();
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('trigger-cell')).toBeInTheDocument();
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
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
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

  // ── Countdown tests ──────────────────────────────────────────────────────────

  it('row-countdown is shown when firedAt + duration_hint_ms is in the future', () => {
    const cue = makeCue({ duration_hint_ms: 30_000 });
    // fired 5s ago, 30s duration → 25s remaining
    const firedAt = BASE_NOW - 5_000;
    render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={firedAt}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('row-countdown')).toBeInTheDocument();
    // 25000ms = 0:25.0
    expect(screen.getByTestId('row-countdown')).toHaveTextContent('0:25.0');
  });

  it('row-countdown is NOT shown when duration_hint_ms is null', () => {
    const cue = makeCue({ duration_hint_ms: null });
    render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={BASE_NOW - 1_000}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.queryByTestId('row-countdown')).toBeNull();
  });

  it('row-countdown is NOT shown when firedAt is null', () => {
    const cue = makeCue({ duration_hint_ms: 30_000 });
    render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.queryByTestId('row-countdown')).toBeNull();
  });

  it('row-countdown is NOT shown when countdown has expired (remaining ≤ 0)', () => {
    const cue = makeCue({ duration_hint_ms: 5_000 });
    // fired 10s ago, 5s duration → remaining = -5s
    render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={BASE_NOW - 10_000}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.queryByTestId('row-countdown')).toBeNull();
  });

  it('counting-down row has red left border (Eos color)', () => {
    const cue = makeCue({ duration_hint_ms: 30_000 });
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={BASE_NOW - 1_000}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveStyle({ borderLeftColor: tokens.color.red });
  });

  // ── ONYX caret≠selection tests ───────────────────────────────────────────────

  it('isSelected adds boxShadow selection ring (aria-selected=true)', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row.style.boxShadow).toContain(tokens.color.teal);
  });

  it('non-selected non-playhead row has aria-selected=false', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveAttribute('aria-selected', 'false');
  });

  it('playhead row has aria-selected=true', () => {
    const cue = makeCue();
    const { container } = render(
      <CueRow
        cue={cue}
        isPlayhead={true}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const row = container.querySelector('[role="row"]') as HTMLElement;
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('gutter click calls onSetPlayhead and does NOT call onSelect', () => {
    const onSelect = vi.fn();
    const onSetPlayhead = vi.fn();
    const cue = makeCue();
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={onSelect}
        onSetPlayhead={onSetPlayhead}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const gutter = screen.getByTestId('playhead-gutter');
    fireEvent.click(gutter);
    expect(onSetPlayhead).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('gutter has aria-label "Set playhead"', () => {
    const cue = makeCue();
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByLabelText('Set playhead')).toBeInTheDocument();
  });

  // ── cue_number column ────────────────────────────────────────────────────────

  it('renders cue-number-cell (empty when cue_number is null)', () => {
    const cue = makeCue({ cue_number: null });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    const cell = screen.getByTestId('cue-number-cell');
    expect(cell).toBeInTheDocument();
    expect(cell.textContent).toBe('');
  });

  it('renders cue_number value in cue-number-cell', () => {
    const cue = makeCue({ cue_number: '1A' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={false}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
      />,
    );
    expect(screen.getByTestId('cue-number-cell')).toHaveTextContent('1A');
  });

  it('renders InlineEdit in cue-number-cell when inlineEditField=cue_number', () => {
    const cue = makeCue({ cue_number: '5' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField="cue_number"
        onInlineCommit={vi.fn()}
        onInlineCancel={vi.fn()}
      />,
    );
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('5');
  });

  it('calls onInlineCommit when inline edit commits cue_number', () => {
    const onInlineCommit = vi.fn();
    const cue = makeCue({ cue_number: null });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField="cue_number"
        onInlineCommit={onInlineCommit}
        onInlineCancel={vi.fn()}
      />,
    );
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onInlineCommit).toHaveBeenCalledWith('cue_number', '10');
  });

  it('calls onInlineCancel on Escape in inline edit', () => {
    const onInlineCancel = vi.fn();
    const cue = makeCue({ cue_number: '1' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField="cue_number"
        onInlineCommit={vi.fn()}
        onInlineCancel={onInlineCancel}
      />,
    );
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onInlineCancel).toHaveBeenCalledOnce();
  });

  it('renders InlineEdit for label when inlineEditField=label', () => {
    const cue = makeCue({ label: 'Scene 1' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField="label"
        onInlineCommit={vi.fn()}
        onInlineCancel={vi.fn()}
      />,
    );
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    expect(input.value).toBe('Scene 1');
  });

  it('renders InlineEdit for duration_hint_ms when inlineEditField=duration_hint_ms', () => {
    const cue = makeCue({ duration_hint_ms: 5000 });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField="duration_hint_ms"
        onInlineCommit={vi.fn()}
        onInlineCancel={vi.fn()}
      />,
    );
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    // 5000ms = 5 seconds
    expect(input.value).toBe('5');
  });

  it('no InlineEdit when inlineEditField is null', () => {
    const cue = makeCue({ cue_number: '1' });
    render(
      <CueRow
        cue={cue}
        isPlayhead={false}
        isSelected={true}
        isArmed={false}
        isFiring={false}
        firedAt={null}
        now={BASE_NOW}
        onSelect={() => {}}
        stations={[]}
        mode="rehearsal"
        inlineEditField={null}
        onInlineCommit={vi.fn()}
        onInlineCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('inline-edit-input')).toBeNull();
  });
});
