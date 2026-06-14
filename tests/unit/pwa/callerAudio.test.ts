// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallerAudio, type CallerManifestPWA, type MockableAudio, type CallerAudioState } from '../../../pwa/src/lib/callerAudio.js';
import type { CallerSideChannel } from '../../../pwa/src/lib/callerAudio.js';

// ── Mock audio element ────────────────────────────────────────────────────────

class MockAudio implements MockableAudio {
  src: string;
  onended: (() => void) | null = null;
  paused = false;
  played = false;
  playError: Error | null = null;

  constructor(url: string) {
    this.src = url;
  }

  play(): Promise<void> {
    if (this.playError) return Promise.reject(this.playError);
    this.played = true;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.played = false;
  }
}

// ── Mock side channel ─────────────────────────────────────────────────────────

type SCEventMap = {
  'standby.broadcast': { cue_id: string; cuelist_id: string; departments: string[]; standby: boolean };
  'go.dispatched': { cue_id: string; cuelist_id: string; historic: boolean };
};

class MockSideChannel implements CallerSideChannel {
  private listeners = new Map<string, Set<(e: unknown) => void>>();

  on<K extends keyof SCEventMap>(event: K, cb: (e: SCEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as (e: unknown) => void);
    return () => this.listeners.get(event)?.delete(cb as (e: unknown) => void);
  }

  emit<K extends keyof SCEventMap>(event: K, payload: SCEventMap[K]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }
}

// ── Test manifest ─────────────────────────────────────────────────────────────

function makeManifest(entries: CallerManifestPWA['entries'] = {}): CallerManifestPWA {
  return { schema_version: 1, generated_at: '2026-01-01T00:00:00Z', entries };
}

const FULL_MANIFEST = makeManifest({
  'cue1_LX_standby': { cue_id: 'cue1', dept: 'LX', kind: 'standby', fileUrl: 'file:///show/media/cue1_LX_standby.mp3', text: 'LX standby', duration_secs: 1.2 },
  'cue1_SX_standby': { cue_id: 'cue1', dept: 'SX', kind: 'standby', fileUrl: 'file:///show/media/cue1_SX_standby.mp3', text: 'SX standby', duration_secs: 1.1 },
  'cue1_go':         { cue_id: 'cue1', dept: null,  kind: 'go',      fileUrl: 'file:///show/media/cue1_go.mp3',         text: 'GO',         duration_secs: 0.5 },
  'cue2_LX_standby': { cue_id: 'cue2', dept: 'LX', kind: 'standby', fileUrl: 'file:///show/media/cue2_LX_standby.mp3', text: 'LX standby 2', duration_secs: 1.3 },
  'cue2_go':         { cue_id: 'cue2', dept: null,  kind: 'go',      fileUrl: 'file:///show/media/cue2_go.mp3',         text: 'GO 2',       duration_secs: 0.5 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface EngineOpts {
  manifest?: CallerManifestPWA | null;
  enabled?: boolean;
}

async function makeEngine({ manifest = FULL_MANIFEST, enabled = true }: EngineOpts = {}) {
  const sc = new MockSideChannel();
  const audios: MockAudio[] = [];
  const getManifest = vi.fn().mockResolvedValue(manifest);

  const engine = new CallerAudio({
    sideChannel: sc,
    getManifest,
    _createAudio: (url) => {
      const a = new MockAudio(url);
      audios.push(a);
      return a;
    },
  });

  if (enabled) await engine.setEnabled(true);

  return { engine, sc, audios, getManifest };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CallerAudio', () => {
  describe('standby.broadcast → plays standby audio', () => {
    it('plays the correct dept standby file', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });

      expect(audios).toHaveLength(1);
      expect(audios[0].src).toBe('file:///show/media/cue1_LX_standby.mp3');
      expect(audios[0].played).toBe(true);
      expect(engine.getState()).toBe('playing-standby');

      engine.destroy();
    });

    it('aggregate: multiple departments — plays first available dept audio', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX', 'SX'], standby: true });

      expect(audios).toHaveLength(1);
      // LX is first, so LX audio is used
      expect(audios[0].src).toBe('file:///show/media/cue1_LX_standby.mp3');
      expect(engine.getState()).toBe('playing-standby');

      engine.destroy();
    });

    it('stale standby cancel: new standby cancels previous', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios[0].played).toBe(true);
      expect(audios[0].paused).toBe(false);

      // New standby arrives — previous should be cancelled
      sc.emit('standby.broadcast', { cue_id: 'cue2', cuelist_id: 'cl1', departments: ['LX'], standby: true });

      expect(audios[0].paused).toBe(true);
      expect(audios).toHaveLength(2);
      expect(audios[1].src).toBe('file:///show/media/cue2_LX_standby.mp3');
      expect(audios[1].played).toBe(true);
      expect(engine.getState()).toBe('playing-standby');

      engine.destroy();
    });

    it('standby=false → cancels standby and returns to idle', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(engine.getState()).toBe('playing-standby');

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: false });

      expect(audios[0].paused).toBe(true);
      expect(engine.getState()).toBe('idle');

      engine.destroy();
    });

    it('missing audio for cue → no-audio state', async () => {
      const { engine, sc, audios } = await makeEngine();

      // cue99 has no manifest entries
      sc.emit('standby.broadcast', { cue_id: 'cue99', cuelist_id: 'cl1', departments: ['LX'], standby: true });

      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('no-audio');

      engine.destroy();
    });
  });

  describe('go.dispatched → plays go audio', () => {
    it('plays the correct go file', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: false });

      expect(audios).toHaveLength(1);
      expect(audios[0].src).toBe('file:///show/media/cue1_go.mp3');
      expect(audios[0].played).toBe(true);
      expect(engine.getState()).toBe('playing-go');

      engine.destroy();
    });

    it('historic go.dispatched is ignored — no audio played', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: true });

      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('idle');

      engine.destroy();
    });

    it('missing go audio → no-audio state', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('go.dispatched', { cue_id: 'cue99', cuelist_id: 'cl1', historic: false });

      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('no-audio');

      engine.destroy();
    });
  });

  describe('disabled → silent', () => {
    it('does not play any audio when disabled', async () => {
      const { engine, sc, audios } = await makeEngine({ enabled: false });

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: false });

      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('idle');

      engine.destroy();
    });

    it('disable after enable → stops current playback', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios[0].played).toBe(true);

      await engine.setEnabled(false);

      expect(audios[0].paused).toBe(true);
      expect(engine.getState()).toBe('idle');

      // Further events should be silent
      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: false });
      expect(audios).toHaveLength(1);

      engine.destroy();
    });
  });

  describe('state changes', () => {
    it('returns to idle when audio ends', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(engine.getState()).toBe('playing-standby');

      // Simulate audio element ending
      audios[0].onended?.();

      expect(engine.getState()).toBe('idle');

      engine.destroy();
    });

    it('onStateChange listener fires on each transition', async () => {
      const { engine, sc } = await makeEngine();
      const states: CallerAudioState[] = [];
      engine.onStateChange((s) => states.push(s));

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: false });

      expect(states).toEqual(['playing-standby', 'idle']);

      engine.destroy();
    });
  });

  describe('manifest loading', () => {
    it('fetches manifest exactly once when first enabled', async () => {
      const { getManifest } = await makeEngine();
      expect(getManifest).toHaveBeenCalledTimes(1);
    });

    it('no-manifest case: events result in no-audio state', async () => {
      const { engine, sc, audios } = await makeEngine({ manifest: null });

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });

      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('no-audio');

      engine.destroy();
    });

    it('events before setEnabled do not play audio', async () => {
      const sc = new MockSideChannel();
      const audios: MockAudio[] = [];
      const engine = new CallerAudio({
        sideChannel: sc,
        getManifest: vi.fn().mockResolvedValue(FULL_MANIFEST),
        _createAudio: (url) => { const a = new MockAudio(url); audios.push(a); return a; },
      });

      // Emit before enabling
      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios).toHaveLength(0);

      engine.destroy();
    });
  });

  describe('output device / setSinkId', () => {
    it('setSinkId called on audio element with selected device ID', async () => {
      const sc = new MockSideChannel();
      const audios: MockAudio[] = [];
      const sinkIdCalls: string[] = [];

      class MockAudioWithSink extends MockAudio {
        override setSinkId(deviceId: string): Promise<void> {
          sinkIdCalls.push(deviceId);
          return Promise.resolve();
        }
      }

      const engine = new CallerAudio({
        sideChannel: sc,
        getManifest: vi.fn().mockResolvedValue(FULL_MANIFEST),
        _createAudio: (url) => {
          const a = new MockAudioWithSink(url);
          audios.push(a);
          return a;
        },
      });
      await engine.setEnabled(true);
      engine.setOutputDevice('device-abc');

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });

      // Wait for the async playUrl to complete
      await new Promise((r) => setTimeout(r, 0));

      expect(sinkIdCalls).toEqual(['device-abc']);
      expect(audios[0].played).toBe(true);

      engine.destroy();
    });

    it('default empty sinkId: setSinkId NOT called', async () => {
      const sc = new MockSideChannel();
      const sinkIdCalls: string[] = [];

      class MockAudioWithSink extends MockAudio {
        override setSinkId(deviceId: string): Promise<void> {
          sinkIdCalls.push(deviceId);
          return Promise.resolve();
        }
      }

      const engine = new CallerAudio({
        sideChannel: sc,
        getManifest: vi.fn().mockResolvedValue(FULL_MANIFEST),
        _createAudio: (url) => new MockAudioWithSink(url),
      });
      await engine.setEnabled(true);
      // sinkId stays '' (default)

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      await new Promise((r) => setTimeout(r, 0));

      expect(sinkIdCalls).toHaveLength(0);

      engine.destroy();
    });

    it('setSinkId throws → sinkId resets to default and onDeviceFallback fires', async () => {
      const sc = new MockSideChannel();
      const fallbackCalls: number[] = [];

      class MockAudioWithBadSink extends MockAudio {
        override setSinkId(_deviceId: string): Promise<void> {
          return Promise.reject(new DOMException('Device not found', 'NotFoundError'));
        }
      }

      const engine = new CallerAudio({
        sideChannel: sc,
        getManifest: vi.fn().mockResolvedValue(FULL_MANIFEST),
        _createAudio: (url) => new MockAudioWithBadSink(url),
      });
      await engine.setEnabled(true);
      engine.setOutputDevice('device-gone');
      engine.onDeviceFallback(() => fallbackCalls.push(1));

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      await new Promise((r) => setTimeout(r, 0));

      expect(fallbackCalls).toHaveLength(1);
      engine.destroy();
    });

    it('audio stopped during setSinkId await → play is NOT called', async () => {
      const sc = new MockSideChannel();
      const playCount: number[] = [];
      let resolveSink!: () => void;

      class MockAudioSlow extends MockAudio {
        override setSinkId(_deviceId: string): Promise<void> {
          return new Promise<void>((resolve) => { resolveSink = resolve; });
        }
        override play(): Promise<void> {
          playCount.push(1);
          return Promise.resolve();
        }
      }

      const engine = new CallerAudio({
        sideChannel: sc,
        getManifest: vi.fn().mockResolvedValue(FULL_MANIFEST),
        _createAudio: (url) => new MockAudioSlow(url),
      });
      await engine.setEnabled(true);
      engine.setOutputDevice('device-slow');

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      // Interrupt before setSinkId resolves
      engine.interrupt();
      resolveSink();
      await new Promise((r) => setTimeout(r, 0));

      // play should NOT have been called — audio was stopped mid-await
      expect(playCount).toHaveLength(0);
      expect(engine.getState()).toBe('manual');

      engine.destroy();
    });
  });

  describe('interrupt / manual mode', () => {
    it('interrupt() stops current playback immediately and state → manual', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(engine.getState()).toBe('playing-standby');
      expect(audios[0].played).toBe(true);

      engine.interrupt();

      expect(audios[0].paused).toBe(true);
      expect(engine.getState()).toBe('manual');

      engine.destroy();
    });

    it('interrupt() state fires onStateChange listeners', async () => {
      const { engine, sc } = await makeEngine();
      const states: CallerAudioState[] = [];
      engine.onStateChange((s) => states.push(s));

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      engine.interrupt();

      expect(states).toContain('manual');
      expect(states[states.length - 1]).toBe('manual');

      engine.destroy();
    });

    it('standby.broadcast is suppressed while in manual mode', async () => {
      const { engine, sc, audios } = await makeEngine();

      engine.interrupt();
      expect(engine.getState()).toBe('manual');

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('manual');

      engine.destroy();
    });

    it('go.dispatched is suppressed while in manual mode', async () => {
      const { engine, sc, audios } = await makeEngine();

      engine.interrupt();
      expect(engine.getState()).toBe('manual');

      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: false });
      expect(audios).toHaveLength(0);
      expect(engine.getState()).toBe('manual');

      engine.destroy();
    });

    it('resumeAI() returns to idle without retro-playing anything', async () => {
      const { engine, sc, audios } = await makeEngine();

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      engine.interrupt();
      expect(engine.getState()).toBe('manual');

      engine.resumeAI();

      expect(audios).toHaveLength(1);
      expect(engine.getState()).toBe('idle');

      engine.destroy();
    });

    it('after resumeAI(), standby events play normally', async () => {
      const { engine, sc, audios } = await makeEngine();

      engine.interrupt();
      engine.resumeAI();
      expect(engine.getState()).toBe('idle');

      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios).toHaveLength(1);
      expect(audios[0].src).toBe('file:///show/media/cue1_LX_standby.mp3');
      expect(engine.getState()).toBe('playing-standby');

      engine.destroy();
    });

    it('after resumeAI(), go events play normally', async () => {
      const { engine, sc, audios } = await makeEngine();

      engine.interrupt();
      engine.resumeAI();

      sc.emit('go.dispatched', { cue_id: 'cue1', cuelist_id: 'cl1', historic: false });
      expect(audios).toHaveLength(1);
      expect(audios[0].src).toBe('file:///show/media/cue1_go.mp3');
      expect(engine.getState()).toBe('playing-go');

      engine.destroy();
    });

    it('setEnabled(false) clears manual mode and returns to idle', async () => {
      const { engine, sc, audios } = await makeEngine();

      engine.interrupt();
      expect(engine.getState()).toBe('manual');

      await engine.setEnabled(false);
      expect(engine.getState()).toBe('idle');

      // Re-enable and verify events play again
      await engine.setEnabled(true);
      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios).toHaveLength(1);
      expect(engine.getState()).toBe('playing-standby');

      engine.destroy();
    });
  });

  describe('destroy', () => {
    it('unsubscribes from side-channel on destroy', async () => {
      const { engine, sc, audios } = await makeEngine();
      engine.destroy();

      // After destroy, events must not trigger audio
      sc.emit('standby.broadcast', { cue_id: 'cue1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
      expect(audios).toHaveLength(0);
    });
  });
});
