import type * as Y from 'yjs';
import type { EventBus, Logger, MasterClock } from 'showx-shared';

export interface ScheduledFire {
  cuelist_id: string;
  cue_id: string;
  trigger_mode: 'auto_follow' | 'auto_continue' | 'timecode';
  scheduled_at: number;
  fire_at: number;
  source_cue_id: string;
  timer_id?: ReturnType<typeof setTimeout>;
}

export interface FireEvent {
  cuelist_id: string;
  cue_id: string;
  ts: number;
}

export interface TriggerEngineDeps {
  doc: Y.Doc;
  events: EventBus;
  log: Logger;
  abortSignal: AbortSignal;
  /** Master clock for timecode trigger firing. Optional — timecode cues are inert when absent. */
  clock?: MasterClock;
}
