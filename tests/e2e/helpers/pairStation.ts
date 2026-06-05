import type { Page } from '@playwright/test';

export interface PairOpts {
  url: string;
  pin: string;
  role: 'sm' | 'operator';
  displayName: string;
  departments: string[];
}

export interface PairResult {
  stationId: string;
  token: string;
}

export async function pairStation(page: Page, opts: PairOpts): Promise<PairResult> {
  await page.goto(opts.url + '/pairing?testMode=1');

  await page.waitForSelector('[data-testid="pin-input"]', { timeout: 10_000 });

  await page.fill('[data-testid="pin-input"]', opts.pin);
  await page.fill('[data-testid="device-name-input"]', opts.displayName);
  await page.selectOption('[data-testid="role-select"]', opts.role);

  for (const dept of opts.departments) {
    await page.check(`[data-testid="dept-chip-${dept}"]`);
  }

  await page.click('[data-testid="submit-pairing"]');

  await page.waitForSelector('[data-testid="paired-success"]', { timeout: 10_000 });

  const stationId =
    (await page.getAttribute('[data-testid="station-id"]', 'data-id')) ?? '';
  const token = await page.evaluate(
    () => (window as unknown as Record<string, string>)['showx_pair_token'] ?? localStorage.getItem('showx_pair_token') ?? '',
  );

  return { stationId, token };
}
