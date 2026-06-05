import * as Y from 'yjs';
import type { OutputDispatcher, EventBus, Logger } from 'showx-shared';

export interface DispatchDeps {
  doc: Y.Doc;
  /** show_id for event emission and source URI construction */
  show_id: string;
  /** cuelist_id the firing cue belongs to — needed for group child lookup and event emission */
  cuelist_id: string;
  output: OutputDispatcher;
  events: EventBus;
  log: Logger;
  abortSignal: AbortSignal;
}

export interface SingleDispatchResult {
  ok: boolean;
  error?: string;
}
