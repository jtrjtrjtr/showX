export class CycleDetector {
  private stack: string[] = [];

  enter(cue_id: string): void {
    this.stack.push(cue_id);
  }

  exit(): void {
    this.stack.pop();
  }

  contains(cue_id: string): boolean {
    return this.stack.includes(cue_id);
  }

  depth(): number {
    return this.stack.length;
  }

  snapshot(): string[] {
    return [...this.stack];
  }
}
