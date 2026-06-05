import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createServer, type Server } from 'node:http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { randomUUID } from 'node:crypto';
import type { Subscription } from 'showx-shared';
import { shellVersion } from './version.js';
import type { Logger } from './Logger.js';

export type AssetServerMode =
  | { kind: 'prod'; pwaDir: string }
  | { kind: 'dev'; viteUrl: string };

export interface AssetServerOptions {
  port?: number;
  host?: string;
  mode: AssetServerMode;
  log?: Logger;
  corsOrigin?: (origin: string | undefined) => boolean;
}

interface StaticMount { id: string; slug: string; dir: string; }
interface ApiMount    { id: string; method: string; path: string; }

export class AssetServer {
  private readonly app: Express;
  private server: Server | null = null;
  private staticMounts: StaticMount[] = [];
  private apiMounts: ApiMount[] = [];
  private readonly apiRouter: express.Router;

  constructor(private readonly opts: AssetServerOptions) {
    this.app = express();
    this.apiRouter = express.Router();
    this.installMiddleware();
    this.installSystemRoutes();
    this.app.use('/api', this.apiRouter);
    // Dynamic module static dispatch — no router rebuild needed on unmount
    this.app.use('/modules', (req: Request, res: Response, next: NextFunction) => {
      this.dispatchModuleRequest(req, res, next);
    });
    this.installPwaServing();
  }

  async start(): Promise<void> {
    if (this.server) return;
    const port = this.opts.port ?? 5300;
    const host = this.opts.host ?? '0.0.0.0';
    this.server = createServer(this.app);
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, host, () => resolve());
    });
    this.opts.log?.info('AssetServer listening', { port: this.port(), host });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    // Force-close keep-alive connections so close() callback fires immediately.
    s.closeAllConnections?.();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  port(): number {
    if (!this.server) return -1;
    const addr = this.server.address();
    return addr && typeof addr === 'object' ? addr.port : -1;
  }

  baseUrl(): string {
    const host = this.opts.host ?? '0.0.0.0';
    return `http://${host === '0.0.0.0' ? 'localhost' : host}:${this.port()}`;
  }

  httpServer(): Server {
    if (!this.server) throw new Error('AssetServer not started');
    return this.server;
  }

  /** Expose the Express API router so Shell can mount sub-routers (e.g. pairing routes). */
  get expressApiRouter(): express.Router {
    return this.apiRouter;
  }

  registerStaticRoute(slug: string, dir: string): Subscription {
    const id = randomUUID();
    this.staticMounts.push({ id, slug, dir });
    return { id, unsubscribe: () => { this.staticMounts = this.staticMounts.filter(m => m.id !== id); } };
  }

  registerApiRoute(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: (req: Request, res: Response) => Promise<unknown> | unknown,
  ): Subscription {
    const id = randomUUID();
    this.apiMounts.push({ id, method, path });
    // Routes registered once; removed routes short-circuit with 404
    const wrapped = async (req: Request, res: Response) => {
      if (!this.apiMounts.some(m => m.id === id)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      try {
        const out = await handler(req, res);
        if (!res.headersSent && out !== undefined) res.json(out);
      } catch (err) {
        this.opts.log?.error('api route threw', { method, path, error: String(err) });
        if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
      }
    };
    (this.apiRouter as unknown as Record<string, (p: string, h: typeof wrapped) => void>)[method.toLowerCase()](path, wrapped);
    return { id, unsubscribe: () => { this.apiMounts = this.apiMounts.filter(m => m.id !== id); } };
  }

  private installMiddleware(): void {
    this.app.use(express.json({ limit: '1mb' }));
    // cors() expects callback-style origin; wrap the sync predicate.
    const predicate = this.opts.corsOrigin ?? defaultCorsOrigin;
    this.app.use(cors({
      origin: (origin, cb) => cb(null, predicate(origin)),
      credentials: true,
    }));
  }

  private installSystemRoutes(): void {
    const v = shellVersion();
    this.app.get('/system/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', version: v.version, uptimeMs: Date.now() - v.startedAt });
    });
    this.app.get('/system/version', (_req: Request, res: Response) => {
      res.json({ version: v.version, build: v.build, electron: v.electron, node: v.node });
    });
  }

  private installPwaServing(): void {
    if (this.opts.mode.kind === 'prod') {
      const pwaDir = this.opts.mode.pwaDir;
      this.app.use(express.static(pwaDir, { index: 'index.html', fallthrough: true }));
      this.app.get('*', (req: Request, res: Response, next: NextFunction) => {
        const p = req.path;
        if (p.startsWith('/api') || p.startsWith('/modules') || p.startsWith('/system') || p.startsWith('/yjs') || p.startsWith('/events')) {
          return next();
        }
        res.sendFile('index.html', { root: pwaDir }, (err) => {
          if (err) next();
        });
      });
    } else {
      const viteUrl = this.opts.mode.viteUrl;
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const p = req.path;
        if (p.startsWith('/api') || p.startsWith('/modules') || p.startsWith('/system') || p.startsWith('/yjs') || p.startsWith('/events')) {
          return next();
        }
        createProxyMiddleware({ target: viteUrl, changeOrigin: true, ws: true, logLevel: 'silent' })(req, res, next);
      });
    }
  }

  // Uses req.url (relative to /modules mount) to dispatch to the matching static mount.
  // When mount is removed from staticMounts array, subsequent requests fall through to 404.
  private dispatchModuleRequest(req: Request, res: Response, next: NextFunction): void {
    const url = req.url;
    const slashIdx = url.indexOf('/', 1);
    const slug = slashIdx === -1 ? url.slice(1) : url.slice(1, slashIdx);
    const mount = this.staticMounts.find(m => m.slug === slug);
    if (!mount) return next();
    const savedUrl = req.url;
    req.url = slashIdx === -1 ? '/' : url.slice(slashIdx);
    express.static(mount.dir, { fallthrough: true, index: false })(req, res, (err?: unknown) => {
      req.url = savedUrl;
      next(err as Error | undefined);
    });
  }
}

export function defaultCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}
