'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  FileWarning,
  Loader2,
  RefreshCw,
  Shield,
  TerminalSquare,
  UserRound,
  Wrench,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/context';

type ControlCenterResponse = {
  health: {
    status: string;
    timestamp: string;
    uptime: number | null;
    environment: string | null;
  };
  summary: {
    activeProcessingCount: number;
    stuckProjectCount: number;
    longRunningProjectCount: number;
    failedProjectCount7d: number;
    failedGenerationJobCount: number;
    creditsInSystem: number;
    totalUsers: number;
    activeCreditUsers: number;
    revenue7d: number;
    margin7d: number;
    usageEvents24h: number;
  };
  alerts: Array<{
    severity: 'high' | 'medium' | 'low';
    title: string;
    body: string;
  }>;
  activeProjects: AdminProject[];
  staleProjects: Array<AdminProject & { ageMinutes: number | null }>;
  failedProjects: AdminProject[];
  recentProjects: AdminProject[];
  failedGenerationJobs: Array<{
    id: string;
    projectId: string;
    projectTitle: string;
    userId: string;
    userEmail: string;
    kind: string;
    targetKey: string;
    status: string;
    errorMessage: string | null;
    updatedAt: string;
  }>;
  highRiskTransactions: Array<{
    id: string;
    userId: string;
    userEmail: string;
    transactionType: string;
    amount: number;
    reason?: string;
    createdAt: string;
  }>;
  recentUsage: Array<{
    id: string;
    provider: string;
    serviceName: string;
    billedCost: number;
    projectId: string | null;
    projectTitle: string;
    createdAt: string;
  }>;
  recentAudit: AuditEntry[];
};

type AdminProject = {
  id: string;
  title: string;
  userId: string;
  userEmail: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  status: string;
  processingStage: string | null;
  processingProgress: number | null;
  processingMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type LogsResponse = {
  logs: {
    summaryTail: string[];
    recentConversationFiles: string[];
    recentContentFiles: string[];
    buildLogTail: string[];
  };
};

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil?: string | null;
  credits: {
    balance: number;
    lifetime_credits_added: number;
    lifetime_credits_spent: number;
    updated_at: string;
  } | null;
};

type BillingSummary = {
  summary: {
    balance: number;
    lifetimeCreditsAdded: number;
    lifetimeCreditsSpent: number;
    recentUsage: Array<{
      date: string;
      serviceName: string;
      billedCost: number;
      units: number;
    }>;
    recentTransactions: Array<{
      date: string;
      type: string;
      amount: number;
      balanceAfter: number;
      reason?: string;
    }>;
  };
  audit: {
    isCorrect: boolean;
    discrepancy: number;
    details: {
      transactionCount: number;
    };
  };
};

type AuditEntry = {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  status: 'success' | 'error';
  createdAt: string;
};

type ActionIntent = {
  type: 'project' | 'maintenance' | 'user';
  label: string;
  targetId: string;
  description: string;
  confirmText: string;
  endpoint: string;
  payload: Record<string, unknown>;
  destructive?: boolean;
  requireTypedConfirm?: boolean;
};

const maintenanceJobs = [
  {
    key: 'cleanup_stale_uploads',
    label: 'Clean Stale Uploads',
    description: 'Delete abandoned uploads and clear dangling project rows.',
    icon: Wrench,
    payload: { limit: 50, olderThanHours: 6 },
    destructive: true,
  },
  {
    key: 'reconcile_orphaned_storage',
    label: 'Reconcile Orphaned Storage',
    description: 'Remove R2 and avatar files that no longer belong to live records.',
    icon: Database,
    payload: { limit: 100 },
    destructive: true,
  },
  {
    key: 'reconcile_billing_reservations',
    label: 'Reconcile Billing Reservations',
    description: 'Release stale billing reservations and repair stuck settlement state.',
    icon: Shield,
    payload: { limit: 100, staleActiveMinutes: 120, staleSettlingMinutes: 15 },
    destructive: false,
  },
] as const;

export default function AdminOverviewPage() {
  const { session } = useAuth();
  const [controlCenter, setControlCenter] = useState<ControlCenterResponse | null>(null);
  const [logs, setLogs] = useState<LogsResponse['logs'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userSummary, setUserSummary] = useState<BillingSummary | null>(null);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSummaryLoading, setUserSummaryLoading] = useState(false);
  const [banDurationByUser, setBanDurationByUser] = useState<Record<string, '24h' | '7d'>>({});

  const [projectQuery, setProjectQuery] = useState('');
  const [projectSearchResults, setProjectSearchResults] = useState<AdminProject[]>([]);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);

  const [actionIntent, setActionIntent] = useState<ActionIntent | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [typedConfirm, setTypedConfirm] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [lastMaintenanceRun, setLastMaintenanceRun] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const summaryCards = useMemo(() => {
    if (!controlCenter) return [];

    return [
      { label: 'Active Processing', value: String(controlCenter.summary.activeProcessingCount) },
      { label: 'Stuck Projects', value: String(controlCenter.summary.stuckProjectCount) },
      { label: 'Failed Projects (7d)', value: String(controlCenter.summary.failedProjectCount7d) },
      { label: 'Failed Jobs', value: String(controlCenter.summary.failedGenerationJobCount) },
      { label: 'Revenue (7d)', value: money(controlCenter.summary.revenue7d) },
      { label: 'Credits In System', value: money(controlCenter.summary.creditsInSystem) },
    ];
  }, [controlCenter]);

  async function loadEverything() {
    if (!session?.access_token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [controlRes, logsRes] = await Promise.all([
        fetch('/api/admin/control-center', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/admin/logs', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      const controlJson = await controlRes.json().catch(() => null);
      const logsJson = await logsRes.json().catch(() => null);

      if (!controlRes.ok) {
        throw new Error(controlJson?.error || 'Failed to load admin control center');
      }
      if (!logsRes.ok) {
        throw new Error(logsJson?.error || 'Failed to load logs');
      }

      setControlCenter(controlJson);
      setLogs(logsJson?.logs || null);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to load admin data' });
    } finally {
      setLoading(false);
    }
  }

  async function refreshEverything() {
    setRefreshing(true);
    await loadEverything();
    setRefreshing(false);
  }

  async function searchUsers() {
    if (!session?.access_token || !userSearch.trim()) return;
    setUserSearchLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        search: userSearch.trim(),
        page: '1',
        perPage: '10',
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to search users');
      setUsers(json?.users || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to search users' });
    } finally {
      setUserSearchLoading(false);
    }
  }

  async function loadUserSummary(user: AdminUser) {
    if (!session?.access_token) return;
    setSelectedUser(user);
    setUserSummaryLoading(true);
    try {
      const res = await fetch(`/api/admin/billing/user-summary?userId=${encodeURIComponent(user.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load billing summary');
      setUserSummary(json);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to load billing summary' });
      setUserSummary(null);
    } finally {
      setUserSummaryLoading(false);
    }
  }

  async function searchProjects() {
    if (!session?.access_token || !projectQuery.trim()) return;
    setProjectSearchLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        query: projectQuery.trim(),
        limit: '12',
      });
      const res = await fetch(`/api/admin/projects?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to search projects');
      setProjectSearchResults(json?.projects || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to search projects' });
    } finally {
      setProjectSearchLoading(false);
    }
  }

  function openProjectAction(project: AdminProject, action: 'cancel' | 'retry_generation_jobs') {
    if (action === 'cancel') {
      setActionIntent({
        type: 'project',
        label: `Cancel ${project.title}`,
        targetId: project.id,
        description: 'This will stop the project, mark it cancelled, and attempt audio cleanup if the file still exists.',
        confirmText: 'Cancel Project',
        endpoint: `/api/admin/projects/${project.id}`,
        payload: { action: 'cancel' },
        destructive: true,
        requireTypedConfirm: true,
      });
      setActionReason('Operator cancelled stuck project after review.');
      setTypedConfirm('');
      return;
    }

    setActionIntent({
      type: 'project',
      label: `Retry generation jobs for ${project.title}`,
      targetId: project.id,
      description: 'This will requeue failed generation jobs for the project and trigger the queue processor.',
      confirmText: 'Requeue Jobs',
      endpoint: `/api/admin/projects/${project.id}`,
      payload: { action: 'retry_generation_jobs' },
    });
    setActionReason('Operator requeued failed generation jobs after triage.');
    setTypedConfirm('');
  }

  function openUserAction(user: AdminUser, action: 'ban' | 'block' | 'unban') {
    const duration = banDurationByUser[user.id] || '24h';
    setActionIntent({
      type: 'user',
      label: `${action === 'unban' ? 'Restore access for' : 'Update access for'} ${user.email}`,
      targetId: user.id,
      description: action === 'unban'
        ? 'This will remove the current login restriction.'
        : action === 'block'
          ? 'This will apply an effectively permanent login ban.'
          : `This will ban the user for ${duration}.`,
      confirmText: action === 'unban' ? 'Unban User' : action === 'block' ? 'Block User' : 'Ban User',
      endpoint: `/api/admin/users/${user.id}`,
      payload: action === 'ban' ? { action, duration } : { action },
      destructive: action !== 'unban',
      requireTypedConfirm: action === 'block',
    });
    setActionReason(`Support moderation action: ${action}.`);
    setTypedConfirm('');
  }

  function openMaintenanceAction(jobKey: typeof maintenanceJobs[number]['key']) {
    const job = maintenanceJobs.find((item) => item.key === jobKey);
    if (!job) return;
    setActionIntent({
      type: 'maintenance',
      label: job.label,
      targetId: job.key,
      description: job.description,
      confirmText: 'Run Job',
      endpoint: `/api/admin/maintenance/${job.key}`,
      payload: job.payload,
      destructive: job.destructive,
      requireTypedConfirm: job.destructive,
    });
    setActionReason(`Operator run: ${job.label}.`);
    setTypedConfirm('');
  }

  async function submitAction() {
    if (!session?.access_token || !actionIntent) return;
    if (actionIntent.requireTypedConfirm && typedConfirm !== 'CONFIRM') return;

    setSubmittingAction(true);
    setMessage(null);
    try {
      const res = await fetch(actionIntent.endpoint, {
        method: actionIntent.type === 'maintenance' ? 'POST' : 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...actionIntent.payload,
          reason: actionReason.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Action failed');

      if (actionIntent.type === 'maintenance') {
        setLastMaintenanceRun(json);
      }

      setActionIntent(null);
      setActionReason('');
      setTypedConfirm('');
      setMessage({ type: 'success', text: `${actionIntent.label} completed.` });
      await refreshEverything();
      if (selectedUser) {
        await loadUserSummary(selectedUser);
      }
      if (userSearch.trim()) {
        await searchUsers();
      }
      if (projectQuery.trim()) {
        await searchProjects();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Action failed' });
    } finally {
      setSubmittingAction(false);
    }
  }

  return (
    <div className="py-8">
      <div className="mx-auto max-w-7xl space-y-8 px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Operator Control</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Admin Control Center</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Monitor system health, triage user and project incidents, run maintenance jobs, and audit operator actions from one place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void refreshEverything()}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600 hover:bg-slate-900 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-900/20 px-4 py-2 text-xs text-emerald-300">
              Health: {loading ? 'Loading' : controlCenter?.health.status || 'unknown'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.72))] p-4 shadow-[0_18px_60px_-28px_rgba(34,211,238,0.35)]">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{loading ? '—' : card.value}</p>
            </div>
          ))}
        </div>

        {message && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300'
              : 'border-red-700/50 bg-red-900/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Critical Alerts</h2>
                <p className="text-sm text-slate-400">Immediate issues that need diagnosis or operator action.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-400">Loading alerts…</p>
              ) : controlCenter?.alerts.length ? (
                controlCenter.alerts.map((alert) => (
                  <div
                    key={`${alert.severity}-${alert.title}`}
                    className={`rounded-2xl border px-4 py-4 ${
                      alert.severity === 'high'
                        ? 'border-red-800/60 bg-red-950/30'
                        : alert.severity === 'medium'
                          ? 'border-amber-800/60 bg-amber-950/20'
                          : 'border-cyan-800/60 bg-cyan-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{alert.title}</p>
                        <p className="mt-1 text-sm text-slate-300">{alert.body}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        {alert.severity}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No active alerts. Health looks stable.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <TerminalSquare className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Runtime</h2>
                <p className="text-sm text-slate-400">Current app health and activity snapshot.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MetricPill label="Environment" value={controlCenter?.health.environment || 'unknown'} />
              <MetricPill label="Uptime" value={formatUptime(controlCenter?.health.uptime)} />
              <MetricPill label="Usage Events 24h" value={String(controlCenter?.summary.usageEvents24h ?? 0)} />
              <MetricPill label="Credit Users" value={String(controlCenter?.summary.activeCreditUsers ?? 0)} />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent Usage</p>
              <div className="mt-3 space-y-3">
                {(controlCenter?.recentUsage || []).slice(0, 4).map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{row.projectTitle}</p>
                      <p className="truncate text-xs text-slate-500">{row.provider} · {row.serviceName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-200">{money(row.billedCost)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {!controlCenter?.recentUsage?.length && (
                  <p className="text-sm text-slate-400">No recent usage found.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileWarning className="h-5 w-5 text-red-300" />
                <div>
                  <h2 className="text-lg font-semibold text-white">Project Incidents</h2>
                  <p className="text-sm text-slate-400">Stale, failed, and recently active projects with operator controls.</p>
                </div>
              </div>
              <Link href="/dashboard/admin/monitoring" className="text-sm text-cyan-300 hover:text-cyan-200">
                Open monitoring page
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-400">Loading incidents…</p>
              ) : (
                <>
                  {controlCenter?.staleProjects.map((project) => (
                    <ProjectIncidentRow
                      key={`stale-${project.id}`}
                      project={project}
                      badge={`Stale ${project.ageMinutes ?? 0}m`}
                      accent="high"
                      onCancel={() => openProjectAction(project, 'cancel')}
                      onRetry={() => openProjectAction(project, 'retry_generation_jobs')}
                    />
                  ))}
                  {controlCenter?.failedProjects.map((project) => (
                    <ProjectIncidentRow
                      key={`failed-${project.id}`}
                      project={project}
                      badge="Failed"
                      accent="medium"
                      onRetry={() => openProjectAction(project, 'retry_generation_jobs')}
                    />
                  ))}
                  {!controlCenter?.staleProjects.length && !controlCenter?.failedProjects.length && (
                    <p className="text-sm text-slate-400">No stale or failed projects need attention.</p>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Search Projects</h3>
                <button
                  onClick={() => void searchProjects()}
                  disabled={projectSearchLoading || !projectQuery.trim()}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {projectSearchLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                  placeholder="Find project by title"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div className="mt-4 space-y-3">
                {projectSearchResults.map((project) => (
                  <ProjectIncidentRow
                    key={`search-${project.id}`}
                    project={project}
                    badge={project.status}
                    accent="neutral"
                    onCancel={project.status === 'processing' || project.status === 'uploading' ? () => openProjectAction(project, 'cancel') : undefined}
                    onRetry={() => openProjectAction(project, 'retry_generation_jobs')}
                  />
                ))}
                {!projectSearchLoading && projectQuery.trim() && projectSearchResults.length === 0 && (
                  <p className="text-sm text-slate-400">No matching projects found.</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">User Operations</h2>
                <p className="text-sm text-slate-400">Find accounts, inspect billing history, and apply support actions.</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex gap-2">
                <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search email"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => void searchUsers()}
                  disabled={userSearchLoading || !userSearch.trim()}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {userSearchLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => void loadUserSummary(user)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedUser?.id === user.id
                        ? 'border-cyan-600 bg-cyan-950/20'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{user.email}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Balance {money(user.credits?.balance || 0)} · Last sign-in {formatDate(user.lastSignInAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${
                        user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()
                          ? 'bg-red-950/50 text-red-300'
                          : 'bg-emerald-950/50 text-emerald-300'
                      }`}>
                        {user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now() ? 'restricted' : 'active'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Selected User</h3>
                  <p className="text-xs text-slate-500">{selectedUser?.email || 'Choose a user to inspect.'}</p>
                </div>
                {selectedUser && (
                  <div className="flex items-center gap-2">
                    <select
                      value={banDurationByUser[selectedUser.id] || '24h'}
                      onChange={(event) => setBanDurationByUser((current) => ({
                        ...current,
                        [selectedUser.id]: event.target.value as '24h' | '7d',
                      }))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="24h">24h</option>
                      <option value="7d">7d</option>
                    </select>
                    <button onClick={() => openUserAction(selectedUser, 'ban')} className="rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/30">Ban</button>
                    <button onClick={() => openUserAction(selectedUser, 'block')} className="rounded-lg border border-red-700/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30">Block</button>
                    <button onClick={() => openUserAction(selectedUser, 'unban')} className="rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/30">Unban</button>
                  </div>
                )}
              </div>

              {userSummaryLoading ? (
                <p className="mt-4 text-sm text-slate-400">Loading user summary…</p>
              ) : selectedUser && userSummary ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricPill label="Balance" value={money(userSummary.summary.balance)} />
                    <MetricPill label="Lifetime Added" value={money(userSummary.summary.lifetimeCreditsAdded)} />
                    <MetricPill label="Lifetime Spent" value={money(userSummary.summary.lifetimeCreditsSpent)} />
                    <MetricPill label="Audit" value={userSummary.audit.isCorrect ? 'Pass' : `Mismatch ${money(userSummary.audit.discrepancy)}`} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent Transactions</p>
                    <div className="mt-2 space-y-2">
                      {userSummary.summary.recentTransactions.slice(0, 4).map((transaction, index) => (
                        <div key={`${transaction.date}-${index}`} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="text-slate-200">{transaction.type}</p>
                            <p className="truncate text-xs text-slate-500">{transaction.reason || 'No reason recorded'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-200">{money(transaction.amount)}</p>
                            <p className="text-xs text-slate-500">{formatDate(transaction.date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Search and select a user to inspect billing and moderation state.</p>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-semibold text-white">Maintenance Jobs</h2>
                  <p className="text-sm text-slate-400">Run guarded cleanup and reconciliation jobs without exposing internal secrets.</p>
                </div>
              </div>
              <Link href="/dashboard/admin/data" className="text-sm text-cyan-300 hover:text-cyan-200">
                Billing data
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {maintenanceJobs.map((job) => {
                const Icon = job.icon;
                return (
                  <div key={job.key} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="mt-0.5 rounded-2xl border border-slate-700 bg-slate-950 p-2">
                          <Icon className="h-4 w-4 text-cyan-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{job.label}</p>
                          <p className="mt-1 text-sm text-slate-400">{job.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => openMaintenanceAction(job.key)}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                      >
                        Run
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last Maintenance Result</p>
              <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                {lastMaintenanceRun ? JSON.stringify(lastMaintenanceRun, null, 2) : 'Run a maintenance job to inspect the result payload.'}
              </pre>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <TerminalSquare className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Logs & Diagnostics</h2>
                <p className="text-sm text-slate-400">Recent runtime artifacts from file-backed logs and build output.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <LogCard title="Conversation Summary CSV" lines={logs?.summaryTail || []} />
              <LogCard title="Build Output Tail" lines={logs?.buildLogTail || []} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <FileListCard title="Conversation Logs" items={logs?.recentConversationFiles || []} />
              <FileListCard title="Content Generation Logs" items={logs?.recentContentFiles || []} />
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Billing Risk</h2>
                <p className="text-sm text-slate-400">Recent high-risk credit events that usually need support review.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(controlCenter?.highRiskTransactions || []).map((transaction) => (
                <div key={transaction.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100">{transaction.userEmail}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {transaction.transactionType} · {transaction.reason || 'No reason recorded'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-100">{money(transaction.amount)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(transaction.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!controlCenter?.highRiskTransactions.length && (
                <p className="text-sm text-slate-400">No recent billing anomalies surfaced.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
            <div className="flex items-center gap-3">
              <ArrowRight className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Operator Audit Trail</h2>
                <p className="text-sm text-slate-400">Recent admin actions and outcomes.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(controlCenter?.recentAudit || []).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100">{entry.action}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {entry.adminEmail} · {entry.targetLabel || entry.targetId || entry.targetType}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{entry.reason || 'No reason recorded'}</p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${
                        entry.status === 'success'
                          ? 'bg-emerald-950/50 text-emerald-300'
                          : 'bg-red-950/50 text-red-300'
                      }`}>
                        {entry.status}
                      </span>
                      <p className="mt-2 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!controlCenter?.recentAudit.length && (
                <p className="text-sm text-slate-400">No recent audit entries found.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={Boolean(actionIntent)} onOpenChange={(open) => {
        if (!open && !submittingAction) {
          setActionIntent(null);
          setActionReason('');
          setTypedConfirm('');
        }
      }}>
        <DialogContent className="max-w-xl border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>{actionIntent?.label}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {actionIntent?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Reason</label>
              <textarea
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                placeholder="Explain why this action is necessary."
              />
            </div>

            {actionIntent?.requireTypedConfirm && (
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Type CONFIRM to continue</label>
                <input
                  value={typedConfirm}
                  onChange={(event) => setTypedConfirm(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  placeholder="CONFIRM"
                />
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setActionIntent(null);
                setActionReason('');
                setTypedConfirm('');
              }}
              disabled={submittingAction}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void submitAction()}
              disabled={submittingAction || !actionReason.trim() || (actionIntent?.requireTypedConfirm && typedConfirm !== 'CONFIRM')}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                actionIntent?.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700'
              }`}
            >
              {submittingAction && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionIntent?.confirmText || 'Confirm'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectIncidentRow({
  project,
  badge,
  accent,
  onCancel,
  onRetry,
}: {
  project: AdminProject;
  badge: string;
  accent: 'high' | 'medium' | 'neutral';
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${
      accent === 'high'
        ? 'border-red-800/50 bg-red-950/20'
        : accent === 'medium'
          ? 'border-amber-800/50 bg-amber-950/15'
          : 'border-slate-800 bg-slate-900/60'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{project.title}</p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {project.userEmail} · {project.status} · {project.processingStage || 'no-stage'}
          </p>
          <p className="mt-2 text-sm text-slate-300">{project.processingMessage || 'No processing message recorded.'}</p>
          <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(project.updatedAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            {badge}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {onRetry && (
              <button onClick={onRetry} className="rounded-lg border border-cyan-700/50 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-950/30">
                Requeue jobs
              </button>
            )}
            {onCancel && (
              <button onClick={onCancel} className="rounded-lg border border-red-700/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30">
                Cancel project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function LogCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-300">
        {lines.length ? lines.join('\n') : 'No log lines available.'}
      </pre>
    </div>
  );
}

function FileListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item} className="truncate rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-300">
            {item}
          </div>
        )) : (
          <p className="text-sm text-slate-400">No files found.</p>
        )}
      </div>
    </div>
  );
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatUptime(value?: number | null) {
  if (!value || !Number.isFinite(value)) return '—';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
