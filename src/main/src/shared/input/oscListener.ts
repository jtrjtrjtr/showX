import * as dgram from 'node:dgram';
import { createRequire } from 'node:module';
import type { Logger } from '../Logger.js';
import type { OscMessage } from './types.js';

const _require = createRequire(import.meta.url);

type OscArg = { type: string; value?: unknown };
type OscMinMsg = { oscType: 'message'; address: string; args: OscArg[] };
type OscMinBundle = { oscType: 'bundle'; elements: Array<OscMinMsg | OscMinBundle> };
type OscMinModule = { fromBuffer(buf: Buffer): OscMinMsg | OscMinBundle };

function getOscMin(): OscMinModule {
  return _require('osc-min') as OscMinModule;
}

function decodeArg(arg: OscArg): number | string | boolean | Buffer {
  switch (arg.type) {
    case 'integer':
    case 'float':
      return arg.value as number;
    case 'string':
      return arg.value as string;
    case 'blob':
      return arg.value as Buffer;
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      return String(arg.value ?? '');
  }
}

function flattenOsc(
  parsed: OscMinMsg | OscMinBundle,
  fromHost: string,
  fromPort: number,
): OscMessage[] {
  if (parsed.oscType === 'message') {
    return [{
      address: parsed.address,
      args: parsed.args.map(decodeArg),
      fromHost,
      fromPort,
      receivedAt: Date.now(),
    }];
  }
  return parsed.elements.flatMap(
    (el) => flattenOsc(el as OscMinMsg | OscMinBundle, fromHost, fromPort),
  );
}

export class OscPortListener {
  private socket: dgram.Socket | null = null;
  private handlers = new Set<(msg: OscMessage) => void>();
  private _boundPort: number;

  constructor(private port: number, private logger: Logger) {
    this._boundPort = port;
  }

  async start(): Promise<void> {
    const socket = dgram.createSocket('udp4');
    this.socket = socket;

    socket.on('message', (data: Buffer, rinfo: dgram.RemoteInfo) => {
      let messages: OscMessage[];
      try {
        const parsed = getOscMin().fromBuffer(data);
        messages = flattenOsc(parsed, rinfo.address, rinfo.port);
      } catch (err) {
        this.logger.warn('input.osc.parse_error', { port: this._boundPort, err: String(err) });
        return;
      }
      for (const msg of messages) {
        for (const handler of this.handlers) {
          try {
            handler(msg);
          } catch (err) {
            this.logger.error('input.handler.threw', { port: this._boundPort, err: String(err) });
          }
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(this.port, () => {
        socket.removeListener('error', reject);
        this._boundPort = socket.address().port;
        this.logger.info('input.osc.bound', { port: this._boundPort });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    this.handlers.clear();
    await new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });
    this.logger.info('input.osc.closed', { port: this._boundPort });
  }

  addHandler(fn: (msg: OscMessage) => void): void {
    this.handlers.add(fn);
  }

  removeHandler(fn: (msg: OscMessage) => void): void {
    this.handlers.delete(fn);
  }

  get handlerCount(): number {
    return this.handlers.size;
  }

  get boundPort(): number {
    return this._boundPort;
  }
}
