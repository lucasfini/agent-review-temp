import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { test, type Page } from '@playwright/test';

const screenshotDir = path.join(process.cwd(), 'artifacts', 'screenshots');
const viewports = [
  { name: 'mobile', width: 390, height: 1200 },
  { name: 'tablet', width: 768, height: 1200 },
  { name: 'desktop', width: 1440, height: 1400 },
  { name: 'wide', width: 1920, height: 1400 },
] as const;

async function captureMarketingPage(page: Page, route: string, label: string) {
  await mkdir(screenshotDir, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(750);
    await page.screenshot({
      path: path.join(screenshotDir, `${label}-${viewport.width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test.describe('marketing page screenshots', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/agency-funnel-events', async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });
  });

  test('captures responsive homepage screenshots', async ({ page }) => {
    await captureMarketingPage(page, '/', 'home');
  });

  const agencyRouteExists = existsSync(path.join(process.cwd(), 'app', 'agency', 'page.tsx'));

  test('captures responsive agency screenshots when the branch has /agency', async ({ page }) => {
    // The public agency route is branch-specific and is absent from origin/main.
    test.skip(!agencyRouteExists, 'No app/agency/page.tsx route exists in this worktree.');

    await captureMarketingPage(page, '/agency', 'agency');
  });
});
