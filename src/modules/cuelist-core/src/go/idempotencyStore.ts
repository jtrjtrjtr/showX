import type { GoRequest, GoDispatched } from './goEventChannel.js';

interface Entry {
  show_id: string;
  request: GoRequest;
  dispatched?: GoDispatched;
  added_at: number;
}

/**
 * LRU idempotency store keyed by (show_id, request_id).
 * Prevents duplicate GO fires when a station retransmits the same request.
 * In-memory only — does not survive process restart (by design per out-of-scope spec).
 */
export class IdempotencyStore {
  private map = new Map<string, Entry>();

  constructor(public readonly maxSize: number) {}

  private key(show_id: string, request_id: string): string {
    return `${show_id}::${request_id}`;
  }

  has(show_id: string, request_id: string): boolean {
    return this.map.has(this.key(show_id, request_id));
  }

  mark(show_id: string, request_id: string, entry: { request: GoRequest; dispatched?: GoDispatched }): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
    this.map.set(this.key(show_id, request_id), { show_id, ...entry, added_at: Date.now() });
  }

  updateDispatched(show_id: string, request_id: string, dispatched: GoDispatched): void {
    const entry = this.map.get(this.key(show_id, request_id));
    if (entry) entry.dispatched = dispatched;
  }

  getDispatched(show_id: string, request_id: string): GoDispatched | undefined {
    return this.map.get(this.key(show_id, request_id))?.dispatched;
  }

  /**
   * Find the most recent GO request for a given show + cue.
   * Used to correlate cue-complete events back to the originating side-channel request.
   */
  findRecentRequest(show_id: string, cue_id: string): GoRequest | undefined {
    const entries = [...this.map.entries()].reverse();
    for (const [, e] of entries) {
      if (e.show_id === show_id && e.request.cue_id === cue_id) return e.request;
    }
    return undefined;
  }

  size(): number {
    return this.map.size;
  }
}
