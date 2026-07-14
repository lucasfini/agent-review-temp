import { expect, test, type Page } from '@playwright/test';

async function gotoHome(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
  await page.locator('body').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('audiorepurpose-theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

test.describe('launch product navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('desktop Product dropdown options remain clickable after pointer travel', async ({ page }) => {
    await gotoHome(page);

    const productButton = page.getByRole('button', { name: /^Product$/ });
    await productButton.hover();

    const productMenu = page.getByRole('menu', { name: /Product navigation/i });
    await expect(productMenu).toContainText('Product');
    await expect(productMenu.getByRole('menuitem', { name: /^Upload\s+Upload audio/i })).toBeVisible();
    await expect(productMenu.getByRole('menuitem', { name: /^Teams\s+Collaborate/i })).toBeVisible();
    await expect(productMenu.getByRole('menuitem', { name: /^Studio\s+Manage profiles/i })).toBeVisible();
    await expect(productMenu.getByRole('menuitem', { name: /^Library\s+Save drafts/i })).toBeVisible();
    await expect(productMenu.getByRole('menuitem', { name: /^Integrations\s+Connect supported/i })).toBeVisible();
    await expect(productMenu.getByRole('menuitem', { name: /^Analysis\s+Review transcripts/i })).toBeVisible();
    await expect(productMenu).not.toContainText('Capture and process');
    await expect(productMenu).not.toContainText('Overview');
    await expect(productMenu).not.toContainText('Source intake');

    const studioOption = productMenu.getByRole('menuitem', { name: /^Studio\s+Manage profiles/i });
    await expect(studioOption).toBeVisible();

    const buttonBox = await productButton.boundingBox();
    const optionBox = await studioOption.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(optionBox).not.toBeNull();

    await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height + 2);
    await page.mouse.move(optionBox!.x + optionBox!.width / 2, optionBox!.y + optionBox!.height / 2);
    await expect(productMenu).toBeVisible();
    await studioOption.click();

    await expect(page).toHaveURL(/\/product\/studio$/);
  });

  test('desktop Built For dropdown options remain clickable after pointer travel', async ({ page }) => {
    await gotoHome(page);

    const builtForButton = page.getByRole('button', { name: /^Built For$/ });
    await builtForButton.hover();

    const creatorsOption = page.getByRole('menuitem', { name: /Creators/i });
    await expect(creatorsOption).toBeVisible();

    const buttonBox = await builtForButton.boundingBox();
    const optionBox = await creatorsOption.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(optionBox).not.toBeNull();

    await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height + 2);
    await page.mouse.move(optionBox!.x + optionBox!.width / 2, optionBox!.y + optionBox!.height / 2);
    await expect(page.getByRole('menu', { name: /Built For navigation/i })).toBeVisible();
    await creatorsOption.click();

    await expect(page).toHaveURL(/\/built-for\/creators$/);
    await expect(page.getByRole('heading', { name: 'Creators', exact: true })).toBeVisible();
  });

  test('desktop dropdowns close deliberately and keep the header stable', async ({ page }) => {
    await gotoHome(page);

    const header = page.locator('.site-nav');
    const productButton = page.getByRole('button', { name: /^Product$/ });
    const builtForButton = page.getByRole('button', { name: /^Built For$/ });
    const initialHeight = await header.evaluate((element) => element.getBoundingClientRect().height);

    await productButton.hover();
    const productMenu = page.getByRole('menu', { name: /Product navigation/i });
    await expect(productMenu).toBeVisible();
    await expect(productButton).toHaveAttribute('aria-expanded', 'true');

    const productBox = await productButton.boundingBox();
    expect(productBox).not.toBeNull();
    await page.mouse.move(productBox!.x + productBox!.width / 2, productBox!.y + productBox!.height + 10);
    await page.waitForTimeout(80);
    await expect(productMenu).toBeVisible();

    await builtForButton.hover();
    await expect(productMenu).toBeHidden();
    await expect(page.getByRole('menu', { name: /Built For navigation/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: /Built For navigation/i })).toBeHidden();

    await productButton.click();
    await expect(productMenu).toBeVisible();
    await page.mouse.click(20, 250);
    await expect(productMenu).toBeHidden();

    const finalHeight = await header.evaluate((element) => element.getBoundingClientRect().height);
    expect(finalHeight).toBe(initialHeight);

    const navButtonMetrics = await page.locator('.nav-center :is(a, button)').evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { height: Math.round(rect.height), top: Math.round(rect.top) };
      }),
    );
    expect(new Set(navButtonMetrics.map((metric) => metric.height)).size).toBe(1);
    expect(new Set(navButtonMetrics.map((metric) => metric.top)).size).toBe(1);
  });

  test('desktop Product menu supports keyboard opening and link navigation', async ({ page }) => {
    await gotoHome(page);

    const productButton = page.getByRole('button', { name: /^Product$/ });
    await productButton.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: /Product navigation/i })).toBeVisible();
    await expect(productButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu', { name: /Product navigation/i }).getByRole('menuitem').first()).toBeFocused();

    await expect(page.getByRole('menuitem', { name: /^Upload\s+Upload audio/i })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/product\/upload$/);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`desktop dropdowns render in ${theme} mode`, async ({ page }) => {
      await gotoHome(page);
      await setTheme(page, theme);

      const productButton = page.getByRole('button', { name: /^Product$/ });
      await productButton.hover();
      const productMenu = page.getByRole('menu', { name: /Product navigation/i });
      await expect(productMenu).toBeVisible();
      await expect(productMenu).toContainText('Upload');

      await page.getByRole('button', { name: /^Built For$/ }).hover();
      const builtForMenu = page.getByRole('menu', { name: /Built For navigation/i });
      await expect(builtForMenu).toBeVisible();
      await expect(builtForMenu).toContainText('Marketing teams');
      await expect(builtForMenu).not.toContainText('View all use cases');
      await expectNoHorizontalOverflow(page);
    });
  }

  test('mobile navigation uses accordions and closes after navigation', async ({ page }) => {
    await gotoHome(page, 390, 844);

    await page.getByRole('button', { name: /Open navigation menu/i }).click();
    const mobileMenu = page.locator('#mobile-marketing-menu');
    await expect(mobileMenu).toBeVisible();
    await expect(mobileMenu.getByRole('link', { name: /Sign up for free/i })).toBeVisible();

    await mobileMenu.getByRole('button', { name: /^Product$/ }).click();
    await expect(mobileMenu.getByRole('link', { name: /Upload/i })).toBeVisible();

    await mobileMenu.getByRole('button', { name: /^Built For$/ }).click();
    await expect(mobileMenu.getByRole('link', { name: /Creators/i })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await mobileMenu.getByRole('link', { name: /Creators/i }).click();
    await expect(page).toHaveURL(/\/built-for\/creators$/);
    await expect(page.locator('#mobile-marketing-menu')).toBeHidden();
  });

  test('mobile navigation closes on Escape', async ({ page }) => {
    await gotoHome(page, 390, 844);

    await page.getByRole('button', { name: /Open navigation menu/i }).click();
    await expect(page.locator('#mobile-marketing-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-marketing-menu')).toBeHidden();
  });

  test('reduced motion still exposes dropdown content', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHome(page);

    await page.getByRole('button', { name: /^Product$/ }).hover();
    await expect(page.getByRole('menu', { name: /Product navigation/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: /Product navigation/i })).toBeHidden();
  });

  test('pricing page includes the comparison chart below plans', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);

    await page.getByRole('heading', { name: /What each plan includes/i }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: /What each plan includes/i })).toBeVisible();
    await expect(page.getByRole('table')).toContainText('Monthly credits');
    await expect(page.getByRole('table')).toContainText('35,000 pooled');
  });

  test('launch product layer cards navigate from the full card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const productOverview = page.locator('#product-overview');
    await productOverview.scrollIntoViewIfNeeded();

    const studioCard = productOverview.getByRole('link', {
      name: /Studio Manage profiles, voices, campaign plans, and reusable brand context\./i,
    });
    await studioCard.click();

    await expect(page).toHaveURL(/\/product\/studio$/);
  });
});
