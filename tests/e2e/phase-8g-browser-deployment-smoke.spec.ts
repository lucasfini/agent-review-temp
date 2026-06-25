import { expect, test, type Page } from '@playwright/test';

const publicRoutes = [
  '/',
] as const;

const authRoutes = [
  '/auth/login',
  '/auth/signup',
] as const;

const dashboardRoutes = [
  '/dashboard',
  '/dashboard/billing',
  '/dashboard/studio/profile',
  '/dashboard/studio/voice',
  '/dashboard/studio/plans',
  '/dashboard/library',
  '/dashboard/content',
  '/dashboard/agency',
  '/dashboard/agency/leads',
] as const;

const viewports = [
  { name: 'mobile', width: 390, height: 900 },
  { name: 'desktop', width: 1440, height: 1000 },
] as const;

async function blockFunnelWriteNoise(page: Page) {
  await page.route('**/api/agency-funnel-events', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.continue();
  });
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

test.describe('Phase 8G browser and deployment smoke QA', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await blockFunnelWriteNoise(page);
  });

  for (const route of publicRoutes) {
    for (const viewport of viewports) {
      test(`renders public route ${route} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `${route} should return a non-error HTTP status`).toBeLessThan(400);

        await expectNoPageError(page);
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
        await expectNoHorizontalOverflow(page);
      });
    }
  }

  for (const route of authRoutes) {
    test(`renders auth route ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} should return a non-error HTTP status`).toBeLessThan(400);

      await expectNoPageError(page);
      await expect(page.getByLabel(/email/i).first()).toBeVisible();
    });
  }

  for (const route of dashboardRoutes) {
    test(`protects dashboard route ${route} when signed out`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15000 });
      await expectNoPageError(page);
    });
  }

  test('returns launch-safe API statuses', async ({ request }) => {
    const invalidLeadResponse = await request.post('/api/agency-leads', {
      data: {
        email: 'not-an-email',
        company: 'Smoke QA',
        message: 'Invalid email should be rejected before storage.',
      },
    });
    expect(invalidLeadResponse.status()).toBe(400);

    const unauthenticatedLeadsResponse = await request.get('/api/agency/leads');
    expect(unauthenticatedLeadsResponse.status()).toBe(401);

    const funnelReadResponse = await request.get('/api/agency-funnel-events');
    expect(funnelReadResponse.status()).toBe(405);
  });
});
