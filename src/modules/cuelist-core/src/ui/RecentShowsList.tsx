import { tokens } from './tokens.js';
import type { IpcBridge } from './CuelistCorePanel.js';

export interface RecentShow {
  path: string;
  last_opened_at: string;
  cue_count?: number;
}

interface RecentShowRowProps {
  show: RecentShow;
  onOpen: (showPath: string) => void;
}

function formatRelativeDate(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function showBaseName(showPath: string): string {
  const base = showPath.split('/').pop() ?? showPath;
  return base.endsWith('.showx') ? base.slice(0, -6) : base;
}

function RecentShowRow({ show, onOpen }: RecentShowRowProps) {
  return (
    <button
      onClick={() => onOpen(show.path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        background: 'none',
        border: 'none',
        borderBottom: `1px solid ${tokens.color.gray_50}`,
        padding: `${tokens.space.m}px ${tokens.space.s}px`,
        fontFamily: tokens.font.ui,
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: tokens.radius.s,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = tokens.color.gray_50;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'none';
      }}
    >
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: tokens.color.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {showBaseName(show.path)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: tokens.color.gray_700,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {show.path}
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          marginLeft: tokens.space.m,
          textAlign: 'right',
        }}
      >
        <div style={{ fontSize: 12, color: tokens.color.gray_700 }}>
          {formatRelativeDate(show.last_opened_at)}
        </div>
        {show.cue_count !== undefined && (
          <div style={{ fontSize: 11, color: tokens.color.ink_secondary, marginTop: 2 }}>
            {show.cue_count} cues
          </div>
        )}
      </div>
    </button>
  );
}

interface PillButtonProps {
  label: string;
  onClick: () => void;
}

function PillButton({ label, onClick }: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: tokens.color.cream,
        color: tokens.color.ink,
        border: `1px solid ${tokens.color.gray_300}`,
        borderRadius: tokens.radius.l,
        padding: `${tokens.space.xs}px ${tokens.space.m}px`,
        fontFamily: tokens.font.ui,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

interface RecentShowsListProps {
  ipc: IpcBridge;
  recentShows: RecentShow[];
  onShowOpened?: (showPath: string) => void;
}

export function RecentShowsList({ ipc, recentShows, onShowOpened }: RecentShowsListProps) {
  async function openShow(showPath: string): Promise<void> {
    await ipc.invoke('cuelist-core/open-show', showPath);
    onShowOpened?.(showPath);
  }

  async function openDemo(): Promise<void> {
    const result = await ipc.invoke<{ path?: string; cancelled?: boolean }>('cuelist-core:open-demo');
    if (result?.path) {
      await ipc.invoke('cuelist-core/open-show', result.path);
      onShowOpened?.(result.path);
    }
  }

  async function openFilePicker(): Promise<void> {
    const result = await ipc.invoke<{ path?: string; cancelled?: boolean }>('cuelist-core:open-file-picker');
    if (result?.path) {
      await ipc.invoke('cuelist-core/open-show', result.path);
      onShowOpened?.(result.path);
    }
  }

  async function createNew(): Promise<void> {
    const result = await ipc.invoke<{ path?: string; cancelled?: boolean }>('cuelist-core:create-new');
    if (result?.path) {
      await ipc.invoke('cuelist-core/open-show', result.path);
      onShowOpened?.(result.path);
    }
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: tokens.font.ui,
          fontWeight: 600,
          fontSize: 16,
          color: tokens.color.ink,
          marginBottom: tokens.space.s,
          marginTop: 0,
        }}
      >
        Recent shows
      </h2>
      <div>
        {recentShows.slice(0, 5).map((show) => (
          <RecentShowRow key={show.path} show={show} onOpen={(p) => void openShow(p)} />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: tokens.space.s,
          marginTop: tokens.space.xl,
          flexWrap: 'wrap',
        }}
      >
        <PillButton label="Demo show" onClick={() => void openDemo()} />
        <PillButton label="Open existing…" onClick={() => void openFilePicker()} />
        <PillButton label="New show…" onClick={() => void createNew()} />
      </div>
    </div>
  );
}
