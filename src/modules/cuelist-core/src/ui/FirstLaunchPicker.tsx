import { useState } from 'react';
import { tokens } from './tokens.js';
import type { IpcBridge } from './CuelistCorePanel.js';

interface CardProps {
  icon: string;
  title: string;
  subtext: string;
  ctaLabel: string;
  onClick: () => void;
  loading?: boolean;
}

function PickerCard({ icon, title, subtext, ctaLabel, onClick, loading }: CardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: hovered ? tokens.color.gray_50 : tokens.color.cream,
        border: `1.5px solid ${hovered ? tokens.color.teal : tokens.color.gray_300}`,
        borderRadius: tokens.radius.l,
        padding: `${tokens.space.xxl}px ${tokens.space.xl}px`,
        minHeight: 260,
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={0}
      role="region"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            fontSize: 40,
            marginBottom: tokens.space.m,
            lineHeight: 1,
          }}
          aria-hidden
        >
          {icon}
        </div>
        <h2
          style={{
            fontFamily: tokens.font.ui,
            fontWeight: 700,
            fontSize: 18,
            color: tokens.color.ink,
            margin: 0,
            marginBottom: tokens.space.s,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontFamily: tokens.font.ui,
            fontSize: 13,
            color: tokens.color.gray_700,
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 200,
          }}
        >
          {subtext}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        disabled={loading}
        style={{
          marginTop: tokens.space.xl,
          width: '100%',
          background: tokens.color.teal,
          color: tokens.color.cream,
          border: 'none',
          borderRadius: tokens.radius.m,
          padding: `${tokens.space.s}px ${tokens.space.l}px`,
          fontFamily: tokens.font.ui,
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? '…' : ctaLabel}
      </button>
    </div>
  );
}

interface FirstLaunchPickerProps {
  ipc: IpcBridge;
  onShowOpened?: (showPath: string) => void;
}

type ActionKey = 'demo' | 'open' | 'new' | null;

export function FirstLaunchPicker({ ipc, onShowOpened }: FirstLaunchPickerProps) {
  const [loading, setLoading] = useState<ActionKey>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(key: ActionKey, channel: string): Promise<void> {
    setLoading(key);
    setError(null);
    try {
      const result = await ipc.invoke<{ path?: string; cancelled?: boolean; error?: string }>(channel);
      if (result && !result.cancelled && result.path) {
        await ipc.invoke('cuelist-core/open-show', result.path);
        onShowOpened?.(result.path);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: tokens.space.xl,
          flexWrap: 'wrap',
        }}
      >
        <PickerCard
          icon="▶"
          title="Open Demo Show"
          subtext="A full sample show with 25 cues, 3 devices, and example routing. Best place to start."
          ctaLabel="Open Demo"
          loading={loading === 'demo'}
          onClick={() => void handleAction('demo', 'cuelist-core:open-demo')}
        />
        <PickerCard
          icon="📁"
          title="Open Existing Show"
          subtext="Browse to a .showx file you already have."
          ctaLabel="Browse…"
          loading={loading === 'open'}
          onClick={() => void handleAction('open', 'cuelist-core:open-file-picker')}
        />
        <PickerCard
          icon="+"
          title="Create New from Scratch"
          subtext="Start with a blank show."
          ctaLabel="Create…"
          loading={loading === 'new'}
          onClick={() => void handleAction('new', 'cuelist-core:create-new')}
        />
      </div>
      {error && (
        <div
          role="alert"
          style={{
            background: tokens.color.red,
            color: tokens.color.cream,
            padding: tokens.space.m,
            borderRadius: tokens.radius.m,
            marginTop: tokens.space.l,
            fontFamily: tokens.font.ui,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
