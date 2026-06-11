import { useState, useEffect, useRef } from 'react';
import { tokens } from './cuelist/tokens.js';

export interface DispatchRecord {
  ts: string;
  cue_id: string;
  cue_label: string;
  transport_summary: string;
  payloads_dispatched: number;
  payloads_failed: Array<{ payload_id: string; error: string }>;
  duration_ms: number;
  fired_by: string;
}

function getDispatchLog(): { list: () => Promise<DispatchRecord[]>; onAppend: (cb: (r: DispatchRecord) => void) => () => void } | null {
  const api = (window as unknown as {
    showxApi?: { dispatchLog?: {
      list: () => Promise<unknown[]>;
      onAppend: (cb: (r: unknown) => void) => () => void;
    } };
  }).showxApi?.dispatchLog;
  if (!api) return null;
  return api as { list: () => Promise<DispatchRecord[]>; onAppend: (cb: (r: DispatchRecord) => void) => () => void };
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const mmm = d.getMilliseconds().toString().padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
  } catch {
    return ts;
  }
}

const sectionStyle: React.CSSProperties = {
  padding: `${tokens.space.m}px ${tokens.space.l}px`,
  borderTop: `1px solid ${tokens.color.border}`,
  fontFamily: tokens.font.ui,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: tokens.color.ink_secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 1fr 80px 60px 50px',
  gap: tokens.space.s,
  alignItems: 'start',
  padding: `${tokens.space.xs}px 0`,
  borderBottom: `1px solid ${tokens.color.border}`,
  fontSize: 12,
  color: tokens.color.ink,
  fontFamily: tokens.font.mono,
};

const cellMuted: React.CSSProperties = {
  color: tokens.color.ink_secondary,
  fontSize: 11,
};

function DispatchRow({ record, index }: { record: DispatchRecord; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasFails = record.payloads_failed.length > 0;

  return (
    <div
      data-testid={`dispatch-row-${index}`}
      onClick={() => hasFails && setExpanded((v) => !v)}
      style={{ cursor: hasFails ? 'pointer' : 'default' }}
    >
      <div
        style={{
          ...rowStyle,
          borderBottom: expanded ? 'none' : `1px solid ${tokens.color.border}`,
          cursor: undefined,
        }}
      >
        <span style={cellMuted}>{formatTs(record.ts)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {record.cue_label}
        </span>
        <span style={cellMuted}>{record.transport_summary}</span>
        <span>
          <span style={{ color: tokens.color.green }}>{record.payloads_dispatched}ok</span>
          {hasFails && (
            <span style={{ color: tokens.color.red, marginLeft: 4 }}>
              {record.payloads_failed.length}fail
            </span>
          )}
        </span>
        <span style={cellMuted}>{record.duration_ms}ms</span>
      </div>
      {expanded && hasFails && (
        <div
          style={{
            padding: `${tokens.space.xs}px ${tokens.space.m}px`,
            background: tokens.color.raised,
            borderBottom: `1px solid ${tokens.color.border}`,
            fontSize: 11,
            fontFamily: tokens.font.mono,
          }}
        >
          {record.payloads_failed.map((f) => (
            <div key={f.payload_id} style={{ color: tokens.color.red, marginBottom: 2 }}>
              {f.payload_id}: {f.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DispatchLogPanel() {
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [open, setOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = getDispatchLog();
    if (!api) return;

    void api.list().then((initial) => setRecords(initial.slice().reverse()));

    const unsub = api.onAppend((record) => {
      setRecords((prev) => [record, ...prev].slice(0, 100));
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (open && bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [records, open]);

  return (
    <div data-testid="dispatch-log-panel" style={sectionStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: open ? tokens.space.s : 0,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={labelStyle}>Dispatch Log</span>
        <span style={{ fontSize: 10, color: tokens.color.ink_secondary }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div
          data-testid="dispatch-log-list"
          style={{ maxHeight: 240, overflowY: 'auto' }}
        >
          {records.length === 0 ? (
            <div style={{ color: tokens.color.ink_secondary, fontSize: 12, padding: `${tokens.space.s}px 0` }}>
              No cues fired yet
            </div>
          ) : (
            records.map((r, i) => <DispatchRow key={`${r.ts}-${r.cue_id}-${i}`} record={r} index={i} />)
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
