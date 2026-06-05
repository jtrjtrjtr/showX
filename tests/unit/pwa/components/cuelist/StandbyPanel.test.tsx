// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Cue } from 'showx-shared';
import { StandbyPanel } from '../../../../../pwa/src/components/cuelist/StandbyPanel.js';
import { CallingText } from '../../../../../pwa/src/components/cuelist/CallingText.js';
import type { GoDispatched } from '../../../../../pwa/src/lib/sideChannel.js';
import { tokens } from '../../../../../pwa/src/components/cuelist/tokens.js';

afterEach(() => cleanup());

function makeCue(id: string, label: string, standbyNote = ''): Cue {
  return {
    id,
    label,
    description: '',
    department: ['SM'],
    standby_note: standbyNote,
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
  };
}

const cues = [
  makeCue('q1', 'Overture', 'House to half'),
  makeCue('q2', 'Act 1', 'Spots on conductor'),
  makeCue('q3', 'Intermission'),
  makeCue('q4', 'Act 2'),
];

describe('StandbyPanel', () => {
  it('renders next cues in the standby area', () => {
    render(
      <StandbyPanel nextCues={[cues[0], cues[1], cues[2]]} armedCueId={null} cues={cues} />,
    );
    expect(screen.getByText('Overture')).toBeInTheDocument();
    expect(screen.getByText('Act 1')).toBeInTheDocument();
    expect(screen.getByText('Intermission')).toBeInTheDocument();
  });

  it('shows armed cue standby text in red when armed', () => {
    render(
      <StandbyPanel nextCues={[]} armedCueId="q1" cues={cues} />,
    );
    const callout = screen.getByText(/Standby Overture/);
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveStyle({ color: '#D14D3B' });
  });

  it('shows no red callout when no cue is armed', () => {
    render(
      <StandbyPanel nextCues={[cues[0]]} armedCueId={null} cues={cues} />,
    );
    const redElements = Array.from(document.querySelectorAll('*')).filter(
      (el) => (el as HTMLElement).style?.color === tokens.color.red,
    );
    expect(redElements).toHaveLength(0);
  });

  it('shows standby_note alongside armed cue label', () => {
    render(
      <StandbyPanel nextCues={[]} armedCueId="q1" cues={cues} />,
    );
    expect(screen.getByText(/House to half/)).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    const { container } = render(
      <StandbyPanel nextCues={[cues[0]]} armedCueId={null} cues={cues} />,
    );
    const section = container.querySelector('[role="status"]');
    expect(section).toBeTruthy();
  });

  it('has aria-live="polite" for screen reader announcements', () => {
    const { container } = render(
      <StandbyPanel nextCues={[cues[0]]} armedCueId={null} cues={cues} />,
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
  });

  it('renders tappable buttons for next cues when onStandby is provided', () => {
    const onStandby = vi.fn();
    render(
      <StandbyPanel
        nextCues={[cues[0], cues[1]]}
        armedCueId={null}
        cues={cues}
        onStandby={onStandby}
      />,
    );
    const btn = screen.getByRole('button', { name: /Arm cue Overture/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onStandby).toHaveBeenCalledWith('q1');
  });

  it('clicking a next-cue button calls onStandby with cueId', () => {
    const onStandby = vi.fn();
    render(
      <StandbyPanel
        nextCues={[cues[0], cues[1]]}
        armedCueId={null}
        cues={cues}
        onStandby={onStandby}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Arm cue Act 1/i }));
    expect(onStandby).toHaveBeenCalledWith('q2');
  });
});

describe('CallingText', () => {
  it('shows STANDBY <label> when a cue is armed and not firing', () => {
    const cue = makeCue('q1', 'Scene 1');
    render(<CallingText armedCue={cue} lastFired={null} />);
    expect(screen.getByText('STANDBY Scene 1')).toBeInTheDocument();
  });

  it('shows GO <cue_id> when a dispatch occurred within 2 seconds', () => {
    const dispatched: GoDispatched = {
      topic: 'go.dispatched',
      request_id: 'r1',
      cue_id: 'q-live',
      cuelist_id: 'cl1',
      sequence: 1,
      dispatched_at: new Date().toISOString(),
      payloads_dispatched: 1,
      payloads_failed: [],
      fired_by: { station_id: 'st1', operator_id: 'op1' },
      historic: false,
    };
    render(<CallingText armedCue={null} lastFired={dispatched} />);
    expect(screen.getByText('GO q-live')).toBeInTheDocument();
  });

  it('shows Ready when neither armed nor recently fired', () => {
    render(<CallingText armedCue={null} lastFired={null} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('has aria-live="polite" for screen reader accessibility', () => {
    const { container } = render(<CallingText armedCue={null} lastFired={null} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
  });

  it('shows Ready when lastFired is older than 2 seconds', () => {
    const oldDate = new Date(Date.now() - 5000).toISOString();
    const dispatched: GoDispatched = {
      topic: 'go.dispatched',
      request_id: 'r1',
      cue_id: 'q-old',
      cuelist_id: 'cl1',
      sequence: 1,
      dispatched_at: oldDate,
      payloads_dispatched: 1,
      payloads_failed: [],
      fired_by: { station_id: 'st1', operator_id: 'op1' },
      historic: true,
    };
    render(<CallingText armedCue={null} lastFired={dispatched} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
