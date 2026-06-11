import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Cue } from 'showx-shared';
import { useCuelist } from '../../hooks/useCuelist.js';
import type { CueFieldPatch } from '../../hooks/useCuelist.js';
import { CueEditDialog } from './CueEditDialog.js';
import { useMode } from '../../hooks/useMode.js';
import { useStations } from '../../hooks/useStations.js';
import { useGoChannel } from '../../hooks/useGoChannel.js';
import { usePlayhead } from '../../hooks/usePlayhead.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { tokens } from './tokens.js';
import { CueRow } from './CueRow.js';
import type { InlineEditField } from './CueRow.js';
import { PlaybackHeader } from './PlaybackHeader.js';
import { StandbyPanel } from './StandbyPanel.js';
import { CallingText } from './CallingText.js';
import { GoButton, HOLD_GO_THRESHOLD_MS } from './GoButton.js';
import { TransportBar } from './TransportBar.js';
import { GoConfirmDialog } from './GoConfirmDialog.js';
import { HelpOverlay } from './HelpOverlay.js';

interface SMMasterViewProps {
  cuelistId: string;
}

function getNextCues(cues: Cue[], playheadCueId: string | null, count: number): Cue[] {
  if (!playheadCueId) return cues.slice(0, count);
  const idx = cues.findIndex((c) => c.id === playheadCueId);
  if (idx < 0) return cues.slice(0, count);
  return cues.slice(idx + 1, idx + 1 + count);
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.space.xxl,
        color: tokens.color.ink_secondary,
        gap: tokens.space.l,
      }}
    >
      <div style={{ fontSize: 18, color: tokens.color.ink_secondary }}>No cues yet — click + to add</div>
      <button
        aria-label="Add first cue"
        style={{
          padding: `${tokens.space.m}px ${tokens.space.xl}px`,
          background: tokens.color.teal,
          color: tokens.color.bg,
          border: 'none',
          borderRadius: tokens.radius.m,
          fontSize: 16,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        + Add cue
      </button>
    </div>
  );
}

export function SMMasterView({ cuelistId }: SMMasterViewProps) {
  const conn = useConnection();
  const { cuelist, cues, updateFields } = useCuelist(cuelistId);
  const { mode, transition } = useMode();
  const stations = useStations();
  const { go, standby, lastDispatched, lastHistoric, firstGoAt } = useGoChannel(cuelistId);
  const { playheadCueId, armedCueId, setPlayhead, advance, retreat, arm, unarm, smOnline } =
    usePlayhead(cuelistId);

  // Declare this station as SM in awareness so all stations can identify the authority
  useEffect(() => {
    conn.awareness.setLocalStateField('role', 'sm');
  }, [conn.awareness]);

  // ONYX caret≠selection: selectedCueId is independent of playhead
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);

  // Single rAF ticker at ~10Hz for countdown + time-ago display
  const [now, setNow] = useState(() => Date.now());
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  useEffect(() => {
    function tick(t: DOMHighResTimeStamp) {
      if (t - lastTickRef.current >= 100) {
        lastTickRef.current = t;
        setNow(Date.now());
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Follow-grid autoscroll toggle (default ON)
  const [followGrid, setFollowGrid] = useState(true);
  const [jumpVisible, setJumpVisible] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const checkPlayheadVisible = useCallback(() => {
    if (!listRef.current || !playheadCueId) { setJumpVisible(false); return; }
    const el = listRef.current.querySelector(`[data-cue-id="${playheadCueId}"]`) as HTMLElement | null;
    if (!el) { setJumpVisible(false); return; }
    const containerRect = listRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const visible = elRect.bottom > containerRect.top && elRect.top < containerRect.bottom;
    setJumpVisible(!visible);
  }, [playheadCueId]);

  const scrollToPlayhead = useCallback(() => {
    if (!listRef.current || !playheadCueId) return;
    const el = listRef.current.querySelector(`[data-cue-id="${playheadCueId}"]`) as HTMLElement | null;
    if (!el) return;
    if (typeof listRef.current.scrollTo !== 'function') return;
    const containerHeight = listRef.current.clientHeight;
    const targetScrollTop = el.offsetTop - containerHeight / 2 + el.clientHeight / 2;
    listRef.current.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
  }, [playheadCueId]);

  // Autoscroll when playhead changes (if followGrid is ON)
  useEffect(() => {
    if (!followGrid) {
      checkPlayheadVisible();
      return;
    }
    scrollToPlayhead();
    setJumpVisible(false);
  }, [playheadCueId, followGrid, scrollToPlayhead, checkPlayheadVisible]);

  // Track scroll to update jump-to-playhead visibility when followGrid is OFF
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => { if (!followGrid) checkPlayheadVisible(); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [followGrid, checkPlayheadVisible]);

  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingCue, setEditingCue] = useState<Cue | null>(null);

  // ── Inline editing state ───────────────────────────────────────────────────
  const [inlineEdit, setInlineEdit] = useState<{ cueId: string; field: InlineEditField } | null>(null);

  const INLINE_TAB_ORDER: InlineEditField[] = ['cue_number', 'label', 'duration_hint_ms', 'standby_note'];

  const handleInlineCommit = useCallback((field: InlineEditField, value: string, cueId: string) => {
    try {
      const patch: CueFieldPatch = {};
      if (field === 'cue_number') {
        patch.cue_number = value.trim() || null;
      } else if (field === 'label') {
        const trimmed = value.trim();
        if (trimmed) patch.label = trimmed;
      } else if (field === 'duration_hint_ms') {
        const secs = parseFloat(value);
        patch.duration_hint_ms = isNaN(secs) ? null : Math.round(secs * 1000);
      } else if (field === 'standby_note') {
        patch.standby_note = value;
      }
      if (Object.keys(patch).length > 0) {
        updateFields(cueId, patch, String(conn.doc.clientID));
      }
    } catch {
      // ValidationError — revert silently
    }
    setInlineEdit(null);
  }, [updateFields, conn.doc.clientID]);

  const handleInlineTab = useCallback((field: InlineEditField, value: string, cueId: string) => {
    handleInlineCommit(field, value, cueId);
    const idx = INLINE_TAB_ORDER.indexOf(field);
    const nextField = INLINE_TAB_ORDER[(idx + 1) % INLINE_TAB_ORDER.length];
    // Re-open on same cue with next field (use setTimeout to let commit settle)
    setTimeout(() => setInlineEdit({ cueId, field: nextField }), 0);
  }, [handleInlineCommit]);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const rejectionSeqRef = useRef(0);

  // ── GO ergonomics: debounce guard ──────────────────────────────────────────
  const goInertRef = useRef(false);
  const [goInert, setGoInert] = useState(false);
  const goInertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── GO ergonomics: post-GO "fired: {label}" confirmation strip ────────────
  const [firedConfirmLabel, setFiredConfirmLabel] = useState<string | null>(null);
  const firedConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── GO ergonomics: Space hold state for show-mode (drives externalHoldFraction) ─
  const [spaceHoldFraction, setSpaceHoldFraction] = useState(0);
  const spaceHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceHoldRafRef = useRef<number | null>(null);
  const spaceHoldStartRef = useRef<number | null>(null);

  const clearSpaceHold = useCallback(() => {
    if (spaceHoldTimerRef.current != null) { clearTimeout(spaceHoldTimerRef.current); spaceHoldTimerRef.current = null; }
    if (spaceHoldRafRef.current != null) { cancelAnimationFrame(spaceHoldRafRef.current); spaceHoldRafRef.current = null; }
    spaceHoldStartRef.current = null;
    setSpaceHoldFraction(0);
  }, []);

  // refs for stable callback in space hold effect
  const armedCueIdRef = useRef(armedCueId);
  const armedCueRef = useRef<Cue | null>(null);
  useEffect(() => { armedCueIdRef.current = armedCueId; }, [armedCueId]);

  const armedCue = armedCueId ? (cues.find((c) => c.id === armedCueId) ?? null) : null;
  useEffect(() => { armedCueRef.current = armedCue; }, [armedCue]);

  // Subscribe to go.rejected events — encode seq so even same reason re-triggers shake
  useEffect(() => {
    return conn.sideChannel.on('go.rejected', (event) => {
      rejectionSeqRef.current += 1;
      const key = `${event.reason}:${rejectionSeqRef.current}`;
      setRejectedReason(key);
      const t = setTimeout(() => setRejectedReason(null), 2000);
      return () => clearTimeout(t);
    });
  }, [conn.sideChannel]);

  // Cmd+Shift+G emergency override shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.code === 'KeyG') {
        e.preventDefault();
        if (armedCueId) setShowConfirmDialog(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedCueId]);

  // ── handleGo: shared by button click, Space (rehearsal), Space hold (show) ─
  const handleGo = useCallback(() => {
    const cueId = armedCueIdRef.current;
    if (!cueId || goInertRef.current) return;
    go(cueId);

    // Debounce guard: inert for 300ms
    goInertRef.current = true;
    setGoInert(true);
    if (goInertTimerRef.current) clearTimeout(goInertTimerRef.current);
    goInertTimerRef.current = setTimeout(() => {
      goInertRef.current = false;
      setGoInert(false);
    }, 300);

    // Post-GO confirm strip: show "fired: {label}" for 3s
    const label = armedCueRef.current?.label ?? cueId;
    setFiredConfirmLabel(label);
    if (firedConfirmTimerRef.current) clearTimeout(firedConfirmTimerRef.current);
    firedConfirmTimerRef.current = setTimeout(() => setFiredConfirmLabel(null), 3000);
  }, [go]);

  // ── Space hold-to-fire for SHOW mode ──────────────────────────────────────
  useEffect(() => {
    if (mode !== 'show') {
      clearSpaceHold();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (spaceHoldTimerRef.current !== null) return; // already holding
      if (!armedCueIdRef.current || goInertRef.current) return;
      e.preventDefault();

      spaceHoldStartRef.current = Date.now();

      const animate = () => {
        if (spaceHoldStartRef.current === null) return;
        const elapsed = Date.now() - spaceHoldStartRef.current;
        setSpaceHoldFraction(Math.min(1, elapsed / HOLD_GO_THRESHOLD_MS));
        if (elapsed < HOLD_GO_THRESHOLD_MS) {
          spaceHoldRafRef.current = requestAnimationFrame(animate);
        }
      };
      spaceHoldRafRef.current = requestAnimationFrame(animate);

      spaceHoldTimerRef.current = setTimeout(() => {
        clearSpaceHold();
        handleGo();
      }, HOLD_GO_THRESHOLD_MS);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      clearSpaceHold();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearSpaceHold();
    };
  }, [mode, handleGo, clearSpaceHold]);

  // ── handleBack: retreat playhead + arm + standby (NO dispatch) ───────────
  const cuesRef = useRef(cues);
  const playheadCueIdRef = useRef(playheadCueId);
  useEffect(() => { cuesRef.current = cues; }, [cues]);
  useEffect(() => { playheadCueIdRef.current = playheadCueId; }, [playheadCueId]);

  const handleBack = useCallback(() => {
    const cs = cuesRef.current;
    const ph = playheadCueIdRef.current;
    if (cs.length === 0) return;
    const idx = ph ? cs.findIndex((c) => c.id === ph) : -1;
    const prevIdx = idx > 0 ? idx - 1 : cs.length - 1;
    const prev = cs[prevIdx];
    if (!prev) return;
    setPlayhead(prev.id);
    arm(prev.id);
    standby(prev.id);
  }, [setPlayhead, arm, standby]);

  // ── +N follow count: cues auto-chained after armed cue ────────────────────
  const followCount = useMemo(() => {
    if (!armedCueId) return 0;
    const idx = cues.findIndex((c) => c.id === armedCueId);
    if (idx < 0) return 0;
    let count = 0;
    for (let i = idx + 1; i < cues.length; i++) {
      if (cues[i].trigger.kind === 'manual') break;
      count++;
      if (count >= 9) break;
    }
    return count;
  }, [armedCueId, cues]);

  const shortcuts = useMemo(
    () => ({
      Space: () => {
        // Rehearsal only — show mode uses separate keydown/keyup hold handler above
        if (mode === 'rehearsal' && armedCueId) handleGo();
      },
      KeyB: () => handleBack(),
      KeyQ: () => {
        if (playheadCueId) {
          standby(playheadCueId);
          arm(playheadCueId);
        }
      },
      KeyE: () => {
        if (mode === 'rehearsal' && playheadCueId) {
          const cue = cues.find((c) => c.id === playheadCueId);
          if (cue) setEditingCue(cue);
        }
      },
      // Single-key inline editing on selected row (rehearsal + SM only)
      KeyN: () => {
        if (mode === 'rehearsal' && selectedCueId) setInlineEdit({ cueId: selectedCueId, field: 'cue_number' });
      },
      KeyL: () => {
        if (mode === 'rehearsal' && selectedCueId) setInlineEdit({ cueId: selectedCueId, field: 'label' });
      },
      KeyD: () => {
        if (mode === 'rehearsal' && selectedCueId) setInlineEdit({ cueId: selectedCueId, field: 'duration_hint_ms' });
      },
      KeyO: () => {
        if (mode === 'rehearsal' && selectedCueId) setInlineEdit({ cueId: selectedCueId, field: 'standby_note' });
      },
      ArrowUp: () => retreat(),
      ArrowDown: () => advance(),
      Escape: () => {
        if (inlineEdit) {
          setInlineEdit(null);
        } else if (!editingCue) {
          unarm();
        }
      },
      Slash: () => setShowHelp((v) => !v),
    }),
    [armedCueId, playheadCueId, selectedCueId, mode, cues, editingCue, inlineEdit, go, standby, arm, unarm, advance, retreat, handleGo, handleBack],
  );

  useKeyboardShortcuts(shortcuts);

  const filtered = useMemo(() => {
    if (!search) return cues;
    const q = search.toLowerCase();
    return cues.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [cues, search]);

  const playheadCue = playheadCueId ? (cues.find((c) => c.id === playheadCueId) ?? null) : null;
  const lastFiredAt = lastDispatched ? new Date(lastDispatched.dispatched_at).getTime() : null;
  // Strip the :seq counter suffix before display
  const displayReason = rejectedReason ? rejectedReason.replace(/:\d+$/, '') : null;

  const handleGoOverride = useCallback(() => {
    if (armedCueId) setShowConfirmDialog(true);
  }, [armedCueId]);

  const handleConfirmOverride = useCallback(() => {
    if (armedCueId) go(armedCueId, true);
    setShowConfirmDialog(false);
  }, [armedCueId, go]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: tokens.color.bg,
        fontFamily: tokens.font.ui,
        overflow: 'hidden',
        color: tokens.color.ink,
      }}
    >
      <header
        style={{
          padding: `${tokens.space.m}px ${tokens.space.l}px`,
          borderBottom: `1px solid ${tokens.color.border}`,
          background: tokens.color.panel,
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space.l,
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: tokens.color.ink }}>
          {cuelist?.name ?? 'Cuelist'}
        </h1>
        <input
          type="search"
          placeholder="Search cues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search cues"
          style={{
            padding: `${tokens.space.s}px ${tokens.space.m}px`,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.m,
            fontSize: 14,
            background: tokens.color.raised,
            color: tokens.color.ink,
            flex: 1,
            maxWidth: 320,
          }}
        />
        <button
          data-testid="mode-badge"
          aria-label={`Current mode: ${mode}. Click to toggle`}
          onClick={() => transition(mode === 'rehearsal' ? 'show' : 'rehearsal')}
          style={{
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            borderRadius: tokens.radius.s,
            border: `1px solid ${mode === 'show' ? tokens.color.red : tokens.color.teal}`,
            background: mode === 'show' ? tokens.color.red : tokens.color.teal,
            color: tokens.color.white,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {mode === 'show' ? 'SHOW' : 'REHEARSAL'}
        </button>
        {/* Follow-grid autoscroll toggle */}
        <button
          data-testid="follow-grid-toggle"
          aria-label={followGrid ? 'Autoscroll ON — click to disable' : 'Autoscroll OFF — click to enable'}
          title={followGrid ? 'Autoscroll ON' : 'Autoscroll OFF'}
          onClick={() => setFollowGrid((v) => !v)}
          style={{
            background: followGrid ? tokens.color.teal_dim : 'none',
            border: `1px solid ${followGrid ? tokens.color.teal : tokens.color.border}`,
            borderRadius: tokens.radius.s,
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            cursor: 'pointer',
            fontSize: 13,
            color: followGrid ? tokens.color.teal : tokens.color.ink_disabled,
          }}
        >
          {/* ⇣ = Downwards Arrow with Double Stroke U+21E3 */}
          ⇣
        </button>
        <button
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShowHelp(true)}
          style={{
            background: 'none',
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.s,
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            cursor: 'pointer',
            fontSize: 13,
            color: tokens.color.ink,
          }}
        >
          ?
        </button>
      </header>

      {/* Playback status strip */}
      <PlaybackHeader
        lastFiredLabel={lastDispatched ? (cues.find((c) => c.id === lastDispatched.cue_id)?.label ?? lastDispatched.cue_id) : null}
        lastFiredAt={lastFiredAt}
        playheadCueLabel={playheadCue?.label ?? null}
        firstGoAt={firstGoAt}
        now={now}
      />

      <main
        role="grid"
        aria-label="Cue list"
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: 0, position: 'relative' }}
      >
        {filtered.length > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              display: 'grid',
              gridTemplateColumns: '8px 80px 48px 1fr auto auto auto auto auto',
              gap: tokens.space.m,
              padding: `${tokens.space.xs}px ${tokens.space.l}px`,
              paddingLeft: tokens.space.xl,
              background: tokens.color.panel,
              borderBottom: `1px solid ${tokens.color.border}`,
              fontSize: 10,
              fontWeight: 700,
              color: tokens.color.ink_disabled,
              fontFamily: tokens.font.ui,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span />
            <span />
            <span>No.</span>
            <span>Cue</span>
            <span>Trigger</span>
            <span style={{ textAlign: 'right' }}>Dur</span>
            <span />
            <span />
            <span />
          </div>
        )}
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((cue) => {
            const firedAt =
              lastDispatched?.cue_id === cue.id
                ? new Date(lastDispatched.dispatched_at).getTime()
                : null;
            const rowInlineField =
              inlineEdit?.cueId === cue.id ? inlineEdit.field : null;
            return (
              <CueRow
                key={cue.id}
                cue={cue}
                cues={cues}
                isPlayhead={cue.id === playheadCueId}
                isSelected={cue.id === selectedCueId}
                isArmed={cue.id === armedCueId}
                isFiring={firedAt !== null && now - firedAt < 2000}
                firedAt={firedAt}
                now={now}
                onSelect={() => setSelectedCueId(cue.id)}
                onSetPlayhead={() => setPlayhead(cue.id)}
                onEdit={() => setEditingCue(cue)}
                onTriggerUpdate={(trigger) => {
                  updateFields(cue.id, { trigger }, String(conn.doc.clientID));
                }}
                stations={stations.filter((s) => s.cursor.cue_id === cue.id)}
                mode={mode}
                inlineEditField={rowInlineField}
                onInlineCommit={(field, value) => handleInlineCommit(field, value, cue.id)}
                onInlineCancel={() => setInlineEdit(null)}
                onInlineTab={(field, value) => handleInlineTab(field, value, cue.id)}
              />
            );
          })
        )}

        {/* Jump-to-playhead pill — shown when followGrid is OFF and playhead is off-screen */}
        {!followGrid && jumpVisible && (
          <button
            data-testid="jump-to-playhead"
            onClick={() => { scrollToPlayhead(); setFollowGrid(true); }}
            style={{
              position: 'sticky',
              bottom: tokens.space.m,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'block',
              margin: `${tokens.space.s}px auto`,
              padding: `${tokens.space.xs}px ${tokens.space.m}px`,
              background: tokens.color.teal,
              color: tokens.color.bg,
              border: 'none',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              zIndex: 20,
              whiteSpace: 'nowrap',
            }}
          >
            ↓ Jump to playhead
          </button>
        )}
      </main>

      <StandbyPanel
        nextCues={getNextCues(cues, playheadCueId, 3)}
        armedCueId={armedCueId}
        cues={cues}
        onStandby={(cueId) => {
          standby(cueId);
          arm(cueId);
        }}
      />
      <CallingText armedCue={armedCue} lastFired={lastDispatched} />
      {!smOnline && (
        <div
          data-testid="sm-offline-indicator"
          aria-live="polite"
          style={{
            padding: `${tokens.space.xs}px ${tokens.space.m}px`,
            background: tokens.color.panel,
            borderTop: `1px solid ${tokens.color.border}`,
            fontSize: 11,
            color: tokens.color.ink_secondary,
            textAlign: 'center',
            fontFamily: tokens.font.ui,
          }}
        >
          SM offline — playhead frozen
        </div>
      )}
      <div style={{ padding: tokens.space.m, flexShrink: 0 }}>
        {displayReason && (
          <div
            data-testid="go-rejected-toast"
            role="alert"
            aria-live="assertive"
            style={{
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              marginBottom: tokens.space.s,
              background: tokens.color.red,
              color: tokens.color.white,
              borderRadius: tokens.radius.m,
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            Rejected: {displayReason}
          </div>
        )}
        {lastHistoric && (
          <div
            data-testid="cue-history-marker"
            aria-live="polite"
            style={{
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              marginBottom: tokens.space.s,
              background: tokens.color.panel,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.m,
              fontSize: 12,
              color: tokens.color.ink_secondary,
            }}
          >
            Missed: {lastHistoric.cue_id}
          </div>
        )}
        {/* Transport row: BACK + UNARM (left) | GO button (right) */}
        <div style={{ display: 'flex', gap: tokens.space.m, alignItems: 'stretch' }}>
          <TransportBar
            onBack={handleBack}
            onUnarm={unarm}
            backDisabled={!playheadCueId}
            unarmDisabled={!armedCueId}
          />
          <GoButton
            armedCueId={armedCueId}
            cueLabel={armedCue?.label}
            mode={mode}
            onGo={handleGo}
            onOverride={handleGoOverride}
            rejectedReason={rejectedReason}
            isAuthoritative={true}
            goInert={goInert}
            firedConfirmLabel={firedConfirmLabel}
            followCount={followCount}
            externalHoldFraction={spaceHoldFraction > 0 ? spaceHoldFraction : undefined}
          />
        </div>
      </div>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showConfirmDialog && armedCue && (
        <GoConfirmDialog
          cue={armedCue}
          onConfirm={handleConfirmOverride}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}
      {editingCue && (
        <CueEditDialog
          cue={editingCue}
          onSave={(patch) => {
            updateFields(editingCue.id, patch, String(conn.doc.clientID));
            setEditingCue(null);
          }}
          onCancel={() => setEditingCue(null)}
        />
      )}
    </div>
  );
}
