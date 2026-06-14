import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { registerLlmDraftBridge, type LlmDraftBridgeDeps } from '../../../src/main/src/ipc/llmDraftBridge.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';
import type { LlmDraftClient, DraftResult } from '../../../src/main/src/caller/llmDraft.js';
import type { Cue } from 'showx-shared';

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function captureHandlers() {
  const handlers: Record<string, HandlerFn> = {};
  const ipc: IpcMainBridge = {
    handle: vi.fn((ch: string, fn: HandlerFn) => {
      handlers[ch] = fn;
    }) as IpcMainBridge['handle'],
  };
  return { ipc, handlers };
}

function makeFakeLlmClient(overrides: Partial<LlmDraftClient> = {}): LlmDraftClient {
  const deterministicResult: DraftResult = {
    lines: { standby: { LX: 'LX — standby' }, go: 'LX — GO' },
    source: 'deterministic',
  };
  return {
    isEnabled: vi.fn().mockResolvedValue(true),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    draftCallerLines: vi.fn().mockResolvedValue(deterministicResult),
    ...overrides,
  } as unknown as LlmDraftClient;
}

function makeDeps(overrides: Partial<LlmDraftBridgeDeps> = {}): LlmDraftBridgeDeps {
  return {
    llmDraft: makeFakeLlmClient(),
    ...overrides,
  };
}

function makeCue(): Cue {
  return {
    id: 'cue-1',
    label: 'Opening',
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('caller:llm:status', () => {
  it('returns enabled=true when LLM client is enabled', async () => {
    const { ipc, handlers } = captureHandlers();
    registerLlmDraftBridge(makeDeps({ llmDraft: makeFakeLlmClient({ isEnabled: vi.fn().mockResolvedValue(true) }) }), ipc);
    const result = await handlers['caller:llm:status']!();
    expect(result).toEqual({ enabled: true });
  });

  it('returns enabled=false when no key configured', async () => {
    const { ipc, handlers } = captureHandlers();
    registerLlmDraftBridge(makeDeps({ llmDraft: makeFakeLlmClient({ isEnabled: vi.fn().mockResolvedValue(false) }) }), ipc);
    const result = await handlers['caller:llm:status']!();
    expect(result).toEqual({ enabled: false });
  });
});

describe('caller:llm:apikey:set', () => {
  it('calls setApiKey and returns ok', async () => {
    const { ipc, handlers } = captureHandlers();
    const llmDraft = makeFakeLlmClient();
    registerLlmDraftBridge(makeDeps({ llmDraft }), ipc);
    const result = await handlers['caller:llm:apikey:set']!(null, 'sk-ant-new-key');
    expect(llmDraft.setApiKey).toHaveBeenCalledWith('sk-ant-new-key');
    expect(result).toEqual({ ok: true });
  });
});

describe('caller:llm:draft', () => {
  it('calls draftCallerLines with cue and returns result', async () => {
    const { ipc, handlers } = captureHandlers();
    const llmResult: DraftResult = {
      lines: { standby: { LX: 'Standby lights, opening' }, go: 'Lights — go' },
      source: 'llm',
    };
    const llmDraft = makeFakeLlmClient({ draftCallerLines: vi.fn().mockResolvedValue(llmResult) });
    registerLlmDraftBridge(makeDeps({ llmDraft }), ipc);

    const cue = makeCue();
    const result = await handlers['caller:llm:draft']!(null, cue);
    expect(llmDraft.draftCallerLines).toHaveBeenCalledWith(cue, undefined);
    expect(result).toEqual(llmResult);
  });

  it('passes surroundingCues when provided', async () => {
    const { ipc, handlers } = captureHandlers();
    const llmDraft = makeFakeLlmClient();
    registerLlmDraftBridge(makeDeps({ llmDraft }), ipc);

    const cue = makeCue();
    const surrounding = [makeCue(), { ...makeCue(), id: 'cue-2', label: 'Scene B' }];
    await handlers['caller:llm:draft']!(null, cue, surrounding);
    expect(llmDraft.draftCallerLines).toHaveBeenCalledWith(cue, surrounding);
  });

  it('returns deterministic fallback result (error field present) without throwing', async () => {
    const { ipc, handlers } = captureHandlers();
    const fallback: DraftResult = {
      lines: { standby: { LX: 'LX — standby for 1 Opening' }, go: 'LX — GO' },
      source: 'deterministic',
      error: 'LLM draft failed: Anthropic API error (429): rate limited',
    };
    const llmDraft = makeFakeLlmClient({ draftCallerLines: vi.fn().mockResolvedValue(fallback) });
    registerLlmDraftBridge(makeDeps({ llmDraft }), ipc);

    const result = await handlers['caller:llm:draft']!(null, makeCue()) as DraftResult;
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/429/);
  });
});
