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

type Tier = 'basic' | 'pro' | 'premium';

interface RouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const tier = (searchParams.get('tier') || 'basic') as Tier;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

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

    // Basic tier: Only external sources (research links)
    if (tier === 'basic') {
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
      cost_usd: insight.cost_usd,
    };
  });
}
