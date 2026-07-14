import { expect, test } from '@playwright/test';

const builtForPages = [
  {
    route: '/built-for/marketing-teams',
    heading: /^Marketing Teams$/i,
    text: 'Campaign-ready drafts',
  },
  {
    route: '/built-for/founders',
    heading: /^Founders$/i,
    text: 'Founder POV capture',
  },
  {
    route: '/built-for/sales-teams',
    heading: /^Sales Teams$/i,
    text: 'Objection capture',
  },
  {
    route: '/built-for/customer-success',
    heading: /^Customer Success Teams$/i,
    text: 'Feedback capture',
  },
  {
    route: '/built-for/product-marketers',
    heading: /^Product Marketers$/i,
    text: 'Positioning signal',
  },
  {
    route: '/built-for/consultants',
    heading: /^Consultants$/i,
    text: 'Client call summaries',
  },
  {
    route: '/built-for/creators',
    heading: /^Creators$/i,
    text: 'Multi-channel drafts',
  },
] as const;

test.describe('built-for marketing pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('built-for index links to the target audience pages', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/built-for', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /built for teams that turn conversations into content/i })).toBeVisible();
    await expect(page.locator('#built-for-pages a[href="/built-for/creators"]').first()).toBeVisible();
  });

  for (const builtForPage of builtForPages) {
    test(`${builtForPage.route} renders audience-specific copy`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto(builtForPage.route, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { name: builtForPage.heading }).first()).toBeVisible();
      await expect(page.getByText(builtForPage.text).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Sign up for free/i }).first()).toHaveAttribute('href', '/auth/signup');
    });
  }
});
