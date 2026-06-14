import type { Cue, CallerLineGroup } from 'showx-shared';
import type { SecretStore } from 'showx-shared';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_SECRET_KEY = 'anthropic-api-key';

export type DraftSource = 'llm' | 'deterministic';

export type DraftResult = {
  lines: CallerLineGroup;
  source: DraftSource;
  /** Present when LLM was not used (no key, API error, or parse failure). */
  error?: string;
};

/** Deterministic fallback — mirrors generateCallerLines from cuelist-core (pure, no deps). */
function deterministicFallback(cue: Cue): CallerLineGroup {
  const depts = cue.department ?? [];
  if (depts.length === 0) return { standby: {}, go: 'GO' };
  const parts: string[] = [];
  if (cue.cue_number) parts.push(cue.cue_number);
  if (cue.label) parts.push(cue.label);
  const ref = parts.join(' ') || 'cue';
  const standby: Record<string, string> = {};
  for (const dept of depts) standby[dept] = `${dept} — standby for ${ref}`;
  return { standby, go: `${depts.join(', ')} — GO` };
}

export class LlmDraftClient {
  constructor(private readonly secrets: SecretStore) {}

  async isEnabled(): Promise<boolean> {
    const k = await this.secrets.get(ANTHROPIC_SECRET_KEY);
    return !!k;
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.secrets.set(ANTHROPIC_SECRET_KEY, apiKey);
  }

  async draftCallerLines(cue: Cue, surroundingCues?: readonly Cue[]): Promise<DraftResult> {
    const apiKey = await this.secrets.get(ANTHROPIC_SECRET_KEY);
    if (!apiKey) {
      return {
        lines: deterministicFallback(cue),
        source: 'deterministic',
        error: 'No Anthropic API key configured. Add it via Settings > Caller.',
      };
    }

    try {
      const prompt = buildPrompt(cue, surroundingCues);
      const lines = await callAnthropicMessages(apiKey, prompt);
      return { lines, source: 'llm' };
    } catch (err) {
      return {
        lines: deterministicFallback(cue),
        source: 'deterministic',
        error: `LLM draft failed: ${String(err)}`,
      };
    }
  }
}

function buildPrompt(cue: Cue, surroundingCues?: readonly Cue[]): string {
  const depts = cue.department.length > 0 ? cue.department.join(', ') : 'none';
  const ref = [cue.cue_number, cue.label].filter(Boolean).join(' ') || 'cue';

  let contextLines = '';
  if (surroundingCues && surroundingCues.length > 0) {
    const nearby = surroundingCues
      .filter((c) => c.id !== cue.id)
      .slice(0, 3)
      .map((c) => {
        const cRef = [c.cue_number, c.label].filter(Boolean).join(' ') || 'cue';
        const cDepts = c.department.join(', ') || 'none';
        return `  - ${cRef} (${cDepts})`;
      })
      .join('\n');
    if (nearby) contextLines = `\nNearby cues:\n${nearby}`;
  }

  const descLine = cue.description ? `\nDescription: ${cue.description}` : '';
  const standbyNoteLine = cue.standby_note ? `\nStandby note: ${cue.standby_note}` : '';

  return `You are a professional stage manager's showcaller. Generate concise, natural standby/GO calls for this theatrical cue.

Cue: ${ref}
Departments: ${depts}${descLine}${standbyNoteLine}${contextLines}

Rules:
- standby calls are said before the cue fires (advance warning to each department)
- the GO call is said when the cue fires
- be brief and professional (theatre convention)
- each department listed gets its own standby entry
- use the department names exactly as given

Return ONLY a JSON object (no markdown, no explanation):
{"standby":{"DEPT_NAME":"standby text"},"go":"GO call text"}`;
}

async function callAnthropicMessages(apiKey: string, prompt: string): Promise<CallerLineGroup> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new Error(`Anthropic network error: ${String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
  return parseCallerLines(text);
}

function parseCallerLines(text: string): CallerLineGroup {
  const stripped = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`LLM returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['go'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['standby'] !== 'object' ||
    (parsed as Record<string, unknown>)['standby'] === null
  ) {
    throw new Error('LLM response has unexpected shape');
  }

  const raw = parsed as { standby: Record<string, unknown>; go: string };
  const standby: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.standby)) {
    if (typeof v === 'string') standby[k] = v;
  }

  return { standby, go: raw.go };
}
