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
  /**
   * When true, the dispatch pipeline runs route resolution and validation but skips all
   * real transport sends. Results are prefixed [AUDITION] in the Dispatch Log.
   * No cue-complete event is emitted and the playhead/chain are not advanced.
   */
  audition?: boolean;
}

export interface SingleDispatchResult {
  ok: boolean;
  error?: string;
}
