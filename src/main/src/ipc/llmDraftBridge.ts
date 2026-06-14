import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import type { LlmDraftClient } from '../caller/llmDraft.js';
import type { Cue } from 'showx-shared';

export interface LlmDraftBridgeDeps {
  llmDraft: LlmDraftClient;
}

export function registerLlmDraftBridge(deps: LlmDraftBridgeDeps, ipc: IpcMainBridge): void {
  ipc.handle(IPC.CALLER_LLM_STATUS, async () => {
    const enabled = await deps.llmDraft.isEnabled();
    return { enabled };
  });

  ipc.handle(IPC.CALLER_LLM_APIKEY_SET, async (_e: unknown, apiKey: string) => {
    await deps.llmDraft.setApiKey(apiKey);
    return { ok: true };
  });

  ipc.handle(
    IPC.CALLER_LLM_DRAFT,
    async (_e: unknown, cue: Cue, surroundingCues?: Cue[]) => {
      return deps.llmDraft.draftCallerLines(cue, surroundingCues);
    },
  );
}
