export type SideChannelEvent =
  | { type: 'go'; cue_id: string; timestamp: number }
  | { type: 'presence'; device_id: string; display_name: string; online: boolean };

export interface SideChannel {
  onEvent(cb: (e: SideChannelEvent) => void): () => void;
  destroy(): void;
}

export function createSideChannel(opts: {
  host: string;
  port: number;
  showId: string;
  token: string;
}): SideChannel {
  const listeners = new Set<(e: SideChannelEvent) => void>();
  const url = `ws://${opts.host}:${opts.port}/events/${opts.showId}?token=${encodeURIComponent(opts.token)}`;
  let ws: WebSocket | null = null;
  let stopped = false;
  const seenIds = new Set<string>();

  function emit(e: SideChannelEvent) {
    for (const l of listeners) l(e);
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as SideChannelEvent & { id?: string };
        // idempotency: skip duplicate event IDs
        if (parsed.id) {
          if (seenIds.has(parsed.id)) return;
          seenIds.add(parsed.id);
          if (seenIds.size > 1000) {
            const first = seenIds.values().next().value;
            if (first !== undefined) seenIds.delete(first);
          }
        }
        emit(parsed);
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      if (!stopped) setTimeout(connect, 2000);
    };
  }

  connect();

  return {
    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      stopped = true;
      ws?.close();
      listeners.clear();
    },
  };
}
