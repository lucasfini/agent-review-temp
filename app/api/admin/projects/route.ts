import { NextRequest, NextResponse } from 'next/server';

import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim();
    const status = searchParams.get('status')?.trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || '25'), 1), 100);

    let projectQuery = supabaseAdmin
      .from('projects')
      .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      projectQuery = projectQuery.eq('status', status);
    }

    if (query) {
      projectQuery = projectQuery.ilike('title', `%${query}%`);
    }

    const { data: projects, error } = await projectQuery;
    if (error) throw error;

    const userIds = Array.from(new Set((projects || []).map((project: any) => project.user_id).filter(Boolean)));
    const projectIds = (projects || []).map((project: any) => project.id);

    const [users, jobs] = await Promise.all([
      Promise.all(userIds.map(async (userId) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        return {
          id: userId,
          email: data.user?.email || 'unknown',
          bannedUntil: (data.user as any)?.banned_until || null,
        };
      })),
      projectIds.length > 0
        ? (supabaseAdmin as any)
            .from('project_generation_jobs')
            .select('id, project_id, kind, target_key, status, error_message, updated_at')
            .in('project_id', projectIds)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const jobsByProject = new Map<string, any[]>();

    for (const job of jobs.data || []) {
      const collection = jobsByProject.get(job.project_id) || [];
      collection.push(job);
      jobsByProject.set(job.project_id, collection);
    }

    return NextResponse.json({
      success: true,
      projects: (projects || []).map((project: any) => ({
        id: project.id,
        title: project.title || 'Untitled project',
        userId: project.user_id,
        userEmail: userMap.get(project.user_id)?.email || 'unknown',
        bannedUntil: userMap.get(project.user_id)?.bannedUntil || null,
        status: project.status,
        processingStage: project.processing_stage,
        processingProgress: project.processing_progress,
        processingMessage: project.processing_message,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        jobs: (jobsByProject.get(project.id) || []).slice(0, 5),
      })),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ADMIN PROJECTS] Error:', error);
    return NextResponse.json({ error: 'Failed to load admin projects' }, { status: 500 });
  }
}
