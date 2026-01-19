import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeNarrativeCoverage } from '@/lib/narrative-coverage-analyzer';
import {
  getActiveNarrativeGoals,
  saveNarrativeCoverageSnapshot,
  appendCoverageCostToProject
} from '@/lib/narrative-coverage';

interface RunCoveragePayload {
  userId?: string;
  force?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams.id;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as RunCoveragePayload;
    const userId = payload.userId;
    const force = Boolean(payload.force);

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required to run coverage' },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(
        'id, user_id, title, transcription_text, ai_summary, performance_level'
      )
      .eq('id', projectId)
      .single() as {
        data: {
          id: string;
          user_id: string;
          title: string;
          transcription_text: string;
          ai_summary: string;
          performance_level: string
        } | null;
        error: any
      };

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.user_id !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to run coverage for this project' },
        { status: 403 }
      );
    }

    if (!project.transcription_text) {
      return NextResponse.json(
        { error: 'Transcription missing. Run processing before coverage analysis.' },
        { status: 400 }
      );
    }

    const { data: existingSnapshot } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSnapshot && !force) {
      return NextResponse.json(
        {
          alreadyAnalyzed: true,
          message: 'Coverage snapshot already exists. Pass force=true to re-run.'
        },
        { status: 409 }
      );
    }

    const goals = await getActiveNarrativeGoals(userId);
    const tier = (project.performance_level as string) || 'basic';

    const coverageAnalysis = await analyzeNarrativeCoverage(
      project.transcription_text,
      {
        projectTitle: project.title,
        summary: project.ai_summary || null,
        goals,
        tier,
        maxTopics: tier === 'premium' ? 10 : 6,
        coverageWindow: 'full_episode'
      }
    );

    const snapshot = await saveNarrativeCoverageSnapshot({
      projectId,
      userId,
      projectTitle: project.title,
      coverageWindow: coverageAnalysis.coverageWindow,
      topics: coverageAnalysis.topics,
      ctas: coverageAnalysis.ctas,
      opportunities: coverageAnalysis.opportunities,
      aiUsage: coverageAnalysis.aiUsage,
      notes: coverageAnalysis.notes
    });

    if (coverageAnalysis.aiUsage.costUsd > 0) {
      await appendCoverageCostToProject(projectId, coverageAnalysis.aiUsage);
    }

    return NextResponse.json({
      success: true,
      snapshotId: snapshot?.id,
      projectId,
      cost: coverageAnalysis.aiUsage.costUsd,
      topics: coverageAnalysis.topics.length,
      ctas: coverageAnalysis.ctas.length,
      opportunities: coverageAnalysis.opportunities.length,
      fallback: coverageAnalysis.notes?.includes('Heuristic') ? true : false
    });
  } catch (error: any) {
    console.error('[RUN COVERAGE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run narrative coverage' },
      { status: 500 }
    );
  }
}
