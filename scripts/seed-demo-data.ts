/**
 * Seed Demo Data Script
 *
 * Creates 4 pre-seeded, fully-processed demo projects for demo@audiorepurpose.com
 * so visitors experience the full value of AudioRepurpose immediately.
 *
 * Usage: npx tsx scripts/seed-demo-data.ts
 *
 * Prerequisites:
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - Demo user must already exist in Supabase auth (created by signup flow)
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Content imports ───────────────────────────────────────────────────────────
import {
  PROJECT1_TITLE,
  PROJECT1_TRANSCRIPTION_TEXT,
  PROJECT1_SEGMENTS,
  PROJECT1_SPEAKER_DATA,
} from './demo-content/project1-basic';

import {
  PROJECT2_TITLE,
  PROJECT2_TRANSCRIPTION_TEXT,
  PROJECT2_SEGMENTS,
  PROJECT2_SPEAKER_DATA,
  PROJECT2_SUMMARY,
  PROJECT2_OUTPUTS,
} from './demo-content/project2-pro';

import {
  PROJECT3_TITLE,
  PROJECT3_TRANSCRIPTION_TEXT,
  PROJECT3_SEGMENTS,
  PROJECT3_SPEAKER_DATA,
  PROJECT3_SUMMARY,
  PROJECT3_CHAPTERS,
  PROJECT3_TAKEAWAYS,
  PROJECT3_QUOTES,
  PROJECT3_OUTPUTS,
  PROJECT3_INSIGHTS,
} from './demo-content/project3-premium-science';

import {
  PROJECT4_TITLE,
  PROJECT4_TRANSCRIPTION_TEXT,
  PROJECT4_SEGMENTS,
  PROJECT4_SPEAKER_DATA,
  PROJECT4_SUMMARY,
  PROJECT4_CHAPTERS,
  PROJECT4_TAKEAWAYS,
  PROJECT4_QUOTES,
  PROJECT4_OUTPUTS,
  PROJECT4_INSIGHTS,
} from './demo-content/project4-premium-ai';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@audiorepurpose.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`  ${msg}`);
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 AudioRepurpose Demo Data Seeder');
  console.log(`   Target: ${DEMO_EMAIL}`);

  // ── 1. Find demo user ──────────────────────────────────────────────────────
  section('1. Looking up demo user');
  const { data: { users }, error: userListError } = await supabase.auth.admin.listUsers();
  if (userListError) {
    console.error('❌ Failed to list users:', userListError.message);
    process.exit(1);
  }

  const demoUser = users.find(u => u.email === DEMO_EMAIL);
  if (!demoUser) {
    console.error(`❌ Demo user not found: ${DEMO_EMAIL}`);
    console.error('   Create the user at https://supabase.com/dashboard → Authentication → Users');
    process.exit(1);
  }
  const demoId = demoUser.id;
  log(`✅ Found demo user: ${demoId}`);

  // ── 2. Delete existing demo data ───────────────────────────────────────────
  section('2. Clearing existing demo data');

  // Get project IDs first (for cascaded deletes of insights/coverage)
  const { data: existingProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', demoId);

  const existingProjectIds = (existingProjects || []).map((p: any) => p.id);

  if (existingProjectIds.length > 0) {
    // Delete insights
    const { error: insightsDel } = await supabase
      .from('insights')
      .delete()
      .in('project_id', existingProjectIds);
    if (insightsDel) log(`⚠️  insights delete: ${insightsDel.message}`);
    else log(`✅ Deleted insights for ${existingProjectIds.length} projects`);

    // Delete coverage snapshots
    const { error: snapDel } = await supabase
      .from('narrative_coverage_snapshots')
      .delete()
      .in('project_id', existingProjectIds);
    if (snapDel) log(`⚠️  coverage_snapshots delete: ${snapDel.message}`);
    else log(`✅ Deleted coverage snapshots`);

    // Delete outputs
    const { error: outputsDel } = await supabase
      .from('outputs')
      .delete()
      .in('project_id', existingProjectIds);
    if (outputsDel) log(`⚠️  outputs delete: ${outputsDel.message}`);
    else log(`✅ Deleted outputs`);
  }

  // Delete narrative goals
  const { error: goalsDel } = await supabase
    .from('narrative_goals')
    .delete()
    .eq('user_id', demoId);
  if (goalsDel) log(`⚠️  narrative_goals delete: ${goalsDel.message}`);
  else log(`✅ Deleted narrative goals`);

  // Delete projects (cascades to related tables)
  const { error: projDel } = await supabase
    .from('projects')
    .delete()
    .eq('user_id', demoId);
  if (projDel) log(`⚠️  projects delete: ${projDel.message}`);
  else log(`✅ Deleted ${existingProjectIds.length} existing projects`);

  // ── 3. Upsert account credits ──────────────────────────────────────────────
  section('3. Setting up account credits');
  const { error: creditsError } = await supabase
    .from('account_credits')
    .upsert({
      user_id: demoId,
      balance: 50.00,
      lifetime_credits_added: 150.00,
      lifetime_credits_spent: 100.00,
      version: 1,
    }, { onConflict: 'user_id' });
  if (creditsError) log(`⚠️  credits upsert: ${creditsError.message}`);
  else log(`✅ Credits set: $50.00 balance`);

  // ── 4. Insert projects ─────────────────────────────────────────────────────
  section('4. Inserting projects');

  // Project 1 — Basic
  const { data: p1, error: p1Err } = await supabase
    .from('projects')
    .insert({
      user_id: demoId,
      title: PROJECT1_TITLE,
      status: 'completed',
      performance_level: 'basic',
      project_type: 'INTERVIEW',
      audio_file_name: 'how-we-built-it-dorm-to-10m-arr.mp3',
      audio_file_size: 31457280,
      audio_duration_seconds: 1320,
      processing_time_seconds: 28,
      processing_stage: 'completed',
      processing_progress: 100,
      transcription_text: PROJECT1_TRANSCRIPTION_TEXT,
      transcription_segments: JSON.stringify(PROJECT1_SEGMENTS),
      speaker_data: PROJECT1_SPEAKER_DATA,
      ai_summary: null,
      chapters: [],
      key_takeaways: [],
      social_quotes: [],
      created_at: daysAgo(14),
      updated_at: daysAgo(14),
      processing_started_at: daysAgo(14),
      processing_completed_at: daysAgo(14),
    } as any)
    .select('id')
    .single();
  if (p1Err || !p1) {
    console.error('❌ Failed to insert project 1:', p1Err?.message);
    process.exit(1);
  }
  log(`✅ Project 1 (Basic): ${p1.id}`);

  // Project 2 — Pro
  const { data: p2, error: p2Err } = await supabase
    .from('projects')
    .insert({
      user_id: demoId,
      title: PROJECT2_TITLE,
      status: 'completed',
      performance_level: 'pro',
      project_type: 'INTERVIEW',
      audio_file_name: 'building-6-figure-creator-business.mp3',
      audio_file_size: 54525952,
      audio_duration_seconds: 2280,
      processing_time_seconds: 47,
      processing_stage: 'completed',
      processing_progress: 100,
      transcription_text: PROJECT2_TRANSCRIPTION_TEXT,
      transcription_segments: JSON.stringify(PROJECT2_SEGMENTS),
      speaker_data: PROJECT2_SPEAKER_DATA,
      ai_summary: PROJECT2_SUMMARY,
      chapters: [],
      key_takeaways: [],
      social_quotes: [],
      created_at: daysAgo(10),
      updated_at: daysAgo(10),
      processing_started_at: daysAgo(10),
      processing_completed_at: daysAgo(10),
    } as any)
    .select('id')
    .single();
  if (p2Err || !p2) {
    console.error('❌ Failed to insert project 2:', p2Err?.message);
    process.exit(1);
  }
  log(`✅ Project 2 (Pro): ${p2.id}`);

  // Project 3 — Premium Science
  const { data: p3, error: p3Err } = await supabase
    .from('projects')
    .insert({
      user_id: demoId,
      title: PROJECT3_TITLE,
      status: 'completed',
      performance_level: 'premium',
      project_type: 'INTERVIEW',
      audio_file_name: 'science-of-peak-performance.mp3',
      audio_file_size: 78643200,
      audio_duration_seconds: 3300,
      processing_time_seconds: 62,
      processing_stage: 'completed',
      processing_progress: 100,
      transcription_text: PROJECT3_TRANSCRIPTION_TEXT,
      transcription_segments: JSON.stringify(PROJECT3_SEGMENTS),
      speaker_data: PROJECT3_SPEAKER_DATA,
      ai_summary: PROJECT3_SUMMARY,
      chapters: PROJECT3_CHAPTERS,
      key_takeaways: PROJECT3_TAKEAWAYS,
      social_quotes: PROJECT3_QUOTES,
      created_at: daysAgo(7),
      updated_at: daysAgo(7),
      processing_started_at: daysAgo(7),
      processing_completed_at: daysAgo(7),
    } as any)
    .select('id')
    .single();
  if (p3Err || !p3) {
    console.error('❌ Failed to insert project 3:', p3Err?.message);
    process.exit(1);
  }
  log(`✅ Project 3 (Premium/Science): ${p3.id}`);

  // Project 4 — Premium AI Roundtable (FLAGSHIP)
  const { data: p4, error: p4Err } = await supabase
    .from('projects')
    .insert({
      user_id: demoId,
      title: PROJECT4_TITLE,
      status: 'completed',
      performance_level: 'premium',
      project_type: 'DEBATE',
      audio_file_name: 'future-of-ai-roundtable.mp3',
      audio_file_size: 74448896,
      audio_duration_seconds: 3120,
      processing_time_seconds: 71,
      processing_stage: 'completed',
      processing_progress: 100,
      transcription_text: PROJECT4_TRANSCRIPTION_TEXT,
      transcription_segments: JSON.stringify(PROJECT4_SEGMENTS),
      speaker_data: PROJECT4_SPEAKER_DATA,
      ai_summary: PROJECT4_SUMMARY,
      chapters: PROJECT4_CHAPTERS,
      key_takeaways: PROJECT4_TAKEAWAYS,
      social_quotes: PROJECT4_QUOTES,
      created_at: daysAgo(3),
      updated_at: daysAgo(3),
      processing_started_at: daysAgo(3),
      processing_completed_at: daysAgo(3),
    } as any)
    .select('id')
    .single();
  if (p4Err || !p4) {
    console.error('❌ Failed to insert project 4:', p4Err?.message);
    process.exit(1);
  }
  log(`✅ Project 4 (Premium/AI Roundtable): ${p4.id}`);

  // ── 5. Insert outputs ──────────────────────────────────────────────────────
  section('5. Inserting outputs');

  // Map content generator types/platforms to DB-allowed values (same logic as generate-content route)
  const normalizeType = (type: string): string => {
    const fallbacks: Record<string, string> = {
      twitter_thread: 'social_post',
      linkedin_post: 'social_post',
      instagram_caption: 'social_post',
      email_newsletter: 'social_post',
    };
    return fallbacks[type] ?? type;
  };
  const normalizePlatform = (platform: string): string => {
    const fallbacks: Record<string, string> = { blog: 'general', email: 'general' };
    return fallbacks[platform] ?? platform;
  };

  const insertOutputs = async (projectId: string, outputs: any[], label: string) => {
    const rows = outputs.map(o => {
      const normalizedType = normalizeType(o.type);
      const metadata = normalizedType !== o.type ? { originalOutputType: o.type } : undefined;
      return {
        project_id: projectId,
        user_id: demoId,
        type: normalizedType,
        platform: normalizePlatform(o.platform),
        title: o.title,
        content: o.content,
        status: o.status,
        word_count: o.content.split(/\s+/).length,
        character_count: o.content.length,
        ai_model: 'claude-sonnet-4-6',
        ai_cost_usd: 0.0012,
        ...(metadata ? { metadata } : {}),
      };
    });

    const { error } = await supabase.from('outputs').insert(rows as any);
    if (error) {
      log(`⚠️  outputs insert (${label}): ${error.message}`);
    } else {
      log(`✅ ${rows.length} outputs for ${label}`);
    }
  };

  await insertOutputs(p2.id, PROJECT2_OUTPUTS, 'Project 2 Pro');
  await insertOutputs(p3.id, PROJECT3_OUTPUTS, 'Project 3 Premium/Science');
  await insertOutputs(p4.id, PROJECT4_OUTPUTS, 'Project 4 Premium/AI Roundtable');

  // ── 6. Insert insights ─────────────────────────────────────────────────────
  section('6. Inserting insights');

  const insertInsights = async (projectId: string, insights: any[], label: string) => {
    const rows = insights.map(ins => ({
      project_id: projectId,
      entity_id: ins.entity_id,
      label: ins.label,
      category: ins.category,
      match_text: ins.match_text,
      match_variants: ins.match_variants || [],
      simple_definition: ins.simple_definition,
      full_explanation: ins.full_explanation,
      related_concepts: ins.related_concepts || [],
      why_it_matters: ins.why_it_matters,
      confidence: ins.confidence,
      status: 'auto_detected',
      external_sources: [],
      transcript_excerpts: [],
      cost_usd: 0.0004,
    }));

    const { error } = await supabase.from('insights').insert(rows as any);
    if (error) {
      log(`⚠️  insights insert (${label}): ${error.message}`);
    } else {
      log(`✅ ${rows.length} insights for ${label}`);
    }
  };

  await insertInsights(p3.id, PROJECT3_INSIGHTS, 'Project 3 Premium/Science');
  await insertInsights(p4.id, PROJECT4_INSIGHTS, 'Project 4 Premium/AI Roundtable');

  // ── 7. Insert narrative goals ──────────────────────────────────────────────
  section('7. Inserting narrative goals');

  const goalsCreatedAt = daysAgo(20); // older than all snapshots so no "stale" warning
  const goals = [
    {
      user_id: demoId,
      topic_id: 'ai-machine-learning',
      topic_label: 'AI & machine learning',
      goal_type: 'include',
      target_mentions: 3,
      cadence_days: 30,
      status: 'active',
      created_at: goalsCreatedAt,
      updated_at: goalsCreatedAt,
    },
    {
      user_id: demoId,
      topic_id: 'productivity-performance',
      topic_label: 'Productivity & performance',
      goal_type: 'include',
      target_mentions: 2,
      cadence_days: 30,
      status: 'active',
      created_at: goalsCreatedAt,
      updated_at: goalsCreatedAt,
    },
    {
      user_id: demoId,
      topic_id: 'cta-newsletter',
      topic_label: 'Subscribe to newsletter',
      goal_type: 'cta',
      target_mentions: 1,
      cadence_days: 30,
      status: 'active',
      created_at: goalsCreatedAt,
      updated_at: goalsCreatedAt,
    },
    {
      user_id: demoId,
      topic_id: 'avoid-political',
      topic_label: 'Controversial political topics',
      goal_type: 'avoid',
      target_mentions: 0,
      cadence_days: 30,
      status: 'active',
      created_at: goalsCreatedAt,
      updated_at: goalsCreatedAt,
    },
  ];

  const { data: insertedGoals, error: goalsErr } = await supabase
    .from('narrative_goals')
    .insert(goals as any)
    .select('id, topic_id');

  if (goalsErr) {
    log(`⚠️  goals insert: ${goalsErr.message}`);
  } else {
    log(`✅ ${insertedGoals?.length || 0} narrative goals inserted`);
  }

  // ── 8. Insert narrative coverage snapshots ─────────────────────────────────
  section('8. Inserting narrative coverage snapshots');

  // Project 3 snapshot — Science/Performance
  const p3Topics = [
    { id: 'productivity-performance', label: 'Productivity & performance', mentioned: true, mentionCount: 4, coverage: 0.92, sentiment: 'positive', keyMoments: [{ timestamp: 265, excerpt: 'dopamine is primarily a prediction and anticipation molecule' }, { timestamp: 476, excerpt: 'engineer novelty and micro-goals within the larger project' }] },
    { id: 'ai-machine-learning', label: 'AI & machine learning', mentioned: false, mentionCount: 0, coverage: 0, sentiment: 'neutral', keyMoments: [] },
    { id: 'sleep-performance', label: 'Sleep science', mentioned: true, mentionCount: 6, coverage: 0.85, sentiment: 'positive', keyMoments: [{ timestamp: 610, excerpt: '6 hours produces cognitive impairment equivalent to being legally drunk' }] },
    { id: 'neuroscience', label: 'Neuroscience', mentioned: true, mentionCount: 8, coverage: 0.95, sentiment: 'positive', keyMoments: [{ timestamp: 73, excerpt: 'performance is the brain\'s ability to recruit the right neural resources' }] },
  ];

  const p3CTAs = [
    { type: 'newsletter', text: 'The Neuro Edge Newsletter', timestamp: 1780, confidence: 0.94 },
    { type: 'subscribe', text: 'The lab\'s findings are published openly at Stanford\'s HPL website', timestamp: 1770, confidence: 0.91 },
  ];

  const { error: snap3Err } = await supabase
    .from('narrative_coverage_snapshots')
    .insert({
      project_id: p3.id,
      user_id: demoId,
      project_title: PROJECT3_TITLE,
      coverage_window: 'Full episode (55 min)',
      topics: p3Topics,
      ctas: p3CTAs,
      opportunities: [
        { topic: 'AI & machine learning', suggestion: 'No AI/ML coverage this episode — consider a follow-up exploring performance optimization through AI tools', priority: 'medium' },
      ],
      analytics: {
        totalTopicsCovered: 3,
        totalTopicsTracked: 4,
        coverageScore: 0.82,
        ctaCount: 2,
        sentimentBreakdown: { positive: 3, neutral: 1, negative: 0 },
      },
      ai_usage: { model: 'claude-sonnet-4-6', inputTokens: 4820, outputTokens: 1240 },
      total_input_tokens: 4820,
      total_output_tokens: 1240,
      ai_cost_usd: 0.0092,
      created_at: daysAgo(7),
    } as any);
  if (snap3Err) log(`⚠️  coverage snapshot p3: ${snap3Err.message}`);
  else log(`✅ Coverage snapshot for Project 3`);

  // Project 4 snapshot — AI Roundtable (full coverage)
  const p4Topics = [
    { id: 'ai-machine-learning', label: 'AI & machine learning', mentioned: true, mentionCount: 18, coverage: 0.99, sentiment: 'positive', keyMoments: [{ timestamp: 109, excerpt: 'agentic wave is fundamentally different' }, { timestamp: 685, excerpt: 'reasoning reliability is the meaningful advance in GPT-5' }] },
    { id: 'productivity-performance', label: 'Productivity & performance', mentioned: true, mentionCount: 5, coverage: 0.78, sentiment: 'positive', keyMoments: [{ timestamp: 197, excerpt: 'enterprises want AI that does more work' }] },
    { id: 'ai-safety', label: 'AI safety & alignment', mentioned: true, mentionCount: 7, coverage: 0.88, sentiment: 'cautious', keyMoments: [{ timestamp: 599, excerpt: 'the gap can widen before it narrows' }] },
    { id: 'enterprise-tech', label: 'Enterprise technology', mentioned: true, mentionCount: 12, coverage: 0.91, sentiment: 'positive', keyMoments: [{ timestamp: 1402, excerpt: 'the AI chasm is real and it\'s a product problem' }] },
  ];

  const p4CTAs = [
    { type: 'newsletter', text: 'Subscribe wherever you get your podcasts', timestamp: 1864, confidence: 0.88 },
  ];

  const { error: snap4Err } = await supabase
    .from('narrative_coverage_snapshots')
    .insert({
      project_id: p4.id,
      user_id: demoId,
      project_title: PROJECT4_TITLE,
      coverage_window: 'Full episode (52 min)',
      topics: p4Topics,
      ctas: p4CTAs,
      opportunities: [
        { topic: 'Subscribe to newsletter', suggestion: 'Only one CTA mention detected — consider adding a newsletter CTA in the show notes and episode description', priority: 'high' },
      ],
      analytics: {
        totalTopicsCovered: 4,
        totalTopicsTracked: 4,
        coverageScore: 0.96,
        ctaCount: 1,
        sentimentBreakdown: { positive: 3, neutral: 0, cautious: 1 },
      },
      ai_usage: { model: 'claude-sonnet-4-6', inputTokens: 5840, outputTokens: 1480 },
      total_input_tokens: 5840,
      total_output_tokens: 1480,
      ai_cost_usd: 0.0108,
      created_at: daysAgo(3),
    } as any);
  if (snap4Err) log(`⚠️  coverage snapshot p4: ${snap4Err.message}`);
  else log(`✅ Coverage snapshot for Project 4`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n✅ Demo seeding complete!\n');
  console.log('   Projects created:');
  console.log(`   1. ${PROJECT1_TITLE} (Basic)  — ${p1.id}`);
  console.log(`   2. ${PROJECT2_TITLE} (Pro)  — ${p2.id}`);
  console.log(`   3. ${PROJECT3_TITLE} (Premium)  — ${p3.id}`);
  console.log(`   4. ${PROJECT4_TITLE} (Premium)  — ${p4.id}`);
  console.log('\n   Verification checklist:');
  console.log('   □ Log in as demo@audiorepurpose.com');
  console.log('   □ /dashboard/hub → 4 projects with correct tier badges');
  console.log('   □ Project 1 → Transcript only, no chapters/insights/content');
  console.log('   □ Project 4 → All tabs populated (Transcript, Chapters, Content, Insights)');
  console.log('   □ /dashboard/analytics → 4 goals + coverage data for projects 3 & 4');
  console.log('   □ Try upload → confirm 403 guard fires\n');
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err);
  process.exit(1);
});
