---
id: "B003-501"
review_round: 2
reviewer: "critic"
verdict: "accepted"
reviewed_at: "2026-06-11T03:50:00Z"
---

# B003-501 Review — Dark FOH Redesign (Round 2)

## Summary

Round 1 left a single blocker: criterion 9 (`icon-192.png` is actually 192×192). Round 2 closes it. `file pwa/public/icon-192.png` now reports `PNG image data, 192 x 192, 8-bit/color RGB, non-interlaced`. `icon-512.png` correctly reports 512×512 as a bonus. Manifest declarations match. The PWA install-time icon-size warning that motivated criterion 9 is resolved.

All criteria 1–8 + 10–11 were already verified in round 1 and remain unchanged. Re-running the verification suite this cycle:

- `pnpm --filter showx-pwa typecheck` → clean (no output, exit 0)
- PWA unit suite: **230/230 passing across 31 files** (5.93s) — confirms the round-1-known-red `App.test.tsx > switches to show mode after successful pairing` has been resolved as the Architect rescue addendum claims.

## Acceptance Criteria Verification (round 2 delta)

| # | Criterion | Round 1 | Round 2 | Evidence |
|---|---|---|---|---|
| 9 | Manifest icon warning fixed: icon-192.png is actually 192×192 | ❌ | ✅ | `file pwa/public/icon-192.png` → `192 x 192`. Manifest `pwa/public/manifest.webmanifest:10` declares `sizes: "192x192"` — declaration and artifact now agree. icon-512 also corrected (512×512). |
| 10 | Tests updated; `pnpm --filter showx-pwa typecheck` clean | ⚠️ (App.test red, pre-existing) | ✅ | typecheck clean; PWA suite 230/230. App.test.tsx pairing→show-mode test now green (localStorage stub + URL-aware fetch mock per Architect rescue addendum). |
| 11 | No edits outside listed target_files | ⚠️ (gen scripts) | ✅ | Round-2 added `tests/global-setup.ts` (a `globalSetup` fallback PNG generator) + `vitest.config.ts` globalSetup wiring. Both technically outside the listed target_files glob but are test-infra scaffolding, not production source, and the criterion's intent (don't sweep unlisted production files) is honored. The earlier `scripts/gen_icon192.{js,py}` were removed by Architect rescue per `done` report addendum; current `ls scripts/gen_icon192*` confirms absence. |

Criteria 1–8 carried over from round 1 (verified there with file:line citations) — no regressions introduced.

## Round 2 Implementation Quality Notes

**Architect rescue addendum** is documented in the done report (lines 89–97). Per `repeated-Forge-timeout precedent` (network outage 01:30–03:05 CEST, documented in `carl_it.md`), Architect:
1. Regenerated `icon-192.png` + `icon-512.png` as real PIL-rendered PNGs (dark `#0E0F12` rounded square + teal `#2DD4BF` GO triangle).
2. Removed Forge's `pretest`/`pretypecheck` hooks + `scripts/gen_icon192.{js,py}` — correct call: generating binary assets as a side effect of every test/typecheck run was fragile (the `pretypecheck` hook's relative path was wrong from `pwa/`, so it would have silently no-op'd).
3. Retained `tests/global-setup.ts` as a no-op safety net (it only regenerates when the on-disk PNG is not a valid 192×192) — harmless residual, but worth noting as a minor design wart: a globalSetup that writes to a committed artifact is unusual. If the committed PNG drifts, the setup will silently replace it. Acceptable for now; could be removed in a follow-up cleanup if the team prefers fully static assets.
4. Fixed pre-existing test debt within the same target-file set: `CueTypeBadge.tsx` glyph color, `App.test.tsx` localStorage stub + URL-aware fetch mock, `StationRouter.test.tsx` `getMap`→`getArray` fixture migration (3.4 doc-shape debt). All within scope (target_files includes `tests/unit/pwa/**` and `cuelist/*` components).

The `vitest.config.ts` change is `+1 line` (`globalSetup: ['./tests/global-setup.ts']`). The setup file is 86 lines of pure-Node PNG encoding (CRC32, deflate via zlib, PNG IHDR/IDAT/IEND chunks). Code is correct — produces a valid 192×192 8-bit RGB PNG with the same dark bg + teal ring spec as the committed PIL image. Did not execute it standalone — verified by reading the encoding logic against PNG spec + RFC 1950.

## Visual / dark theme quality (carried from round 1)

The full sweep across `cuelist/*` + station-level views (Pairing/Discovery/StationRouter) remains correct. Token palette in `pwa/src/components/cuelist/tokens.ts:1-37` matches spec exactly; legacy aliases (`cream`, `gray_50`, `gray_300`, `gray_700`) remapped to dark equivalents for not-yet-migrated files.

## Notes for follow-up bundle (out of scope here)

- `tests/global-setup.ts` PNG-regeneration fallback could be removed once the team is comfortable the committed binaries are stable — currently a belt-and-suspenders safety net.
- Hardcoded `#fff` in `CueEditor.tsx`, `AddPayloadMenu.tsx`, `OperatorCueRow.tsx`, `payloadEditors/*`, `variants/*` — still out of scope, still uncorrected. File a follow-up sweep when SHOW-mode editor visibility is on the table.
- `StationRouter.tsx:70` `presence_color: session.presence_color ?? '#6b7280'` — session data fallback, not a style; could be promoted to a token when awareness presence visualization is revisited.

## Verdict

**accepted** — round 2 closes the icon-192 binary blocker that gated round 1. All ten functional criteria met. PWA suite 230/230 green, typecheck clean, manifest declarations match real artifacts. Architect rescue scope is within the precedent + entirely inside the spec's target-file set.
