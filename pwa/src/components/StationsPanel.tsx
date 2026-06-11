import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { tokens } from './cuelist/tokens.js';

interface ServerInfo {
  lan_ip: string;
  port: number;
  mdns_name: string;
  test_pin: string | null;
}

function getApiBase(): string {
  const u = new URLSearchParams(window.location.search);
  const apiPort = u.get('api_port');
  if (apiPort) return `http://localhost:${apiPort}`;
  return window.location.origin;
}

function buildStationUrl(info: ServerInfo, host: string): string {
  const base = `http://${host}:${info.port}/pairing`;
  return info.test_pin ? `${base}?pin=${info.test_pin}` : base;
}

function openExternal(url: string): void {
  const api = (window as unknown as {
    showxApi?: { shell?: { openExternal?: (url: string) => Promise<unknown> } };
  }).showxApi?.shell;
  if (api?.openExternal) {
    void api.openExternal(url);
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
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom: tokens.space.xs,
};

const urlStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.color.ink,
  fontFamily: 'monospace',
  wordBreak: 'break-all' as const,
  marginBottom: tokens.space.xs,
};

const btnStyle: React.CSSProperties = {
  marginTop: tokens.space.s,
  padding: `${tokens.space.xs}px ${tokens.space.m}px`,
  background: tokens.color.raised,
  color: tokens.color.ink,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.m,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: tokens.font.ui,
  width: '100%',
};

export function StationsPanel() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [qrLan, setQrLan] = useState<string | null>(null);
  const [qrMdns, setQrMdns] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/api/server-info`)
      .then((r) => r.json() as Promise<ServerInfo>)
      .then((data) => {
        setInfo(data);
        const urlLan = buildStationUrl(data, data.lan_ip);
        const urlMdns = buildStationUrl(data, data.mdns_name);
        return Promise.all([
          QRCode.toDataURL(urlLan, { width: 128, margin: 1 }),
          QRCode.toDataURL(urlMdns, { width: 128, margin: 1 }),
        ]);
      })
      .then(([lan, mdns]) => {
        setQrLan(lan);
        setQrMdns(mdns);
      })
      .catch(() => {/* server info unavailable — panel stays empty */});
  }, []);

  if (!info) return null;

  const urlLan = buildStationUrl(info, info.lan_ip);
  const urlMdns = buildStationUrl(info, info.mdns_name);

  return (
    <div data-testid="stations-panel" style={sectionStyle}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: tokens.space.s }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ ...labelStyle, marginBottom: 0 }}>Stations</span>
        <span style={{ fontSize: 10, color: tokens.color.ink_secondary }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div>
          <div style={{ marginBottom: tokens.space.m }}>
            <div style={labelStyle}>LAN</div>
            <div style={urlStyle}>{urlLan}</div>
            {qrLan && (
              <img
                data-testid="qr-lan"
                src={qrLan}
                alt="QR code — LAN"
                style={{ width: 96, height: 96, display: 'block', marginBottom: tokens.space.xs }}
              />
            )}
          </div>

          <div style={{ marginBottom: tokens.space.m }}>
            <div style={labelStyle}>mDNS</div>
            <div style={urlStyle}>{urlMdns}</div>
            {qrMdns && (
              <img
                data-testid="qr-mdns"
                src={qrMdns}
                alt="QR code — mDNS"
                style={{ width: 96, height: 96, display: 'block', marginBottom: tokens.space.xs }}
              />
            )}
          </div>

          <button
            data-testid="open-station-browser"
            style={btnStyle}
            onClick={() => openExternal(urlLan)}
          >
            Open station in this Mac's browser
          </button>
        </div>
      )}
    </div>
  );
}
