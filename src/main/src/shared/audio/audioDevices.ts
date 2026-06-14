import { createRequire } from 'node:module';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

export interface AudioDevice {
  id: number;
  name: string;
  inputChannels: number;
  outputChannels: number;
  isDefaultInput: boolean;
  isDefaultOutput: boolean;
  preferredSampleRate: number;
}

export type AudioStatus = 'ok' | 'unavailable';

export interface AudioDeviceList {
  status: AudioStatus;
  devices: AudioDevice[];
}

// Minimal surface of the RtAudio class used here (keeps stubs testable).
export interface RtAudioDeviceInfo {
  id?: number;
  name?: string;
  inputChannels?: number;
  outputChannels?: number;
  isDefaultInput?: boolean;
  isDefaultOutput?: boolean;
  preferredSampleRate?: number;
}

export interface RtAudioLike {
  getDeviceCount(): number;
  getDeviceInfo(id: number): RtAudioDeviceInfo | null;
}

export interface AudifyFactory {
  createRtAudio(): RtAudioLike;
}

function defaultAudifyFactory(): AudifyFactory | null {
  try {
    const mod = _require('audify') as { RtAudio: new () => RtAudioLike };
    return { createRtAudio: () => new mod.RtAudio() };
  } catch {
    return null;
  }
}

export function enumerateAudioDevices(
  log?: Logger,
  factory?: AudifyFactory | null,
): AudioDeviceList {
  // Use injected factory for tests; fall back to the real audify module.
  const resolved = factory !== undefined ? factory : defaultAudifyFactory();

  if (!resolved) {
    log?.warn('audioDevices: audify not available (headless/CI) — returning []');
    return { status: 'unavailable', devices: [] };
  }

  try {
    const rt = resolved.createRtAudio();
    const count = rt.getDeviceCount();
    const devices: AudioDevice[] = [];
    for (let i = 0; i < count; i++) {
      const info = rt.getDeviceInfo(i);
      if (!info) continue;
      devices.push({
        id: info.id ?? i,
        name: info.name ?? `Device ${i}`,
        inputChannels: info.inputChannels ?? 0,
        outputChannels: info.outputChannels ?? 0,
        isDefaultInput: info.isDefaultInput ?? false,
        isDefaultOutput: info.isDefaultOutput ?? false,
        preferredSampleRate: info.preferredSampleRate ?? 44100,
      });
    }
    return { status: 'ok', devices };
  } catch (err) {
    log?.warn('audioDevices: enumeration failed', { err: String(err) });
    return { status: 'unavailable', devices: [] };
  }
}
