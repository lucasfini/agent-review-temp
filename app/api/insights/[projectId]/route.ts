/**
 * Insights API - GET endpoint
 * Purpose: Fetch insights for a project with tier-based filtering
 * Tiers:
 *   - Basic: Only external_sources (research links)
 *   - Pro: simple_definition + external_sources
 *   - Premium: Full insight data (all fields)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

type Tier = 'standard' | 'pro';

function getRelationshipDescription(relationships: any[], types: string[]) {
  for (const type of types) {
    const match = relationships.find((relationship: any) => relationship?.type === type)?.description;
    if (match) return match;
  }
  return '';
}

function buildPersonProfile(insight: any) {
  if (insight.category !== 'person') return undefined;

  const relationships = Array.isArray(insight.relationships) ? insight.relationships : [];
  const getSection = (type: string) => getRelationshipDescription(relationships, [type]);

  const whoTheyAre = getSection('person_summary') || insight.simple_definition || '';
  const currentWork = getSection('current_work') || '';
  const notableBackground = getSection('notable_background') || '';
  const whyRelevant = getSection('episode_relevance') || insight.why_it_matters || '';

  if (!whoTheyAre && !currentWork && !notableBackground && !whyRelevant) {
    return undefined;
  }

  return {
    who_they_are: whoTheyAre,
    current_work: currentWork,
    notable_background: notableBackground,
    why_relevant: whyRelevant,
  };
}

function buildConceptProfile(insight: any) {
  if (insight.category !== 'concept') return undefined;

  const relationships = Array.isArray(insight.relationships) ? insight.relationships : [];
  const transcriptExcerpt = insight.transcript_excerpts?.[0]?.text || '';
  const plainEnglish = insight.simple_definition || '';
  const coreMechanism = getRelationshipDescription(relationships, [
    'mechanism',
    'how_it_works',
    'explanation',
    'process',
  ]) || insight.full_explanation || '';
  const inThisEpisode = getRelationshipDescription(relationships, [
    'episode_relevance',
    'context',
    'example',
  ]) || transcriptExcerpt || insight.why_it_matters || '';
  const whyRelevant = insight.why_it_matters || getRelationshipDescription(relationships, [
    'importance',
    'impact',
    'episode_relevance',
  ]);
  const relatedIdeas = Array.isArray(insight.related_concepts)
    ? insight.related_concepts.filter(Boolean)
    : [];

  if (!plainEnglish && !coreMechanism && !inThisEpisode && !whyRelevant && relatedIdeas.length === 0) {
    return undefined;
  }

  return {
    plain_english: plainEnglish,
    core_mechanism: coreMechanism,
    in_this_episode: inThisEpisode,
    why_relevant: whyRelevant,
    related_ideas: relatedIdeas,
  };
}

function buildToolProfile(insight: any) {
  if (insight.category !== 'tool' && insight.category !== 'product' && insight.category !== 'org') {
    return undefined;
  }

  const relationships = Array.isArray(insight.relationships) ? insight.relationships : [];
  const transcriptExcerpt = insight.transcript_excerpts?.[0]?.text || '';
  const whatItIs = insight.simple_definition || '';
  const primaryUseCase = getRelationshipDescription(relationships, [
    'primary_use_case',
    'use_case',
    'how_it_works',
    'application',
  ]) || insight.full_explanation || transcriptExcerpt || '';
  const whoUsesIt = getRelationshipDescription(relationships, [
    'who_uses_it',
    'audience',
    'users',
  ]);
  const whyRelevant = insight.why_it_matters || getRelationshipDescription(relationships, [
    'episode_relevance',
    'importance',
    'impact',
  ]);
  const alternatives = Array.isArray(insight.related_concepts)
    ? insight.related_concepts.filter(Boolean)
    : [];

  if (!whatItIs && !primaryUseCase && !whoUsesIt && !whyRelevant && alternatives.length === 0) {
    return undefined;
  }

  return {
    what_it_is: whatItIs,
    primary_use_case: primaryUseCase,
    who_uses_it: whoUsesIt,
    why_relevant: whyRelevant,
    alternatives,
  };
}

interface RouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const { project } = await requireProjectOwner<{ performance_level: Tier | null }>(
      request,
      projectId,
      'performance_level'
    );
    const rawTier: string = project.performance_level || 'standard';
    const tier = (rawTier === 'basic' ? 'standard' : rawTier === 'premium' ? 'pro' : rawTier) as Tier;

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch insights from database
    const { data: insights, error } = await supabase
      .from('insights')
      .select('*')
      .eq('project_id', projectId)
      .order('confidence', { ascending: false });

    if (error) {
      console.error('[Insights API] Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
    }

    if (!insights || insights.length === 0) {
      return NextResponse.json({
        insights: [],
        count: 0,
        tier,
        message: 'No insights available yet',
      });
    }

    // Filter insights based on tier
    const filteredInsights = filterInsightsByTier(insights, tier);

    return NextResponse.json({
      insights: filteredInsights,
      count: filteredInsights.length,
      tier,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Insights API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Filter insight data based on user tier
 */
function filterInsightsByTier(insights: any[], tier: Tier): any[] {
  return insights.map((insight) => {
    // Base fields available to all tiers
    const base = {
      id: insight.id,
      entity_id: insight.entity_id,
      label: insight.label,
      category: insight.category,
      match_text: insight.match_text,
      match_variants: insight.match_variants,
      transcript_excerpts: insight.transcript_excerpts,
      confidence: insight.confidence,
      status: insight.status,
      created_at: insight.created_at,
      updated_at: insight.updated_at,
    };

    // Standard tier: Only external sources (research links)
    if (tier === 'standard') {
      return {
        ...base,
        external_sources: insight.external_sources || [],
      };
    }

    // Pro tier: Add simple definition
    if (tier === 'pro') {
      return {
        ...base,
        simple_definition: insight.simple_definition,
        external_sources: insight.external_sources || [],
        person_profile: buildPersonProfile(insight),
        concept_profile: buildConceptProfile(insight),
        tool_profile: buildToolProfile(insight),
      };
    }

    // Premium tier: All fields
    return {
      ...base,
      simple_definition: insight.simple_definition,
      full_explanation: insight.full_explanation,
      related_concepts: insight.related_concepts || [],
      why_it_matters: insight.why_it_matters,
      relationships: insight.relationships || [],
      external_sources: insight.external_sources || [],
      person_profile: buildPersonProfile(insight),
      concept_profile: buildConceptProfile(insight),
      tool_profile: buildToolProfile(insight),
      cost_usd: insight.cost_usd,
    };
  });
}
