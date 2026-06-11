import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type express from 'express';
import QRCode from 'qrcode';
import type { Logger } from 'showx-shared';
import type { PairingStore } from '../PairingStore.js';
import type { PinManager } from './pinManager.js';
import type { TokenManager } from './tokenManager.js';
import { ClaimRequest, PinInvalidError, TokenInvalidError } from './types.js';
import type { ActiveShowDoc } from '../../runtime/ActiveShowDoc.js';

function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  // Prefer en0 (macOS Wi-Fi / Ethernet)
  const preferred = ['en0', 'en1', 'eth0', 'eth1'];
  for (const name of preferred) {
    const list = ifaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  // Fallback: first non-internal IPv4
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  return '127.0.0.1';
}

export interface PairingApiDeps {
  pairing: PairingStore;
  pins: PinManager;
  tokens: TokenManager;
  hostInfo: { host: string; port: number };
  logger: Logger;
  // Optional: local-call bypass secret. When a request presents
  // x-showx-local-secret: <value> matching this, it is treated as admin.
  // Populated by the Electron shell for its own internal HTTP calls.
  // TODO(B001-011): wire up a real random-per-boot local secret.
  localSecret?: string;
  // When set, /pairing/claim response includes show_id (string | null).
  // Omit to preserve old response shape for backward compat.
  activeShow?: ActiveShowDoc;
}

function authAdmin(deps: PairingApiDeps) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    // Local bypass: Electron shell passes a per-boot secret header
    if (deps.localSecret) {
      const localHdr = req.headers['x-showx-local-secret'];
      if (typeof localHdr === 'string' && localHdr === deps.localSecret) {
        next();
        return;
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'missing_token' });
      return;
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = deps.tokens.validate(token);
    } catch (e) {
      const reason = e instanceof TokenInvalidError ? e.reason : 'bad_sig';
      res.status(401).json({ error: 'token_invalid', reason });
      return;
    }

    // v1: admin = no owned_departments (stage manager / system account)
    if (payload.owned_departments.length !== 0) {
      res.status(401).json({ error: 'insufficient_privileges' });
      return;
    }

    next();
  };
}

export function mountPairingRoutes(
  router: express.Router,
  deps: PairingApiDeps,
): void {
  const admin = authAdmin(deps);

  router.post('/pairing/initiate', async (_req: express.Request, res: express.Response) => {
    try {
      const rec = deps.pins.generate();
      const { host, port } = deps.hostInfo;
      const pairUrl = `showx://pair?pin=${rec.pin}&host=${encodeURIComponent(host)}&port=${port}`;
      const qrDataUrl = await QRCode.toDataURL(pairUrl, { width: 256 });
      res.json({
        pin: rec.pin,
        expires_at: rec.expires_at,
        qr_data_url: qrDataUrl,
        pair_url: pairUrl,
      });
    } catch (err) {
      deps.logger.error('pairing.initiate.error', { error: String(err) });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  router.post('/pairing/claim', async (req: express.Request, res: express.Response) => {
    try {
      const { pin, display_name, owned_departments = [] } = req.body as ClaimRequest;
      const sourceIp = req.ip ?? 'unknown';

      deps.pins.claim(pin, sourceIp);

      const device_id = crypto.randomUUID();
      const tier = 'free' as const;
      const token = deps.tokens.sign({ device_id, display_name, owned_departments, tier });
      const token_hash = deps.tokens.hashToken(token);

      const device = await deps.pairing.addDevice({
        device_id,
        display_name,
        owned_departments,
        tier,
        token_hash,
        revoked_at: undefined,
      });

      deps.logger.info('pairing.claim.ok', { device_id, display_name });
      const showIdField =
        deps.activeShow !== undefined ? { show_id: deps.activeShow.getShowId() } : {};
      res.json({ token, device, ...showIdField });
    } catch (e) {
      if (e instanceof PinInvalidError) {
        res.status(401).json({ error: e.reason });
        return;
      }
      deps.logger.error('pairing.claim.error', { error: String(e) });
      res.status(500).json({ error: 'internal_error' });
    }
  });

  router.get('/pairing/devices', admin, (_req: express.Request, res: express.Response) => {
    res.json(deps.pairing.listDevices());
  });

  router.delete(
    '/pairing/devices/:id',
    admin,
    async (req: express.Request, res: express.Response) => {
      try {
        await deps.pairing.revokeDevice(req.params['id']);
        res.json({ ok: true });
      } catch (err) {
        deps.logger.error('pairing.revoke.error', { error: String(err) });
        res.status(500).json({ error: 'internal_error' });
      }
    },
  );

  router.get('/active-show', (_req: express.Request, res: express.Response) => {
    const meta = deps.activeShow?.getActiveShow();
    const showId = deps.activeShow?.getShowId() ?? null;
    res.json({
      open: !!meta,
      show_id: showId,
      title: meta?.title ?? null,
      mode: meta?.mode ?? null,
    });
  });

  // Validate a pairing bearer token — used by station browsers on reload
  router.get('/pairing/validate', (req: express.Request, res: express.Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ valid: false });
      return;
    }
    const token = authHeader.slice(7);
    try {
      deps.pairing.resolveToken(token);
      res.json({ valid: true });
    } catch {
      res.status(401).json({ valid: false });
    }
  });

  // Server discovery info — used by StationsPanel in the shell to build QR + URLs
  router.get('/server-info', (_req: express.Request, res: express.Response) => {
    const lanIp = getLanIp();
    const { port } = deps.hostInfo;
    const mdnsName = `${deps.hostInfo.host}.local`;
    // test_pin only returned when env var is explicitly set (never in production)
    const testPin = process.env['SHOWX_PAIRING_TEST_PIN'] ?? null;
    res.json({ lan_ip: lanIp, port, mdns_name: mdnsName, test_pin: testPin });
  });
}
