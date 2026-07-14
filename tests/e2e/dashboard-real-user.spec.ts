import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Supabase environment variables are required for real-user Playwright tests.');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const seededOutputTitle = 'LinkedIn Post';
const seededOutputContent = 'Three practical lessons from this interview, reframed for a professional audience.';

type SeededAccount = {
  userId: string;
  email: string;
  password: string;
  projectId: string;
  speakerOriginalName: string;
};

const seededAccounts: SeededAccount[] = [];

function buildSpeakerData() {
  return {
    speakers: {
      spk_host: {
        id: 'spk_host',
        name: 'Host Alpha',
        finalName: 'Host Alpha',
        fallbackName: 'Host Alpha',
        customName: 'Host Alpha',
        role: 'host',
        segmentCount: 2,
        totalDuration: 42,
      },
      spk_guest: {
        id: 'spk_guest',
        name: 'Guest Beta',
        finalName: 'Guest Beta',
        fallbackName: 'Guest Beta',
        customName: 'Guest Beta',
        role: 'guest',
        segmentCount: 1,
        totalDuration: 18,
      },
    },
    segments: [
      {
        speakerId: 'spk_host',
        finalSpeakerId: 'spk_host',
        text: 'Welcome back to the show. Today we are testing real user project flows.',
        startTime: 0,
        endTime: 18,
        confidence: 0.96,
        status: 'confirmed',
      },
      {
        speakerId: 'spk_guest',
        finalSpeakerId: 'spk_guest',
        text: 'Thanks for having me. I am sharing a few concrete examples for the transcript.',
        startTime: 18,
        endTime: 36,
        confidence: 0.92,
        status: 'confirmed',
      },
      {
        speakerId: 'spk_host',
        finalSpeakerId: 'spk_host',
        text: 'Perfect. Let us verify the speaker rename workflow and keep the UI stable.',
        startTime: 36,
        endTime: 60,
        confidence: 0.94,
        status: 'confirmed',
      },
    ],
    detectionMetadata: {
      totalSpeakers: 2,
      confidence: 0.94,
      lastModified: new Date().toISOString(),
    },
  };
}

async function createSeededAccount(): Promise<SeededAccount> {
  const nonce = randomUUID().slice(0, 8);
  const email = `playwright.real.${nonce}@example.com`;
  const password = `Playwright-${nonce}-pass123`;

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Playwright Real User',
      display_name: 'Playwright Real User',
    },
  });

  if (createUserError || !createdUser.user) {
    throw new Error(createUserError?.message || 'Failed to create seeded user.');
  }

  const userId = createdUser.user.id;

  await supabaseAdmin
    .from('account_credits')
    .upsert({
      user_id: userId,
      balance: 25,
      lifetime_credits_added: 25,
      lifetime_credits_spent: 0,
      version: 1,
    }, { onConflict: 'user_id' });

  const speakerData = buildSpeakerData();
  const { data: insertedProject, error: insertProjectError } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      title: `Playwright Project ${nonce}`,
      status: 'completed',
      performance_level: 'premium',
      project_type: 'INTERVIEW',
      audio_file_name: `playwright-project-${nonce}.mp3`,
      audio_file_size: 1048576,
      audio_duration_seconds: 60,
      processing_time_seconds: 12,
      processing_stage: 'completed',
      processing_progress: 100,
      transcription_text: [
        'Host Alpha: Welcome back to the show. Today we are testing real user project flows.',
        'Guest Beta: Thanks for having me. I am sharing a few concrete examples for the transcript.',
        'Host Alpha: Perfect. Let us verify the speaker rename workflow and keep the UI stable.',
      ].join('\n\n'),
      transcription_segments: JSON.stringify(speakerData.segments),
      speaker_data: speakerData,
      ai_summary: 'A short interview used to validate project workspace mutations.',
      chapters: [],
      key_takeaways: [],
      social_quotes: [],
    } as any)
    .select('id')
    .single();

  if (insertProjectError || !insertedProject) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(insertProjectError?.message || 'Failed to seed project.');
  }

  const seededAccount = {
    userId,
    email,
    password,
    projectId: insertedProject.id,
    speakerOriginalName: 'Host Alpha',
  };

  seededAccounts.push(seededAccount);
  return seededAccount;
}

async function insertSeededOutput(userId: string, projectId: string) {
  const { data, error } = await supabaseAdmin
    .from('outputs')
    .insert({
      user_id: userId,
      project_id: projectId,
      type: 'social_post',
      platform: 'linkedin',
      title: seededOutputTitle,
      content: seededOutputContent,
      status: 'generated',
      word_count: 11,
      character_count: 78,
      ai_model: 'playwright-test-model',
      ai_cost_usd: 0.001,
      metadata: {
        originalOutputType: 'linkedin_post',
        platform: 'LinkedIn',
        ui_metadata: {
          platform_label: 'LinkedIn Post',
          theme_label: 'Professional',
          badge_color: '#0077B5',
        },
      },
    } as any)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to seed output.');
  }

  return data.id as string;
}

async function cleanupSeededAccounts() {
  while (seededAccounts.length > 0) {
    const account = seededAccounts.pop();
    if (!account) continue;

    await supabaseAdmin.from('outputs').delete().eq('project_id', account.projectId);
    await supabaseAdmin.from('projects').delete().eq('id', account.projectId);
    await supabaseAdmin.from('account_credits').delete().eq('user_id', account.userId);
    await supabaseAdmin.from('profiles').delete().eq('id', account.userId);
    await supabaseAdmin.auth.admin.deleteUser(account.userId);
  }
}

async function fetchProjectSpeakerData(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('speaker_data')
    .eq('id', projectId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.speaker_data === 'string'
    ? JSON.parse(data.speaker_data)
    : data?.speaker_data;
}

async function fetchGenerationProgress(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from('generation_progress')
    .select('status, total_blocks, completed_blocks, message')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function countOutputs(projectId: string) {
  const { count, error } = await supabaseAdmin
    .from('outputs')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function seedConnectedIntegration(userId: string, provider: 'zoom' | 'microsoft') {
  const externalAccountId = `${provider}-acct-${randomUUID().slice(0, 8)}`;
  const metadata = provider === 'zoom'
    ? { email: 'host@zoom.example', name: 'Zoom Host' }
    : { email: 'host@microsoft.example', name: 'Teams Host' };

  const { error } = await supabaseAdmin
    .from('integration_connections')
    .upsert({
      user_id: userId,
      provider,
      external_account_id: externalAccountId,
      status: 'connected',
      scopes: [],
      access_token_enc: 'encrypted-token',
      refresh_token_enc: 'encrypted-refresh-token',
      metadata,
    } as any, { onConflict: 'user_id,provider' });

  if (error) {
    throw new Error(error.message);
  }
}

async function fetchIntegrationStatus(userId: string, provider: 'zoom' | 'microsoft') {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('status')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.status ?? null;
}

async function loginAsUser(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  const loginForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Sign In' }) }).first();
  await loginForm.locator('#email').fill(email);
  await loginForm.locator('#password').fill(password);
  await loginForm.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.afterAll(async () => {
  await cleanupSeededAccounts();
});

test.describe('Authenticated Real User Flows', () => {
  test('renames a speaker from the project workspace and persists after reload', async ({ page }) => {
    const account = await createSeededAccount();
    const renamedSpeaker = `Renamed Host ${account.projectId.slice(0, 4)}`;

    await loginAsUser(page, account.email, account.password);
    await page.goto(`/dashboard/projects?id=${account.projectId}`);

    await expect(page.getByText('Transcript').first()).toBeVisible();
    await page.getByRole('button', { name: /^Speakers/ }).click();
    const speakersPanel = page.locator('[data-tour="speakers-panel"]');
    await expect(speakersPanel).toBeVisible();

    await speakersPanel.locator('span[title="Click to rename"]').first().click();
    const editInput = speakersPanel.locator('input').first();
    await expect(editInput).toBeVisible();
    await editInput.fill(renamedSpeaker);
    await editInput.press('Enter');

    await expect(speakersPanel.getByText(renamedSpeaker, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects\\?id=${account.projectId}`));
    await page.getByRole('button', { name: /^Speakers/ }).click();
    await expect(page.locator('[data-tour="speakers-panel"]').getByText(renamedSpeaker, { exact: true })).toBeVisible();
  });

  test('changes a speaker role from the project workspace and persists after reload', async ({ page }) => {
    const account = await createSeededAccount();

    await loginAsUser(page, account.email, account.password);
    await page.goto(`/dashboard/projects?id=${account.projectId}`);

    await expect(page.getByText('Transcript').first()).toBeVisible();
    await page.getByRole('button', { name: /^Speakers/ }).click();
    const speakersPanel = page.locator('[data-tour="speakers-panel"]');
    await expect(speakersPanel).toBeVisible();

    await speakersPanel.getByRole('button', { name: `Set role for speaker ${account.speakerOriginalName}` }).click();
    await page.getByRole('button', { name: `Set speaker ${account.speakerOriginalName} role to Co-host` }).click();

    await expect(speakersPanel.getByText('Co-host', { exact: false })).toBeVisible();
    await expect
      .poll(async () => {
        const speakerData = await fetchProjectSpeakerData(account.projectId);
        return speakerData?.speakers?.spk_host?.role || '';
      })
      .toBe('co_host');

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects\\?id=${account.projectId}`));
    await page.getByRole('button', { name: /^Speakers/ }).click();
    await expect(page.locator('[data-tour="speakers-panel"]').getByText('Co-host', { exact: false })).toBeVisible();
  });

  test('reassigns and removes a speaker from the project workspace', async ({ page }) => {
    const account = await createSeededAccount();

    await loginAsUser(page, account.email, account.password);
    await page.goto(`/dashboard/projects?id=${account.projectId}`);

    await expect(page.getByText('Transcript').first()).toBeVisible();
    await page.getByRole('button', { name: /^Speakers/ }).click();
    const speakersPanel = page.locator('[data-tour="speakers-panel"]');
    await expect(speakersPanel).toBeVisible();

    await speakersPanel.getByRole('button', { name: 'Open more speaker actions for Guest Beta' }).click();
    await page.getByRole('button', { name: 'Delete speaker Guest Beta' }).click();
    await speakersPanel.getByRole('combobox', { name: 'Reassign segments for speaker Guest Beta' }).selectOption('spk_host');
    await speakersPanel.getByRole('button', { name: 'Reassign and remove speaker Guest Beta' }).click();

    await expect(speakersPanel.getByText('Guest Beta', { exact: true })).toHaveCount(0);
    await expect(speakersPanel.getByText('Host Alpha', { exact: true })).toBeVisible();
    await expect(speakersPanel.getByText('3 segments', { exact: false })).toBeVisible();
    await expect
      .poll(async () => {
        const speakerData = await fetchProjectSpeakerData(account.projectId);
        return {
          speakerCount: Object.keys(speakerData?.speakers || {}).length,
          guestExists: Boolean(speakerData?.speakers?.spk_guest),
          hostSegments: speakerData?.speakers?.spk_host?.segmentCount || 0,
        };
      })
      .toEqual({ speakerCount: 1, guestExists: false, hostSegments: 3 });

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects\\?id=${account.projectId}`));
    await page.getByRole('button', { name: /^Speakers/ }).click();
    const reloadedSpeakersPanel = page.locator('[data-tour="speakers-panel"]');
    await expect(reloadedSpeakersPanel.getByText('Guest Beta', { exact: true })).toHaveCount(0);
    await expect(reloadedSpeakersPanel.getByText('3 segments', { exact: false })).toBeVisible();
  });

  test('starts content generation for a real user project', async ({ page }) => {
    const account = await createSeededAccount();

    await loginAsUser(page, account.email, account.password);
    await page.goto(`/dashboard/projects?id=${account.projectId}`);

    await expect(page.getByText('Transcript').first()).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    const modal = page.locator('[data-tour="generate-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Generate Content' })).toBeVisible();

    await modal.getByRole('button', { name: 'Increase LinkedIn Posts quantity' }).click();
    await expect(modal.getByText('1 item', { exact: false })).toBeVisible();

    await modal.getByRole('button', { name: /^Generate/ }).click();

    await expect(modal).toBeHidden();
    await expect
      .poll(async () => {
        const progress = await fetchGenerationProgress(account.projectId);
        return progress
          ? {
              status: progress.status,
              totalBlocks: progress.total_blocks,
              completedBlocks: progress.completed_blocks,
            }
          : null;
      })
      .toEqual({ status: 'preparing', totalBlocks: 1, completedBlocks: 0 });
  });

  test('shows seeded outputs and deletes an output from the content tab', async ({ page }) => {
    const account = await createSeededAccount();
    await insertSeededOutput(account.userId, account.projectId);

    await page.addInitScript(() => {
      let copiedText = '';
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            copiedText = value;
          },
        },
      });
      Object.defineProperty(window, '__playwrightCopiedText', {
        configurable: true,
        get: () => copiedText,
      });
    });

    await loginAsUser(page, account.email, account.password);
    await page.goto(`/dashboard/projects?id=${account.projectId}`);

    await expect(page.getByText('Transcript').first()).toBeVisible();
    await page.getByRole('button', { name: /^Content/ }).click();

    const contentCard = page.locator('[data-tour="content-output"]').first();
    await expect(contentCard).toBeVisible();
    await contentCard.getByRole('button', { name: 'Copy output LinkedIn Post' }).click();
    await expect(page.getByText('Copied to clipboard').first()).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => (window as Window & { __playwrightCopiedText?: string }).__playwrightCopiedText ?? ''))
      .toBe(seededOutputContent);

    const downloadPromise = page.waitForEvent('download');
    await contentCard.getByRole('button', { name: 'Download output LinkedIn Post' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('linkedin_post.txt');
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const downloadedContent = await readFile(downloadPath!, 'utf8');
    expect(downloadedContent).toBe(`${seededOutputTitle}\n\n${seededOutputContent}`);

    await expect(contentCard.getByRole('button', { name: 'Delete output LinkedIn Post' })).toBeVisible();
    await contentCard.getByRole('button', { name: 'Delete output LinkedIn Post' }).click();
    await expect(contentCard).toHaveCount(0);
    await expect.poll(async () => countOutputs(account.projectId)).toBe(0);

    await page.reload();
    await page.getByRole('button', { name: /^Content/ }).click();
    await expect(page.getByText('No content yet')).toBeVisible();
  });

  test('saves real-user settings updates and persists the display name', async ({ page }) => {
    const account = await createSeededAccount();
    const updatedDisplayName = `QA User ${account.projectId.slice(0, 4)}`;

    await loginAsUser(page, account.email, account.password);
    await page.goto('/dashboard/settings');

    const displayNameInput = page.getByLabel('Display Name').first();
    await expect(displayNameInput).toBeEditable();
    await displayNameInput.fill(updatedDisplayName);
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect(page.getByText('Settings saved successfully').first()).toBeVisible();
    await expect
      .poll(async () => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(account.userId);
        if (error) return '';
        return data.user?.user_metadata?.display_name || data.user?.user_metadata?.full_name || '';
      })
      .toBe(updatedDisplayName);

    await page.reload();
    await expect(page.getByLabel('Display Name').first()).toHaveValue(updatedDisplayName, { timeout: 15000 });
  });

  test('shows a validation error for weak passwords in settings', async ({ page }) => {
    const account = await createSeededAccount();

    await loginAsUser(page, account.email, account.password);
    await page.goto('/dashboard/settings');

    await page.getByLabel('New Password', { exact: true }).fill('short12');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('short12');
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect(page.getByText('Password must be at least 8 characters long.').first()).toBeVisible();
  });

  test('starts the Zoom integration connect flow for a real user', async ({ page }) => {
    const account = await createSeededAccount();

    await page.route('https://zoom.us/oauth/authorize**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Zoom OAuth Test</body></html>',
      });
    });

    await loginAsUser(page, account.email, account.password);
    await page.goto('/dashboard/integrations');

    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes('/api/integrations/zoom/start?mode=json') && resp.status() === 200
    );

    await page.getByRole('button', { name: 'Connect' }).first().click();

    await responsePromise;

    await page.waitForURL(/zoom\.us\/oauth\/authorize/, { timeout: 15000 });
  });

  test('disconnects a seeded Zoom integration for a real user', async ({ page }) => {
    const account = await createSeededAccount();
    await seedConnectedIntegration(account.userId, 'zoom');

    await loginAsUser(page, account.email, account.password);
    await page.goto('/dashboard/integrations');

    await expect(page.getByText('Connected - host@zoom.example')).toBeVisible();
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect.poll(async () => fetchIntegrationStatus(account.userId, 'zoom')).toBe('revoked');
    await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();
  });
});
