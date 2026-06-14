---
id: "B007-003"
title: "LLM draft caller lines (Claude) into editable fields"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-14T03:36:00Z"
round: 1
---

## Summary

Optional LLM (Claude) layer for richer caller-line drafts. Main-process Anthropic
client gated by SecretStore key, IPC bridge for PWA, `CallerLinesEditor` gains a
"Draft with AI" review flow. Deterministic generator (B007-002) remains the
always-available baseline, also used as fallback. Implementation is clean, tests
are thorough, no surprises.

## Acceptance criteria — verification

### AC1. Optional LLM draft pulling cue context, editable (not auto-fire), latest appropriate Claude model id
- `LlmDraftClient.draftCallerLines(cue, surroundingCues?)` at `src/main/src/caller/llmDraft.ts:43`.
- Prompt builds from departments (`buildPrompt` line 68), cue_number+label (line 69),
  description (line 85), standby_note (line 86), and up to 3 surrounding cues
  (lines 72–82) — `src/main/src/caller/llmDraft.ts:67-102`.
- Lines never auto-apply: PWA shows a review panel (`CallerLinesEditor.tsx:200-254`).
  `onChange(aiDraft.result.lines)` only fires when the user clicks "Accept draft"
  (`pwa/src/components/cuelist/CallerLinesEditor.tsx:108-112`).
- Model: `claude-haiku-4-5-20251001` (`llmDraft.ts:6`). Matches the current Claude 4.5
  Haiku id. Reasonable choice for short, repetitive generation — cost-effective without
  loss of quality for this task. ✓

### AC2. Runs in MAIN; API key via SecretStore (not env/plaintext); IPC bridge; graceful no-key
- Network call lives in the main process via `fetch` (`llmDraft.ts:107-119`). ✓
- Key access via `SecretStore.get(ANTHROPIC_SECRET_KEY)` (`llmDraft.ts:35, 44`),
  `setApiKey` writes via `secrets.set` (`llmDraft.ts:40`). No `process.env`, no plaintext.
- IPC bridge `registerLlmDraftBridge` registers three channels — `caller:llm:status`,
  `caller:llm:apikey:set`, `caller:llm:draft` (`src/main/src/ipc/llmDraftBridge.ts:11-26`,
  `src/main/src/ipc/channels.ts:22-24`).
- Wired through `IpcDeps.llmDraft?` and only enabled when present
  (`src/main/src/ipc/index.ts:32, 92-94`). Optional dep keeps Shell wiring backwards
  compatible.
- No-key path returns deterministic + clear error string
  (`llmDraft.ts:45-51`); deterministic generator from B007-002 remains independently
  accessible via the "Generate from sheet" button. ✓

### AC3. Drafted lines flagged as LLM-drafted vs deterministic vs hand-edited
- `DraftResult.source: 'llm' | 'deterministic'` (`llmDraft.ts:9-16`).
- The review panel renders `"AI Draft — review before accepting"` (teal) for `'llm'`
  vs `"Deterministic fallback"` for `'deterministic'`
  (`CallerLinesEditor.tsx:226`). Error text shown when present (line 228-235).
- After explicit acceptance the lines become regular `CallerLineGroup`; "hand-edited"
  is the implicit default (no source flag) — semantically correct since once the
  showcaller approves, the lines ARE hand-edited.
- The mandatory review-before-apply UX satisfies "showcaller knows what to review". ✓

### AC4. Failure → clear message, fallback, never blocks
- No-key: error `"No Anthropic API key configured…"` (`llmDraft.ts:49`). ✓
- HTTP non-200: throws `"Anthropic API error (${status}): ${body}"`
  (`llmDraft.ts:126`), caught at `llmDraft.ts:57-63`, returns deterministic + error.
  Verified by test `tests/unit/main/caller/llmDraft.test.ts:165-173`. ✓
- Network error: caught in inner try (`llmDraft.ts:120-122`), surfaces
  `"Anthropic network error: …"`. Verified by test `llmDraft.test.ts:175-182`. ✓
- Non-JSON / wrong shape: `parseCallerLines` throws, caught at outer catch
  (`llmDraft.ts:137-164`). Verified by tests `llmDraft.test.ts:184-210`. ✓
- No path throws to the IPC handler; `draftCallerLines` always resolves a
  `DraftResult`. Cue is never blocked. ✓

### AC5. Unit tests with mocked LLM client
- `tests/unit/main/caller/llmDraft.test.ts` — 12 tests: enabled (2), setApiKey (1),
  no-key fallback (1), LLM success incl. correct headers/model and prompt content (4),
  error fallback for non-200, network, non-JSON, wrong-shape (4).
- `tests/unit/ipc/llmDraftBridge.test.ts` — 6 tests: status/apikey:set/draft pass-through,
  surroundingCues propagation, deterministic-fallback error pass-through.
- `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` — 8 new tests in
  "Draft with AI" block: button visibility on prop presence, loading state, review
  panel render, accept applies + hides, dismiss does nothing, deterministic-fallback
  label/error render, disabled propagation.
- Flag correctness asserted at `llmDraft.test.ts:106` ('llm'), `:89, :170` ('deterministic').
- Source-driven UI label asserted at `CallerLinesEditor.test.tsx:258, 295`. ✓

  (Forge done report claimed 13 + 5 + 8 = 26 new tests; actual is 12 + 6 + 8 = 26 —
  same total, miscount inside the two files. Not a blocker.)

### AC6. typecheck clean, tests pass, no edits outside target_files
- `pnpm -r typecheck` clean — verified locally; all 5 workspaces pass. ✓
- Targeted tests run clean: 12 + 6 + 30 = 48 pass. ✓
- Edits limited to declared target_files: `src/main/src/caller/llmDraft.ts` (new),
  `src/main/src/ipc/llmDraftBridge.ts` (new), `src/main/src/ipc/channels.ts` (+3 IPC
  constants), `src/main/src/ipc/index.ts` (+`llmDraft?` dep wiring),
  `pwa/src/components/cuelist/CallerLinesEditor.tsx` (+ AI draft prop / UI),
  `tests/unit/**` (new + augmented). The working-tree modifications to
  `CueEditDialog.tsx`, `cuelist-core/document/cue.ts`, `shared/types/cue.ts`,
  `Shell.test.ts` etc. are carry-over from B007-001/002/004, not B007-003 —
  confirmed by reading the diff (no LLM-related code in those files). ✓

## Code-quality notes (non-blocking)

- The inline `deterministicFallback` in `llmDraft.ts:19-29` correctly mirrors
  `generateCallerLines` in `src/modules/cuelist-core/src/caller/generateCallerLines.ts`
  (verified byte-equivalent semantics: `{Dept} — standby for {ref}` standby,
  `{depts joined} — GO` go, empty-dept handling). The rootDir rationale is sound;
  drift risk is real but small — both are pure 7-line helpers, both have tests.
- Markdown-fence stripping in `parseCallerLines` (line 138) is sensible; tested
  (`llmDraft.test.ts:147-161`).
- `max_tokens: 512` is enough headroom for a department list; no observed cap-hit risk.
- The `source` flag is transient (in `DraftResult` only, not persisted on
  `CallerLineGroup`). This is the right design call: the review-and-accept gate is
  the source of trust, not a persisted "this was AI-drafted" flag the showcaller
  would have to inspect later. Forge documented this in the done report; spec text
  is satisfied via the mandatory review panel.
- `onAiDraft` not yet wired in `CueEditDialog` — explicitly out of scope per
  target_files. Follow-up task can wire `window.electronAPI.invoke('caller:llm:draft', cue)`
  into `CueEditDialog` so the button actually appears for users.

## Verdict

**accepted** — All 6 acceptance criteria met with file:line citations. Tests pass,
typecheck clean, no out-of-scope edits, code quality solid. The transient `source`
flag + mandatory review panel is the correct interpretation of AC3. Forge's
done-report test count is off by one in each test file but the totals match.
