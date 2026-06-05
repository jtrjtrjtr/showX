// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import type { Cue, DepartmentTag, ShowMode } from 'showx-shared';
import { useStations } from '../../../pwa/src/hooks/useStations.js';
import type { StationAwareness } from '../../../pwa/src/lib/awareness.js';
import { useMode } from '../../../pwa/src/hooks/useMode.js';
import { useCue } from '../../../pwa/src/hooks/useCue.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function getChangeCb(mockFn: ReturnType<typeof vi.fn>): (() => void) | undefined {
  const call = (mockFn.mock.calls as Array<[string, () => void]>).find(([e]) => e === 'change');
  return call?.[1];
}

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, cueId: string, label: string) {
  const cl = doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', cueId);
  cue.set('label', label);
  cue.set('department', ['SM'] as DepartmentTag[]);
  cue.set('payloads', []);
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function makeStation(id: string): StationAwareness {
  return {
    operator_id: id,
    station_id: id,
    display_name: id,
    owned_departments: [],
    watched_departments: [],
    current_view: { cuelist_id: '', focus_cue_id: null },
    presence_color: '#fff',
    cursor: { cue_id: null, field: null },
    last_heartbeat_at: new Date().toISOString(),
  };
}

// ── useStations ───────────────────────────────────────────────────────────────

function StationsDisplay() {
  const stations = useStations();
  return <div data-testid="count">{stations.length}</div>;
}

describe('useStations', () => {
  it('returns empty array initially when no remote stations', () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <StationsDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('re-renders when awareness change event fires with a new station', async () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <StationsDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    // Add a remote station (different clientId from local)
    conn.awareness.states.set(conn.doc.clientID + 1, makeStation('remote-op') as unknown as Record<string, unknown>);
    const changeCb = getChangeCb(conn.awareness.on as ReturnType<typeof vi.fn>);

    await act(async () => {
      changeCb?.();
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('returns same array reference between parent re-renders when awareness is unchanged', () => {
    const conn = makeTestConnection();
    const snapshots: StationAwareness[][] = [];

    function Capturer({ tick }: { tick: number }) {
      const stations = useStations();
      snapshots.push(stations);
      return <div>{tick}</div>;
    }

    const { rerender } = render(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={0} />
      </ConnectionContext.Provider>,
    );

    rerender(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={1} />
      </ConnectionContext.Provider>,
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(Object.is(snapshots[0], snapshots[snapshots.length - 1])).toBe(true);
  });
});

// ── useMode ───────────────────────────────────────────────────────────────────

function ModeDisplay() {
  const { mode } = useMode();
  return <div data-testid="mode">{mode}</div>;
}

describe('useMode', () => {
  it('returns rehearsal by default when meta.mode unset', () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <ModeDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('rehearsal');
  });

  it('re-renders when mode changes in Y.Doc', async () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <ModeDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('rehearsal');

    await act(async () => {
      conn.doc.transact(() => conn.doc.getMap('meta').set('mode', 'show'));
    });

    expect(screen.getByTestId('mode')).toHaveTextContent('show');
  });

  it('returns same string value between parent re-renders when mode unchanged', () => {
    const conn = makeTestConnection();
    const modes: ShowMode[] = [];

    function Capturer({ tick }: { tick: number }) {
      const { mode } = useMode();
      modes.push(mode);
      return <div>{tick}</div>;
    }

    const { rerender } = render(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={0} />
      </ConnectionContext.Provider>,
    );

    rerender(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={1} />
      </ConnectionContext.Provider>,
    );

    expect(modes.length).toBeGreaterThanOrEqual(2);
    // Primitive equality (mode is a string)
    expect(modes[0]).toBe(modes[modes.length - 1]);
  });
});

// ── useCue ────────────────────────────────────────────────────────────────────

function CueDisplay({ cuelistId, cueId }: { cuelistId: string; cueId: string }) {
  const cue = useCue(cuelistId, cueId);
  if (!cue) return <div data-testid="label">null</div>;
  return <div data-testid="label">{cue.label}</div>;
}

describe('useCue', () => {
  it('returns null for an unknown cue', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    render(
      <ConnectionContext.Provider value={conn}>
        <CueDisplay cuelistId="cl" cueId="missing" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('label')).toHaveTextContent('null');
  });

  it('returns cue data when cue exists in the doc', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', 'Opening Sequence');
    render(
      <ConnectionContext.Provider value={conn}>
        <CueDisplay cuelistId="cl" cueId="q1" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('label')).toHaveTextContent('Opening Sequence');
  });

  it('re-renders when the cue label changes in Y.Doc', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', 'Original Label');
    render(
      <ConnectionContext.Provider value={conn}>
        <CueDisplay cuelistId="cl" cueId="q1" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('label')).toHaveTextContent('Original Label');

    await act(async () => {
      const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray()[0];
      const cue = (cl.get('cues') as Y.Array<Y.Map<unknown>>).get(0);
      conn.doc.transact(() => cue.set('label', 'Updated Label'));
    });

    expect(screen.getByTestId('label')).toHaveTextContent('Updated Label');
  });

  it('returns same Cue reference between parent re-renders when cue data unchanged', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', 'Stable Cue');
    const snapshots: (Cue | null)[] = [];

    function Capturer({ tick }: { tick: number }) {
      const cue = useCue('cl', 'q1');
      snapshots.push(cue);
      return <div>{tick}</div>;
    }

    const { rerender } = render(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={0} />
      </ConnectionContext.Provider>,
    );

    rerender(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={1} />
      </ConnectionContext.Provider>,
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(Object.is(snapshots[0], snapshots[snapshots.length - 1])).toBe(true);
  });
});
