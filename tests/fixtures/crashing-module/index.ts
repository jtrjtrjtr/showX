import type { Module } from 'showx-shared';

const crasher: Module = {
  async init() { throw new Error('boom'); },
  async start() {},
  async stop() {},
  async teardown() {},
};

export default crasher;
