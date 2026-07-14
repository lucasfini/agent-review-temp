import { randomUUID, createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const themeStorageKey = 'audiorepurpose-theme';
const created = {
  userId: null,
  projectIds: [],
  outputIds: [],
  organizationId: null,
  libraryId: null,
  campaignId: null,
  profileId: null,
  voiceId: null,
  itemIds: [],
  snapshotIds: [],
  goalIds: [],
  insightIds: [],
};

function personalSlug(userId) {
  return `personal-${createHash('md5').update(userId).digest('hex').slice(0, 20)}`;
}

async function insert(table, payload, select = 'id') {
  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(payload)
    .select(select)
    .single();
  if (error || !data) {
    throw new Error(`${table}: ${error?.message || 'insert failed'}`);
  }
  return data;
}

function speakerData() {
  return {
    speakers: {
      spk_host: {
        id: 'spk_host',
        name: 'Maya Chen',
        finalName: 'Maya Chen',
        role: 'host',
        segmentCount: 3,
        totalDuration: 210,
      },
      spk_guest: {
        id: 'spk_guest',
        name: 'Jordan Lee',
        finalName: 'Jordan Lee',
        role: 'guest',
        segmentCount: 3,
        totalDuration: 260,
      },
    },
    segments: [
      {
        speakerId: 'spk_host',
        finalSpeakerId: 'spk_host',
        text: 'Welcome back. Today we are looking at how customer conversations become reusable sales and marketing assets.',
        startTime: 0,
        endTime: 38,
        confidence: 0.96,
        status: 'confirmed',
      },
      {
        speakerId: 'spk_guest',
        finalSpeakerId: 'spk_guest',
        text: 'The biggest shift was centralizing the transcript, the talking points, and the campaign plan in one workspace.',
        startTime: 38,
        endTime: 94,
        confidence: 0.94,
        status: 'confirmed',
      },
      {
        speakerId: 'spk_host',
        finalSpeakerId: 'spk_host',
        text: 'That made the content easier to review because every draft stayed attached to the original source.',
        startTime: 94,
        endTime: 142,
        confidence: 0.95,
        status: 'confirmed',
      },
    ],
    detectionMetadata: {
      totalSpeakers: 2,
      confidence: 0.95,
      lastModified: new Date().toISOString(),
    },
  };
}

async function createSeededAccount() {
  const nonce = randomUUID().slice(0, 8);
  const email = `launch.assets.${nonce}@example.com`;
  const password = `Launch-${nonce}-pass123`;

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Launch Capture User',
      display_name: 'Launch Capture User',
      dashboard_welcome_seen_at: new Date().toISOString(),
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    },
  });

  if (createUserError || !createdUser.user) {
    throw new Error(createUserError?.message || 'Failed to create capture user.');
  }

  const userId = createdUser.user.id;
  created.userId = userId;

  const organization = await insert('organizations', {
    name: 'BeaconOps Studio',
    slug: personalSlug(userId),
    type: 'personal_legacy',
    owner_user_id: userId,
  });
  created.organizationId = organization.id;

  await supabaseAdmin.from('organization_members').upsert({
    organization_id: organization.id,
    user_id: userId,
    role: 'owner',
    status: 'active',
    invited_by: userId,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id' });

  await supabaseAdmin.from('user_workspace_preferences').upsert({
    user_id: userId,
    active_organization_id: organization.id,
  }, { onConflict: 'user_id' });

  await supabaseAdmin.from('account_credits').upsert({
    user_id: userId,
    balance: 300,
    lifetime_credits_added: 300,
    lifetime_credits_spent: 0,
    version: 1,
  }, { onConflict: 'user_id' });

  const profile = await insert('creator_profiles', {
    organization_id: organization.id,
    name: 'BeaconOps profile',
    website: 'https://beaconops.example',
    positioning: 'Operational content for B2B teams that turn customer conversations into proof-driven assets.',
    audience: 'Founders, revenue leaders, and content operators at growing software companies.',
    content_goal: 'Publish credible customer proof, explain workflows clearly, and create review-ready drafts.',
    is_default: true,
    created_by: userId,
    owner_user_id: userId,
  });
  created.profileId = profile.id;

  const voice = await insert('brand_voices', {
    organization_id: organization.id,
    name: 'Proof-first operator',
    description: 'Clear, practical, and evidence-led. Avoid hype and keep claims tied to the source.',
    tone: 'Clear, practical, operator-led, and proof-first.',
    audience: 'B2B founders, revenue leaders, and content operators.',
    content_pillars_json: ['Customer proof', 'Workflow clarity', 'Review velocity'],
    writing_examples_json: ['Lead with the customer problem', 'Use concrete examples', 'Keep CTAs direct'],
    banned_phrases_json: ['revolutionary', 'game-changing', 'unlock your potential'],
    cta_preferences: 'Use direct CTAs that invite a workflow review or product conversation.',
    created_by: userId,
    owner_user_id: userId,
  });
  created.voiceId = voice.id;

  const campaign = await insert('campaigns', {
    organization_id: organization.id,
    brand_voice_id: voice.id,
    name: 'Q3 Customer Proof',
    status: 'active',
    objective: 'Turn customer interviews and webinars into sales-ready proof assets.',
    audience: 'B2B buyers comparing content operations tools.',
    channels_json: ['LinkedIn', 'Newsletter', 'Sales enablement'],
    owner_user_id: userId,
    created_by: userId,
  });
  created.campaignId = campaign.id;

  const library = await insert('content_libraries', {
    organization_id: organization.id,
    name: 'Customer proof library',
    description: 'Approved and in-review drafts grounded in recent source material.',
    created_by: userId,
    owner_user_id: userId,
  });
  created.libraryId = library.id;

  const transcript = [
    'Maya Chen: Welcome back. Today we are looking at how customer conversations become reusable sales and marketing assets.',
    'Jordan Lee: The biggest shift was centralizing the transcript, the talking points, and the campaign plan in one workspace.',
    'Maya Chen: That made the content easier to review because every draft stayed attached to the original source.',
  ].join('\n\n');

  const projectTitles = [
    'Customer proof interview: onboarding wins',
    'Founder update: Q3 narrative planning',
    'Sales demo recap: expansion objections',
  ];

  for (let index = 0; index < projectTitles.length; index += 1) {
    const project = await insert('projects', {
      user_id: userId,
      organization_id: organization.id,
      title: projectTitles[index],
      status: 'completed',
      performance_level: index === 0 ? 'premium' : 'content_kit',
      project_type: index === 1 ? 'MONOLOGUE' : 'INTERVIEW',
      audio_file_name: `${projectTitles[index].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp3`,
      audio_file_size: 18_874_368,
      audio_duration_seconds: 1780 + index * 340,
      audio_duration: 1780 + index * 340,
      processing_time_seconds: 132 + index * 28,
      processing_stage: 'completed',
      processing_progress: 100,
      selected_content_types: ['linkedin_posts', 'newsletter', 'quote_graphics'],
      transcription_text: transcript,
      transcription_segments: JSON.stringify(speakerData().segments),
      speaker_data: speakerData(),
      ai_summary: 'A source-backed conversation about using transcripts, analysis, and Studio context to produce review-ready B2B content.',
      chapters: [
        { title: 'Source context', start: 0 },
        { title: 'Reusable content system', start: 312 },
      ],
      key_takeaways: ['Keep claims tied to source material', 'Reuse Studio context across every output'],
      social_quotes: ['Every draft stayed attached to the original source.'],
      actual_processing_cost: 1.42 + index * 0.31,
      metadata: { seeded_for: 'launch_assets' },
    }, 'id, title');
    created.projectIds.push(project.id);
  }

  const outputPayloads = [
    ['LinkedIn Post', 'linkedin_post', 'social_post', 'linkedin', 'Three practical lessons from a customer proof interview, reframed for operators building a repeatable content workflow.'],
    ['Newsletter Brief', 'email_newsletter', 'social_post', 'general', 'A concise newsletter section that ties the customer quote, source transcript, and campaign angle together.'],
    ['Sales Enablement Summary', 'show_notes', 'show_notes', 'general', 'A short internal brief for account teams using the source interview as proof.'],
    ['Quote Bank', 'quote_graphic', 'quote_graphic', 'general', 'Reusable lines pulled from the transcript for social, decks, and launch copy.'],
  ];

  for (const [title, originalType, type, platform, content] of outputPayloads) {
    const output = await insert('outputs', {
      user_id: userId,
      project_id: created.projectIds[0],
      type,
      platform,
      title,
      content,
      status: 'generated',
      word_count: content.split(/\s+/).length,
      character_count: content.length,
      ai_model: 'launch-capture-model',
      ai_cost_usd: 0.018,
      metadata: {
        originalOutputType: originalType,
        platform_label: title,
        ui_metadata: { platform_label: title },
      },
    });
    created.outputIds.push(output.id);
  }

  const libraryItems = [
    ['Customer proof LinkedIn post', 'linkedin_post', 'LinkedIn', 'approved'],
    ['Newsletter proof section', 'newsletter', 'Email', 'in_review'],
    ['Sales enablement brief', 'sales_brief', 'Sales', 'draft'],
  ];
  for (let index = 0; index < libraryItems.length; index += 1) {
    const [title, contentType, platform, status] = libraryItems[index];
    const item = await insert('content_library_items', {
      organization_id: organization.id,
      creator_profile_id: profile.id,
      library_id: library.id,
      campaign_id: campaign.id,
      brand_voice_id: voice.id,
      project_id: created.projectIds[0],
      output_id: created.outputIds[index] || null,
      title,
      content_type: contentType,
      platform,
      status,
      body: 'This saved draft keeps the source project, Studio profile, voice, plan, and review metadata close to the content.',
      excerpt: 'Source-backed draft with Studio context attached.',
      source_label: 'Customer proof interview',
      tags_json: ['customer-proof', 'q3-plan', 'review-ready'],
      metadata_json: {
        generationContextSnapshot: {
          profile: 'BeaconOps profile',
          voice: 'Proof-first operator',
          plan: 'Q3 Customer Proof',
        },
      },
      created_by: userId,
      owner_user_id: userId,
    });
    created.itemIds.push(item.id);
  }

  const snapshot = await insert('narrative_coverage_snapshots', {
    user_id: userId,
    organization_id: organization.id,
    project_id: created.projectIds[0],
    project_title: projectTitles[0],
    coverage_window: '30d',
    topics: [
      { label: 'Customer proof', intensity: 0.82 },
      { label: 'Workflow automation', intensity: 0.74 },
      { label: 'Review velocity', intensity: 0.58 },
    ],
    ctas: [{ label: 'Book a workflow review', count: 2 }],
    opportunities: [
      {
        id: 'opp-proof',
        label: 'Use proof earlier',
        type: 'positioning',
        severity: 'high',
        summary: 'The strongest proof point appears late in the transcript.',
        recommendedAction: 'Move the customer quote into the introduction.',
      },
    ],
    ai_usage: { costUsd: 1.42, provider: 'openai', model: 'launch-capture' },
    ai_cost_usd: 1.42,
    analytics: { seeded_for: 'launch_assets' },
  });
  created.snapshotIds.push(snapshot.id);

  for (const goal of [
    ['Customer proof', 'include', 3],
    ['Book a workflow review', 'cta', 2],
  ]) {
    const row = await insert('narrative_goals', {
      user_id: userId,
      organization_id: organization.id,
      topic_label: goal[0],
      goal_type: goal[1],
      target_mentions: goal[2],
      cadence_days: 30,
      status: 'active',
    });
    created.goalIds.push(row.id);
  }

  for (const insight of [
    ['Maya Chen', 'person', 0.96],
    ['Customer proof workflow', 'concept', 0.91],
    ['Review-ready drafts', 'concept', 0.88],
  ]) {
    const row = await insert('insights', {
      project_id: created.projectIds[0],
      entity_id: insight[0].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: insight[0],
      category: insight[1],
      match_text: insight[0],
      match_variants: [insight[0]],
      transcript_excerpts: [
        {
          text: 'The biggest shift was centralizing the transcript, the talking points, and the campaign plan in one workspace.',
          startTime: 38,
        },
      ],
      simple_definition: `${insight[0]} appears as a useful source-backed theme in the transcript.`,
      full_explanation: `${insight[0]} gives the workspace a concrete anchor for analysis, saved drafts, and campaign context.`,
      related_concepts: ['Customer proof', 'Workflow clarity'],
      why_it_matters: 'It helps reviewers tie generated content back to the original conversation.',
      relationships: [],
      external_sources: [],
      confidence: insight[2],
      status: 'auto_detected',
      cost_usd: 0.003,
    });
    created.insightIds.push(row.id);
  }

  return { email, password };
}

async function cleanup() {
  const ops = [];
  if (created.insightIds.length) ops.push(supabaseAdmin.from('insights').delete().in('id', created.insightIds));
  if (created.goalIds.length) ops.push(supabaseAdmin.from('narrative_goals').delete().in('id', created.goalIds));
  if (created.snapshotIds.length) ops.push(supabaseAdmin.from('narrative_coverage_snapshots').delete().in('id', created.snapshotIds));
  if (created.itemIds.length) ops.push(supabaseAdmin.from('content_library_items').delete().in('id', created.itemIds));
  if (created.outputIds.length) ops.push(supabaseAdmin.from('outputs').delete().in('id', created.outputIds));
  if (created.projectIds.length) ops.push(supabaseAdmin.from('projects').delete().in('id', created.projectIds));
  if (created.libraryId) ops.push(supabaseAdmin.from('content_libraries').delete().eq('id', created.libraryId));
  if (created.campaignId) ops.push(supabaseAdmin.from('campaigns').delete().eq('id', created.campaignId));
  if (created.voiceId) ops.push(supabaseAdmin.from('brand_voices').delete().eq('id', created.voiceId));
  if (created.profileId) ops.push(supabaseAdmin.from('creator_profiles').delete().eq('id', created.profileId));
  if (created.userId) ops.push(supabaseAdmin.from('account_credits').delete().eq('user_id', created.userId));
  if (created.userId) ops.push(supabaseAdmin.from('user_workspace_preferences').delete().eq('user_id', created.userId));
  if (created.userId) ops.push(supabaseAdmin.from('organization_members').delete().eq('user_id', created.userId));
  if (created.organizationId) ops.push(supabaseAdmin.from('organizations').delete().eq('id', created.organizationId));

  for (const op of ops) {
    const { error } = await op;
    if (error) {
      console.warn(`cleanup warning: ${error.message}`);
    }
  }

  if (created.userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(created.userId);
    if (error) {
      console.warn(`cleanup warning: ${error.message}`);
    }
  }
}

async function login(page, email, password) {
  await page.goto(`${baseURL}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(750);
  const loginForm = page.locator('form').filter({ has: page.getByRole('button', { name: /^sign in$/i }) }).first();
  const emailInput = loginForm.locator('#email');
  const passwordInput = loginForm.locator('#password');
  await emailInput.fill(email);
  await passwordInput.fill(password);
  if (await emailInput.inputValue() !== email || await passwordInput.inputValue() !== password) {
    await page.evaluate(([nextEmail, nextPassword]) => {
      const emailElement = document.querySelector<HTMLInputElement>('form input#email');
      const passwordElement = document.querySelector<HTMLInputElement>('form input#password');
      for (const [element, value] of [[emailElement, nextEmail], [passwordElement, nextPassword]]) {
        if (!element) continue;
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, [email, password]);
  }
  await loginForm.getByRole('button', { name: /^sign in$/i }).click();
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  } catch (error) {
    await mkdir(path.join(root, 'artifacts', 'screenshots'), { recursive: true });
    await page.screenshot({
      path: path.join(root, 'artifacts', 'screenshots', 'launch-asset-login-failure.png'),
      fullPage: true,
      animations: 'disabled',
    }).catch(() => undefined);
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const usefulText = bodyText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).join(' | ');
    throw new Error(`Login did not reach dashboard. Visible text: ${usefulText || 'none'}`);
  }
}

async function setTheme(page, theme) {
  await page.evaluate(([key, value]) => {
    window.localStorage.setItem(key, value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, [themeStorageKey, theme]);
}

async function capture(page, route, theme, outputName, size) {
  const outputPath = path.join(root, 'public', 'launch', outputName);
  await page.setViewportSize(size);
  await setTheme(page, theme);
  await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
  await setTheme(page, theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('body').waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1250);
  await page.screenshot({
    path: outputPath,
    fullPage: false,
    animations: 'disabled',
  });
  console.log(`captured ${outputName}`);
}

async function main() {
  await mkdir(path.join(root, 'public', 'launch'), { recursive: true });
  let browser;

  try {
    const account = await createSeededAccount();
    browser = await chromium.launch();
    const page = await browser.newPage();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, account.email, account.password);

    const studioRoute = '/dashboard/studio/profile';
    await capture(page, '/dashboard/hub', 'dark', 'hub-real.png', { width: 1440, height: 1080 });
    await capture(page, '/dashboard/hub', 'light', 'hub-light.png', { width: 1440, height: 1080 });
    await capture(page, studioRoute, 'dark', 'project-real.png', { width: 1440, height: 1100 });
    await capture(page, studioRoute, 'light', 'project-light.png', { width: 1440, height: 1100 });
    await capture(page, '/dashboard/analytics', 'dark', 'speakers-real.png', { width: 1440, height: 1100 });
    await capture(page, '/dashboard/analytics', 'light', 'speakers-light.png', { width: 1440, height: 1100 });
    await capture(page, '/dashboard/upload', 'dark', 'upload-real.png', { width: 1440, height: 1080 });
    await capture(page, '/dashboard/upload', 'light', 'upload-light.png', { width: 1440, height: 1080 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
