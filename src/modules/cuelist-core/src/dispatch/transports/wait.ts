import type { WaitPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';

export async function dispatchWait(
  payload: WaitPayload,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, payload.duration_ms);
    deps.abortSignal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
  return { ok: true };
}
