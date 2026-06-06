"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Loader2,
  Upload,
  Download,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  Zap,
  FolderOpen,
  FolderKanban,
  Library,
  Palette,
  Sparkles,
  Users,
  Mic,
  Radio,
  User,
  HelpCircle,
  ListChecks,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { supabase } from '@/lib/supabase/client';
import { KPICard, CollapsibleStatsRow } from '@/components/ui/kpi-card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { emitProjectMutation } from '@/lib/project-events';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/confirm-modal';
import ExportModal, { type ExportPayload } from '@/components/ExportModal';
import { useUserPrefs } from '@/lib/hooks/useUserPrefs';
import { DashboardLoadErrorState } from '@/components/dashboard/load-error-state';
import { getDashboardErrorMessage, logDashboardLoad } from '@/lib/dashboard-load-state';
import { exportContent } from '@/lib/export-utils';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import type { BrandVoice } from '@/lib/brand-voices';
import type { Campaign, ContentLibraryItem } from '@/lib/campaigns-content-library';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';
import { formatSubscriptionStatus } from '@/lib/billing/subscription-ui';

// ============================================================================
// TYPES
// ============================================================================

type ProjectType = 'DEBATE' | 'INTERVIEW' | 'PODCAST' | 'MONOLOGUE' | 'OTHER';
const HUB_PAGE_SIZE = 10;

interface Project {
  id: string;
  title: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  audio_duration?: number;
  audio_file_size?: number;
  audio_file_name?: string;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  processing_time_seconds?: number;
  transcription_text?: string;
  performance_level?: string;
  project_type?: ProjectType;
  actual_processing_cost?: number;
}

interface Output {
  id: string;
  project_id: string;
  type: string;
  platform: string;
  status: string;
  created_at: string;
}

interface ExportOutputRecord {
  id: string;
  title: string;
  content: string;
  status: string;
  metadata?: any;
  type: string;
  platform: string;
  created_at: string;
}

interface ExportProjectRecord extends Project {
  outputs: ExportOutputRecord[];
  transcription_text?: string;
  ai_summary?: string;
  chapters?: any[];
  key_takeaways?: any[];
  social_quotes?: any[];
  insights?: any[];
  speaker_data?: any;
}

interface Stats {
  totalProjects: number;
  completedProjects: number;
  totalProcessingTime: number;
  totalContent: number;
  timeSavedHours: number;
}

interface WorkspaceStatus {
  brandVoiceCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  contentItemCount: number;
  readyContentCount: number;
  subscriptionStatus: string;
  subscriptionPlanName: string | null;
  loading: boolean;
}

const emptyWorkspaceStatus: WorkspaceStatus = {
  brandVoiceCount: 0,
  campaignCount: 0,
  activeCampaignCount: 0,
  contentItemCount: 0,
  readyContentCount: 0,
  subscriptionStatus: formatSubscriptionStatus(null),
  subscriptionPlanName: null,
  loading: true,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isAudioExpired(project: Project): boolean {
  return Boolean(project.audio_deleted_at);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: Project['status'] }) {
  const config: Record<Project['status'], { variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary'; icon: any; label: string }> = {
    completed: { variant: 'success' as const, icon: CheckCircle, label: 'Completed' },
    processing: { variant: 'info' as const, icon: Loader2, label: 'Processing' },
    uploading: { variant: 'warning' as const, icon: Loader2, label: 'Uploading' },
    failed: { variant: 'destructive' as const, icon: AlertCircle, label: 'Failed' },
    cancelled: { variant: 'secondary' as const, icon: AlertCircle, label: 'Cancelled' }
  };

  const { variant, icon: Icon, label } = config[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={cn("h-3 w-3", status === 'processing' && "animate-spin")} />
      {label}
    </Badge>
  );
}

function ProjectTypeBadge({ type }: { type?: ProjectType }) {
  if (!type) return null;

  const config: Record<ProjectType, { icon: any; label: string; className: string; description: string }> = {
    DEBATE: {
      icon: Users,
      label: 'Debate',
      className: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/30',
      description: 'Panel discussion with moderator',
    },
    INTERVIEW: {
      icon: Mic,
      label: 'Interview',
      className: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800/30',
      description: '1-on-1 Q&A format',
    },
    PODCAST: {
      icon: Radio,
      label: 'Podcast',
      className: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800/30',
      description: 'Conversational show',
    },
    MONOLOGUE: {
      icon: User,
      label: 'Solo',
      className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      description: 'Single speaker',
    },
    OTHER: {
      icon: HelpCircle,
      label: 'Other',
      className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700',
      description: 'Unclassified format',
    },
  };

  const { icon: Icon, label, className, description } = config[type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium",
        className
      )}
      title={description}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4 mb-4">
        <FolderOpen className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">No source projects yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        Add a call, meeting, demo, webinar, founder update, or podcast to start building your team&apos;s content pipeline.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/dashboard/upload"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Add Source
        </Link>
        <Link
          href="/dashboard/onboarding"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ListChecks className="h-4 w-4" />
          Set Up Workspace
        </Link>
      </div>
    </div>
  );
}

function WorkspaceStatusItem({
  icon,
  title,
  value,
  detail,
  href,
  action,
  good,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  href: string;
  action: string;
  good?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/70 dark:hover:bg-blue-950/20"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
          good
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {good && <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />}
          </div>
          <p className="mt-1 text-lg font-semibold leading-6 text-slate-900 dark:text-slate-50">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
          <p className="mt-3 text-xs font-semibold text-blue-600 transition-colors group-hover:text-blue-700 dark:text-blue-300 dark:group-hover:text-blue-200">
            {action}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProjectHubPage() {
  const { user, session, isDemoMode } = useAuth();
  const { organizationId } = useCurrentOrganization();
  const prefs = useUserPrefs();
  const [projects, setProjects] = useState<Project[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(emptyWorkspaceStatus);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Project['status']>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectType>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProjects, setExportProjects] = useState<ExportProjectRecord[]>([]);
  const [hubPage, setHubPage] = useState(1);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    logDashboardLoad('hub', 'start', { userId: user.id });

    try {
      const response = await fetch(
        withOrganizationId('/api/dashboard/projects?includeOutputs=1&limit=100', organizationId),
        {
          headers: authHeaders,
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load hub projects' }));
        throw new Error(payload.error || 'Failed to load hub projects');
      }

      const payload = await response.json() as { projects?: Project[]; outputs?: Output[] };
      const validProjects = payload.projects || [];
      setProjects(validProjects);
      setOutputs(payload.outputs || []);

      logDashboardLoad('hub', 'success', {
        userId: user.id,
        projects: validProjects.length,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setProjects([]);
      setOutputs([]);
      const message = getDashboardErrorMessage(error, 'We could not load your projects right now. Please try again.');
      setLoadError(message);
      logDashboardLoad('hub', 'error', { userId: user.id, message });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId, user?.id]);

  const fetchWorkspaceStatus = useCallback(async () => {
    if (!user?.id || !organizationId) {
      setWorkspaceStatus({ ...emptyWorkspaceStatus, loading: false });
      return;
    }

    setWorkspaceStatus((current) => ({ ...current, loading: true }));

    try {
      const [brandResult, campaignResult, contentResult, subscriptionResult] = await Promise.allSettled([
        fetch(withOrganizationId('/api/brand-voices', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/campaigns', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/content-library', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/subscriptions/current', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);

      const brandPayload = brandResult.status === 'fulfilled' && brandResult.value.ok
        ? await brandResult.value.json().catch(() => ({}))
        : {};
      const campaignPayload = campaignResult.status === 'fulfilled' && campaignResult.value.ok
        ? await campaignResult.value.json().catch(() => ({}))
        : {};
      const contentPayload = contentResult.status === 'fulfilled' && contentResult.value.ok
        ? await contentResult.value.json().catch(() => ({}))
        : {};
      const subscriptionPayload = subscriptionResult.status === 'fulfilled' && subscriptionResult.value.ok
        ? await subscriptionResult.value.json().catch(() => ({}))
        : {};

      const brandVoices = Array.isArray(brandPayload.brandVoices) ? brandPayload.brandVoices as BrandVoice[] : [];
      const campaigns = Array.isArray(campaignPayload.campaigns) ? campaignPayload.campaigns as Campaign[] : [];
      const contentItems = Array.isArray(contentPayload.contentItems) ? contentPayload.contentItems as ContentLibraryItem[] : [];
      const subscription = (subscriptionPayload.subscription || null) as OrganizationSubscription | null;

      setWorkspaceStatus({
        brandVoiceCount: brandVoices.length,
        campaignCount: campaigns.length,
        activeCampaignCount: campaigns.filter((campaign) => campaign.status === 'active').length,
        contentItemCount: contentItems.length,
        readyContentCount: contentItems.filter((item) => item.status === 'approved' || item.status === 'published').length,
        subscriptionStatus: formatSubscriptionStatus(subscription?.status),
        subscriptionPlanName: subscription?.plan?.name || null,
        loading: false,
      });
    } catch (statusError) {
      console.warn('[HUB] Failed to load workspace status:', statusError);
      setWorkspaceStatus({ ...emptyWorkspaceStatus, loading: false });
    }
  }, [authHeaders, organizationId, user?.id]);

  useEffect(() => {
    let active = true;

    void (async () => {
      await fetchData();
      if (!active) return;
    })();

    return () => {
      active = false;
    };
  }, [fetchData]);

  useEffect(() => {
    void fetchWorkspaceStatus();
  }, [fetchWorkspaceStatus]);

  // Computed stats
  const stats = useMemo<Stats>(() => {
    const completedProjects = projects.filter(p => p.status === 'completed').length;
    const totalProcessingTime = projects.reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0);
    const totalAudioMinutes = projects.reduce((sum, p) => sum + ((p.audio_duration || 0) / 60), 0);
    // Time saved = transcription time (5× audio) + per-piece content creation time
    const CONTENT_TIME_MINUTES: Record<string, number> = {
      twitter_thread: 30,
      linkedin_post: 45,
      instagram_caption: 20,
      blog_post: 120,
      email_newsletter: 90,
      show_notes: 45,
      quote_graphic: 15,
    };
    const contentMinutes = outputs.reduce(
      (sum, o) => sum + (CONTENT_TIME_MINUTES[o.type] ?? 30), 0
    );
    const timeSavedHours = Math.round((totalAudioMinutes * 5 + contentMinutes) / 60);

    return {
      totalProjects: projects.length,
      completedProjects,
      totalProcessingTime,
      totalContent: outputs.length,
      timeSavedHours
    };
  }, [projects, outputs]);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(term) ||
        p.audio_file_name?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Audio type filter
    if (typeFilter !== 'all') {
      result = result.filter((project) => project.project_type === typeFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [projects, searchTerm, statusFilter, typeFilter, sortBy]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProjects.length / HUB_PAGE_SIZE)),
    [filteredProjects.length]
  );

  const pagedProjects = useMemo(() => {
    const start = (hubPage - 1) * HUB_PAGE_SIZE;
    return filteredProjects.slice(start, start + HUB_PAGE_SIZE);
  }, [filteredProjects, hubPage]);

  const selectedProjectCount = selectedProjectIds.size;
  const pagedProjectIds = useMemo(() => pagedProjects.map((project) => project.id), [pagedProjects]);
  const allPagedProjectsSelected = pagedProjectIds.length > 0 && pagedProjectIds.every((id) => selectedProjectIds.has(id));
  const somePagedProjectsSelected = pagedProjectIds.some((id) => selectedProjectIds.has(id));

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedProjectIds(new Set());
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const togglePagedProjectSelection = () => {
    setSelectedProjectIds((previous) => {
      const next = new Set(previous);
      if (allPagedProjectsSelected) {
        pagedProjectIds.forEach((id) => next.delete(id));
      } else {
        pagedProjectIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  useEffect(() => {
    setHubPage(1);
  }, [searchTerm, statusFilter, typeFilter, sortBy]);

  useEffect(() => {
    if (hubPage > totalPages) {
      setHubPage(totalPages);
    }
  }, [hubPage, totalPages]);

  useEffect(() => {
    const availableProjectIds = new Set(projects.map((project) => project.id));
    setSelectedProjectIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => availableProjectIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [projects]);

  // Output counts by project
  const outputCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    outputs.forEach(o => {
      counts[o.project_id] = (counts[o.project_id] || 0) + 1;
    });
    return counts;
  }, [outputs]);

  // Delete handler — opens confirmation modal
  const handleDelete = (projectId: string) => {
    if (!user?.id) return;
    setPendingDeleteId(projectId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || !user?.id) return;
    setDeletingId(pendingDeleteId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/projects/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to delete project' }));
        throw new Error(data.error || 'Failed to delete project');
      }

      emitProjectMutation({ projectId: pendingDeleteId, action: 'deleted' });
      setProjects(prev => prev.filter(p => p.id !== pendingDeleteId));
      setOutputs(prev => prev.filter(output => output.project_id !== pendingDeleteId));
      setSelectedProjectIds(prev => {
        if (!prev.has(pendingDeleteId)) return prev;
        const next = new Set(prev);
        next.delete(pendingDeleteId);
        return next;
      });
      toast.success('Project deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete project');
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const confirmBulkDelete = async () => {
    const projectIds = Array.from(selectedProjectIds);
    if (projectIds.length === 0 || !user?.id) return;

    setBulkDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit | undefined = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const results = await Promise.allSettled(
        projectIds.map(async (projectId) => {
          const response = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers,
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Failed to delete project' }));
            throw new Error(data.error || 'Failed to delete project');
          }

          return projectId;
        })
      );

      const deletedIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failedCount = results.length - deletedIds.length;
      const deletedIdSet = new Set(deletedIds);

      deletedIds.forEach((projectId) => {
        emitProjectMutation({ projectId, action: 'deleted' });
      });

      if (deletedIds.length > 0) {
        setProjects((prev) => prev.filter((project) => !deletedIdSet.has(project.id)));
        setOutputs((prev) => prev.filter((output) => !deletedIdSet.has(output.project_id)));
      }

      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((projectId) => next.delete(projectId));
        return next;
      });

      if (failedCount > 0) {
        toast.error(`Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}; ${failedCount} failed`);
      } else {
        toast.success(`Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}`);
        setSelectionMode(false);
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast.error('Failed to delete selected projects');
    } finally {
      setBulkDeleting(false);
      setPendingBulkDelete(false);
    }
  };

  const prepareExportForProjects = async (projectIds: string[]) => {
    try {
      const projectsWithOutputs = await Promise.all(
        projectIds.map(async (projectId) => {
          const fallbackProject = projects.find((project) => project.id === projectId);
          if (!fallbackProject) return null;

          const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .select('id, title, transcription_text, ai_summary, chapters, key_takeaways, social_quotes, speaker_data')
            .eq('id', projectId)
            .single();

          if (projectError) {
            throw new Error(projectError.message || 'Failed to load project for export');
          }

          const { data: insightsData, error: insightsError } = await supabase
            .from('insights')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

          if (insightsError && insightsError.code !== 'PGRST116') {
            throw new Error(insightsError.message || 'Failed to load insights for export');
          }

          const { data: outputsData, error: outputsError } = await supabase
            .from('outputs')
            .select('id, title, content, platform, type, created_at, metadata')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

          if (outputsError) {
            throw new Error(outputsError.message || 'Failed to load outputs for export');
          }

          const buildPersonProfile = (insight: any) => {
            const relationships = Array.isArray(insight.relationships) ? insight.relationships : [];
            const getSection = (type: string) =>
              relationships.find((relationship: any) => relationship?.type === type)?.description;

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
          };

          return {
            ...fallbackProject,
            transcription_text: (projectData as any).transcription_text,
            ai_summary: (projectData as any).ai_summary,
            chapters: (projectData as any).chapters,
            key_takeaways: (projectData as any).key_takeaways,
            social_quotes: (projectData as any).social_quotes,
            speaker_data: (projectData as any).speaker_data,
            insights: (insightsData || []).map((insight: any) => ({
              ...insight,
              person_profile: buildPersonProfile(insight),
            })),
            outputs: (outputsData || []).map((output: any) => ({
              id: output.id,
              title: output.title || output.type || 'Untitled output',
              content: output.content || '',
              status: output.status || 'completed',
              metadata: output.metadata,
              type: output.type,
              platform: output.platform,
              created_at: output.created_at,
            })),
          };
        })
      );

      const validProjects = projectsWithOutputs.filter(Boolean) as ExportProjectRecord[];

      if (validProjects.length === 0) {
        toast.error('Nothing available to export');
        return;
      }

      setExportProjects(validProjects);
      setShowExportModal(true);
    } catch (error: any) {
      console.error('[EXPORT] Failed to prepare export:', error);
      toast.error(error?.message || 'Failed to prepare export');
    }
  };

  const handleBulkExport = async () => {
    if (selectedProjectIds.size === 0) return;
    await prepareExportForProjects(Array.from(selectedProjectIds));
  };

  const handleExport = async (payload: ExportPayload) => {
    const projectsForExport = exportProjects.map((project) => ({
      id: project.id,
      title: project.title,
      outputs: project.outputs.map((output) => ({
        id: output.id,
        title: output.title,
        content: output.content,
        platform: output.platform,
        type: output.type,
        created_at: output.created_at,
        metadata: output.metadata,
      })),
      transcription_text: (project as any).transcription_text,
      ai_summary: (project as any).ai_summary,
      chapters: (project as any).chapters,
      key_takeaways: (project as any).key_takeaways,
      social_quotes: (project as any).social_quotes,
      insights: (project as any).insights,
      speaker_data: (project as any).speaker_data,
    }));

    const result = await exportContent(
      projectsForExport,
      payload.export_manifest,
      payload.format,
      { debug: payload.debug }
    );

    if (!result.success) {
      toast.error(`Export failed: ${result.message}`);
      return;
    }

    exitSelectionMode();
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              ))}
            </div>
            <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <DashboardLoadErrorState
        title="Projects unavailable"
        message={loadError}
        onRetry={() => {
          void fetchData();
        }}
      />
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <ConfirmModal
        isOpen={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Project"
        description="This will permanently delete the project and all its generated content. This cannot be undone."
        confirmText="Delete"
        isDestructive
      />
      <ConfirmModal
        isOpen={pendingBulkDelete}
        onClose={() => setPendingBulkDelete(false)}
        onConfirm={confirmBulkDelete}
        title={`Delete ${selectedProjectCount} Project${selectedProjectCount === 1 ? '' : 's'}`}
        description="This will permanently delete the selected projects and all their generated content. This cannot be undone."
        confirmText={`Delete ${selectedProjectCount}`}
        isDestructive
      />
      <ExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setExportProjects([]);
        }}
        projects={exportProjects}
        onExport={handleExport}
      />
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Content Workspace</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Start with source material, then review transcripts, ideas, and generated B2B content in one place.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {!isDemoMode && projects.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (selectionMode) {
                    exitSelectionMode();
                  } else {
                    setSelectionMode(true);
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                  selectionMode
                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-700 text-blue-600 dark:text-blue-400"
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {selectionMode ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <ListChecks className="h-4 w-4" />
                    Select
                  </>
                )}
              </button>
            )}
            <Link
              href="/dashboard/upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Add Source
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <WorkspaceStatusItem
            icon={<Palette className="h-4 w-4" />}
            title="Brand Voice"
            value={workspaceStatus.loading ? 'Checking...' : workspaceStatus.brandVoiceCount > 0 ? 'Ready' : 'Not set'}
            detail={
              workspaceStatus.brandVoiceCount > 0
                ? `${workspaceStatus.brandVoiceCount} profile${workspaceStatus.brandVoiceCount === 1 ? '' : 's'} available for generation`
                : 'Add tone, audience, pillars, and banned phrases'
            }
            href="/dashboard/brand-voice"
            action={workspaceStatus.brandVoiceCount > 0 ? 'Review voice' : 'Set up voice'}
            good={workspaceStatus.brandVoiceCount > 0}
          />
          <WorkspaceStatusItem
            icon={<FolderKanban className="h-4 w-4" />}
            title="Campaigns"
            value={workspaceStatus.loading ? 'Checking...' : `${workspaceStatus.activeCampaignCount} active`}
            detail={`${workspaceStatus.campaignCount} total campaign${workspaceStatus.campaignCount === 1 ? '' : 's'} in this workspace`}
            href="/dashboard/campaigns"
            action={workspaceStatus.campaignCount > 0 ? 'Open campaigns' : 'Create campaign'}
            good={workspaceStatus.activeCampaignCount > 0}
          />
          <WorkspaceStatusItem
            icon={<Library className="h-4 w-4" />}
            title="Content Library"
            value={workspaceStatus.loading ? 'Checking...' : `${workspaceStatus.contentItemCount} items`}
            detail={`${workspaceStatus.readyContentCount} approved or published item${workspaceStatus.readyContentCount === 1 ? '' : 's'}`}
            href="/dashboard/campaigns"
            action={workspaceStatus.contentItemCount > 0 ? 'Review library' : 'Add library item'}
            good={workspaceStatus.contentItemCount > 0}
          />
          <WorkspaceStatusItem
            icon={<CreditCard className="h-4 w-4" />}
            title="Subscription"
            value={workspaceStatus.loading ? 'Checking...' : workspaceStatus.subscriptionPlanName || workspaceStatus.subscriptionStatus}
            detail={workspaceStatus.subscriptionPlanName ? workspaceStatus.subscriptionStatus : 'Review billing when you are ready'}
            href="/dashboard/billing"
            action="Review billing"
            good={workspaceStatus.subscriptionStatus === 'Active' || workspaceStatus.subscriptionStatus === 'Trialing'}
          />
        </div>

        {/* Collapsible Stats Row */}
        <CollapsibleStatsRow title="Key Metrics">
          <div data-tour="hub-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Total Projects"
              value={stats.totalProjects}
              icon={<FolderOpen className="h-5 w-5" />}
              subtitle={`${stats.completedProjects} completed`}
            />
            <KPICard
              title="Content Created"
              value={stats.totalContent}
              icon={<FileText className="h-5 w-5" />}
              subtitle={stats.totalContent > 0 ? `across ${stats.completedProjects} project${stats.completedProjects !== 1 ? 's' : ''}` : 'Generate your first piece'}
            />
            <KPICard
              title="Time Saved"
              value={`${stats.timeSavedHours}h`}
              icon={<Clock className="h-5 w-5" />}
              subtitle="Estimated vs. doing it manually"
            />
            <KPICard
              title="Audio Processed"
              value={formatDuration(stats.totalProcessingTime)}
              icon={<Zap className="h-5 w-5" />}
              subtitle="Total compute time"
            />
          </div>
        </CollapsibleStatsRow>

        {/* Filters & Search Bar */}
        <div data-tour="hub-filters" className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 placeholder:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Filter Toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                  showFilters
                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-700 text-blue-600 dark:text-blue-400"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                <Filter className="h-4 w-4" />
                Filters
                {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recent">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200"
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Type:</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as any)}
                    className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200"
                  >
                    <option value="all">All</option>
                    <option value="DEBATE">Debate</option>
                    <option value="INTERVIEW">Interview</option>
                    <option value="PODCAST">Podcast</option>
                    <option value="MONOLOGUE">Monologue</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                {(statusFilter !== 'all' || typeFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setTypeFilter('all');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-500 dark:hover:text-blue-300"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {selectionMode && filteredProjects.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePagedProjectSelection}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300"
                    aria-label={allPagedProjectsSelected ? 'Deselect visible projects' : 'Select visible projects'}
                  >
                    {allPagedProjectsSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : somePagedProjectsSelected ? (
                      <span className="h-4 w-4 rounded border-2 border-blue-600 bg-blue-600/20" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Select visible
                  </button>
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    {selectedProjectCount} selected
                  </span>
                  {selectedProjectCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedProjectIds(new Set())}
                      className="text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkExport}
                    disabled={selectedProjectCount === 0 || bulkDeleting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Export selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingBulkDelete(true)}
                    disabled={selectedProjectCount === 0 || bulkDeleting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete selected
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Projects Table */}
          {filteredProjects.length === 0 ? (
            projects.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
                <p>No projects match your filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )
          ) : (
            <div data-tour="hub-grid">
              {/* ── Mobile card list (< sm) ── */}
              <div className="sm:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {pagedProjects.map((project) => (
                  <div
                    key={project.id}
                    className={cn(
                      "p-4 space-y-3 transition-colors",
                      selectionMode && selectedProjectIds.has(project.id) && "bg-blue-50 dark:bg-blue-950/20"
                    )}
                  >
                    {/* Title + status */}
                    <div className="flex items-start justify-between gap-3">
                      {selectionMode && (
                        <button
                          type="button"
                          onClick={() => toggleProjectSelection(project.id)}
                          className="mt-0.5 flex-shrink-0 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                          aria-label={selectedProjectIds.has(project.id) ? `Deselect ${project.title || 'project'}` : `Select ${project.title || 'project'}`}
                        >
                          {selectedProjectIds.has(project.id) ? (
                            <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/projects?id=${project.id}`}
                        className="flex-1 min-w-0"
                        onClick={(event) => {
                          if (!selectionMode) return;
                          event.preventDefault();
                          toggleProjectSelection(project.id);
                        }}
                      >
                        <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                          {project.title || 'Untitled'}
                        </p>
                        {project.audio_file_name && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {project.audio_file_name}
                          </p>
                        )}
                        {project.status === 'completed' && isAudioExpired(project) && (
                          <p className="text-xs text-rose-500 dark:text-rose-300 mt-0.5">Source audio expired</p>
                        )}
                      </Link>
                      <StatusBadge status={project.status} />
                    </div>
                    {/* Metadata row */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-500">
                      <ProjectTypeBadge type={project.project_type} />
                      <span>{prefs.formatRelativeDate(project.created_at)}</span>
                      {project.audio_duration && (
                        <span>{formatDuration(project.audio_duration)}</span>
                      )}
                      {outputCountByProject[project.id] > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {outputCountByProject[project.id]} pieces
                        </span>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/projects?id=${project.id}`}
                        className="flex-1 py-2 text-xs font-medium text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                      >
                        View
                      </Link>
                      {project.status === 'completed' && (
                        <Link
                          href={`/dashboard/projects?id=${project.id}&generate=true`}
                          className="flex-1 py-2 text-xs font-medium text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                        >
                          Generate
                        </Link>
                      )}
                      {!isDemoMode && (
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          disabled={deletingId === project.id || bulkDeleting}
                          className="p-2 text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === project.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Desktop table (≥ sm) ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                      {selectionMode && (
                        <th className="w-10 px-4 py-3">
                          <button
                            type="button"
                            onClick={togglePagedProjectSelection}
                            className="inline-flex text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                            aria-label={allPagedProjectsSelected ? 'Deselect visible projects' : 'Select visible projects'}
                          >
                            {allPagedProjectsSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            ) : somePagedProjectsSelected ? (
                              <span className="h-4 w-4 rounded border-2 border-blue-600 bg-blue-600/20" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Project</th>
                      <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Status</th>
                      <th className="hidden sm:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Type</th>
                      <th className="hidden md:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Duration</th>
                      <th className="hidden md:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Content</th>
                      <th className="hidden sm:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Created</th>
                      <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {pagedProjects.map((project) => (
                      <tr
                        key={project.id}
                        className={cn(
                          "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group",
                          selectionMode && selectedProjectIds.has(project.id) && "bg-blue-50 dark:bg-blue-950/20"
                        )}
                      >
                        {selectionMode && (
                          <td className="px-4 py-3 align-top">
                            <button
                              type="button"
                              onClick={() => toggleProjectSelection(project.id)}
                              className="inline-flex text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                              aria-label={selectedProjectIds.has(project.id) ? `Deselect ${project.title || 'project'}` : `Select ${project.title || 'project'}`}
                            >
                              {selectedProjectIds.has(project.id) ? (
                                <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/projects?id=${project.id}`}
                            className="block"
                            onClick={(event) => {
                              if (!selectionMode) return;
                              event.preventDefault();
                              toggleProjectSelection(project.id);
                            }}
                          >
                            <div className="font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {project.title || 'Untitled'}
                            </div>
                            {project.audio_file_name && (
                              <div className="text-xs text-slate-500 truncate max-w-[200px]">
                                {project.audio_file_name}
                              </div>
                            )}
                            {project.status === 'completed' && isAudioExpired(project) && (
                              <div className="text-xs text-rose-500 dark:text-rose-300 truncate max-w-[200px]">
                                Source audio expired
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={project.status} />
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ProjectTypeBadge type={project.project_type} />
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">
                          {project.audio_duration
                            ? formatDuration(project.audio_duration)
                            : '—'}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <FileText className="h-3.5 w-3.5" />
                            {outputCountByProject[project.id] || 0}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400">
                          {prefs.formatRelativeDate(project.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/dashboard/projects?id=${project.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="hidden lg:inline">View</span>
                            </Link>
                            {project.status === 'completed' && (
                              <Link
                                href={`/dashboard/projects?id=${project.id}&generate=true`}
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-green-50 hover:text-green-600 dark:text-slate-300 dark:hover:bg-green-900/20 dark:hover:text-green-400"
                                title="Generate Content"
                              >
                                <Sparkles className="h-4 w-4" />
                                <span className="hidden lg:inline">Generate</span>
                              </Link>
                            )}
                            {!isDemoMode && (
                              <button
                                type="button"
                                onClick={() => handleDelete(project.id)}
                                disabled={deletingId === project.id || bulkDeleting}
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                title="Delete"
                              >
                                {deletingId === project.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                <span className="hidden lg:inline">Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer with count + pagination */}
          {filteredProjects.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30 text-xs text-slate-500">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  Showing {pagedProjects.length} of {filteredProjects.length} projects
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      Page {hubPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHubPage(hubPage - 1)}
                      disabled={hubPage <= 1}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${hubPage <= 1
                        ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setHubPage(hubPage + 1)}
                      disabled={hubPage >= totalPages}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${hubPage >= totalPages
                        ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
