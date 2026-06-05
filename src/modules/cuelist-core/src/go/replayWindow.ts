/** Returns true when client_ts is older than 5 seconds (historic replay guard per data_model.md §8.4). */
export function isHistoricReplay(client_ts: string, now = Date.now()): boolean {
  const tsMs = Date.parse(client_ts);
  if (Number.isNaN(tsMs)) return false; // invalid timestamps are not flagged; caller rejects separately
  return tsMs < now - 5000;
}

export class RingBuffer<T = unknown> {
  private buf: T[] = [];

  constructor(public readonly capacity: number) {}

  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.capacity) this.buf.shift();
  }

  /**
   * Returns messages after the given sequence number.
   * When seq is beyond the retained window, returns all retained messages
   * (caller should detect gap via missing seq numbers).
   */
  since(seq: number, getSeq: (item: T) => number): T[] {
    return this.buf.filter((item) => getSeq(item) > seq);
  }

  /** All retained items, oldest first. */
  all(): T[] {
    return this.buf.slice();
  }

  size(): number {
    return this.buf.length;
  }
}
