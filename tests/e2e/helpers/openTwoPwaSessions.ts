import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { pairStation } from './pairStation.js';

export interface TwoSessionsOpts {
  baseUrl: string;
  pin?: string;
}

export interface TwoSessions {
  smPage: Page;
  lxPage: Page;
  smCtx: BrowserContext;
  lxCtx: BrowserContext;
  browser: Browser;
  close: () => Promise<void>;
}

export async function openTwoPwaSessions(opts: TwoSessionsOpts): Promise<TwoSessions> {
  const pin = opts.pin ?? '000000';
  const browser = await chromium.launch();

  const smCtx = await browser.newContext();
  const lxCtx = await browser.newContext();

  const smPage = await smCtx.newPage();
  const lxPage = await lxCtx.newPage();

  await pairStation(smPage, {
    url: opts.baseUrl,
    pin,
    role: 'sm',
    displayName: 'SM iPad',
    departments: ['SM'],
  });

  await pairStation(lxPage, {
    url: opts.baseUrl,
    pin,
    role: 'operator',
    displayName: 'LX laptop',
    departments: ['LX'],
  });

  return {
    smPage,
    lxPage,
    smCtx,
    lxCtx,
    browser,
    close: async () => {
      await browser.close().catch(() => {});
    },
  };
}
