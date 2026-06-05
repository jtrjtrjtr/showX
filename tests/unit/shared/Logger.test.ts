import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Logger } from '../../../src/main/src/shared/Logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env['LOG_LEVEL'];
  });

  function captureStream() {
    const out = new PassThrough();
    const lines: string[] = [];
    out.on('data', (chunk: Buffer) => {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
    });
    return { out, lines };
  }

  it('info() writes a JSON line with correct shape', () => {
    const { out, lines } = captureStream();
    const log = Logger.forSlug('test-slug', { output: out });
    log.info('hello world', { key: 'val' });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.ts).toBe(1000000);
    expect(parsed.level).toBe('info');
    expect(parsed.prefix).toBe('test-slug');
    expect(parsed.msg).toBe('hello world');
    expect(parsed.meta).toEqual({ key: 'val' });
  });

  it('debug() is dropped when level is info (default)', () => {
    const { out, lines } = captureStream();
    const log = Logger.forSlug('x', { output: out });
    log.debug('should not appear');
    expect(lines).toHaveLength(0);
  });

  it('LOG_LEVEL=debug env override emits debug messages', () => {
    process.env['LOG_LEVEL'] = 'debug';
    const { out, lines } = captureStream();
    const log = Logger.forSlug('x', { output: out });
    log.debug('debug line');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.level).toBe('debug');
  });

  it('child() chains prefix with colon', () => {
    const { out, lines } = captureStream();
    const parent = Logger.forSlug('eventx-bridge', { output: out });
    const child = parent.child('osc');
    child.info('nested');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.prefix).toBe('eventx-bridge:osc');
  });

  it('meta arg appears under meta key in JSON output', () => {
    const { out, lines } = captureStream();
    const log = new Logger({ output: out, level: 'info' });
    log.warn('something', { code: 42, extra: 'data' });
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.meta).toEqual({ code: 42, extra: 'data' });
  });

  it('omits meta key when no meta provided', () => {
    const { out, lines } = captureStream();
    const log = new Logger({ output: out });
    log.info('plain');
    const parsed = JSON.parse(lines[0]!);
    expect('meta' in parsed).toBe(false);
  });

  it('each log line is independently valid JSON', () => {
    const { out, lines } = captureStream();
    const log = new Logger({ output: out, level: 'debug' });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
