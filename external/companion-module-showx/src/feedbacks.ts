import type { ShowXConnection } from './connection.js';

export interface ShowXFeedbackInstance {
  conn?: ShowXConnection;
}

export interface CompanionFeedbackDefinition {
  type: 'boolean' | 'advanced';
  name: string;
  defaultStyle?: Record<string, unknown>;
  options: unknown[];
  callback: () => boolean;
}

export function compileFeedbacks(
  instance: ShowXFeedbackInstance,
): Record<string, CompanionFeedbackDefinition> {
  return {
    connected: {
      type: 'boolean',
      name: 'Connection status (green = connected)',
      defaultStyle: { color: 0xffffff, bgcolor: 0x008000 },
      options: [],
      callback: () => instance.conn?.vars.connected === 1,
    },
    show_mode: {
      type: 'boolean',
      name: 'SHOW mode active (red border)',
      defaultStyle: { color: 0xffffff, bgcolor: 0xcc0000 },
      options: [],
      callback: () => instance.conn?.vars.mode === 'show',
    },
    cue_armed: {
      type: 'boolean',
      name: 'Cue armed (yellow pulse)',
      defaultStyle: { color: 0x000000, bgcolor: 0xffcc00 },
      options: [],
      callback: () => Boolean(instance.conn?.vars.armed_cue_label),
    },
    disconnected: {
      type: 'boolean',
      name: 'Disconnected (red = not connected)',
      defaultStyle: { color: 0xffffff, bgcolor: 0xcc0000 },
      options: [],
      callback: () => instance.conn?.vars.connected !== 1,
    },
  };
}
