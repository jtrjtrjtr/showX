import { createRequire } from 'node:module';
import type { MidiMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

export interface MidiOutLike {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  closePort(): void;
  sendMessage(bytes: number[]): void;
}

export interface MidiFactory {
  output(): MidiOutLike;
}

function defaultMidiFactory(): MidiFactory {
  return {
    output(): MidiOutLike {
      const midi = _require('@julusian/midi') as { Output: new () => MidiOutLike };
      return new midi.Output();
    },
  };
}

function findPortIndex(out: MidiOutLike, name: string): number {
  for (let i = 0; i < out.getPortCount(); i++) {
    if (out.getPortName(i).includes(name)) return i;
  }
  return -1;
}

type ClaimOk = {
  ok: true;
  release(): void;
  send(m: MidiMessage): Promise<DispatchResult>;
};

type ClaimConflict = {
  ok: false;
  reason: 'exclusive_owned';
  ownerSlug: string;
};

export class MidiOutPool {
  private outputs = new Map<string, { handle: MidiOutLike; ownerSlug: string }>();

  constructor(
    private readonly factory: MidiFactory = defaultMidiFactory(),
    private readonly log?: Logger,
  ) {}

  claim(portName: string, ownerSlug: string): ClaimOk | ClaimConflict {
    const existing = this.outputs.get(portName);
    if (existing) {
      return { ok: false, reason: 'exclusive_owned', ownerSlug: existing.ownerSlug };
    }
    const handle = this.factory.output();
    const idx = findPortIndex(handle, portName);
    if (idx < 0) throw new Error(`MIDI output port not found: ${portName}`);
    handle.openPort(idx);
    this.outputs.set(portName, { handle, ownerSlug });
    return {
      ok: true,
      release: () => this.release(portName),
      send: async (m) => {
        const t0 = performance.now();
        try {
          handle.sendMessage(m.bytes);
          return { ok: true, transport: 'midi' as const, latencyMs: performance.now() - t0 };
        } catch (err) {
          this.log?.error('midi send failed', { portName, error: String(err) });
          return { ok: false, transport: 'midi' as const, latencyMs: performance.now() - t0, error: String(err) };
        }
      },
    };
  }

  status(): Array<{ portName: string; ownerSlug: string }> {
    return Array.from(this.outputs.entries()).map(([portName, e]) => ({ portName, ownerSlug: e.ownerSlug }));
  }

  private release(portName: string): void {
    const e = this.outputs.get(portName);
    if (!e) return;
    try { e.handle.closePort(); } catch { /* ignore */ }
    this.outputs.delete(portName);
  }
}
