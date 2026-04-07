import { test, expect, type Page } from '@playwright/test';

async function waitForAnyVisible(page: Page, candidates: Array<{ name: string; locator: ReturnType<Page['locator']> }>, timeout = 20000) {
  await expect.poll(async () => {
    for (const candidate of candidates) {
      if (await candidate.locator.isVisible().catch(() => false)) {
        return candidate.name;
      }
    }
    return 'pending';
  }, { timeout }).not.toBe('pending');

  for (const candidate of candidates) {
    if (await candidate.locator.isVisible().catch(() => false)) {
      return candidate.name;
    }
  }

  throw new Error('No expected dashboard state became visible');
}

async function loginAsDemo(page: Page) {
  await page.goto('/auth/demo');
  await expect(page).toHaveURL(/\/dashboard\/hub/, { timeout: 20000 });

  const welcomeModal = page.getByRole('heading', { name: 'Welcome to the Demo' });
  if (await welcomeModal.isVisible()) {
    await page.getByRole('button', { name: 'Explore on my own' }).click();
    await expect(welcomeModal).toBeHidden();
  }
}

async function openProjectsWorkspace(page: Page) {
  await page.goto('/dashboard/projects');

  const state = await waitForAnyVisible(page, [
    { name: 'error', locator: page.getByRole('heading', { name: 'Projects unavailable' }) },
    { name: 'empty', locator: page.getByRole('heading', { name: 'Select a project to open the studio' }) },
    { name: 'workspace', locator: page.getByText('Transcript').first() },
  ]);

  if (state === 'error') {
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    return 'error';
  }

  if (state === 'empty') {
    await expect(page.getByRole('link', { name: /Upload/i })).toBeVisible();
    return 'empty';
  }

  await expect(page.getByText('Transcript').first()).toBeVisible();
  return 'workspace';
}

test.describe('Authenticated Dashboard Flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('renders the hub shell and primary navigation', async ({ page }) => {
    const state = await waitForAnyVisible(page, [
      { name: 'error', locator: page.getByRole('heading', { name: 'Projects unavailable' }) },
      { name: 'hub', locator: page.getByRole('heading', { name: 'All Projects' }) },
    ]);

    if (state === 'error') {
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      return;
    }

    await expect(page.getByRole('link', { name: /Studio/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Upload/i })).toBeVisible();
  });

  test('shows upload demo restrictions and supports upload method tab switching', async ({ page }) => {
    await page.goto('/dashboard/upload');

    await expect(page.getByRole('heading', { name: 'Upload Audio' })).toBeVisible();
    await expect(page.getByText('Demo accounts cannot upload audio')).toBeVisible();

    await page.getByRole('button', { name: 'URL import' }).click();
    await expect(page.getByRole('heading', { name: 'Import from URL' })).toBeVisible();
    await expect(page.getByLabel('Media URL')).toBeVisible();

    await page.getByRole('button', { name: 'Integrations' }).click();
    await expect(page.getByRole('heading', { name: 'Import from apps' })).toBeVisible();
  });

  test('renders the projects workspace or its empty state cleanly', async ({ page }) => {
    const state = await openProjectsWorkspace(page);
    if (state !== 'workspace') {
      return;
    }

    const detailsToggle = page.getByRole('button', { name: 'Hide details panel' });
    await expect(detailsToggle).toBeVisible();
    await detailsToggle.click();
    await expect(page.getByRole('button', { name: 'Show details panel' })).toBeVisible();
    await page.getByRole('button', { name: 'Show details panel' }).click();

    await page.getByRole('button', { name: 'Enable reader view' }).click();
    await expect(page.getByRole('button', { name: 'Disable reader view' })).toBeVisible();

    await page.getByRole('button', { name: /^Review/ }).click();
    await expect(page.getByText('No segments selected')).toBeVisible();

    await page.getByRole('button', { name: /^Speakers/ }).click();
    const noSpeakers = page.getByText('No speakers detected yet');
    if (await noSpeakers.isVisible()) {
      await expect(noSpeakers).toBeVisible();
    } else {
      await expect(page.locator('[data-tour="speakers-panel"]')).toBeVisible();
      await expect(page.getByText('+ Add speaker')).toHaveCount(0);
    }

    await page.getByRole('button', { name: /^Content/ }).click();
    await expect(page.getByRole('button', { name: 'Generate Content' })).toHaveCount(0);
  });

  test('renders analytics and supports switching to goals', async ({ page }) => {
    await page.goto('/dashboard/analytics');

    const state = await waitForAnyVisible(page, [
      { name: 'error', locator: page.getByRole('heading', { name: 'Analytics unavailable' }) },
      { name: 'empty', locator: page.getByRole('heading', { name: 'No analytics yet' }) },
      { name: 'analytics', locator: page.getByRole('heading', { name: 'Analytics' }) },
    ]);

    if (state === 'error') {
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      return;
    }

    if (state === 'empty') {
      await expect(page.getByRole('button', { name: 'Upload your first project' })).toBeVisible();
      return;
    }

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await page.getByRole('tab', { name: 'Goals' }).click();
    await expect(page.locator('[data-tour="analytics-goals-panel"]')).toBeVisible();
    await expect(page.getByText(/goal[s]? being tracked/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Manage Goals/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Create your first goal/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Browse example goals/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pause goal:/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Archive goal:/i })).toHaveCount(0);
  });

  test('renders settings sections across preferences, billing, and usage', async ({ page }) => {
    await page.goto('/dashboard/settings');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Profile Information')).toBeVisible();
    await expect(page.getByText('Demo account settings are read-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Account' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);

    const main = page.getByRole('main');

    await page.goto('/dashboard/billing');
    await expect(page.getByText('Credit Balance')).toBeVisible();

    await page.goto('/dashboard/usage');
    const usageEmptyState = page.getByRole('heading', { name: 'No usage data yet' });
    if (await usageEmptyState.isVisible()) {
      await expect(page.getByText('Start processing podcasts and generating content')).toBeVisible();
    } else {
      await expect(page.getByText('Usage Trends')).toBeVisible();
    }

    await expect(page.getByText('Danger Zone')).toBeVisible();
  });
});
