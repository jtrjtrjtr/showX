// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { CallerLineGroup, Cue } from 'showx-shared';
import { CallerLinesEditor } from '../../../../../pwa/src/components/cuelist/CallerLinesEditor.js';

afterEach(() => cleanup());

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'cue-1',
    label: 'Opening scene',
    description: '',
    department: ['LX'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'op1',
    modified_at: '2026-01-01T00:00:00Z',
    modified_by: 'op1',
    ...overrides,
  };
}

describe('CallerLinesEditor — baseline rendering', () => {
  it('renders standby inputs for all canonical departments + GO input', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId('caller-standby-LX')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-SX')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-VIDEO')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-AUTO')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-PYRO')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-FS')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-SM')).toBeInTheDocument();
    expect(screen.getByTestId('caller-go-input')).toBeInTheDocument();
  });

  it('pre-fills standby values from value prop', () => {
    const value: CallerLineGroup = { standby: { LX: 'LX standby', SX: 'SX standby' }, go: 'GO' };
    render(<CallerLinesEditor value={value} onChange={vi.fn()} />);
    expect((screen.getByTestId('caller-standby-LX') as HTMLInputElement).value).toBe('LX standby');
    expect((screen.getByTestId('caller-standby-SX') as HTMLInputElement).value).toBe('SX standby');
    expect((screen.getByTestId('caller-standby-VIDEO') as HTMLInputElement).value).toBe('');
  });

  it('pre-fills go value from value prop', () => {
    const value: CallerLineGroup = { standby: {}, go: 'And go!' };
    render(<CallerLinesEditor value={value} onChange={vi.fn()} />);
    expect((screen.getByTestId('caller-go-input') as HTMLInputElement).value).toBe('And go!');
  });

  it('shows empty inputs when value is null', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} />);
    expect((screen.getByTestId('caller-standby-LX') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('caller-go-input') as HTMLInputElement).value).toBe('');
  });

  it('calls onChange with updated standby when dept input changes', () => {
    const onChange = vi.fn();
    render(<CallerLinesEditor value={null} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('caller-standby-LX'), { target: { value: 'LX standby' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ standby: expect.objectContaining({ LX: 'LX standby' }) }),
    );
  });

  it('calls onChange with updated go text', () => {
    const onChange = vi.fn();
    render(<CallerLinesEditor value={null} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('caller-go-input'), { target: { value: 'GO lights!' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ go: 'GO lights!' }));
  });

  it('emits null when all fields are cleared', () => {
    const onChange = vi.fn();
    const value: CallerLineGroup = { standby: { LX: 'LX standby' }, go: '' };
    render(<CallerLinesEditor value={value} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('caller-standby-LX'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('preserves existing standby when only GO is typed', () => {
    const onChange = vi.fn();
    const value: CallerLineGroup = { standby: { SX: 'SX standby' }, go: '' };
    render(<CallerLinesEditor value={value} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('caller-go-input'), { target: { value: 'GO' } });
    expect(onChange).toHaveBeenCalledWith({
      standby: { SX: 'SX standby' },
      go: 'GO',
    });
  });

  it('disables all inputs when disabled=true (SHOW mode lock)', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} disabled />);
    expect((screen.getByTestId('caller-standby-LX') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('caller-standby-SX') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('caller-go-input') as HTMLInputElement).disabled).toBe(true);
  });

  it('enabled inputs when disabled=false', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} disabled={false} />);
    expect((screen.getByTestId('caller-standby-LX') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByTestId('caller-go-input') as HTMLInputElement).disabled).toBe(false);
  });

  it('respects custom departments list', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} departments={['LX', 'SX']} />,
    );
    expect(screen.getByTestId('caller-standby-LX')).toBeInTheDocument();
    expect(screen.getByTestId('caller-standby-SX')).toBeInTheDocument();
    expect(screen.queryByTestId('caller-standby-VIDEO')).toBeNull();
  });
});

describe('CallerLinesEditor — Generate from sheet', () => {
  it('does NOT show generate button when cue prop is absent', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId('caller-generate-btn')).toBeNull();
  });

  it('shows generate button when cue prop is provided', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} cue={makeCue()} />,
    );
    expect(screen.getByTestId('caller-generate-btn')).toBeInTheDocument();
  });

  it('clicking generate with null value applies generated lines directly', () => {
    const onChange = vi.fn();
    const cue = makeCue({ department: ['LX'], label: 'Opening', cue_number: '1' });
    render(<CallerLinesEditor value={null} onChange={onChange} cue={cue} />);
    fireEvent.click(screen.getByTestId('caller-generate-btn'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        standby: expect.objectContaining({ LX: 'LX — standby for 1 Opening' }),
        go: 'LX — GO',
      }),
    );
    // No confirm UI shown
    expect(screen.queryByTestId('caller-generate-confirm')).toBeNull();
  });

  it('clicking generate when value is non-null shows confirmation, does not apply yet', () => {
    const onChange = vi.fn();
    const cue = makeCue({ department: ['LX'], label: 'Opening' });
    const existing: CallerLineGroup = { standby: { LX: 'manually edited' }, go: 'My GO' };
    render(<CallerLinesEditor value={existing} onChange={onChange} cue={cue} />);
    fireEvent.click(screen.getByTestId('caller-generate-btn'));
    expect(screen.getByTestId('caller-generate-confirm')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Replace" in confirmation applies generated lines', () => {
    const onChange = vi.fn();
    const cue = makeCue({ department: ['SX'], label: 'Music', cue_number: '2' });
    const existing: CallerLineGroup = { standby: { SX: 'manually edited' }, go: 'go' };
    render(<CallerLinesEditor value={existing} onChange={onChange} cue={cue} />);
    fireEvent.click(screen.getByTestId('caller-generate-btn'));
    fireEvent.click(screen.getByTestId('caller-generate-apply'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        standby: expect.objectContaining({ SX: 'SX — standby for 2 Music' }),
        go: 'SX — GO',
      }),
    );
    expect(screen.queryByTestId('caller-generate-confirm')).toBeNull();
  });

  it('"Keep manual" in confirmation dismisses without applying', () => {
    const onChange = vi.fn();
    const cue = makeCue({ department: ['LX'], label: 'Scene' });
    const existing: CallerLineGroup = { standby: { LX: 'manual' }, go: 'GO' };
    render(<CallerLinesEditor value={existing} onChange={onChange} cue={cue} />);
    fireEvent.click(screen.getByTestId('caller-generate-btn'));
    fireEvent.click(screen.getByTestId('caller-generate-keep'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('caller-generate-confirm')).toBeNull();
  });

  it('generate button is disabled when disabled=true', () => {
    const cue = makeCue();
    render(<CallerLinesEditor value={null} onChange={vi.fn()} cue={cue} disabled />);
    expect((screen.getByTestId('caller-generate-btn') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CallerLinesEditor — Bulk generate', () => {
  it('does NOT show bulk generate button when onBulkGenerate is absent', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId('caller-generate-all-btn')).toBeNull();
  });

  it('shows bulk generate button when onBulkGenerate is provided', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onBulkGenerate={vi.fn()} />,
    );
    expect(screen.getByTestId('caller-generate-all-btn')).toBeInTheDocument();
  });

  it('clicking bulk generate calls onBulkGenerate callback', () => {
    const onBulkGenerate = vi.fn();
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onBulkGenerate={onBulkGenerate} />,
    );
    fireEvent.click(screen.getByTestId('caller-generate-all-btn'));
    expect(onBulkGenerate).toHaveBeenCalledTimes(1);
  });

  it('bulk generate button is disabled when disabled=true', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onBulkGenerate={vi.fn()} disabled />,
    );
    expect((screen.getByTestId('caller-generate-all-btn') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CallerLinesEditor — Draft with AI', () => {
  const llmResult = {
    lines: { standby: { LX: 'Standby lights, opening scene' }, go: 'Lights — go' },
    source: 'llm' as const,
  };

  it('does NOT show "Draft with AI" button when onAiDraft is absent', () => {
    render(<CallerLinesEditor value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId('caller-ai-draft-btn')).toBeNull();
  });

  it('shows "Draft with AI" button when onAiDraft is provided', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onAiDraft={vi.fn().mockResolvedValue(llmResult)} />,
    );
    expect(screen.getByTestId('caller-ai-draft-btn')).toBeInTheDocument();
  });

  it('clicking "Draft with AI" shows loading state while pending', async () => {
    let resolve: (v: typeof llmResult) => void;
    const pending = new Promise<typeof llmResult>((res) => { resolve = res; });
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onAiDraft={() => pending} />,
    );
    fireEvent.click(screen.getByTestId('caller-ai-draft-btn'));
    expect(screen.getByTestId('caller-ai-draft-btn')).toHaveTextContent('Drafting…');
    resolve!(llmResult);
  });

  it('shows AI draft review panel after successful draft', async () => {
    const onAiDraft = vi.fn().mockResolvedValue(llmResult);
    render(<CallerLinesEditor value={null} onChange={vi.fn()} onAiDraft={onAiDraft} />);
    fireEvent.click(screen.getByTestId('caller-ai-draft-btn'));
    await screen.findByTestId('caller-ai-draft-panel');
    expect(screen.getByTestId('caller-ai-draft-label')).toHaveTextContent(/AI Draft/i);
    expect(screen.getByTestId('caller-ai-draft-accept')).toBeInTheDocument();
    expect(screen.getByTestId('caller-ai-draft-dismiss')).toBeInTheDocument();
  });

  it('"Accept draft" applies the LLM lines and hides the panel', async () => {
    const onChange = vi.fn();
    const onAiDraft = vi.fn().mockResolvedValue(llmResult);
    render(<CallerLinesEditor value={null} onChange={onChange} onAiDraft={onAiDraft} />);
    fireEvent.click(screen.getByTestId('caller-ai-draft-btn'));
    await screen.findByTestId('caller-ai-draft-accept');
    fireEvent.click(screen.getByTestId('caller-ai-draft-accept'));
    expect(onChange).toHaveBeenCalledWith(llmResult.lines);
    expect(screen.queryByTestId('caller-ai-draft-panel')).toBeNull();
  });

  it('"Keep manual" dismisses the panel without calling onChange', async () => {
    const onChange = vi.fn();
    const onAiDraft = vi.fn().mockResolvedValue(llmResult);
    render(<CallerLinesEditor value={null} onChange={onChange} onAiDraft={onAiDraft} />);
    fireEvent.click(screen.getByTestId('caller-ai-draft-btn'));
    await screen.findByTestId('caller-ai-draft-dismiss');
    fireEvent.click(screen.getByTestId('caller-ai-draft-dismiss'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('caller-ai-draft-panel')).toBeNull();
  });

  it('shows fallback label and error message when source is deterministic with error', async () => {
    const fallback = {
      lines: { standby: { LX: 'LX — standby for Opening' }, go: 'LX — GO' },
      source: 'deterministic' as const,
      error: 'No Anthropic API key configured',
    };
    const onAiDraft = vi.fn().mockResolvedValue(fallback);
    render(<CallerLinesEditor value={null} onChange={vi.fn()} onAiDraft={onAiDraft} />);
    fireEvent.click(screen.getByTestId('caller-ai-draft-btn'));
    await screen.findByTestId('caller-ai-draft-panel');
    expect(screen.getByTestId('caller-ai-draft-label')).toHaveTextContent(/fallback/i);
    expect(screen.getByTestId('caller-ai-draft-error')).toHaveTextContent(/No Anthropic API key/);
  });

  it('"Draft with AI" button is disabled when disabled=true', () => {
    render(
      <CallerLinesEditor value={null} onChange={vi.fn()} onAiDraft={vi.fn()} disabled />,
    );
    expect((screen.getByTestId('caller-ai-draft-btn') as HTMLButtonElement).disabled).toBe(true);
  });
});
