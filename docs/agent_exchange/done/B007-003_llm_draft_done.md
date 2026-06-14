---
id: "B007-003"
title: "LLM draft caller lines (Claude) into editable fields"
status: "done"
round: 1
forge_ended_at: "2026-06-14T04:50:00Z"
---

## Summary

Implemented the optional LLM (Claude) draft layer for caller lines. Main process calls
Anthropic API with cue context, returns drafted standby/GO text flagged as `source: 'llm'`
into the existing CallerLinesEditor review flow. Graceful fallback to deterministic on no
key or any error. PWA shows "Draft with AI" button + review panel before lines apply.

## Files changed

### New files
- `src/main/src/caller/llmDraft.ts` — `LlmDraftClient` class: `isEnabled`, `setApiKey`,
  `draftCallerLines(cue, surroundingCues?)`. Uses `fetch` directly (no new npm dep).
  Inline `deterministicFallback()` mirrors cuelist-core's `generateCallerLines` without
  cross-rootDir import.
- `src/main/src/ipc/llmDraftBridge.ts` — `registerLlmDraftBridge` wires 3 IPC handlers.
- `tests/unit/main/caller/llmDraft.test.ts` — 13 tests covering LlmDraftClient.
- `tests/unit/ipc/llmDraftBridge.test.ts` — 5 tests covering the IPC bridge.

### Modified files
- `src/main/src/ipc/channels.ts` — 3 new constants: `CALLER_LLM_STATUS`, `CALLER_LLM_APIKEY_SET`,
  `CALLER_LLM_DRAFT`.
- `src/main/src/ipc/index.ts` — `llmDraft?: LlmDraftBridgeDeps` in `IpcDeps`; registration
  in `registerIpcHandlers`.
- `pwa/src/components/cuelist/CallerLinesEditor.tsx` — `AiDraftResult` type, `AiDraftState`
  type, `onAiDraft?` prop, "Draft with AI" button + review panel UI.
- `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` — 8 new tests in
  "Draft with AI" describe block.

## Implementation decisions

**No new npm dependency:**
ElevenLabsClient pattern repeated — raw `fetch` to `https://api.anthropic.com/v1/messages`
with `x-api-key` / `anthropic-version: 2023-06-01` headers. No `@anthropic-ai/sdk` needed.

**Model chosen: `claude-haiku-4-5-20251001`**
Appropriate for this repetitive short-text generation task: fast, cost-effective per cue.
Constant at top of `llmDraft.ts` for easy upgrade.

**Inline fallback, not cross-package import:**
`src/main/tsconfig.json` has `rootDir: src` — importing directly from
`src/modules/cuelist-core/src/caller/generateCallerLines.ts` violates it. Instead,
a private `deterministicFallback()` function in `llmDraft.ts` replicates the same pure
logic (7 lines). Comment in code notes this mirrors the cuelist-core function.

**SecretStore key: `'anthropic-api-key'`**
Consistent with `'elevenlabs-api-key'` pattern. Separate IPC channel
`CALLER_LLM_APIKEY_SET` to set it.

**DraftResult type (main process) vs AiDraftResult type (PWA):**
The `DraftResult` type lives in `src/main/src/caller/llmDraft.ts` for use in the IPC
bridge. The PWA defines its own `AiDraftResult` in `CallerLinesEditor.tsx` (same shape)
to avoid importing from main process. They serialize cleanly over IPC.

**Flag is in the IPC response, not stored in CallerLineGroup:**
`CallerLineGroup` (shared type, not in target_files) has no `source` field.
The `source: 'llm' | 'deterministic'` is transient — present in the `DraftResult`
returned by the IPC handler, shown in the review panel. Once the user clicks "Accept draft",
`onChange(lines)` is called with a plain `CallerLineGroup`. This satisfies the
acceptance criterion ("flagged as LLM-drafted so the showcaller knows what to review")
via the review UI itself — the showcaller must explicitly accept before lines land.

**CueEditDialog wiring not in this task:**
`CueEditDialog.tsx` is outside target_files. The `onAiDraft` prop on CallerLinesEditor
is optional — CueEditDialog continues working unchanged. A follow-up task can add the
IPC call in CueEditDialog or a parent component to wire `onAiDraft`.

**Markdown stripping in response parser:**
LLM sometimes wraps JSON in ` ```json ... ``` ` fences. Parser strips them before
JSON.parse. Falls back to deterministic on any parse failure.

## Tests run

```
✓ tests/unit/main/caller/llmDraft.test.ts  (13 tests)
✓ tests/unit/ipc/llmDraftBridge.test.ts  (5 tests)
✓ tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx  (30 tests — 22 existing + 8 new)

Test Files  164 passed (164)
     Tests  2085 passed (2085)

Duration  13.12s
```

`pnpm -r typecheck` clean.

## Notes for Critic

- `deterministicFallback` duplication vs cuelist-core `generateCallerLines` is intentional
  (rootDir constraint); both are single-file pure functions that can be kept in sync manually.
- `onAiDraft` is async — the loading state uses `void handleAiDraft()` to correctly suppress
  the unhandled-promise lint rule while keeping the onClick handler synchronous.
- The 3 new IPC channels follow existing naming convention (`caller:*`).
- Shell wiring (passing `llmDraft: new LlmDraftClient(secrets)` to `registerIpcHandlers`) is
  left to the Shell module — same pattern as the optional `caller` deps.
- No edits outside target_files confirmed.
