import * as Y from 'yjs';
import type { ShowMode, ModuleContext, ShowModeChangeEvent } from 'showx-shared';
import { writeSnapshot, type SnapshotResult } from './snapshot.js';
import { appendHistoryEvent } from '../persistence/historyJsonl.js';
import { getCuelists, getCues } from '../document/cuelist.js';
import { preGenerateCallerAudio, type TtsInterface, type PreGenLogger } from '../caller/preGenerate.js';

import { getMode } from './modeState.js';
export { getMode } from './modeState.js';
export type Mode = ShowMode;

export interface PreGenOptions {
  ttsClient: TtsInterface;
  voiceId: string | null | undefined;
  logger?: PreGenLogger;
}

export interface TransitionContext {
  doc: Y.Doc;
  pkgPath: string;
  byOperatorId: string;
  operatorRole?: 'stage_manager' | 'operator' | 'director' | 'watcher';
  ctx?: Pick<ModuleContext, 'events'>;
  /** Optional: pre-generate caller audio on REHEARSAL→SHOW. Skipped gracefully if absent. */
  preGen?: PreGenOptions;
}

export type TransitionResult =
  | { ok: true; from: Mode; to: Mode; snapshotId?: string }
  | { ok: false; reason: 'no_op' | 'not_sm' | 'package_unwritable' | 'unknown_target' };

export type GateResult =
  | { ok: true }
  | { ok: false; reason: 'no_op' | 'not_sm' | 'unknown_target' };

export function canTransitionMode(
  doc: Y.Doc,
  _byOperatorId: string,
  target: Mode,
  operatorRole?: string,
): GateResult {
  const current = getMode(doc);
  if (target !== 'rehearsal' && target !== 'show') return { ok: false, reason: 'unknown_target' };
  if (current === target) return { ok: false, reason: 'no_op' };
  if (operatorRole !== 'stage_manager') return { ok: false, reason: 'not_sm' };
  return { ok: true };
}

export async function transitionMode(
  target: Mode,
  params: TransitionContext,
): Promise<TransitionResult> {
  const { doc, pkgPath, byOperatorId, operatorRole, ctx } = params;
  const current = getMode(doc);

  const gate = canTransitionMode(doc, byOperatorId, target, operatorRole);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  let snapshotId: string | undefined;

  if (target === 'show') {
    const active = doc.getMap('meta').get('active_cuelist_id') as string;
    let snap: SnapshotResult;
    try {
      snap = await writeSnapshot(doc, active, pkgPath, byOperatorId);
    } catch {
      return { ok: false, reason: 'package_unwritable' };
    }
    snapshotId = snap.snapshotId;

    // Pre-generate caller audio before payload freeze (non-blocking: errors logged, not thrown)
    if (params.preGen) {
      const { ttsClient, voiceId, logger } = params.preGen;
      await preGenerateCallerAudio(doc, active, pkgPath, ttsClient, voiceId, logger).catch(
        (err: unknown) => {
          logger?.warn('caller.pregen.transition_hook_error', { error: String(err) });
        },
      );
    }

    const frozenAt = new Date().toISOString();
    doc.transact(() => {
      getCuelists(doc).forEach((cuelist) => {
        getCues(cuelist).forEach((cue) => {
          cue.set('payload_frozen_at', frozenAt);
        });
        if ((cuelist.get('id') as string) === active) {
          cuelist.set('show_snapshot_id', snapshotId);
        }
      });
      doc.getMap('meta').set('mode', 'show');
    });
  } else {
    doc.transact(() => {
      getCuelists(doc).forEach((cuelist) => {
        getCues(cuelist).forEach((cue) => {
          cue.set('payload_frozen_at', null);
        });
      });
      doc.getMap('meta').set('mode', 'rehearsal');
    });
  }

  await appendHistoryEvent(pkgPath, {
    ts: new Date().toISOString(),
    kind: 'mode_changed',
    from: current,
    to: target,
    by: byOperatorId,
    snapshot_id: snapshotId ?? null,
  });

  const event: ShowModeChangeEvent = {
    type: 'show-mode-change',
    show_id: doc.getMap('meta').get('show_id') as string,
    from: current,
    to: target,
    by_operator_id: byOperatorId,
  };
  ctx?.events.publish(event);

  return { ok: true, from: current, to: target, snapshotId };
}
