---
id: "B003-020"
title: "Multi-operator collab integration tests — shell + 2 PWA sessions"
type: "test"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B003-013", "B003-014", "B003-015", "B003-016"]
target_files:
  - "tests/e2e/multiop.spec.ts"
  - "tests/e2e/helpers/bootTestShell.ts"
  - "tests/e2e/helpers/openTwoPwaSessions.ts"
  - "tests/e2e/helpers/pairStation.ts"
  - "tests/e2e/helpers/fixtures.ts"
  - "tests/e2e/fixtures/multiop-show/**"
  - "playwright.config.ts"
acceptance_criteria:
  - "Playwright spec spawns ShowX shell (Electron) + 2 PWA browser contexts; both pair as different operators (SM + LX op) via real pairing flow"
  - "End-to-end scenario covered: both stations open same show → both see cuelist → SM edits cue label → LX op sees update in <1s → LX op edits payload → SM sees update → SM fires GO → both stations animate cue-fire visual"
  - "Awareness check: presence indicators on both stations show counterpart online; offline detection within 5s of disconnect"
  - "Compound cue scenario: SM creates dept=['LX','SX'] cue → LX op sees it (LX dept) → cue editor in PWA shows correct payload highlight (LX-tagged bold; SX-tagged dimmed)"
  - "Conflict resolution scenario: SM and LX op both edit cue.label simultaneously → Yjs LWW resolves; both stations converge to same final value within 2s"
  - "GO authority scenario: cuelist go_authority='sm_called' → LX op presses GO → request sent → FOH rejects (not_sm) → LX op sees reject toast; SM presses GO → accepted; both see go.dispatched broadcast"
  - "REHEARSAL → SHOW transition: SM locks → both stations show lock indicators; LX op tries to edit payload → cue editor shows lock banner + 'Propose change' stub"
  - "GO event idempotency: send same request_id twice → second send returns cached go.dispatched, NOT re-fired"
  - "Replay window: send go.request with client_ts=5+s ago → rejected with reason historic_replay"
  - "Reconnect test: kill LX op's WSS connection → LX op reconnects within 5s → side-channel resume restores last seq → LX op state catches up"
  - "Boot helper `bootTestShell(opts): Promise<{shell, pkgPath, broker, sideChannel, cleanup}>` starts ShowX Electron app with test-mode flags + tmp pkg dir + injects test fixtures"
  - "Pair helper `pairStation(page, opts: {role, departments}): Promise<{stationId, token}>` walks through PWA pairing UI with mock PIN"
  - "Fixtures: `tests/e2e/fixtures/multiop-show/` — pre-built .showx with 5 cues (1 compound, 2 LX, 1 SX, 1 SM-only)"
  - "Playwright config: 2 minute test timeout, retry once on failure, video on failure"
  - "12+ test cases across the .spec.ts file"
---

## Context

Multi-operator collaboration is the headline feature of ShowX vs. QLab — and the most fragile thing to test. This task delivers the integration test harness + 12 E2E scenarios validating the full FOH↔2 station chain. Failures here block 0.1 ship.

These tests run in CI and pre-release smoke. They depend on ShowX-1 having a bootable test shell — Forge should validate that pre-condition in the done report. If shell test harness is missing or limited, document gaps + propose ShowX-1 follow-up.

## Implementation notes

### Test shell boot helper

```ts
// tests/e2e/helpers/bootTestShell.ts
import { _electron as electron } from 'playwright';
import path from 'node:path';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';

export interface BootOpts {
  fixturePath?: string;  // Optional: path to a fixture .showx to seed
  port?: number;         // Default 5300; tests randomize
  pairingPin?: string;   // Default '000000' for test mode
}

export interface BootResult {
  shell: import('playwright').ElectronApplication;
  shellWindow: import('playwright').Page;
  pkgPath: string;
  port: number;
  cleanup: () => Promise<void>;
}

export async function bootTestShell(opts: BootOpts = {}): Promise<BootResult> {
  const tmpDir = await mkdtemp(path.join(require('os').tmpdir(), 'showx-e2e-'));
  const pkgPath = path.join(tmpDir, 'test-show.showx');
  if (opts.fixturePath) {
    await copyShowFixture(opts.fixturePath, pkgPath);
  }
  const port = opts.port ?? (5300 + Math.floor(Math.random() * 1000));
  const env = {
    ...process.env,
    SHOWX_PORT: String(port),
    SHOWX_TEST_MODE: '1',
    SHOWX_PAIRING_TEST_PIN: opts.pairingPin ?? '000000',
    SHOWX_AUTOLOAD_SHOW: pkgPath,
  };
  const shell = await electron.launch({
    args: [path.join(__dirname, '../../../dist/main/index.js')],
    env,
  });
  const shellWindow = await shell.firstWindow();
  await shellWindow.waitForLoadState('domcontentloaded');
  return {
    shell, shellWindow, pkgPath, port,
    cleanup: async () => {
      await shell.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}
```

### Pair station helper

```ts
// tests/e2e/helpers/pairStation.ts
export async function pairStation(
  page: Page, opts: { url: string; pin: string; role: 'sm' | 'operator'; displayName: string; departments: string[] },
): Promise<{ stationId: string; token: string }> {
  await page.goto(opts.url + '/pairing');
  await page.fill('[data-testid="pin-input"]', opts.pin);
  await page.fill('[data-testid="device-name-input"]', opts.displayName);
  await page.selectOption('[data-testid="role-select"]', opts.role);
  for (const dept of opts.departments) {
    await page.check(`[data-testid="dept-chip-${dept}"]`);
  }
  await page.click('[data-testid="submit-pairing"]');
  await page.waitForSelector('[data-testid="paired-success"]', { timeout: 5000 });
  const stationId = await page.getAttribute('[data-testid="station-id"]', 'data-id') ?? '';
  const token = await page.evaluate(() => localStorage.getItem('showx_pair_token') ?? '');
  return { stationId, token };
}
```

### Main test spec

```ts
// tests/e2e/multiop.spec.ts
import { test, expect, chromium } from '@playwright/test';
import { bootTestShell } from './helpers/bootTestShell';
import { pairStation } from './helpers/pairStation';

test.describe('Multi-operator collab', () => {
  let shell: any, pkgPath: string, baseUrl: string;
  let smCtx: any, lxCtx: any;
  let smPage: any, lxPage: any;

  test.beforeAll(async () => {
    const boot = await bootTestShell({ fixturePath: './tests/e2e/fixtures/multiop-show' });
    shell = boot; pkgPath = boot.pkgPath;
    baseUrl = `http://localhost:${boot.port}`;
    const browser = await chromium.launch();
    smCtx = await browser.newContext();
    lxCtx = await browser.newContext();
    smPage = await smCtx.newPage();
    lxPage = await lxCtx.newPage();
    await pairStation(smPage, { url: baseUrl, pin: '000000', role: 'sm', displayName: 'SM iPad', departments: ['SM'] });
    await pairStation(lxPage, { url: baseUrl, pin: '000000', role: 'operator', displayName: 'LX laptop', departments: ['LX'] });
  });

  test.afterAll(async () => {
    await shell.cleanup();
  });

  test('1. Both stations see cuelist after pairing', async () => {
    await smPage.waitForSelector('[data-testid="cue-row"]');
    await lxPage.waitForSelector('[data-testid="cue-row"]');
    const smCues = await smPage.locator('[data-testid="cue-row"]').count();
    const lxCues = await lxPage.locator('[data-testid="cue-row"]').count();
    expect(smCues).toBe(5); // SM sees all
    expect(lxCues).toBeGreaterThan(0); // LX sees LX + SM + compound
    expect(lxCues).toBeLessThan(5);
  });

  test('2. SM edits cue label → LX op sees update <1s', async () => {
    await smPage.click('[data-testid="cue-row"]:first-child');
    await smPage.fill('[data-testid="cue-label-input"]', 'Q 1 modified');
    await smPage.locator('[data-testid="cue-label-input"]').blur();
    await expect(lxPage.locator('[data-testid="cue-row"]:first-child')).toContainText('Q 1 modified', { timeout: 1500 });
  });

  test('3. LX op edits payload → SM sees update', async () => {
    await lxPage.click('[data-testid="cue-row-LX"]');
    await lxPage.fill('[data-testid="lx-cue-number-input"]', '99');
    await lxPage.locator('[data-testid="lx-cue-number-input"]').blur();
    await smPage.click('[data-testid="cue-row-LX"]');
    await expect(smPage.locator('[data-testid="payload-summary"]')).toContainText('99', { timeout: 1500 });
  });

  test('4. SM fires GO → both animate cue-fire', async () => {
    await smPage.press('body', 'KeyQ'); // arm
    await smPage.press('body', 'Space'); // GO
    await expect(smPage.locator('[data-testid="calling-text"]')).toContainText('GO', { timeout: 1000 });
    await expect(lxPage.locator('[data-testid="cue-fire-animation"]')).toBeVisible({ timeout: 1000 });
  });

  test('5. Presence indicators show both online', async () => {
    const smPresenceOnLx = await lxPage.locator('[data-testid="presence-dot-SM"]').count();
    expect(smPresenceOnLx).toBeGreaterThan(0);
  });

  test('6. Compound cue visible in both views with correct highlight', async () => {
    const compoundOnSm = await smPage.locator('[data-testid="cue-row-compound"]').isVisible();
    const compoundOnLx = await lxPage.locator('[data-testid="cue-row-compound"]').isVisible();
    expect(compoundOnSm).toBe(true);
    expect(compoundOnLx).toBe(true);
    // LX op opens editor → LX payload highlighted, SX payload dimmed
    await lxPage.click('[data-testid="cue-row-compound"]');
    const lxHighlight = await lxPage.locator('[data-testid="payload-LX"]').evaluate(el => getComputedStyle(el).fontWeight);
    expect(lxHighlight).toMatch(/700|bold/);
  });

  test('7. Conflict resolution: concurrent label edits converge', async () => {
    // Both stations edit same cue label
    await smPage.click('[data-testid="cue-row"]:nth-child(2)');
    await lxPage.click('[data-testid="cue-row"]:nth-child(2)');
    await smPage.fill('[data-testid="cue-label-input"]', 'SM edit');
    await lxPage.fill('[data-testid="cue-label-input"]', 'LX edit');
    await Promise.all([smPage.locator('[data-testid="cue-label-input"]').blur(), lxPage.locator('[data-testid="cue-label-input"]').blur()]);
    await smPage.waitForTimeout(2000);
    const smLabel = await smPage.locator('[data-testid="cue-row"]:nth-child(2) [data-testid="cue-label"]').textContent();
    const lxLabel = await lxPage.locator('[data-testid="cue-row"]:nth-child(2) [data-testid="cue-label"]').textContent();
    expect(smLabel).toBe(lxLabel); // converged
  });

  test('8. GO authority: LX op press → rejected; SM press → accepted', async () => {
    await lxPage.press('body', 'KeyQ');
    await lxPage.press('body', 'Space');
    await expect(lxPage.locator('[data-testid="go-rejected-toast"]')).toBeVisible({ timeout: 1000 });
    await expect(lxPage.locator('[data-testid="go-rejected-toast"]')).toContainText(/not.sm|not.authorized/i);
    await smPage.press('body', 'KeyQ');
    await smPage.press('body', 'Space');
    await expect(smPage.locator('[data-testid="calling-text"]')).toContainText('GO');
  });

  test('9. REHEARSAL → SHOW lock visible on both stations', async () => {
    await smPage.click('[data-testid="mode-badge"]'); // toggle
    await expect(smPage.locator('[data-testid="mode-badge"]')).toContainText('SHOW');
    await expect(lxPage.locator('[data-testid="mode-badge"]')).toContainText('SHOW');
    await lxPage.click('[data-testid="cue-row-LX"]');
    await expect(lxPage.locator('[data-testid="show-lock-banner"]')).toBeVisible();
  });

  test('10. Idempotency: same request_id sent twice → only one fire', async () => {
    // Use sideChannel directly via injected debug API
    const requestId = await smPage.evaluate(() => crypto.randomUUID());
    await smPage.evaluate((id: string) => (window as any).debugSendGoRequest(id), requestId);
    await smPage.evaluate((id: string) => (window as any).debugSendGoRequest(id), requestId);
    await smPage.waitForTimeout(500);
    const fireCount = await smPage.evaluate(() => (window as any).debugFireCount);
    expect(fireCount).toBe(1);
  });

  test('11. Replay window: stale client_ts rejected', async () => {
    const staleTs = new Date(Date.now() - 10000).toISOString();
    const reqId = await smPage.evaluate(() => crypto.randomUUID());
    const result = await smPage.evaluate(([id, ts]: any) => (window as any).debugSendGoRequestWithTs(id, ts), [reqId, staleTs]);
    expect(result).toMatch(/historic_replay/);
  });

  test('12. Reconnect: kill + restore WSS, state catches up', async () => {
    await lxPage.evaluate(() => (window as any).debugCloseSideChannel());
    await lxPage.waitForTimeout(1000);
    // SM fires while LX disconnected
    await smPage.press('body', 'KeyQ');
    await smPage.press('body', 'Space');
    await lxPage.evaluate(() => (window as any).debugReconnectSideChannel());
    await lxPage.waitForTimeout(2000);
    // LX should now see the missed dispatch (rendered as historic)
    await expect(lxPage.locator('[data-testid="cue-history-marker"]')).toBeVisible();
  });
});
```

### Fixtures

```
tests/e2e/fixtures/multiop-show/
├── show.json
├── cuelists/
│   └── cl_main.json
├── routing.json
├── operators.json
└── history.jsonl
```

5 cues: Q1 (LX), Q2 (SM-only), Q3 (compound LX+SX), Q4 (SX), Q5 (LX, manual fire test target).

### Playwright config

```ts
// playwright.config.ts
export default {
  testDir: './tests/e2e',
  timeout: 120000,
  retries: 1,
  use: {
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  workers: 1, // serial — only one shell can bind port at a time per worker
};
```

## Test plan

(Test plan IS the tests themselves — 12 named tests above.)

Acceptance: all 12 pass in CI on macOS. If Playwright reports flakes, Forge investigates timing assumptions (use longer waitForSelector timeouts not arbitrary sleeps).

## Out of scope

- SHOW mode proposal queue tests (ShowX-4).
- More than 2 stations (post-MVP — concurrent scaling test post-0.1).
- Performance benchmarking (post-MVP).
- Network failure injection beyond simple WSS close (post-MVP).
- Stream Deck / Companion integration (B003-021).
- Pairing PIN brute-force resilience (covered by pairing_auth.md spec, separate test).
- Audio/video QLab integration (out of product).

## Notes for Critic

- Verify tests use Playwright with Electron app launch (NOT chromium-only).
- Verify each test uses unique tmp pkgPath to avoid cross-test contamination.
- Verify SHOWX_TEST_MODE=1 enables a debug API on window (debugSendGoRequest etc.) — Forge documents the test API surface in done report.
- Verify timing thresholds reasonable: 1.5s for CRDT propagation, 5s for reconnect, 2s for awareness disconnect detection.
- Confirm conflict resolution test produces deterministic outcome (LWW based on modified_at).
- Verify data-testid selectors exist in the actual components (Forge cross-references B003-013, B003-014, B003-015, B003-016).
- Confirm video capture only on failure (CI noise reduction).
- Watch for port collisions in CI — random port 5300+rand works but Forge documents the range.
- Verify cleanup removes tmp directories.
- Confirm fixtures match actual data_model.md §3 layout (must round-trip through openShowxPackage).
