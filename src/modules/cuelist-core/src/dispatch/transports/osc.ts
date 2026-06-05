import { hostname } from 'node:os';
import type { OscPayload, OscArg } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import { resolveDeviceTransport } from '../resolveRouting.js';
import type { RoutingEntry, OscTransport } from '../resolveRouting.js';

export function buildSourceURI(doc: import('yjs').Doc): string {
  const showId = doc.getMap('meta').get('show_id') as string;
  return `showx://${hostname()}/${showId}`;
}

function convertArg(a: OscArg): number | string | boolean | Buffer | null {
  switch (a.type) {
    case 'int':
    case 'float':
      return a.value;
    case 'string':
      return a.value;
    case 'bool':
      return a.value;
    case 'blob':
      return Buffer.from(a.value, 'base64');
    case 'nil':
      return null;
  }
}

/** Convert typed OscArg[] to the wire format, skipping nil values. Appends sourceURI as trailing string. */
export function buildOscArgs(args: OscArg[], sourceURI: string): Array<number | string | boolean | Buffer> {
  const out: Array<number | string | boolean | Buffer> = [];
  for (const a of args) {
    const v = convertArg(a);
    if (v !== null) out.push(v);
  }
  out.push(sourceURI);
  return out;
}

export async function dispatchOsc(
  payload: OscPayload,
  routing: Record<string, RoutingEntry>,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const transport = resolveDeviceTransport(payload.device_id, 'osc', routing);
  if (!transport) {
    return { ok: false, error: `no routing for device ${payload.device_id}` };
  }
  if (transport.kind !== 'osc') {
    return { ok: false, error: `device ${payload.device_id} not mapped to osc transport (got ${transport.kind})` };
  }
  const osc = transport as OscTransport;
  const args = buildOscArgs(payload.args, buildSourceURI(deps.doc));
  const result = await deps.output.send({
    transport: 'osc',
    host: osc.host,
    port: osc.port,
    address: payload.address,
    args,
  });
  return { ok: result.ok, error: result.error };
}
