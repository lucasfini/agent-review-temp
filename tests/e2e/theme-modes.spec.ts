import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const screenshotDir = path.join(process.cwd(), 'artifacts', 'screenshots');
const themeStorageKey = 'audiorepurpose-theme';

const viewports = [
  { name: 'mobile', width: 390, height: 1200 },
  { name: 'tablet', width: 768, height: 1200 },
  { name: 'desktop', width: 1440, height: 1400 },
  { name: 'wide', width: 1920, height: 1400 },
] as const;

const publicThemeRoutes = [
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
  { route: '/built-for/creators', label: 'built-for-creators', routeFile: ['app', 'built-for', '[slug]', 'page.tsx'] },
  { route: '/auth/login', label: 'auth-login', routeFile: ['app', 'auth', 'login', 'page.tsx'] },
  { route: '/auth/signup', label: 'auth-signup', routeFile: ['app', 'auth', 'signup', 'page.tsx'] },
  { route: '/auth/reset-password', label: 'auth-reset-password', routeFile: ['app', 'auth', 'reset-password', 'page.tsx'] },
  { route: '/auth/auth-code-error', label: 'auth-code-error', routeFile: ['app', 'auth', 'auth-code-error', 'page.tsx'] },
  { route: '/billing/cancel', label: 'billing-cancel', routeFile: ['app', 'billing', 'cancel', 'page.tsx'] },
  { route: '/billing/success', label: 'billing-success', routeFile: ['app', 'billing', 'success', 'page.tsx'] },
  { route: '/contact', label: 'contact', routeFile: ['app', 'contact', 'page.tsx'] },
  { route: '/invite', label: 'invite', routeFile: ['app', 'invite', 'page.tsx'] },
  { route: '/privacy', label: 'privacy', routeFile: ['app', 'privacy', 'page.tsx'] },
  { route: '/terms', label: 'terms', routeFile: ['app', 'terms', 'page.tsx'] },
] as const;

const protectedThemeRoutes = [
  { route: '/dashboard/hub', label: 'dashboard-hub' },
  { route: '/dashboard/upload', label: 'dashboard-upload' },
  { route: '/dashboard/settings', label: 'dashboard-settings' },
  { route: '/dashboard/analytics', label: 'dashboard-analytics' },
  { route: '/dashboard/studio', label: 'dashboard-studio' },
  { route: '/dashboard/pipeline', label: 'dashboard-pipeline' },
] as const;

const adminThemeRoutes = [
  { route: '/admin', label: 'admin-overview' },
  { route: '/admin/billing-ops', label: 'admin-billing-ops' },
  { route: '/dashboard/admin', label: 'dashboard-admin' },
] as const;

function routeFileExists(routeFile: readonly string[]) {
  return existsSync(path.join(process.cwd(), ...routeFile));
}

async function setStoredTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [themeStorageKey, theme],
  );
}

async function expectNoPageError(page: Page) {
  const body = page.locator('body');
  await expect(body).toBeVisible();
  await expect(body).not.toContainText(/Application error|Unhandled Runtime Error|This page could not be found|404/i);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(2);
}

async function expectThemeApplied(page: Page, theme: 'light' | 'dark') {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(theme === 'dark');

  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), themeStorageKey))
    .toBe(theme);

  const landingRoot = page.locator('.landing-scroll-root').first();
  if (await landingRoot.count()) {
    await expect.poll(() => landingRoot.getAttribute('data-theme')).toBe(theme);
  }

  await expect
    .poll(() =>
      page.locator('[data-theme-toggle]').evaluateAll((toggles) =>
        toggles.filter((toggle) => {
          const rect = toggle.getBoundingClientRect();
          const style = window.getComputedStyle(toggle);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        }).length,
      ),
    )
    .toBeGreaterThan(0);
}

async function captureThemeRoute(page: Page, route: string, label: string, theme: 'light' | 'dark') {
  await mkdir(screenshotDir, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    let response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should return a non-error HTTP status`).toBeLessThan(400);
    await setStoredTheme(page, theme);
    response = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should reload with a non-error HTTP status`).toBeLessThan(400);
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
    await expectNoPageError(page);
    await expectThemeApplied(page, theme);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(screenshotDir, `${label}-${theme}-${viewport.width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.describe('site theme modes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  for (const theme of ['light', 'dark'] as const) {
    for (const routeDef of publicThemeRoutes) {
      test(`captures ${routeDef.label} in ${theme} mode`, async ({ page }) => {
        test.skip(
          !routeFileExists(routeDef.routeFile),
          `No ${routeDef.routeFile.join('/')} route exists in this worktree.`,
        );

        await captureThemeRoute(page, routeDef.route, routeDef.label, theme);
      });
    }
  }
});

test.describe('authenticated theme modes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  const email = process.env.THEME_AUDIT_EMAIL;
  const password = process.env.THEME_AUDIT_PASSWORD;

  test.skip(
    !email || !password,
    'Set THEME_AUDIT_EMAIL and THEME_AUDIT_PASSWORD to capture authenticated dashboard theme pages.',
  );

  for (const theme of ['light', 'dark'] as const) {
    for (const routeDef of protectedThemeRoutes) {
      test(`captures ${routeDef.label} in ${theme} mode`, async ({ page }) => {
        await loginWithPassword(page, email!, password!);
        await captureThemeRoute(page, routeDef.route, routeDef.label, theme);
      });
    }
  }
});

test.describe('admin theme modes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  const email = process.env.THEME_AUDIT_ADMIN_EMAIL;
  const password = process.env.THEME_AUDIT_ADMIN_PASSWORD;

  test.skip(
    !email || !password,
    'Set THEME_AUDIT_ADMIN_EMAIL and THEME_AUDIT_ADMIN_PASSWORD to capture admin/internal theme pages.',
  );

  for (const theme of ['light', 'dark'] as const) {
    for (const routeDef of adminThemeRoutes) {
      test(`captures ${routeDef.label} in ${theme} mode`, async ({ page }) => {
        await loginWithPassword(page, email!, password!);
        await captureThemeRoute(page, routeDef.route, routeDef.label, theme);
      });
    }
  }
});
