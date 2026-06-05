import { test, expect, chromium } from '@playwright/test';
import { bootTestShell } from './helpers/bootTestShell.js';
import { pairStation } from './helpers/pairStation.js';
import {
  MULTIOP_SHOW_FIXTURE,
  SM_TOTAL_CUES,
  LX_VISIBLE_CUES,
  CUELIST_ID,
} from './helpers/fixtures.js';
import type { BootResult } from './helpers/bootTestShell.js';
import type { Page, Browser, BrowserContext } from '@playwright/test';

test.describe('Multi-operator collab', () => {
  let boot: BootResult;
  let browser: Browser;
  let smCtx: BrowserContext;
  let lxCtx: BrowserContext;
  let smPage: Page;
  let lxPage: Page;

  test.beforeAll(async () => {
    boot = await bootTestShell({ fixturePath: MULTIOP_SHOW_FIXTURE });
    browser = await chromium.launch();
    smCtx = await browser.newContext();
    lxCtx = await browser.newContext();
    smPage = await smCtx.newPage();
    lxPage = await lxCtx.newPage();

    await pairStation(smPage, {
      url: boot.baseUrl,
      pin: '000000',
      role: 'sm',
      displayName: 'SM iPad',
      departments: ['SM'],
    });

    await pairStation(lxPage, {
      url: boot.baseUrl,
      pin: '000000',
      role: 'operator',
      displayName: 'LX laptop',
      departments: ['LX'],
    });
  });

  test.afterAll(async () => {
    await browser.close().catch(() => {});
    await boot.cleanup();
  });

  // ── Test 1: Both stations see cuelist after pairing ────────────────────────

  test('1. Both stations see cuelist after pairing', async () => {
    await smPage.waitForSelector('[data-testid="cue-row"]', { timeout: 10_000 });
    await lxPage.waitForSelector('[data-testid="cue-row"]', { timeout: 10_000 });

    const smCues = await smPage.locator('[data-testid="cue-row"]').count();
    const lxCues = await lxPage.locator('[data-testid="cue-row"]').count();

    expect(smCues).toBe(SM_TOTAL_CUES);
    expect(lxCues).toBeGreaterThan(0);
    expect(lxCues).toBeLessThanOrEqual(LX_VISIBLE_CUES);
  });

  // ── Test 2: SM edits cue label → LX op sees update <1.5s ─────────────────

  test('2. SM edits cue label → LX op sees update <1.5s', async () => {
    await smPage.locator('[data-testid="cue-row"]').first().click();
    await smPage.waitForSelector('[data-testid="cue-label-input"]');
    await smPage.fill('[data-testid="cue-label-input"]', 'Q 1 modified');
    await smPage.locator('[data-testid="cue-label-input"]').blur();

    await expect(
      lxPage.locator('[data-testid="cue-row"]').first(),
    ).toContainText('Q 1 modified', { timeout: 1500 });
  });

  // ── Test 3: LX op edits payload → SM sees update ─────────────────────────

  test('3. LX op edits payload → SM sees update', async () => {
    await lxPage.locator('[data-testid="cue-row"][data-cue-type="LX"]').first().click();
    await lxPage.waitForSelector('[data-testid="lx-cue-number-input"]');
    await lxPage.fill('[data-testid="lx-cue-number-input"]', '99');
    await lxPage.locator('[data-testid="lx-cue-number-input"]').blur();

    await smPage.locator('[data-testid="cue-row"][data-cue-type="LX"]').first().click();
    await expect(
      smPage.locator('[data-testid="payload-summary"]'),
    ).toContainText('99', { timeout: 1500 });
  });

  // ── Test 4: SM fires GO → both animate cue-fire visual ───────────────────

  test('4. SM fires GO → both animate cue-fire visual', async () => {
    await smPage.press('body', 'KeyQ');
    await smPage.press('body', 'Space');

    await expect(
      smPage.locator('[data-testid="calling-text"]'),
    ).toContainText('GO', { timeout: 2000 });
    await expect(
      lxPage.locator('[data-testid="cue-fire-animation"]'),
    ).toBeVisible({ timeout: 2000 });
  });

  // ── Test 5: Presence indicators show both online ─────────────────────────

  test('5. Presence indicators show both online', async () => {
    const smPresenceOnLx = await lxPage
      .locator('[data-testid="presence-dot-SM"]')
      .count();
    expect(smPresenceOnLx).toBeGreaterThan(0);
  });

  // ── Test 6: Compound cue visible in both views with correct highlight ──────

  test('6. Compound cue visible in both views with correct highlight', async () => {
    await expect(
      smPage.locator('[data-testid="cue-row"][data-cue-type="compound"]'),
    ).toBeVisible({ timeout: 3000 });
    await expect(
      lxPage.locator('[data-testid="cue-row"][data-cue-type="compound"]'),
    ).toBeVisible({ timeout: 3000 });

    await lxPage.locator('[data-testid="cue-row"][data-cue-type="compound"]').click();
    await lxPage.waitForSelector('[data-testid="payload-LX"]');

    const lxWeight = await lxPage
      .locator('[data-testid="payload-LX"]')
      .evaluate((el) => getComputedStyle(el).fontWeight);
    expect(lxWeight).toMatch(/700|bold/);
  });

  // ── Test 7: Conflict resolution — concurrent label edits converge ─────────

  test('7. Conflict resolution: concurrent label edits converge', async () => {
    const secondRow = '[data-testid="cue-row"]:nth-child(2)';

    await smPage.locator(secondRow).click();
    await lxPage.locator('[data-testid="cue-row"]').nth(1).click();

    await smPage.waitForSelector('[data-testid="cue-label-input"]');
    await lxPage.waitForSelector('[data-testid="cue-label-input"]');

    await smPage.fill('[data-testid="cue-label-input"]', 'SM edit');
    await lxPage.fill('[data-testid="cue-label-input"]', 'LX edit');

    await Promise.all([
      smPage.locator('[data-testid="cue-label-input"]').blur(),
      lxPage.locator('[data-testid="cue-label-input"]').blur(),
    ]);

    await smPage.waitForTimeout(2000);

    const smLabel = await smPage
      .locator(`${secondRow} [data-testid="cue-label"]`)
      .textContent();
    const lxLabel = await lxPage
      .locator('[data-testid="cue-row"]:nth-child(2) [data-testid="cue-label"]')
      .textContent();

    expect(smLabel).toBe(lxLabel);
  });

  // ── Test 8: GO authority — LX op GO rejected; SM GO accepted ─────────────

  test('8. GO authority: LX op press → rejected; SM press → accepted', async () => {
    await lxPage.press('body', 'KeyQ');
    await lxPage.press('body', 'Space');

    await expect(
      lxPage.locator('[data-testid="go-rejected-toast"]'),
    ).toBeVisible({ timeout: 2000 });
    await expect(
      lxPage.locator('[data-testid="go-rejected-toast"]'),
    ).toContainText(/not.sm|not.authorized/i, { timeout: 2000 });

    await smPage.press('body', 'KeyQ');
    await smPage.press('body', 'Space');

    await expect(
      smPage.locator('[data-testid="calling-text"]'),
    ).toContainText('GO', { timeout: 2000 });
  });

  // ── Test 9: REHEARSAL → SHOW lock visible on both stations ───────────────

  test('9. REHEARSAL → SHOW lock visible on both stations', async () => {
    await smPage.click('[data-testid="mode-badge"]');

    await expect(
      smPage.locator('[data-testid="mode-badge"]'),
    ).toContainText('SHOW', { timeout: 3000 });
    await expect(
      lxPage.locator('[data-testid="mode-badge"]'),
    ).toContainText('SHOW', { timeout: 3000 });

    await lxPage.locator('[data-testid="cue-row"][data-cue-type="LX"]').first().click();

    await expect(
      lxPage.locator('[data-testid="show-lock-banner"]'),
    ).toBeVisible({ timeout: 3000 });
  });

  // ── Test 10: GO idempotency — same request_id sent twice → one fire ────────

  test('10. Idempotency: same request_id sent twice → only one fire', async () => {
    const requestId = await smPage.evaluate(() => crypto.randomUUID());

    await smPage.evaluate(
      ([id, cl]: [string, string]) =>
        (window as unknown as Record<string, Function>)['debugSendGoRequest'](id, cl),
      [requestId, CUELIST_ID],
    );
    await smPage.evaluate(
      ([id, cl]: [string, string]) =>
        (window as unknown as Record<string, Function>)['debugSendGoRequest'](id, cl),
      [requestId, CUELIST_ID],
    );

    await smPage.waitForTimeout(500);

    const fireCount = await smPage.evaluate(
      () => (window as unknown as Record<string, number>)['debugFireCount'] ?? 0,
    );
    expect(fireCount).toBe(1);
  });

  // ── Test 11: Replay window — stale client_ts rejected ────────────────────

  test('11. Replay window: stale client_ts rejected', async () => {
    const staleTs = new Date(Date.now() - 10_000).toISOString();
    const reqId = await smPage.evaluate(() => crypto.randomUUID());

    const result = await smPage.evaluate(
      ([id, ts, cl]: [string, string, string]) =>
        (window as unknown as Record<string, Function>)['debugSendGoRequestWithTs'](id, ts, cl),
      [reqId, staleTs, CUELIST_ID],
    );

    expect(String(result)).toMatch(/historic_replay/);
  });

  // ── Test 12: Reconnect — LX op reconnects + state catches up ─────────────

  test('12. Reconnect: kill + restore WSS, state catches up', async () => {
    await lxPage.evaluate(
      () => (window as unknown as Record<string, Function>)['debugCloseSideChannel'](),
    );
    await lxPage.waitForTimeout(1000);

    await smPage.press('body', 'KeyQ');
    await smPage.press('body', 'Space');

    await lxPage.evaluate(
      () => (window as unknown as Record<string, Function>)['debugReconnectSideChannel'](),
    );

    await lxPage.waitForTimeout(2000);

    await expect(
      lxPage.locator('[data-testid="cue-history-marker"]'),
    ).toBeVisible({ timeout: 5000 });
  });
});
