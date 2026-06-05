import { createWriteStream, type WriteStream } from 'node:fs';
import type { Logger as LoggerIface } from 'showx-shared';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  const v = raw?.toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  return fallback;
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  output?: NodeJS.WritableStream;
  filePath?: string;
  now?: () => number;
}

export class Logger implements LoggerIface {
  private readonly level: LogLevel;
  private readonly prefix?: string;
  private readonly out: NodeJS.WritableStream;
  private readonly fileOut?: WriteStream;
  private readonly now: () => number;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? parseLevel(process.env['LOG_LEVEL'], 'info');
    this.prefix = opts.prefix;
    this.out = opts.output ?? process.stdout;
    this.now = opts.now ?? Date.now;

    if (opts.filePath) {
      try {
        this.fileOut = createWriteStream(opts.filePath, { flags: 'a' });
        this.fileOut.once('error', (err) => {
          process.stdout.write(
            JSON.stringify({ ts: Date.now(), level: 'warn', msg: 'Logger file stream error', error: String(err) }) + '\n',
          );
        });
      } catch (err) {
        process.stdout.write(
          JSON.stringify({ ts: Date.now(), level: 'warn', msg: 'Logger could not open file stream', error: String(err) }) + '\n',
        );
      }
    }
  }

  static forSlug(slug: string, opts: LoggerOptions = {}): Logger {
    return new Logger({ ...opts, prefix: slug });
  }

  child(suffix: string): Logger {
    const nextPrefix = this.prefix ? `${this.prefix}:${suffix}` : suffix;
    return new Logger({ level: this.level, prefix: nextPrefix, output: this.out, now: this.now });
  }

  debug(msg: string, meta?: Record<string, unknown>): void { this.emit('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>): void  { this.emit('info',  msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>): void  { this.emit('warn',  msg, meta); }
  error(msg: string, meta?: Record<string, unknown>): void { this.emit('error', msg, meta); }

  private emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;
    const line =
      JSON.stringify({
        ts: this.now(),
        level,
        ...(this.prefix !== undefined ? { prefix: this.prefix } : {}),
        msg,
        ...(meta !== undefined ? { meta } : {}),
      }) + '\n';
    this.out.write(line);
    if (this.fileOut && !this.fileOut.destroyed) {
      try {
        this.fileOut.write(line);
      } catch {
        // EBADF or similar — file stream gone, warn once to stdout and stop writing
        process.stdout.write(
          JSON.stringify({ ts: this.now(), level: 'warn', msg: 'Logger file write failed — stopping file output' }) + '\n',
        );
        this.fileOut.destroy();
      }
    }
  }

  close(): void {
    this.fileOut?.end();
  }
}
