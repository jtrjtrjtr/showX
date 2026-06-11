import { useState, useRef, useEffect, useCallback } from 'react';
import type { Cue, Trigger, TriggerKind } from 'showx-shared';
import type { ShowMode } from 'showx-shared';
import { tokens } from './tokens.js';

export interface TriggerCellProps {
  cue: Cue;
  cues: Cue[];
  mode: ShowMode;
  editable: boolean;
  onUpdate: (trigger: Trigger) => void;
}

function formatTcMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function parseTcMmSs(s: string): number {
  const parts = s.split(':');
  const mins = parseInt(parts[0] ?? '0', 10) || 0;
  const secs = parseFloat(parts[1] ?? '0') || 0;
  return Math.max(0, Math.round((mins * 60 + secs) * 1000));
}

function triggerDisplay(trigger: Trigger, cues: Cue[]): { glyph: string; text: string } {
  switch (trigger.kind) {
    case 'manual':
      // glyph-only: the word "GO" inside rows reads as a fire button (Jindřich 2026-06-11)
      return { glyph: '⏵', text: '' };
    case 'auto_follow': {
      const prev = cues.find((c) => c.id === trigger.prev_cue_id);
      const label = prev ? prev.label.substring(0, 10) : '?';
      return { glyph: '→', text: `follow ${label}` };
    }
    case 'auto_continue': {
      const delaySecs = (trigger.delay_ms / 1000).toFixed(1);
      return { glyph: '⏩', text: `+${delaySecs}s` };
    }
    case 'timecode': {
      const totalSecs = Math.floor(trigger.time_ms / 1000);
      const mm = Math.floor(totalSecs / 60);
      const ss = String(totalSecs % 60).padStart(2, '0');
      return { glyph: '⏱', text: `TC ${mm}:${ss}` };
    }
  }
}

const inputBase: React.CSSProperties = {
  padding: `${tokens.space.xs}px ${tokens.space.s}px`,
  background: tokens.color.raised,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.s,
  color: tokens.color.ink,
  fontSize: 13,
  fontFamily: tokens.font.ui,
  width: '100%',
  boxSizing: 'border-box',
};

const labelBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: tokens.color.ink_secondary,
  fontFamily: tokens.font.ui,
};

export function TriggerCell({ cue, cues, mode, editable, onUpdate }: TriggerCellProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TriggerKind>(cue.trigger.kind);
  const [delaySecs, setDelaySecs] = useState(
    cue.trigger.kind === 'auto_continue' ? String(cue.trigger.delay_ms / 1000) : '0',
  );
  const [prevCueId, setPrevCueId] = useState(
    cue.trigger.kind === 'auto_follow' ? cue.trigger.prev_cue_id : '',
  );
  const [tcMmSs, setTcMmSs] = useState(
    cue.trigger.kind === 'timecode' ? formatTcMs(cue.trigger.time_ms) : '0:00',
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const { glyph, text } = triggerDisplay(cue.trigger, cues);
  const locked = mode === 'show';
  const canEdit = editable && mode === 'rehearsal';

  const handleOpen = useCallback(() => {
    if (!canEdit) return;
    setKind(cue.trigger.kind);
    if (cue.trigger.kind === 'auto_continue') setDelaySecs(String(cue.trigger.delay_ms / 1000));
    else setDelaySecs('0');
    if (cue.trigger.kind === 'auto_follow') setPrevCueId(cue.trigger.prev_cue_id);
    else {
      const idx = cues.findIndex((c) => c.id === cue.id);
      setPrevCueId(cues[idx - 1]?.id ?? '');
    }
    if (cue.trigger.kind === 'timecode') setTcMmSs(formatTcMs(cue.trigger.time_ms));
    else setTcMmSs('0:00');
    setOpen(true);
  }, [canEdit, cue, cues]);

  const handleKindChange = useCallback(
    (k: TriggerKind) => {
      setKind(k);
      if (k === 'auto_follow') {
        const idx = cues.findIndex((c) => c.id === cue.id);
        setPrevCueId(cues[idx - 1]?.id ?? '');
      }
    },
    [cues, cue.id],
  );

  const handleSave = useCallback(() => {
    let trigger: Trigger;
    switch (kind) {
      case 'manual':
        trigger = { kind: 'manual' };
        break;
      case 'auto_continue': {
        const delay_ms = Math.max(0, Math.round(parseFloat(delaySecs || '0') * 1000));
        trigger = { kind: 'auto_continue', delay_ms };
        break;
      }
      case 'auto_follow':
        trigger = { kind: 'auto_follow', prev_cue_id: prevCueId };
        break;
      case 'timecode': {
        const time_ms = parseTcMmSs(tcMmSs);
        trigger = { kind: 'timecode', time_ms, source: 'internal' };
        break;
      }
    }
    onUpdate(trigger);
    setOpen(false);
  }, [kind, delaySecs, prevCueId, tcMmSs, onUpdate]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }} data-testid="trigger-cell">
      <button
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        aria-label={`Trigger: ${text}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space.xs,
          padding: `${tokens.space.xs}px ${tokens.space.s}px`,
          background: 'none',
          border: `1px solid ${locked || !canEdit ? 'transparent' : tokens.color.border}`,
          borderRadius: tokens.radius.s,
          color: locked ? tokens.color.ink_disabled : tokens.color.ink_secondary,
          fontSize: 12,
          cursor: canEdit ? 'pointer' : 'default',
          fontFamily: tokens.font.ui,
          whiteSpace: 'nowrap',
        }}
      >
        <span>{glyph}</span>
        <span>{text}</span>
        {locked && (
          <span aria-label="Locked" style={{ fontSize: 10, marginLeft: 2 }}>
            🔒
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Edit trigger"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 300,
            background: tokens.color.panel,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.m,
            padding: tokens.space.l,
            minWidth: 240,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.space.m,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <select
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as TriggerKind)}
            aria-label="Trigger kind"
            style={inputBase}
          >
            <option value="manual">Manual (GO press)</option>
            <option value="auto_continue">Auto continue (+delay)</option>
            <option value="auto_follow">Auto follow (after prev)</option>
            <option value="timecode" disabled>
              Timecode (ShowX 0.2)
            </option>
          </select>

          {kind === 'auto_continue' && (
            <label style={labelBase}>
              Delay (seconds)
              <input
                type="number"
                min={0}
                step={0.1}
                value={delaySecs}
                onChange={(e) => setDelaySecs(e.target.value)}
                style={inputBase}
                aria-label="Delay seconds"
              />
            </label>
          )}

          {kind === 'auto_follow' && (
            <label style={labelBase}>
              After cue
              <select
                value={prevCueId}
                onChange={(e) => setPrevCueId(e.target.value)}
                style={inputBase}
                aria-label="Previous cue"
              >
                <option value="">— select —</option>
                {cues
                  .filter((c) => c.id !== cue.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {kind === 'timecode' && (
            <label style={labelBase}>
              Timecode (mm:ss)
              <input
                type="text"
                value={tcMmSs}
                onChange={(e) => setTcMmSs(e.target.value)}
                placeholder="0:00"
                style={inputBase}
                aria-label="Timecode mm:ss"
              />
              <span style={{ fontSize: 11, color: tokens.color.yellow }}>
                Timecode triggers ship in ShowX 0.2; saved but treated as manual until then.
              </span>
            </label>
          )}

          <div style={{ display: 'flex', gap: tokens.space.s, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: `${tokens.space.xs}px ${tokens.space.m}px`,
                background: 'none',
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.s,
                color: tokens.color.ink_secondary,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: tokens.font.ui,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              data-testid="trigger-cell-save"
              style={{
                padding: `${tokens.space.xs}px ${tokens.space.m}px`,
                background: tokens.color.teal,
                border: 'none',
                borderRadius: tokens.radius.s,
                color: tokens.color.bg,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: tokens.font.ui,
              }}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
