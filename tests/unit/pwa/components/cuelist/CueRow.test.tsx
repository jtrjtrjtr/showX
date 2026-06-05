// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import type { Cue } from 'showx-shared';
import { CueRow } from '../../../../../pwa/src/components/cuelist/CueRow.js';
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
    const label = screen.getByText('ACT 1 OPEN');
    expect(label.style.fontSize).toBe('24px');
    expect(label.style.fontWeight).toBe('700');
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

  it('playhead row renders with teal_dim background', () => {
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
    expect(row).toHaveStyle({ background: '#7FCFC9' });
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
    expect(row).toHaveStyle({ background: '#2DA44E' });
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
});
