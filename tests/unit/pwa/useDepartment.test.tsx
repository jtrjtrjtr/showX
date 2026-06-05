// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';

afterEach(() => cleanup());
import React from 'react';
import * as Y from 'yjs';
import type { DepartmentTag } from 'showx-shared';
import { useDepartment } from '../../../pwa/src/hooks/useDepartment.js';
import type { FilterContext } from '../../../pwa/src/hooks/useDepartment.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, cueId: string, depts: DepartmentTag[]) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', cueId);
  cue.set('label', cueId);
  cue.set('department', depts);
  cue.set('payloads', []);
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function DeptDisplay({ cuelistId, ctx }: { cuelistId: string; ctx: FilterContext }) {
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  return (
    <div>
      <span data-testid="visible">{visible.length}</span>
      <span data-testid="actionable">{actionable.size}</span>
    </div>
  );
}

const smCtx: FilterContext = {
  owned: new Set<DepartmentTag>(['SM']),
  watched: new Set<DepartmentTag>(),
};

const lxCtx: FilterContext = {
  owned: new Set<DepartmentTag>(['LX']),
  watched: new Set<DepartmentTag>(['SX']),
};

describe('useDepartment', () => {
  it('SM profile sees all cues', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', ['SM']);
    addCue(conn.doc, 'cl', 'q2', ['LX']);
    addCue(conn.doc, 'cl', 'q3', ['SM', 'LX']);
    render(
      <ConnectionContext.Provider value={conn}>
        <DeptDisplay cuelistId="cl" ctx={{ owned: new Set<DepartmentTag>(['SM']), watched: new Set<DepartmentTag>(['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS']) }} />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('visible')).toHaveTextContent('3');
    expect(screen.getByTestId('actionable')).toHaveTextContent('2'); // SM owns SM + SM,LX
  });

  it('LX op sees LX and SX cues only', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', ['SM']); // not LX or SX
    addCue(conn.doc, 'cl', 'q2', ['LX']); // LX owned
    addCue(conn.doc, 'cl', 'q3', ['SX']); // SX watched
    addCue(conn.doc, 'cl', 'q4', ['VIDEO']); // not in lens
    render(
      <ConnectionContext.Provider value={conn}>
        <DeptDisplay cuelistId="cl" ctx={lxCtx} />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('visible')).toHaveTextContent('2');
    expect(screen.getByTestId('actionable')).toHaveTextContent('1'); // only LX
  });

  it('empty owned and watched renders nothing', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', ['LX']);
    render(
      <ConnectionContext.Provider value={conn}>
        <DeptDisplay
          cuelistId="cl"
          ctx={{ owned: new Set<DepartmentTag>(), watched: new Set<DepartmentTag>() }}
        />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('visible')).toHaveTextContent('0');
    expect(screen.getByTestId('actionable')).toHaveTextContent('0');
  });

  it('re-renders when a cue department changes', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', ['VIDEO']); // not in lxCtx
    render(
      <ConnectionContext.Provider value={conn}>
        <DeptDisplay cuelistId="cl" ctx={lxCtx} />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('visible')).toHaveTextContent('0');

    await act(async () => {
      const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray()[0];
      const cue = (cl.get('cues') as Y.Array<Y.Map<unknown>>).get(0);
      conn.doc.transact(() => cue.set('department', ['LX']));
    });
    expect(screen.getByTestId('visible')).toHaveTextContent('1');
  });

  it('memoizes — same ctx produces referentially equal result when cues unchanged', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl');
    addCue(conn.doc, 'cl', 'q1', ['LX']);
    const results: ReturnType<typeof useDepartment>[] = [];

    function Capturer({ tick }: { tick: number }) {
      const result = useDepartment('cl', smCtx);
      results.push(result);
      return <button data-testid="btn">{tick}</button>;
    }

    const { rerender } = render(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={0} />
      </ConnectionContext.Provider>,
    );

    // Force a re-render via new prop — no Yjs mutation, ctx unchanged
    rerender(
      <ConnectionContext.Provider value={conn}>
        <Capturer tick={1} />
      </ConnectionContext.Provider>,
    );

    expect(results.length).toBeGreaterThanOrEqual(2);
    const first = results[0];
    const last = results[results.length - 1];
    // useMemo must return same references when cues + ctx key are unchanged
    expect(Object.is(first.visible, last.visible)).toBe(true);
    expect(Object.is(first.actionable, last.actionable)).toBe(true);
  });
});
