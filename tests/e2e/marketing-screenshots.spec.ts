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

const marketingPages = [
  { route: '/', label: 'home', routeFile: ['app', 'page.tsx'] },
  { route: '/product/upload', label: 'product-upload', routeFile: ['app', 'product', 'upload', 'page.tsx'] },
  { route: '/product/teams', label: 'product-teams', routeFile: ['app', 'product', 'teams', 'page.tsx'] },
  { route: '/product/studio', label: 'product-studio', routeFile: ['app', 'product', 'studio', 'page.tsx'] },
  { route: '/product/library', label: 'product-library', routeFile: ['app', 'product', 'library', 'page.tsx'] },
  { route: '/product/integrations', label: 'product-integrations', routeFile: ['app', 'product', 'integrations', 'page.tsx'] },
  { route: '/product/analysis', label: 'product-analysis', routeFile: ['app', 'product', 'analysis', 'page.tsx'] },
  { route: '/pricing', label: 'pricing', routeFile: ['app', 'pricing', 'page.tsx'] },
  { route: '/whats-new', label: 'whats-new', routeFile: ['app', 'whats-new', 'page.tsx'] },
  { route: '/built-for', label: 'built-for', routeFile: ['app', 'built-for', 'page.tsx'] },
  { route: '/built-for/marketing-teams', label: 'built-for-marketing-teams', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/founders', label: 'built-for-founders', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/sales-teams', label: 'built-for-sales-teams', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/customer-success', label: 'built-for-customer-success', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/product-marketers', label: 'built-for-product-marketers', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/consultants', label: 'built-for-consultants', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/built-for/creators', label: 'built-for-creators', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/contact', label: 'contact', routeFile: ['app', 'contact', 'page.tsx'] },
] as const;

function routeFileExists(routeFile: readonly string[]) {
  return existsSync(path.join(process.cwd(), ...routeFile));
}

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
  });

  for (const marketingPage of marketingPages) {
    test(`captures responsive ${marketingPage.label} screenshots when the route exists`, async ({ page }) => {
      test.skip(
        !routeFileExists(marketingPage.routeFile),
        `No ${marketingPage.routeFile.join('/')} route exists in this worktree.`
      );

      await captureMarketingPage(page, marketingPage.route, marketingPage.label);
    });
  }
});
