import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal('fetch', mockFetch);

import { LlmDraftClient } from '../../../../src/main/src/caller/llmDraft.js';
import type { SecretStore } from 'showx-shared';
import type { Cue } from 'showx-shared';

function makeSecrets(key?: string): SecretStore {
  return {
    get: vi.fn().mockResolvedValue(key ?? null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  };
}

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'cue-1',
    label: 'Opening',
    description: '',
    department: ['LX', 'SX'],
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
    cue_number: '1',
    ...overrides,
  };
}

function makeAnthropicResponse(standby: Record<string, string>, go: string): Response {
  const body = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ standby, go }) }] });
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(JSON.parse(body)),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LlmDraftClient.isEnabled', () => {
  it('returns true when Anthropic API key is stored', async () => {
    const client = new LlmDraftClient(makeSecrets('sk-ant-test'));
    expect(await client.isEnabled()).toBe(true);
  });

  it('returns false when no API key stored', async () => {
    const client = new LlmDraftClient(makeSecrets(undefined));
    expect(await client.isEnabled()).toBe(false);
  });
});

describe('LlmDraftClient.setApiKey', () => {
  it('saves the key via SecretStore', async () => {
    const secrets = makeSecrets();
    const client = new LlmDraftClient(secrets);
    await client.setApiKey('sk-new-key');
    expect(secrets.set).toHaveBeenCalledWith('anthropic-api-key', 'sk-new-key');
  });
});

describe('LlmDraftClient.draftCallerLines — no API key', () => {
  it('returns deterministic fallback with error when no key', async () => {
    const client = new LlmDraftClient(makeSecrets(undefined));
    const cue = makeCue({ department: ['LX'], label: 'Scene A', cue_number: '1' });
    const result = await client.draftCallerLines(cue);
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/No Anthropic API key/i);
    expect(result.lines.standby['LX']).toContain('standby');
    expect(result.lines.go).toContain('GO');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('LlmDraftClient.draftCallerLines — LLM success', () => {
  it('returns llm-sourced caller lines on successful API call', async () => {
    const standby = { LX: 'Standby lights, cue 1 opening', SX: 'Standby sound, cue 1 opening' };
    const go = 'Lights and sound — go';
    mockFetch.mockResolvedValueOnce(makeAnthropicResponse(standby, go));

    const client = new LlmDraftClient(makeSecrets('sk-ant-test'));
    const result = await client.draftCallerLines(makeCue());

    expect(result.source).toBe('llm');
    expect(result.error).toBeUndefined();
    expect(result.lines.standby).toEqual(standby);
    expect(result.lines.go).toBe(go);
  });

  it('posts to Anthropic API with correct headers and model', async () => {
    mockFetch.mockResolvedValueOnce(
      makeAnthropicResponse({ LX: 'Standby LX' }, 'LX GO'),
    );

    const client = new LlmDraftClient(makeSecrets('sk-ant-key'));
    await client.draftCallerLines(makeCue({ department: ['LX'] }));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].role).toBe('user');
  });

  it('includes cue context in the prompt', async () => {
    mockFetch.mockResolvedValueOnce(
      makeAnthropicResponse({ VIDEO: 'Standby video' }, 'VIDEO GO'),
    );
    const cue = makeCue({ department: ['VIDEO'], label: 'Playback', cue_number: '5', description: 'Main video loop' });
    const client = new LlmDraftClient(makeSecrets('sk-test'));
    await client.draftCallerLines(cue);

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    const prompt = body.messages[0].content as string;
    expect(prompt).toContain('5 Playback');
    expect(prompt).toContain('VIDEO');
    expect(prompt).toContain('Main video loop');
  });

  it('strips markdown code fences from LLM response', async () => {
    const jsonText = '```json\n{"standby":{"LX":"Standby LX"},"go":"LX GO"}\n```';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: jsonText }],
      }),
      text: vi.fn(),
    } as unknown as Response);

    const client = new LlmDraftClient(makeSecrets('sk-test'));
    const result = await client.draftCallerLines(makeCue({ department: ['LX'] }));
    expect(result.source).toBe('llm');
    expect(result.lines.standby['LX']).toBe('Standby LX');
  });
});

describe('LlmDraftClient.draftCallerLines — error fallback', () => {
  it('falls back to deterministic on API error (non-200)', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(429, 'rate limited'));
    const client = new LlmDraftClient(makeSecrets('sk-test'));
    const cue = makeCue({ department: ['LX'], label: 'Scene' });
    const result = await client.draftCallerLines(cue);
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/429/);
    expect(result.lines.standby['LX']).toContain('standby');
  });

  it('falls back to deterministic on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = new LlmDraftClient(makeSecrets('sk-test'));
    const result = await client.draftCallerLines(makeCue({ department: ['SX'] }));
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/network error/i);
    expect(result.lines.standby['SX']).toContain('standby');
  });

  it('falls back to deterministic when LLM returns invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'not json at all' }],
      }),
      text: vi.fn(),
    } as unknown as Response);
    const client = new LlmDraftClient(makeSecrets('sk-test'));
    const result = await client.draftCallerLines(makeCue({ department: ['LX'] }));
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/non-JSON/i);
  });

  it('falls back to deterministic when LLM response has wrong shape', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"wrong":"shape"}' }],
      }),
      text: vi.fn(),
    } as unknown as Response);
    const client = new LlmDraftClient(makeSecrets('sk-test'));
    const result = await client.draftCallerLines(makeCue({ department: ['LX'] }));
    expect(result.source).toBe('deterministic');
    expect(result.error).toMatch(/unexpected shape/i);
  });
});
