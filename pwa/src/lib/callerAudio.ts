// Caller playback engine — B007-006
// Subscribes to standby.broadcast + go.dispatched side-channel events,
// resolves pre-generated audio from manifest, plays via HTMLAudioElement.
// Zero dependencies on Node.js — runs purely in the browser/Electron renderer.

// ── Manifest types (PWA-safe mirror of preGenerate.ts without Node.js imports) ──

export interface CallerMediaEntryPWA {
  cue_id: string;
  dept: string | null;
  kind: 'standby' | 'go';
  fileUrl: string;
  text: string;
  duration_secs: number;
}

export interface CallerManifestPWA {
  schema_version: 1;
  generated_at: string;
  entries: Record<string, CallerMediaEntryPWA>;
}

// ── Side-channel event shapes (subset used by caller) ─────────────────────────

export interface StandbyBroadcastEvt {
  cue_id: string;
  cuelist_id: string;
  departments: string[];
  standby: boolean;
}

export interface GoDispatchedEvt {
  cue_id: string;
  cuelist_id: string;
  historic: boolean;
}

// ── Injectable audio element abstraction (for testing) ────────────────────────

export interface MockableAudio {
  src: string;
  onended: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
  setSinkId?: (deviceId: string) => Promise<void>;
}

// ── State ─────────────────────────────────────────────────────────────────────

export type CallerAudioState = 'idle' | 'playing-standby' | 'playing-go' | 'no-audio' | 'manual';

// ── Side-channel subscription interface ──────────────────────────────────────

export interface CallerSideChannel {
  on(event: 'standby.broadcast', cb: (e: StandbyBroadcastEvt) => void): () => void;
  on(event: 'go.dispatched', cb: (e: GoDispatchedEvt) => void): () => void;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface CallerAudioOpts {
  sideChannel: CallerSideChannel;
  /** Async function that fetches the manifest (with file:// URLs) from main process. */
  getManifest(): Promise<CallerManifestPWA | null>;
  /** Injected in tests to control audio elements. Defaults to `new Audio(url)`. */
  _createAudio?: (url: string) => MockableAudio;
}

// ── CallerAudio class ─────────────────────────────────────────────────────────

export class CallerAudio {
  private enabled = false;
  private manualMode = false;
  private sinkId = '';
  private manifest: CallerManifestPWA | null = null;
  private manifestLoading = false;
  private currentAudio: MockableAudio | null = null;
  private state: CallerAudioState = 'idle';
  private stateListeners: Array<(s: CallerAudioState) => void> = [];
  private deviceFallbackListeners: Array<() => void> = [];
  private unsubs: Array<() => void> = [];

  constructor(private opts: CallerAudioOpts) {
    this.unsubs = [
      opts.sideChannel.on('standby.broadcast', (e) => this.handleStandby(e)),
      opts.sideChannel.on('go.dispatched', (e) => this.handleGo(e)),
    ];
  }

  getState(): CallerAudioState {
    return this.state;
  }

  onStateChange(cb: (s: CallerAudioState) => void): () => void {
    this.stateListeners.push(cb);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== cb);
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (enabled) {
      if (!this.manifest && !this.manifestLoading) {
        this.manifestLoading = true;
        try {
          this.manifest = await this.opts.getManifest();
        } finally {
          this.manifestLoading = false;
        }
      }
    } else {
      this.manualMode = false;
      this.stopCurrent();
      this.setState('idle');
    }
  }

  /** Immediately stop AI playback and latch into MANUAL mode — the showcaller speaks live. */
  interrupt(): void {
    this.stopCurrent();
    this.manualMode = true;
    this.setState('manual');
  }

  /** Exit MANUAL mode and return AI caller to IDLE — does NOT retro-play the interrupted line. */
  resumeAI(): void {
    this.manualMode = false;
    this.setState('idle');
  }

  /** Route playback to the given audio output device (e.g. the intercom channel). '' = system default. */
  setOutputDevice(deviceId: string): void {
    this.sinkId = deviceId;
  }

  /** Register a callback fired when the selected output device disappears (engine falls back to default). */
  onDeviceFallback(cb: () => void): () => void {
    this.deviceFallbackListeners.push(cb);
    return () => {
      this.deviceFallbackListeners = this.deviceFallbackListeners.filter((l) => l !== cb);
    };
  }

  /** Re-fetch the manifest (e.g. after a new pre-generation run). */
  async refreshManifest(): Promise<void> {
    this.manifest = await this.opts.getManifest();
  }

  destroy(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.stopCurrent();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private setState(s: CallerAudioState): void {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }

  private stopCurrent(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onended = null;
      this.currentAudio = null;
    }
  }

  private createAudio(url: string): MockableAudio {
    if (this.opts._createAudio) return this.opts._createAudio(url);
    // Cast: HTMLAudioElement is structurally compatible; setSinkId exists in Chromium/Electron
    // but is not in TypeScript's DOM lib — the cast is safe at runtime in Electron renderer.
    return new Audio(url) as unknown as MockableAudio;
  }

  private handleStandby(e: StandbyBroadcastEvt): void {
    if (!this.enabled || this.manualMode) return;

    if (!e.standby) {
      // Un-standby: cancel any active standby playback
      this.stopCurrent();
      this.setState('idle');
      return;
    }

    // Cancel stale standby before starting new one
    this.stopCurrent();

    if (!this.manifest) {
      // Manifest not yet loaded — show no-audio indicator
      this.setState('no-audio');
      return;
    }

    const url = this.resolveStandbyUrl(e.cue_id, e.departments);
    if (!url) {
      this.setState('no-audio');
      return;
    }

    void this.playUrl(url, 'playing-standby');
  }

  private handleGo(e: GoDispatchedEvt): void {
    if (!this.enabled || this.manualMode) return;
    // Skip historic events that arrive on reconnect — don't replay past audio
    if (e.historic) return;

    this.stopCurrent();

    if (!this.manifest) {
      this.setState('no-audio');
      return;
    }

    const url = this.resolveGoUrl(e.cue_id);
    if (!url) {
      this.setState('no-audio');
      return;
    }

    void this.playUrl(url, 'playing-go');
  }

  private resolveStandbyUrl(cueId: string, departments: string[]): string | null {
    if (!this.manifest) return null;
    // Try each department in order — first available wins.
    // For compound cues all dept standby texts are identical, so any dept audio works.
    for (const dept of departments) {
      const key = `${cueId}_${dept}_standby`;
      const entry = this.manifest.entries[key];
      if (entry) return entry.fileUrl;
    }
    return null;
  }

  private resolveGoUrl(cueId: string): string | null {
    if (!this.manifest) return null;
    const key = `${cueId}_go`;
    const entry = this.manifest.entries[key];
    return entry?.fileUrl ?? null;
  }

  private async playUrl(url: string, newState: CallerAudioState): Promise<void> {
    const audio = this.createAudio(url);
    this.currentAudio = audio;
    this.setState(newState);

    audio.onended = () => {
      if (this.currentAudio === audio) {
        this.currentAudio = null;
        this.setState('idle');
      }
    };

    if (this.sinkId && typeof audio.setSinkId === 'function') {
      try {
        await audio.setSinkId(this.sinkId);
      } catch {
        // Output device disappeared — fall back to system default and notify
        this.sinkId = '';
        for (const l of this.deviceFallbackListeners) l();
      }
    }

    // Guard: audio might have been stopped (interrupt/disable) during setSinkId await
    if (this.currentAudio !== audio) return;

    audio.play().catch(() => {
      if (this.currentAudio === audio) {
        this.currentAudio = null;
        this.setState('idle');
      }
    });
  }
}
