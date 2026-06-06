import * as Y from 'yjs';
import { vi } from 'vitest';
import type { Connection } from '../../../../pwa/src/lib/cuelistData.js';
import type { SideChannelClient } from '../../../../pwa/src/lib/sideChannel.js';

function makeMockSideChannel(): SideChannelClient {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
      return () => handlers.get(event)?.delete(cb);
    }),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    sendGoRequest: vi.fn(() => 'req-id'),
    sendArmRequest: vi.fn(),
  } as unknown as SideChannelClient;
}

function makeMockAwareness(localClientId: number) {
  const states = new Map<number, Record<string, unknown>>();
  const listeners = new Map<string, Set<() => void>>();

  // Seed local station so getPlayheadAuthorityClientId finds at least one entry
  states.set(localClientId, {});

  function fire(event: string) {
    listeners.get(event)?.forEach((fn) => fn());
  }

  return {
    setLocalState: vi.fn((state: Record<string, unknown>) => {
      states.set(localClientId, state);
      fire('change');
    }),
    setLocalStateField: vi.fn((field: string, value: unknown) => {
      const cur = states.get(localClientId) ?? {};
      states.set(localClientId, { ...cur, [field]: value });
      fire('change');
    }),
    getStates: vi.fn(() => states),
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    }),
    states,
    localClientId,
  };
}

export function makeTestConnection(): Connection & {
  awareness: ReturnType<typeof makeMockAwareness>;
  sideChannel: SideChannelClient;
} {
  const doc = new Y.Doc();
  const awareness = makeMockAwareness(doc.clientID);
  const sideChannel = makeMockSideChannel();

  return {
    doc,
    provider: {} as Connection['provider'],
    persistence: {} as Connection['persistence'],
    awareness: awareness as unknown as Connection['awareness'],
    sideChannel,
    disconnect: vi.fn(),
  } as unknown as Connection & {
    awareness: ReturnType<typeof makeMockAwareness>;
    sideChannel: SideChannelClient;
  };
}
