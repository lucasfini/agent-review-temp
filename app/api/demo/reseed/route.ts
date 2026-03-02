/**
 * POST /api/demo/reseed
 *
 * Admin-only endpoint to re-run demo data seeding without shell access.
 * Gated by DEMO_RESEED_SECRET environment variable.
 *
 * Usage:
 *   curl -X POST https://yourapp.com/api/demo/reseed \
 *     -H "Authorization: Bearer <DEMO_RESEED_SECRET>"
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { DEMO_EMAIL } from '@/lib/demo-mode';

// Import all demo content
import {
  PROJECT1_TITLE,
  PROJECT1_TRANSCRIPTION_TEXT,
  PROJECT1_SEGMENTS,
  PROJECT1_SPEAKER_DATA,
} from '@/scripts/demo-content/project1-basic';

import {
  PROJECT2_TITLE,
  PROJECT2_TRANSCRIPTION_TEXT,
  PROJECT2_SEGMENTS,
  PROJECT2_SPEAKER_DATA,
  PROJECT2_SUMMARY,
  PROJECT2_OUTPUTS,
} from '@/scripts/demo-content/project2-pro';

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
} from '@/scripts/demo-content/project3-premium-science';

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
} from '@/scripts/demo-content/project4-premium-ai';

export const dynamic = 'force-dynamic';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export async function POST(request: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const secret = process.env.DEMO_RESEED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DEMO_RESEED_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];
  const info = (msg: string) => { log.push(msg); console.log(`[reseed] ${msg}`); };

  try {
    // ── Find demo user ───────────────────────────────────────────────────────
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const demoUser = users.find(u => u.email === DEMO_EMAIL);
    if (!demoUser) {
      return NextResponse.json({ error: `Demo user not found: ${DEMO_EMAIL}` }, { status: 404 });
    }
    const demoId = demoUser.id;
    info(`Found demo user: ${demoId}`);

    // ── Clear existing data ──────────────────────────────────────────────────
    const { data: existingProjects } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('user_id', demoId);

    const existingIds = (existingProjects || []).map((p: any) => p.id);

    if (existingIds.length > 0) {
      await supabaseAdmin.from('insights').delete().in('project_id', existingIds);
      await supabaseAdmin.from('narrative_coverage_snapshots').delete().in('project_id', existingIds);
      await supabaseAdmin.from('outputs').delete().in('project_id', existingIds);
    }
    await supabaseAdmin.from('narrative_goals').delete().eq('user_id', demoId);
    await supabaseAdmin.from('projects').delete().eq('user_id', demoId);
    info(`Cleared ${existingIds.length} existing projects`);

    // ── Credits ──────────────────────────────────────────────────────────────
    await supabaseAdmin.from('account_credits').upsert({
      user_id: demoId,
      balance: 50.00,
      lifetime_credits_added: 150.00,
      lifetime_credits_spent: 100.00,
      version: 1,
    } as any, { onConflict: 'user_id' });

    // ── Insert projects ──────────────────────────────────────────────────────
    const insertProject = async (data: any) => {
      const { data: proj, error } = await supabaseAdmin
        .from('projects')
        .insert(data)
        .select('id')
        .single();
      if (error) throw new Error(`Project insert failed: ${error.message}`);
      return (proj as any).id as string;
    };

    const p1Id = await insertProject({
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
    });
    info(`Project 1 (Basic): ${p1Id}`);

    const p2Id = await insertProject({
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
    });
    info(`Project 2 (Pro): ${p2Id}`);

    const p3Id = await insertProject({
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
    });
    info(`Project 3 (Premium/Science): ${p3Id}`);

    const p4Id = await insertProject({
      user_id: demoId,
      title: PROJECT4_TITLE,
      status: 'completed',
      performance_level: 'premium',
      project_type: 'DEBATE',
      audio_file_name: 'future-of-work-roundtable.mp3',
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
    });
    info(`Project 4 (Premium/AI Roundtable): ${p4Id}`);

    // ── Outputs ──────────────────────────────────────────────────────────────
    // Map content generator types/platforms to DB-allowed values (same logic as generate-content route)
    const normalizeOutputType = (type: string): string => {
      const fallbacks: Record<string, string> = {
        twitter_thread: 'social_post',
        linkedin_post: 'social_post',
        instagram_caption: 'social_post',
        email_newsletter: 'social_post',
      };
      return fallbacks[type] ?? type;
    };
    const normalizeOutputPlatform = (platform: string): string => {
      const fallbacks: Record<string, string> = { blog: 'general', email: 'general' };
      return fallbacks[platform] ?? platform;
    };

    const insertOutputs = async (projectId: string, outputs: any[]) => {
      const rows = outputs.map(o => {
        const normalizedType = normalizeOutputType(o.type);
        const baseMetadata = o.metadata || {};
        const metadata = normalizedType !== o.type
          ? { ...baseMetadata, originalOutputType: o.type }
          : baseMetadata;
        const hasMetadata = metadata && Object.keys(metadata).length > 0;
        return {
          project_id: projectId,
          user_id: demoId,
          type: normalizedType,
          platform: normalizeOutputPlatform(o.platform),
          title: o.title,
          content: o.content,
          status: o.status,
          word_count: o.content.split(/\s+/).length,
          character_count: o.content.length,
          ai_model: 'claude-sonnet-4-6',
          ai_cost_usd: 0.0012,
          ...(hasMetadata ? { metadata } : {}),
        };
      });
      const { error } = await supabaseAdmin.from('outputs').insert(rows as any);
      if (error) info(`⚠️  outputs error (${projectId}): ${error.message}`);
    };

    await insertOutputs(p2Id, PROJECT2_OUTPUTS);
    await insertOutputs(p3Id, PROJECT3_OUTPUTS);
    await insertOutputs(p4Id, PROJECT4_OUTPUTS);
    info(`Outputs inserted (${PROJECT2_OUTPUTS.length + PROJECT3_OUTPUTS.length + PROJECT4_OUTPUTS.length} total)`);

    // ── Insights ─────────────────────────────────────────────────────────────
    const insertInsights = async (projectId: string, insights: any[]) => {
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
      const { error } = await supabaseAdmin.from('insights').insert(rows as any);
      if (error) info(`⚠️  insights error (${projectId}): ${error.message}`);
    };

    await insertInsights(p3Id, PROJECT3_INSIGHTS);
    await insertInsights(p4Id, PROJECT4_INSIGHTS);
    info(`Insights inserted (${PROJECT3_INSIGHTS.length + PROJECT4_INSIGHTS.length} total)`);

    // ── Narrative goals ───────────────────────────────────────────────────────
    // Use a date older than all snapshots so the analytics page doesn't show
    // "goals modified after last analysis run" warning
    const goalsTs = daysAgo(20);
    const { error: goalsErr } = await supabaseAdmin.from('narrative_goals').insert([
      { user_id: demoId, topic_id: 'ai-machine-learning', topic_label: 'AI & machine learning', goal_type: 'include', target_mentions: 3, cadence_days: 30, status: 'active', created_at: goalsTs, updated_at: goalsTs },
      { user_id: demoId, topic_id: 'productivity-performance', topic_label: 'Productivity & performance', goal_type: 'include', target_mentions: 2, cadence_days: 30, status: 'active', created_at: goalsTs, updated_at: goalsTs },
      { user_id: demoId, topic_id: 'cta-newsletter', topic_label: 'Subscribe to newsletter', goal_type: 'cta', target_mentions: 1, cadence_days: 30, status: 'active', created_at: goalsTs, updated_at: goalsTs },
      { user_id: demoId, topic_id: 'avoid-political', topic_label: 'Controversial political topics', goal_type: 'avoid', target_mentions: 0, cadence_days: 30, status: 'active', created_at: goalsTs, updated_at: goalsTs },
    ] as any);
    if (goalsErr) info(`⚠️  goals error: ${goalsErr.message}`);
    else info(`Narrative goals inserted`);

    // ── Coverage snapshots ────────────────────────────────────────────────────
    await supabaseAdmin.from('narrative_coverage_snapshots').insert([
      {
        project_id: p3Id,
        user_id: demoId,
        project_title: PROJECT3_TITLE,
        coverage_window: 'Full episode (55 min)',
        topics: [
          { id: 'productivity-performance', label: 'Productivity & performance', mentioned: true, mentionCount: 4, coverage: 0.92, sentiment: 'positive', keyMoments: [] },
          { id: 'ai-machine-learning', label: 'AI & machine learning', mentioned: false, mentionCount: 0, coverage: 0, sentiment: 'neutral', keyMoments: [] },
          { id: 'sleep-performance', label: 'Sleep science', mentioned: true, mentionCount: 6, coverage: 0.85, sentiment: 'positive', keyMoments: [] },
          { id: 'neuroscience', label: 'Neuroscience', mentioned: true, mentionCount: 8, coverage: 0.95, sentiment: 'positive', keyMoments: [] },
        ],
        ctas: [{ type: 'newsletter', text: 'The Neuro Edge Newsletter', timestamp: 1780, confidence: 0.94 }],
        opportunities: [{ topic: 'AI & machine learning', suggestion: 'No AI/ML coverage this episode', priority: 'medium' }],
        analytics: { totalTopicsCovered: 3, totalTopicsTracked: 4, coverageScore: 0.82, ctaCount: 2 },
        ai_usage: { model: 'claude-sonnet-4-6', inputTokens: 4820, outputTokens: 1240 },
        total_input_tokens: 4820,
        total_output_tokens: 1240,
        ai_cost_usd: 0.0092,
        created_at: daysAgo(7),
      },
      {
        project_id: p4Id,
        user_id: demoId,
        project_title: PROJECT4_TITLE,
        coverage_window: 'Full episode (52 min)',
        topics: [
          { id: 'ai-machine-learning', label: 'AI & machine learning', mentioned: true, mentionCount: 12, coverage: 0.88, sentiment: 'positive', keyMoments: [] },
          { id: 'productivity-performance', label: 'Productivity & performance', mentioned: true, mentionCount: 9, coverage: 0.82, sentiment: 'positive', keyMoments: [] },
          { id: 'remote-work', label: 'Remote work & distributed teams', mentioned: true, mentionCount: 18, coverage: 0.99, sentiment: 'positive', keyMoments: [] },
          { id: 'talent-retention', label: 'Talent retention & culture', mentioned: true, mentionCount: 7, coverage: 0.79, sentiment: 'positive', keyMoments: [] },
        ],
        ctas: [{ type: 'newsletter', text: 'Subscribe wherever you get your podcasts', timestamp: 1864, confidence: 0.88 }],
        opportunities: [{ topic: 'Subscribe to newsletter', suggestion: 'Only one CTA detected — add newsletter CTA in show notes', priority: 'high' }],
        analytics: { totalTopicsCovered: 4, totalTopicsTracked: 4, coverageScore: 0.96, ctaCount: 1 },
        ai_usage: { model: 'claude-sonnet-4-6', inputTokens: 5840, outputTokens: 1480 },
        total_input_tokens: 5840,
        total_output_tokens: 1480,
        ai_cost_usd: 0.0108,
        created_at: daysAgo(3),
      },
    ] as any);
    info(`Coverage snapshots inserted`);

    return NextResponse.json({
      success: true,
      message: 'Demo data reseeded successfully',
      projects: {
        p1: p1Id,
        p2: p2Id,
        p3: p3Id,
        p4: p4Id,
      },
      log,
    });
  } catch (err: any) {
    console.error('[reseed] Fatal error:', err);
    return NextResponse.json({
      error: err.message || 'Unknown error',
      log,
    }, { status: 500 });
  }
}
