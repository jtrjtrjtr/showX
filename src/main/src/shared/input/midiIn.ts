import { createRequire } from 'node:module';
import type { Logger } from '../Logger.js';
import type { MidiMessage } from './types.js';

const _require = createRequire(import.meta.url);

interface MidiInLike {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  closePort(): void;
  on(event: 'message', handler: (deltaTime: number, bytes: number[]) => void): void;
  removeListener(event: 'message', handler: (deltaTime: number, bytes: number[]) => void): void;
}

interface MidiInFactory {
  input(): MidiInLike;
}

function defaultMidiInFactory(): MidiInFactory {
  return {
    input(): MidiInLike {
      const midi = _require('@julusian/midi') as { Input: new () => MidiInLike };
      return new midi.Input();
    },
  };
}

function findPortIndex(input: MidiInLike, name: string): number {
  for (let i = 0; i < input.getPortCount(); i++) {
    if (input.getPortName(i).includes(name)) return i;
  }
  return -1;
}

export function parseMidi(bytes: number[]): MidiMessage | null {
  if (bytes.length === 0) return null;
  const status = bytes[0]!;
  const typeNibble = status & 0xf0;
  const channel = status & 0x0f;
  const now = Date.now();

  if (typeNibble === 0x80) {
    return { type: 'noteOff', channel, data1: bytes[1] ?? 0, data2: bytes[2] ?? 0, raw: bytes, receivedAt: now };
  }
  if (typeNibble === 0x90) {
    const velocity = bytes[2] ?? 0;
    return {
      type: velocity === 0 ? 'noteOff' : 'noteOn',
      channel,
      data1: bytes[1] ?? 0,
      data2: velocity,
      raw: bytes,
      receivedAt: now,
    };
  }
  if (typeNibble === 0xb0) {
    return { type: 'cc', channel, data1: bytes[1] ?? 0, data2: bytes[2] ?? 0, raw: bytes, receivedAt: now };
  }
  if (typeNibble === 0xc0) {
    return { type: 'programChange', channel, data1: bytes[1] ?? 0, data2: 0, raw: bytes, receivedAt: now };
  }
  if (status === 0xf0) {
    return { type: 'sysex', channel: 0, data1: 0, data2: 0, raw: bytes, receivedAt: now };
  }
  if (status === 0xf1) {
    // MIDI Time Code quarter-frame — emit as sysex so MTC decoder can receive it via raw bytes
    return { type: 'sysex', channel: 0, data1: bytes[1] ?? 0, data2: 0, raw: bytes, receivedAt: now };
  }
  return null;
}

export class MidiPortListener {
  private input: MidiInLike | null = null;
  private handlers = new Set<(msg: MidiMessage) => void>();
  private _msgHandler?: (deltaTime: number, bytes: number[]) => void;

  constructor(
    private readonly portName: string,
    private readonly logger: Logger,
    private readonly factory: MidiInFactory = defaultMidiInFactory(),
  ) {}

  async start(): Promise<void> {
    const input = this.factory.input();
    const idx = findPortIndex(input, this.portName);
    if (idx < 0) throw new Error(`MIDI input port not found: ${this.portName}`);

    this._msgHandler = (_deltaTime: number, bytes: number[]) => {
      this._fanOut(bytes);
    };
    input.on('message', this._msgHandler);
    input.openPort(idx);
    this.input = input;
    this.logger.info('input.midi.opened', { portName: this.portName });
  }

  async stop(): Promise<void> {
    if (!this.input) return;
    const input = this.input;
    this.input = null;
    if (this._msgHandler) {
      input.removeListener('message', this._msgHandler);
      this._msgHandler = undefined;
    }
    input.closePort();
    this.handlers.clear();
    this.logger.info('input.midi.closed', { portName: this.portName });
  }

  addHandler(fn: (msg: MidiMessage) => void): void {
    this.handlers.add(fn);
  }

  removeHandler(fn: (msg: MidiMessage) => void): void {
    this.handlers.delete(fn);
  }

  get handlerCount(): number {
    return this.handlers.size;
  }

  /** @internal — for unit testing without real MIDI hardware. */
  _injectForTest(bytes: number[]): void {
    this._fanOut(bytes);
  }

  private _fanOut(bytes: number[]): void {
    const msg = parseMidi(bytes);
    if (!msg) return;
    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch (err) {
        this.logger.error('input.handler.threw', { portName: this.portName, err: String(err) });
      }
    }
  }
}
