import { useState } from 'react';
import type { Cue, CallerLineGroup } from 'showx-shared';
import { CANONICAL_DEPARTMENTS } from '../../../../src/shared/src/types/department.js';
import { generateCallerLines } from '../../../../src/modules/cuelist-core/src/caller/generateCallerLines.js';
import { tokens } from './tokens.js';

export type AiDraftResult = {
  lines: CallerLineGroup;
  source: 'llm' | 'deterministic';
  error?: string;
};

type AiDraftState =
  | null
  | { status: 'loading' }
  | { status: 'ready'; result: AiDraftResult };

export interface CallerLinesEditorProps {
  /** Current value; null/undefined = no caller lines set. */
  value: CallerLineGroup | null | undefined;
  /** Departments to show standby inputs for (defaults to canonical set). */
  departments?: readonly string[];
  onChange: (next: CallerLineGroup | null) => void;
  disabled?: boolean;
  /** If provided, enables the "Generate from sheet" button for this cue. */
  cue?: Cue;
  /** If provided, shows a "Generate for all cues" button that delegates to the parent. */
  onBulkGenerate?: () => void;
  /**
   * If provided, shows a "Draft with AI" button that calls the Anthropic API
   * for richer phrasing. Returns a DraftResult; source='llm' means the LLM
   * succeeded; source='deterministic' means it fell back (error field explains why).
   */
  onAiDraft?: () => Promise<AiDraftResult>;
}

/**
 * Editing UI for per-cue caller script.
 * Shows a standby text input per department and a single GO text input.
 * Emits null when all fields are cleared.
 *
 * When `cue` prop is provided, shows a "Generate from sheet" button that
 * fills the lines deterministically. If the field already has content, shows
 * a confirmation step before overwriting.
 */
export function CallerLinesEditor({
  value,
  departments = CANONICAL_DEPARTMENTS,
  onChange,
  disabled = false,
  cue,
  onBulkGenerate,
  onAiDraft,
}: CallerLinesEditorProps) {
  const standby = value?.standby ?? {};
  const go = value?.go ?? '';

  // Pending generated value — shown for confirmation when overwriting manual edits.
  const [pendingGenerated, setPendingGenerated] = useState<CallerLineGroup | null>(null);
  // AI draft state: null | loading | ready-for-review
  const [aiDraft, setAiDraft] = useState<AiDraftState>(null);

  function setStandby(dept: string, text: string) {
    const next: Record<string, string> = { ...standby };
    if (text === '') {
      delete next[dept];
    } else {
      next[dept] = text;
    }
    const hasAny = Object.values(next).some((v) => v !== '') || go !== '';
    onChange(hasAny ? { standby: next, go } : null);
  }

  function setGo(text: string) {
    const hasAny = Object.values(standby).some((v) => v !== '') || text !== '';
    onChange(hasAny ? { standby, go: text } : null);
  }

  function handleGenerate() {
    if (!cue) return;
    const generated = generateCallerLines(cue);
    if (value != null) {
      // Current value exists — ask for confirmation before overwriting.
      setPendingGenerated(generated);
    } else {
      onChange(generated);
    }
  }

  function handleApplyGenerated() {
    if (pendingGenerated) {
      onChange(pendingGenerated);
      setPendingGenerated(null);
    }
  }

  function handleDiscardGenerated() {
    setPendingGenerated(null);
  }

  async function handleAiDraft() {
    if (!onAiDraft) return;
    setAiDraft({ status: 'loading' });
    const result = await onAiDraft();
    setAiDraft({ status: 'ready', result });
  }

  function handleAcceptAiDraft() {
    if (aiDraft?.status !== 'ready') return;
    onChange(aiDraft.result.lines);
    setAiDraft(null);
  }

  function handleDismissAiDraft() {
    setAiDraft(null);
  }

  const fieldStyle: React.CSSProperties = {
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    background: tokens.color.raised,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.s,
    color: disabled ? tokens.color.ink_disabled : tokens.color.ink,
    fontSize: 14,
    fontFamily: tokens.font.ui,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: tokens.color.ink_secondary,
    fontFamily: tokens.font.ui,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    minWidth: 52,
    flexShrink: 0,
  };

  const btnStyle: React.CSSProperties = {
    padding: `${tokens.space.xs}px ${tokens.space.m}px`,
    background: 'none',
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.s,
    color: tokens.color.ink_secondary,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: tokens.font.ui,
  };

  return (
    <div
      data-testid="caller-lines-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}
    >
      {/* Generate / AI draft actions row */}
      {(cue || onBulkGenerate || onAiDraft) && (
        <div style={{ display: 'flex', gap: tokens.space.s, alignItems: 'center', flexWrap: 'wrap' }}>
          {cue && (
            <button
              data-testid="caller-generate-btn"
              onClick={handleGenerate}
              disabled={disabled}
              style={btnStyle}
            >
              Generate from sheet
            </button>
          )}
          {onBulkGenerate && (
            <button
              data-testid="caller-generate-all-btn"
              onClick={onBulkGenerate}
              disabled={disabled}
              style={btnStyle}
            >
              Generate for all cues
            </button>
          )}
          {onAiDraft && (
            <button
              data-testid="caller-ai-draft-btn"
              onClick={() => void handleAiDraft()}
              disabled={disabled || aiDraft?.status === 'loading'}
              style={{
                ...btnStyle,
                borderColor: tokens.color.teal,
                color: tokens.color.teal,
                opacity: aiDraft?.status === 'loading' ? 0.6 : 1,
              }}
            >
              {aiDraft?.status === 'loading' ? 'Drafting…' : 'Draft with AI'}
            </button>
          )}
        </div>
      )}

      {/* AI draft review panel */}
      {aiDraft?.status === 'ready' && (
        <div
          data-testid="caller-ai-draft-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.space.s,
            padding: `${tokens.space.s}px ${tokens.space.m}px`,
            background: tokens.color.raised,
            border: `1px solid ${tokens.color.teal}`,
            borderRadius: tokens.radius.s,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
            <span
              data-testid="caller-ai-draft-label"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: tokens.color.teal,
                fontFamily: tokens.font.ui,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                flex: 1,
              }}
            >
              {aiDraft.result.source === 'llm' ? 'AI Draft — review before accepting' : 'Deterministic fallback'}
            </span>
            {aiDraft.result.error && (
              <span
                data-testid="caller-ai-draft-error"
                style={{ fontSize: 11, color: tokens.color.ink_secondary, fontFamily: tokens.font.ui }}
              >
                {aiDraft.result.error}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: tokens.space.s }}>
            <button
              data-testid="caller-ai-draft-accept"
              onClick={handleAcceptAiDraft}
              style={{ ...btnStyle, borderColor: tokens.color.teal, color: tokens.color.teal }}
            >
              Accept draft
            </button>
            <button
              data-testid="caller-ai-draft-dismiss"
              onClick={handleDismissAiDraft}
              style={btnStyle}
            >
              Keep manual
            </button>
          </div>
        </div>
      )}

      {/* Overwrite confirmation */}
      {pendingGenerated && (
        <div
          data-testid="caller-generate-confirm"
          style={{
            display: 'flex',
            gap: tokens.space.s,
            alignItems: 'center',
            padding: `${tokens.space.s}px ${tokens.space.m}px`,
            background: tokens.color.raised,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.s,
          }}
        >
          <span style={{ fontSize: 12, color: tokens.color.ink_secondary, fontFamily: tokens.font.ui, flex: 1 }}>
            Caller lines already set — replace with generated?
          </span>
          <button
            data-testid="caller-generate-apply"
            onClick={handleApplyGenerated}
            style={{ ...btnStyle, borderColor: tokens.color.teal, color: tokens.color.teal }}
          >
            Replace
          </button>
          <button
            data-testid="caller-generate-keep"
            onClick={handleDiscardGenerated}
            style={btnStyle}
          >
            Keep manual
          </button>
        </div>
      )}

      {departments.map((dept) => (
        <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
          <span
            data-testid={`caller-dept-label-${dept}`}
            style={{
              ...labelStyle,
              color: (tokens.color.dept as Record<string, string>)[dept] ?? tokens.color.ink_secondary,
            }}
          >
            {dept}
          </span>
          <input
            data-testid={`caller-standby-${dept}`}
            value={standby[dept] ?? ''}
            onChange={(e) => setStandby(dept, e.target.value)}
            placeholder={`${dept} standby…`}
            disabled={disabled}
            style={fieldStyle}
            aria-label={`${dept} standby call`}
          />
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span data-testid="caller-go-label" style={labelStyle}>
          GO
        </span>
        <input
          data-testid="caller-go-input"
          value={go}
          onChange={(e) => setGo(e.target.value)}
          placeholder="GO call…"
          disabled={disabled}
          style={{
            ...fieldStyle,
            fontWeight: 700,
            color: disabled ? tokens.color.ink_disabled : tokens.color.teal,
          }}
          aria-label="GO call"
        />
      </div>
    </div>
  );
}
