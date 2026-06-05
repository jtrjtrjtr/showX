import type { LxRefPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import { resolveDeviceTransport } from '../resolveRouting.js';
import type { RoutingEntry, OscTransport } from '../resolveRouting.js';

export async function dispatchLxRef(
  payload: LxRefPayload,
  routing: Record<string, RoutingEntry>,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const transport = resolveDeviceTransport(payload.device_id, 'lx_ref', routing);
  if (!transport || transport.kind !== 'osc') {
    return { ok: false, error: `no lx_ref → osc routing for device ${payload.device_id}` };
  }
  const osc = transport as OscTransport;
  const encoding = osc.encoding ?? 'eos';

  let address: string;
  let args: Array<number | string | boolean | Buffer> = [];

  switch (encoding) {
    case 'eos':
      address = `/eos/cue/${payload.cue_list}/${payload.cue_number}/fire`;
      break;
    case 'ma3':
      address = `/cmd`;
      args = [`GO Cue ${payload.cue_number} List ${payload.cue_list}`];
      break;
    case 'hog':
      address = `/hog/playback/go/${payload.cue_list}.${payload.cue_number}`;
      break;
    case 'chamsys':
      address = `/pb/${payload.cue_list}/go`;
      args = [payload.cue_number];
      break;
    case 'qlab':
      address = `/cue/${payload.cue_number}/go`;
      break;
    default:
      return { ok: false, error: `unsupported lx encoding ${encoding as string}` };
  }

  const result = await deps.output.send({
    transport: 'osc',
    host: osc.host,
    port: osc.port,
    address,
    args,
  });
  return { ok: result.ok, error: result.error };
}
