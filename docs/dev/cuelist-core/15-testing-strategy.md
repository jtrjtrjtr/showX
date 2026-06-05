# 15 — Testing strategy

Test layout, mocking patterns, CRDT-merge testing, and the seams Forge / contributors need to use.

## Layout

```
tests/
├── unit/
│   ├── modules/cuelist-core/
│   │   ├── document/       # CRDT factories + mutators + crdt-merge
│   │   ├── persistence/    # showxPackage + migration + recovery
│   │   ├── mode/           # REHEARSAL/SHOW transitions + lock guards
│   │   ├── views/          # filter + highlights + viewProfiles
│   │   ├── cue/            # compoundCue + invariants + payloadOps
│   │   ├── trigger/        # scheduler + triggerEngine
│   │   ├── go/             # sequence + replayWindow + idempotency + authority + goEventChannel
│   │   ├── dispatch/       # payloadDispatch + resolveRouting + transports/*
│   │   ├── catalog/        # cueCatalog + summarize
│   │   ├── import/         # csvImport + dialects + heuristics
│   │   ├── export/         # showxExport + singleFile + pdfExport
│   │   ├── ui/             # CuelistCorePanel + StationsTable (React TLR)
│   │   └── skeleton.test.ts
│   ├── pwa/                # PWA hooks + components
│   └── external/companion/ # Stream Deck module (B003-021)
├── e2e/                    # Playwright multi-op E2E (B003-020)
│   ├── helpers/
│   ├── fixtures/
│   └── multiop.spec.ts
├── parity/                 # BridgeX 0.3.x parity harness (B001-013, mostly inert in 0.1)
└── fixtures/
    ├── csv/                # QLab + Eos + generic CSV samples
    └── showx/              # sample .showx packages
```

## Test count (post-bundle)

- ~900 vitest unit tests (passing)
- 12 Playwright E2E (written, needs ShowX-1.1 shell harness to run)
- 23 Companion module tests

## Vitest patterns

### Y.Doc fixture

Most tests start with:

```ts
import * as Y from 'yjs'
import { createShow } from '../../src/document/show.js'

let doc: Y.Doc
beforeEach(() => {
  doc = new Y.Doc()
  createShow(doc)
})
```

`createShow` populates the 7 root entries so subsequent mutator calls find what they expect.

### Mutator test pattern

```ts
test('addCue inserts cue with required fields', () => {
  const cuelist = addCuelist(doc, { label: 'Main' }, { actorId: 'sm' })
  const cue = addCue(cuelist, { label: 'LX 1', department: ['LX'] }, { actorId: 'sm' })
  expect(cue.get('label')).toBe('LX 1')
  expect(cue.get('department')).toEqual(['LX'])
  expect(getCuesSorted(cuelist)).toHaveLength(1)
})
```

Always integrate the cue (mutator does it via `cues.push`), THEN read field values. Never read prelim maps.

### CRDT merge pattern

```ts
test('concurrent adds converge', () => {
  const doc1 = new Y.Doc(); const doc2 = new Y.Doc()
  createShow(doc1); createShow(doc2)
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))  // sync initial

  // simulate concurrent edits (no exchange between them)
  const c1 = addCuelist(doc1, { label: 'A' }, { actorId: 's1' })
  const c2 = addCuelist(doc2, { label: 'B' }, { actorId: 's2' })

  // sync forward + back
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

  expect(getCuelists(doc1).size).toBe(2)
  expect(getCuelists(doc2).size).toBe(2)
})
```

Pattern in `crdt-merge.test.ts`: forward-back sync, then assert both docs converged.

### Mocking transport injection

Dispatch tests inject a fake OutputDispatcher:

```ts
const sent: TransportMessage[] = []
const ctx: DispatchDeps = {
  output: { send: async (msg) => { sent.push(msg) } },
  log: makeMockLog(),
  abortSignal: new AbortController().signal,
  cuelistResolver: () => cuelist,
  cycleDetector: new CycleDetector(),
}

await dispatchCue(cue, doc, ctx)

expect(sent).toHaveLength(3)
expect(sent[0]).toMatchObject({ transport: 'osc-out', address: '/test', args: [1] })
```

### makeMockLog with vi.fn

B003-007 round 2 upgraded `makeMockLog()` to use `vi.fn()` spies so tests can assert on log calls:

```ts
function makeMockLog(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}

test('timecode trigger emits info log', () => {
  const log = makeMockLog()
  /* ... */
  expect(log.info).toHaveBeenCalledWith('timecode trigger deferred to 0.2', { cuelist_id, cue_id })
})
```

### Fake timers for SideChannelClient

```ts
vi.useFakeTimers()
const ws = makeMockWebSocket()
const client = new SideChannelClient('ws://test', { _WebSocket: () => ws })
ws.simulateClose()  // trigger reconnect
vi.advanceTimersByTime(1000)
expect(ws.connectCalls).toBe(2)  // first attempt @ 1s
vi.advanceTimersByTime(2000)
expect(ws.connectCalls).toBe(3)  // second attempt @ 1+2s
// ... continue for [5000, 10000, 30000, 30000]
```

### React Testing Library

PWA component tests use `@testing-library/react` + `renderHook`:

```ts
import { renderHook } from '@testing-library/react'
import { ConnectionProvider } from '../../pwa/src/lib/ConnectionProvider'

test('useCue returns referentially equal results across re-renders', () => {
  const wrapper = makeConnectionWrapper({ doc, cuelist, cue })
  const { result, rerender } = renderHook(() => useCue(cuelistId, cueId), { wrapper })
  const r0 = result.current
  rerender()
  expect(Object.is(result.current, r0)).toBe(true)
})
```

## E2E (Playwright)

`tests/e2e/multiop.spec.ts` (B003-020):

```ts
import { test, expect, chromium } from '@playwright/test'
import { bootTestShell } from './helpers/bootTestShell.js'

test('SM edits cue label → LX op sees update <1.5s', async () => {
  const boot = await bootTestShell({ fixturePath: MULTIOP_SHOW_FIXTURE })
  const browser = await chromium.launch()
  const smPage = await browser.newContext().then(c => c.newPage())
  const lxPage = await browser.newContext().then(c => c.newPage())

  await pairStation(smPage, { role: 'sm', ... })
  await pairStation(lxPage, { role: 'operator', departments: ['LX'], ... })

  await smPage.locator('[data-testid="cue-row"]').first().click()
  await smPage.locator('input[name="label"]').fill('NEW LABEL')
  await smPage.locator('input[name="label"]').blur()

  await expect(lxPage.locator('[data-testid="cue-row"]').first()).toContainText('NEW LABEL', { timeout: 1500 })

  await browser.close()
  await boot.cleanup()
})
```

### Helpers

- `bootTestShell` — spawns Electron app via `_electron` from Playwright, with `SHOWX_TEST_MODE=1`
- `pairStation` — walks PWA pairing flow with mock PIN `000000`
- `openTwoPwaSessions` — wires both pages with separate browser contexts
- `fixtures` — paths + expected cue counts

### Status of E2E

12 tests written. Runtime gated by ShowX-1.1 follow-up (Electron build + test-mode env flag wiring). Critic verified the test code is correct + selectors match data-testids in PWA components.

## Common gotchas

- **Vitest passes, typecheck fails** — esbuild strips TS at runtime; `noUnusedLocals` only fires via `tsc`. Forge sometimes forgets `pnpm typecheck` after `pnpm test`. B003-024 cleanup absorbed accumulated drift.
- **Prelim Y.Map .get returns undefined** — see [02 document model] gotcha. Always integrate first.
- **TS6307 / TS6059 rootDir issues** — `migrations/` lived outside `src/` until B003-024 moved it in. tsconfig.json's `rootDir: src` is strict.
- **React getSnapshot cache** — hooks must return same ref across rerenders if value unchanged. UNSET sentinel + cache pattern (B003-012 round 2).
- **Concurrent state.json writes** — Forge/Critic both write state.json; rare races possible. Architect commits as snapshot; system tolerates short-term inconsistency.

## Test budgets

- vitest run: ~12s for full cuelist-core unit suite
- PWA tests: ~5s
- E2E (when shell harness lands): ~5 min estimated for full 12 scenarios

## Open issues

- Property-based testing for CRDT convergence (currently scenario-based)
- Snapshot regression tests for PDF output (pixel-diff currently manual)
- Test coverage report integration (vitest --coverage works locally; CI integration TBD)
