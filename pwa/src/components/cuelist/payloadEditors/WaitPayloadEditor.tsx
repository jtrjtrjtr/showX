import { useState } from 'react';
import type { WaitPayload } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

interface WaitPayloadEditorProps {
  payload: WaitPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function WaitPayloadEditor({ payload, cuelistId, cueId, locked }: WaitPayloadEditorProps) {
  const conn = useConnection();
  const [durationErr, setDurationErr] = useState<string | null>(null);

  const labelStyle = { display: 'block', fontSize: 12, color: tokens.color.gray_700, fontWeight: 600, marginBottom: tokens.space.xs } as const;
  const inputStyle = (err?: boolean) => ({
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${err ? tokens.color.red : tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: locked ? tokens.color.gray_50 : '#fff',
  } as const);

  return (
    <div>
      <label style={labelStyle}>
        Duration (ms, 0–600000)
        <input
          type="number"
          min={0}
          max={600_000}
          value={payload.duration_ms}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < 0 || v > 600_000) {
              setDurationErr('Duration must be 0–600000 ms');
              return;
            }
            setDurationErr(null);
            updatePayload(conn.doc, cuelistId, cueId, payload.id, { duration_ms: v });
          }}
          disabled={locked}
          style={inputStyle(!!durationErr)}
          aria-label="Wait duration ms"
        />
        {durationErr && (
          <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>
            {durationErr}
          </span>
        )}
      </label>
    </div>
  );
}
