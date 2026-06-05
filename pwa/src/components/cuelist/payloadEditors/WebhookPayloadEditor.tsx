import { useState } from 'react';
import type { WebhookPayload } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

function isLoopback(url: string): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost|::1)(:\d+)?(\/|$)/.test(url);
}

interface WebhookPayloadEditorProps {
  payload: WebhookPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function WebhookPayloadEditor({ payload, cuelistId, cueId, locked }: WebhookPayloadEditorProps) {
  const conn = useConnection();
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderVal, setNewHeaderVal] = useState('');

  const labelStyle = { display: 'block', fontSize: 12, color: tokens.color.gray_700, fontWeight: 600, marginBottom: tokens.space.xs } as const;
  const inputStyle = (err?: boolean) => ({
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${err ? tokens.color.red : tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: locked ? tokens.color.gray_50 : '#fff',
  } as const);

  const updateUrl = (url: string) => {
    if (!url.startsWith('https://') && !isLoopback(url)) {
      setUrlErr('URL must be https (loopback http allowed)');
      return;
    }
    setUrlErr(null);
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { url });
  };

  const addHeader = () => {
    if (!newHeaderKey) return;
    const headers = { ...payload.headers, [newHeaderKey]: newHeaderVal };
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { headers });
    setNewHeaderKey('');
    setNewHeaderVal('');
  };

  const removeHeader = (key: string) => {
    const headers = { ...payload.headers };
    delete headers[key];
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { headers });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <label style={labelStyle}>
        URL
        <input
          type="url"
          value={payload.url}
          onChange={(e) => updateUrl(e.target.value)}
          disabled={locked}
          style={inputStyle(!!urlErr)}
          aria-label="Webhook URL"
          placeholder="https://example.com/hook"
        />
        {urlErr && <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>{urlErr}</span>}
      </label>

      <label style={labelStyle}>
        Method
        <select
          value={payload.method}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { method: e.target.value as WebhookPayload['method'] })}
          disabled={locked}
          style={inputStyle()}
          aria-label="Webhook method"
        >
          {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>

      <div>
        <div style={labelStyle}>Headers</div>
        {Object.entries(payload.headers).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: tokens.space.xs, marginBottom: tokens.space.xs, alignItems: 'center' }}>
            <span style={{ fontSize: 12, flex: 1, fontFamily: tokens.font.mono }}>{k}: {v}</span>
            {!locked && (
              <button type="button" onClick={() => removeHeader(k)} style={{ background: 'none', border: 'none', color: tokens.color.red, cursor: 'pointer', fontSize: 14 }} aria-label={`Remove header ${k}`}>×</button>
            )}
          </div>
        ))}
        {!locked && (
          <div style={{ display: 'flex', gap: tokens.space.xs }}>
            <input
              type="text"
              value={newHeaderKey}
              onChange={(e) => setNewHeaderKey(e.target.value)}
              placeholder="Key"
              style={{ flex: 1, padding: `${tokens.space.xs}px`, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s, fontSize: 12 }}
              aria-label="New header key"
            />
            <input
              type="text"
              value={newHeaderVal}
              onChange={(e) => setNewHeaderVal(e.target.value)}
              placeholder="Value"
              style={{ flex: 2, padding: `${tokens.space.xs}px`, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s, fontSize: 12 }}
              aria-label="New header value"
            />
            <button type="button" onClick={addHeader} style={{ padding: `${tokens.space.xs}px ${tokens.space.s}px`, background: tokens.color.teal, color: '#fff', border: 'none', borderRadius: tokens.radius.s, fontSize: 12, cursor: 'pointer' }}>Add</button>
          </div>
        )}
      </div>

      <label style={labelStyle}>
        Body
        <textarea
          value={payload.body ?? ''}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { body: e.target.value || null })}
          disabled={locked}
          rows={3}
          style={{ ...inputStyle(), resize: 'vertical', fontFamily: tokens.font.mono }}
          aria-label="Webhook body"
          placeholder="Optional request body (JSON, etc.)"
        />
      </label>

      <label style={labelStyle}>
        Timeout (ms)
        <input
          type="number"
          min={0}
          value={payload.timeout_ms}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { timeout_ms: Number(e.target.value) })}
          disabled={locked}
          style={inputStyle()}
          aria-label="Webhook timeout ms"
        />
      </label>
    </div>
  );
}
