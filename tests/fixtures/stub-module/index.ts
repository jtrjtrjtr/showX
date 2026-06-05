import type { Module, ModuleContext } from 'showx-shared';

const calls: string[] = [];

const stub: Module = {
  async init(ctx: ModuleContext) { calls.push(`init:${ctx.slug}`); },
  async start() { calls.push('start'); },
  async stop() { calls.push('stop'); },
  async teardown() { calls.push('teardown'); },
};

export default stub;
export const __calls = calls;
