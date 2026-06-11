// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { CueEditDialog } from '../../../../../pwa/src/components/cuelist/CueEditDialog.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, cue: Cue) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  const cuesArr = new Y.Array<Y.Map<unknown>>();
  cl.set('cues', cuesArr);
  doc.getArray('cuelists').push([cl]);
  const cueMap = new Y.Map<unknown>();
  cueMap.set('id', cue.id); cueMap.set('label', cue.label); cueMap.set('department', cue.department);
  cueMap.set('trigger', cue.trigger); cueMap.set('notes', cue.notes ?? ''); cueMap.set('description', cue.description);
  cueMap.set('standby_note', cue.standby_note); cueMap.set('script_line_ref', null);
  cueMap.set('duration_hint_ms', null); cueMap.set('payload_frozen_at', null); cueMap.set('sort_key', 1000);
  cueMap.set('created_at', cue.created_at); cueMap.set('created_by', cue.created_by);
  cueMap.set('modified_at', cue.modified_at); cueMap.set('modified_by', cue.modified_by);
  cueMap.set('payloads', new Y.Array<Y.Map<unknown>>());
  cuesArr.push([cueMap]);
}

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'q1',
    label: 'Scene 1',
    description: 'Opening scene',
    department: ['SM'],
    standby_note: 'Standby SM',
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

describe('CueEditDialog', () => {
  it('renders with initial cue values pre-filled', () => {
    const cue = makeCue({ label: 'ACT 1', description: 'Big open', standby_note: 'Standby all' });
    render(<CueEditDialog cue={cue} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByTestId('cue-edit-label') as HTMLInputElement).value).toBe('ACT 1');
    expect((screen.getByTestId('cue-edit-description') as HTMLInputElement).value).toBe('Big open');
    expect((screen.getByTestId('cue-edit-standby-note') as HTMLInputElement).value).toBe('Standby all');
  });

  it('save button calls onSave with current field values', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1', description: '', standby_note: '' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('cue-edit-label'), { target: { value: 'Q1 edited' } });
    fireEvent.change(screen.getByTestId('cue-edit-description'), { target: { value: 'New desc' } });
    fireEvent.click(screen.getByTestId('cue-edit-save'));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({
      label: 'Q1 edited',
      description: 'New desc',
      standby_note: '',
      duration_hint_ms: null,
    });
  });

  it('trims whitespace from label on save', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('cue-edit-label'), { target: { value: '  Q1 trimmed  ' } });
    fireEvent.click(screen.getByTestId('cue-edit-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: 'Q1 trimmed' }));
  });

  it('empty label shows error and does NOT call onSave', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('cue-edit-label'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('cue-edit-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('cue-edit-label-error')).toBeInTheDocument();
  });

  it('cancel button calls onCancel without saving', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<CueEditDialog cue={makeCue()} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('cue-edit-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(<CueEditDialog cue={makeCue()} onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByTestId('cue-edit-dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Cmd+Enter calls onSave', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.keyDown(screen.getByTestId('cue-edit-dialog'), { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('Ctrl+Enter calls onSave', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.keyDown(screen.getByTestId('cue-edit-dialog'), { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('duration field pre-fills from cue.duration_hint_ms', () => {
    const cue = makeCue({ duration_hint_ms: 5000 });
    render(<CueEditDialog cue={cue} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByTestId('cue-edit-duration') as HTMLInputElement).value).toBe('5.0');
  });

  it('duration field empty when duration_hint_ms is null', () => {
    const cue = makeCue({ duration_hint_ms: null });
    render(<CueEditDialog cue={cue} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByTestId('cue-edit-duration') as HTMLInputElement).value).toBe('');
  });

  it('saving with duration value includes duration_hint_ms in ms', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('cue-edit-duration'), { target: { value: '5.5' } });
    fireEvent.click(screen.getByTestId('cue-edit-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ duration_hint_ms: 5500 }));
  });

  it('saving with empty duration includes duration_hint_ms: null', () => {
    const onSave = vi.fn();
    const cue = makeCue({ label: 'Q1', duration_hint_ms: 3000 });
    render(<CueEditDialog cue={cue} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('cue-edit-duration'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('cue-edit-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ duration_hint_ms: null }));
  });

  it('no Payloads section when cuelistId is not provided', () => {
    const cue = makeCue({ label: 'Q1' });
    render(<CueEditDialog cue={cue} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/Payloads/i)).toBeNull();
  });

  it('shows Payloads section when cuelistId is provided', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ label: 'Q1' });
    setupCueInDoc(conn, cue);
    render(
      <ConnectionContext.Provider value={conn}>
        <CueEditDialog cue={cue} cuelistId="cl1" locked={false} onSave={vi.fn()} onCancel={vi.fn()} />
      </ConnectionContext.Provider>
    );
    expect(screen.getAllByText(/Payloads/i).length).toBeGreaterThan(0);
  });

  it('shows frozen notice when cuelistId provided and locked', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ label: 'Q1', payload_frozen_at: '2026-01-01T00:00:00Z' });
    setupCueInDoc(conn, cue);
    render(
      <ConnectionContext.Provider value={conn}>
        <CueEditDialog cue={cue} cuelistId="cl1" locked={true} onSave={vi.fn()} onCancel={vi.fn()} />
      </ConnectionContext.Provider>
    );
    expect(screen.getByTestId('payload-frozen-notice')).toBeInTheDocument();
  });

  it('no frozen notice when cuelistId provided and not locked', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ label: 'Q1' });
    setupCueInDoc(conn, cue);
    render(
      <ConnectionContext.Provider value={conn}>
        <CueEditDialog cue={cue} cuelistId="cl1" locked={false} onSave={vi.fn()} onCancel={vi.fn()} />
      </ConnectionContext.Provider>
    );
    expect(screen.queryByTestId('payload-frozen-notice')).toBeNull();
  });
});
