import type { Module, ModuleContext } from 'showx-shared';

const calls: string[] = [];

const depMod: Module = {
  async init(ctx: ModuleContext) { calls.push(`init:${ctx.slug}`); },
  async start() { calls.push('start'); },
  async stop() { calls.push('stop'); },
  async teardown() { calls.push('teardown'); },
};

export default depMod;
export const __calls = calls;
