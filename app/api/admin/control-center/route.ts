import { NextRequest, NextResponse } from 'next/server';

import { getBillingHealthMetrics, getRevenueReport } from '@/lib/billing/admin';
import { requireAdmin, AdminAuthError } from '@/lib/admin/require-admin';
import { supabaseAdmin } from '@/lib/supabase/server';

const STUCK_PROJECT_MINUTES = 30;
const LONG_RUNNING_MINUTES = 15;
const RECENT_AUDIT_LIMIT = 12;

type ProjectRow = {
  id: string;
  title: string | null;
  user_id: string;
  status: string;
  processing_stage: string | null;
  processing_progress: number | null;
  processing_message: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const now = Date.now();
    const last24hIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const last7dIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const stuckCutoffIso = new Date(now - STUCK_PROJECT_MINUTES * 60 * 1000).toISOString();
    const longRunningCutoffIso = new Date(now - LONG_RUNNING_MINUTES * 60 * 1000).toISOString();

    const [
      healthResult,
      billingHealth,
      revenue,
      recentProjectsResult,
      failedProjectsResult,
      activeProjectsResult,
      staleProjectsResult,
      recentUsageResult,
      recentTransactionsResult,
      recentAuditResult,
      failedJobsResult,
    ] = await Promise.all([
      fetch(new URL('/api/health', request.url)).then((res) => res.json()).catch(() => ({
        status: 'unknown',
        timestamp: new Date().toISOString(),
        uptime: null,
        environment: null,
      })),
      getBillingHealthMetrics(),
      getRevenueReport({
        startDate: new Date(last7dIso),
        endDate: new Date(),
      }),
      supabaseAdmin
        .from('projects')
        .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(12),
      supabaseAdmin
        .from('projects')
        .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, updated_at, created_at')
        .eq('status', 'failed')
        .gte('updated_at', last7dIso)
        .order('updated_at', { ascending: false })
        .limit(8),
      supabaseAdmin
        .from('projects')
        .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, updated_at, created_at')
        .in('status', ['uploading', 'processing'])
        .order('updated_at', { ascending: false })
        .limit(12),
      supabaseAdmin
        .from('projects')
        .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, updated_at, created_at')
        .in('status', ['uploading', 'processing'])
        .lte('updated_at', stuckCutoffIso)
        .order('updated_at', { ascending: true })
        .limit(8),
      supabaseAdmin
        .from('usage_events')
        .select('id, provider, service_name, billed_cost, project_id, created_at')
        .gte('created_at', last24hIso)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('credit_transactions')
        .select('id, user_id, transaction_type, amount, reason, created_at')
        .gte('created_at', last7dIso)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('admin_audit_logs')
        .select('id, admin_email, action, target_type, target_id, target_label, reason, status, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_AUDIT_LIMIT),
      (supabaseAdmin as any)
        .from('project_generation_jobs')
        .select('id, project_id, user_id, kind, target_key, status, error_message, failure_notified_at, created_at, updated_at')
        .in('status', ['failed', 'running', 'queued'])
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);

    const userIds = new Set<string>();
    const projectIds = new Set<string>();

    const collectProjectUsers = (rows: ProjectRow[] | null | undefined) => {
      for (const row of rows || []) {
        if (row.user_id) userIds.add(row.user_id);
        if (row.id) projectIds.add(row.id);
      }
    };

    collectProjectUsers(recentProjectsResult.data);
    collectProjectUsers(failedProjectsResult.data);
    collectProjectUsers(activeProjectsResult.data);
    collectProjectUsers(staleProjectsResult.data);

    for (const tx of recentTransactionsResult.data || []) {
      if (tx.user_id) userIds.add(tx.user_id);
    }

    for (const row of recentUsageResult.data || []) {
      if (row.project_id) projectIds.add(row.project_id);
    }

    for (const row of failedJobsResult.data || []) {
      if (row.user_id) userIds.add(row.user_id);
      if (row.project_id) projectIds.add(row.project_id);
    }

    const [authUsers, projectTitles] = await Promise.all([
      Promise.all(Array.from(userIds).map(async (userId) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        return {
          userId,
          email: data.user?.email || 'unknown',
          lastSignInAt: data.user?.last_sign_in_at || null,
          bannedUntil: (data.user as any)?.banned_until || null,
        };
      })),
      projectIds.size > 0
        ? supabaseAdmin
            .from('projects')
            .select('id, title')
            .in('id', Array.from(projectIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap = new Map(authUsers.map((user) => [user.userId, user]));
    const projectTitleMap = new Map((projectTitles.data || []).map((row: any) => [row.id, row.title || 'Untitled project']));

    const highRiskTransactions = (recentTransactionsResult.data || []).filter((row: any) => {
      const type = String(row.transaction_type || '');
      return type === 'refund' || type === 'admin_adjustment' || Math.abs(Number(row.amount || 0)) >= 50;
    }).slice(0, 6).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: userMap.get(row.user_id)?.email || 'unknown',
      transactionType: row.transaction_type,
      amount: Number(row.amount || 0),
      reason: row.reason,
      createdAt: row.created_at,
    }));

    const failedJobs = (failedJobsResult.data || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      projectTitle: projectTitleMap.get(row.project_id) || 'Untitled project',
      userId: row.user_id,
      userEmail: userMap.get(row.user_id)?.email || 'unknown',
      kind: row.kind,
      targetKey: row.target_key,
      status: row.status,
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
    }));

    const staleProjects = ((staleProjectsResult.data || []) as ProjectRow[]).map((row) => ({
      ...serializeProject(row, userMap),
      ageMinutes: row.updated_at
        ? Math.max(0, Math.round((now - new Date(row.updated_at).getTime()) / 60000))
        : null,
    }));

    const longRunningCount = (activeProjectsResult.data || []).filter((row) => {
      return row.updated_at && row.updated_at <= longRunningCutoffIso;
    }).length;

    const alerts = [
      staleProjects.length > 0
        ? {
            severity: 'high',
            title: `${staleProjects.length} stuck processing project${staleProjects.length === 1 ? '' : 's'}`,
            body: 'Projects in uploading or processing have not moved recently and need intervention.',
          }
        : null,
      (failedProjectsResult.data || []).length > 0
        ? {
            severity: 'medium',
            title: `${(failedProjectsResult.data || []).length} recent failed project${(failedProjectsResult.data || []).length === 1 ? '' : 's'}`,
            body: 'Recent failures need triage to identify pipeline, storage, or billing issues.',
          }
        : null,
      failedJobs.filter((job: { status: string }) => job.status === 'failed').length > 0
        ? {
            severity: 'medium',
            title: `${failedJobs.filter((job: { status: string }) => job.status === 'failed').length} failed generation job${failedJobs.filter((job: { status: string }) => job.status === 'failed').length === 1 ? '' : 's'}`,
            body: 'Queued or generated artifacts failed and may need a retry or user follow-up.',
          }
        : null,
      highRiskTransactions.length > 0
        ? {
            severity: 'low',
            title: `${highRiskTransactions.length} high-risk billing event${highRiskTransactions.length === 1 ? '' : 's'}`,
            body: 'Recent refunds or admin adjustments should be reviewed for support and fraud patterns.',
          }
        : null,
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      health: healthResult,
      summary: {
        activeProcessingCount: (activeProjectsResult.data || []).length,
        stuckProjectCount: staleProjects.length,
        longRunningProjectCount: longRunningCount,
        failedProjectCount7d: (failedProjectsResult.data || []).length,
        failedGenerationJobCount: failedJobs.filter((job: { status: string }) => job.status === 'failed').length,
        creditsInSystem: billingHealth.totalCreditsInSystem,
        totalUsers: billingHealth.totalUsers,
        activeCreditUsers: billingHealth.activeUsers,
        revenue7d: revenue.totalRevenue,
        margin7d: revenue.totalMargin,
        usageEvents24h: recentUsageResult.data?.length || 0,
      },
      alerts,
      activeProjects: (activeProjectsResult.data || []).map((row) => serializeProject(row, userMap)),
      staleProjects,
      failedProjects: (failedProjectsResult.data || []).map((row) => serializeProject(row, userMap)),
      recentProjects: (recentProjectsResult.data || []).map((row) => serializeProject(row, userMap)),
      failedGenerationJobs: failedJobs,
      highRiskTransactions,
      recentUsage: (recentUsageResult.data || []).map((row: any) => ({
        id: row.id,
        provider: row.provider,
        serviceName: row.service_name,
        billedCost: Number(row.billed_cost || 0),
        projectId: row.project_id,
        projectTitle: projectTitleMap.get(row.project_id) || 'Unknown project',
        createdAt: row.created_at,
      })),
      recentAudit: (recentAuditResult.data || []).map((row: any) => ({
        id: row.id,
        adminEmail: row.admin_email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        targetLabel: row.target_label,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ADMIN CONTROL CENTER] Error:', error);
    return NextResponse.json({ error: 'Failed to load admin control center' }, { status: 500 });
  }
}

function serializeProject(row: ProjectRow, userMap: Map<string, { email: string; lastSignInAt: string | null; bannedUntil: string | null }>) {
  return {
    id: row.id,
    title: row.title || 'Untitled project',
    userId: row.user_id,
    userEmail: userMap.get(row.user_id)?.email || 'unknown',
    lastSignInAt: userMap.get(row.user_id)?.lastSignInAt || null,
    bannedUntil: userMap.get(row.user_id)?.bannedUntil || null,
    status: row.status,
    processingStage: row.processing_stage,
    processingProgress: row.processing_progress,
    processingMessage: row.processing_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
