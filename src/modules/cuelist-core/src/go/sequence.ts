export class SequenceCounter {
  private current = 0;

  next(): number {
    return ++this.current;
  }

  peek(): number {
    return this.current;
  }

  /** Reset to 0 — only valid on process restart, never on show open. */
  reset(): void {
    this.current = 0;
  }
}
