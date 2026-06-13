// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { SMMasterView } from '../../../../../pwa/src/components/cuelist/SMMasterView.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCuelist(doc: Y.Doc, id: string, name = 'Show A') {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', name);
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(
  doc: Y.Doc,
  cuelistId: string,
  id: string,
  label: string,
  opts: { dept?: string[]; description?: string; standbyNote?: string; trigger?: object } = {},
) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
  cue.set('description', opts.description ?? '');
  cue.set('department', opts.dept ?? ['SM']);
  cue.set('standby_note', opts.standbyNote ?? '');
  cue.set('trigger', opts.trigger ?? { kind: 'manual' });
  cue.set('payloads', []);
  cue.set('notes', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function Wrapper({ cuelistId, conn }: { cuelistId: string; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <SMMasterView cuelistId={cuelistId} />
    </ConnectionContext.Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SMMasterView', () => {
  it('renders all cues from useCuelist', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Overture');
    addCue(conn.doc, 'cl1', 'q2', 'Scene 1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    // Labels appear in the cue list (as 24px bold elements)
    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Overture')).toBeInTheDocument();
    expect(within(grid).getByText('Scene 1')).toBeInTheDocument();
  });

  it('filters cues by label when searching', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Overture');
    addCue(conn.doc, 'cl1', 'q2', 'Blackout');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'over' } });
    });

    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Overture')).toBeInTheDocument();
    expect(within(grid).queryByText('Blackout')).toBeNull();
  });

  it('filters cues by description when searching', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue A', { description: 'house to half' });
    addCue(conn.doc, 'cl1', 'q2', 'Cue B', { description: 'spots on' });
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'house' } });
    });

    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Cue A')).toBeInTheDocument();
    expect(within(grid).queryByText('Cue B')).toBeNull();
  });

  it('shows empty state when cuelist has no cues', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText(/No cues yet/)).toBeInTheDocument();
  });

  it('ArrowDown moves playhead to first cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      // Wait for 100ms rate-limit flush in usePlayhead
      await new Promise<void>((r) => setTimeout(r, 150));
    });

    // First row should now be selected
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowDown then ArrowDown moves playhead to second cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Each keypress flushes rate-limit after 100ms; wait between presses
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });

    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-selected', 'false');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp from first cue wraps to last cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Move to first cue then up — wrapping behavior: goes to last cue
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowUp' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Q key calls sendArmRequest for playhead cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Target Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Navigate to first cue — must wait for rate-limit flush so playheadCueId is set
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    // Press Q to arm (standby + arm); standby calls sendArmRequest immediately
    await act(async () => {
      fireEvent.keyDown(window, { code: 'KeyQ' });
    });

    expect(conn.sideChannel.sendArmRequest).toHaveBeenCalledWith('cl1', 'q1');
  });

  it('Space fires the armed cue via sendGoRequest', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Fire This');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Navigate — wait for playheadCueId to be set
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    // Arm — wait for armedCueId to propagate via awareness
    await act(async () => {
      fireEvent.keyDown(window, { code: 'KeyQ' });
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    // Fire
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' });
    });

    expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'q1', false);
  });

  it('clicking a row sets it as selected (aria-selected="true")', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Click Me');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const rows = screen.getAllByRole('row');
    // Click calls setPlayhead which is rate-limited; wait for flush
    await act(async () => {
      fireEvent.click(rows[0]);
      await new Promise<void>((r) => setTimeout(r, 150));
    });
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('renders lock icons when mode is show', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Locked Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    await act(async () => {
      conn.doc.transact(() => conn.doc.getMap('meta').set('mode', 'show'));
    });

    expect(screen.getByLabelText('Payload locked')).toBeInTheDocument();
  });

  it('keyboard shortcuts do not fire when typing in search box', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First');
    addCue(conn.doc, 'cl1', 'q2', 'Second');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    input.focus();

    await act(async () => {
      // Fire ArrowDown with target = the INPUT element
      fireEvent.keyDown(input, { code: 'ArrowDown' });
    });

    // Playhead should not have moved — all rows remain unselected
    const rows = screen.getAllByRole('row');
    rows.forEach((row) => {
      expect(row).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('renders search input with aria-label', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('searchbox', { name: /search cues/i })).toBeInTheDocument();
  });

  describe('go.rejected toast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows rejection reason text and clears after 2 s', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Locate the registered go.rejected handler
      const onMock = vi.mocked(conn.sideChannel.on);
      const handlerCall = onMock.mock.calls.find(([event]) => event === 'go.rejected');
      expect(handlerCall).toBeDefined();
      const handler = handlerCall![1] as (ev: { reason: string; seq?: number }) => void;

      // No alert before rejection
      expect(screen.queryByRole('alert')).toBeNull();

      // Emit go.rejected
      await act(async () => {
        handler({ reason: 'not_sm', seq: 1 });
      });

      // Alert should appear with reason text
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('not_sm');

      // After 2 seconds the alert should be gone
      await act(async () => {
        vi.advanceTimersByTime(2001);
      });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('strips seq counter suffix from displayed reason', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      const onMock = vi.mocked(conn.sideChannel.on);
      const handlerCall = onMock.mock.calls.find(([event]) => event === 'go.rejected')!;
      const handler = handlerCall[1] as (ev: { reason: string }) => void;

      await act(async () => {
        handler({ reason: 'authority_mismatch' });
      });

      const alert = screen.getByRole('alert');
      // Should show the reason without any :N suffix
      expect(alert).toHaveTextContent('authority_mismatch');
      expect(alert.textContent).not.toMatch(/:\d+/);
    });
  });

  // ── B003-603 GO ergonomics ────────────────────────────────────────────────

  describe('TransportBar BACK button', () => {
    it('BACK button is present with correct testid', () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);
      expect(screen.getByTestId('transport-back')).toBeInTheDocument();
    });

    it('BACK button does not call sendGoRequest', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Navigate to second cue
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      const backBtn = screen.getByTestId('transport-back');
      await act(async () => {
        fireEvent.click(backBtn);
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      expect(conn.sideChannel.sendGoRequest).not.toHaveBeenCalled();
    });

    it('BACK button calls sendArmRequest for previous cue', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Navigate to second cue
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      // Clear any prior arm calls from navigation
      vi.mocked(conn.sideChannel.sendArmRequest).mockClear();

      const backBtn = screen.getByTestId('transport-back');
      await act(async () => {
        fireEvent.click(backBtn);
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      // BACK arms the previous cue (q1) — does NOT fire a GO
      expect(conn.sideChannel.sendArmRequest).toHaveBeenCalledWith('cl1', 'q1');
    });

    it('UNARM button is present with correct testid', () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);
      expect(screen.getByTestId('transport-unarm')).toBeInTheDocument();
    });
  });

  describe('B key shortcut for BACK', () => {
    it('B key calls sendArmRequest for previous cue (no sendGoRequest)', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue');
      addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Navigate to second cue
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      vi.mocked(conn.sideChannel.sendArmRequest).mockClear();
      vi.mocked(conn.sideChannel.sendGoRequest).mockClear();

      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyB' });
        await new Promise<void>((r) => setTimeout(r, 150));
      });

      expect(conn.sideChannel.sendGoRequest).not.toHaveBeenCalled();
      expect(conn.sideChannel.sendArmRequest).toHaveBeenCalledWith('cl1', 'q1');
    });
  });

  describe('GO debounce guard (goInert)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('Space fires once; second Space within 300ms is blocked', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Fire This');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Navigate to first cue
      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        vi.advanceTimersByTime(150);
      });
      // Arm
      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyQ' });
        vi.advanceTimersByTime(150);
      });

      // First GO
      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space' });
      });

      // Second GO within debounce window (< 300ms)
      await act(async () => {
        vi.advanceTimersByTime(100);
        fireEvent.keyDown(window, { code: 'Space' });
      });

      // Only one GO should have been sent
      expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledTimes(1);
    });

    it('Space fires again after 300ms debounce window clears', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Fire This');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        vi.advanceTimersByTime(150);
      });
      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyQ' });
        vi.advanceTimersByTime(150);
      });

      // First GO
      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space' });
      });

      // Advance past debounce window
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Arm again (awareness update needed between GOs in real usage)
      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyQ' });
        vi.advanceTimersByTime(150);
      });

      // Second GO after debounce clears
      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space' });
      });

      expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledTimes(2);
    });
  });

  // ── Inline editing shortcuts ──────────────────────────────────────────────────

  describe('inline editing shortcuts (N/L/D/O)', () => {
    it('N key on selected row in rehearsal opens cue_number inline edit', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Click to select the first row
      await act(async () => {
        const rows = screen.getAllByRole('row');
        fireEvent.click(rows[0]);
      });

      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyN' });
      });

      expect(screen.getByTestId('inline-edit-input')).toBeInTheDocument();
    });

    it('L key on selected row opens label inline edit', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        const rows = screen.getAllByRole('row');
        fireEvent.click(rows[0]);
      });

      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyL' });
      });

      const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
      expect(input.value).toBe('Scene 1');
    });

    it('N key does nothing when no row is selected', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyN' });
      });

      expect(screen.queryByTestId('inline-edit-input')).toBeNull();
    });

    it('N key does nothing in show mode', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Select
      await act(async () => {
        const rows = screen.getAllByRole('row');
        fireEvent.click(rows[0]);
      });

      // Switch to show mode
      await act(async () => {
        fireEvent.click(screen.getByTestId('mode-badge'));
      });

      await act(async () => {
        fireEvent.keyDown(window, { code: 'KeyN' });
      });

      expect(screen.queryByTestId('inline-edit-input')).toBeNull();
    });

    it('Escape closes inline edit without committing', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        const rows = screen.getAllByRole('row');
        fireEvent.click(rows[0]);
      });
      await act(async () => { fireEvent.keyDown(window, { code: 'KeyN' }); });

      expect(screen.getByTestId('inline-edit-input')).toBeInTheDocument();

      await act(async () => {
        const input = screen.getByTestId('inline-edit-input');
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      expect(screen.queryByTestId('inline-edit-input')).toBeNull();
    });
  });

  describe('hotkey triggers', () => {
    it('pressing bound key fires the cue via sendGoRequest', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Hotkey Cue', { trigger: { kind: 'hotkey', key: 'F5' } });
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        fireEvent.keyDown(window, { key: 'F5' });
      });

      expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'q1', false);
    });

    it('pressing key while INPUT is focused does NOT fire', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Hotkey Cue', { trigger: { kind: 'hotkey', key: 'F5' } });
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      // Simulate focus inside an input (the search box is always present)
      const searchBox = screen.getByRole('searchbox');
      await act(async () => {
        fireEvent.keyDown(searchBox, { key: 'F5' });
      });

      expect(conn.sideChannel.sendGoRequest).not.toHaveBeenCalled();
    });

    it('duplicate hotkey: fires the first cue in cuelist order', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'First Cue', { trigger: { kind: 'hotkey', key: 'F7' } });
      addCue(conn.doc, 'cl1', 'q2', 'Second Cue', { trigger: { kind: 'hotkey', key: 'F7' } });
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        fireEvent.keyDown(window, { key: 'F7' });
      });

      expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'q1', false);
      expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledTimes(1);
    });

    it('pressing unbound key does NOT fire any cue', async () => {
      const conn = makeTestConnection();
      addCuelist(conn.doc, 'cl1');
      addCue(conn.doc, 'cl1', 'q1', 'Manual Cue', { trigger: { kind: 'manual' } });
      render(<Wrapper cuelistId="cl1" conn={conn} />);

      await act(async () => {
        fireEvent.keyDown(window, { key: 'F9' });
      });

      expect(conn.sideChannel.sendGoRequest).not.toHaveBeenCalled();
    });
  });
});
