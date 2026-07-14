"use client";

import { useState, useEffect, useMemo, useCallback, type ElementType, type ReactNode } from 'react';
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
  Trash2,
  Eye,
  Sparkles,
  Users,
  Mic,
  Radio,
  User,
  HelpCircle,
  ListChecks,
  CheckSquare,
  Square,
  X,
  MoreHorizontal,
  SlidersHorizontal,
  Star,
  UploadCloud,
  LayoutGrid
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { supabase } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DashboardHeaderAction, DashboardPageHeader, DashboardPageShell, DashboardPanel } from '@/components/dashboard/shell';
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

function getStatusLabel(status: Project['status']): string {
  const labels: Record<Project['status'], string> = {
    completed: 'Completed',
    processing: 'Processing',
    uploading: 'Uploading',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function getNextAction(project: Project, assetCount: number): string {
  if (project.status === 'failed') return 'Retry processing';
  if (project.status === 'cancelled') return 'Review source';
  if (project.status === 'uploading') return 'Finishing upload';
  if (project.status === 'processing') return 'Generating assets';
  if (assetCount > 0) return 'Ready to review';
  return 'Generate reusable assets';
}

function getSourceIconElement(project: Project) {
  const fileName = (project.audio_file_name || project.title || '').toLowerCase();
  if (project.project_type === 'PODCAST') return <Radio className="h-5 w-5" />;
  if (project.project_type === 'INTERVIEW') return <Mic className="h-5 w-5" />;
  if (project.project_type === 'DEBATE') return <Users className="h-5 w-5" />;
  if (fileName.includes('video') || fileName.endsWith('.mp4') || fileName.endsWith('.mov')) {
    return <FileText className="h-5 w-5" />;
  }
  return <FileText className="h-5 w-5" />;
}

function getSourceLabel(project: Project): string {
  if (project.audio_file_name) {
    const extension = project.audio_file_name.split('.').pop()?.toUpperCase();
    if (extension && extension.length <= 5) return `${extension} source`;
  }
  if (project.project_type) return project.project_type.toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
  return 'Audio source';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: Project['status'] }) {
  const config: Record<Project['status'], { className: string; icon: ElementType }> = {
    completed: { className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300', icon: CheckCircle },
    processing: { className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300', icon: Loader2 },
    uploading: { className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300', icon: Loader2 },
    failed: { className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300', icon: AlertCircle },
    cancelled: { className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: AlertCircle }
  };

  const { className, icon: Icon } = config[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2.5 py-1 font-medium", className)}>
      <Icon className={cn("h-3.5 w-3.5", (status === 'processing' || status === 'uploading') && "motion-safe:animate-spin")} />
      {getStatusLabel(status)}
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

function PremiumStatCard({
  icon,
  value,
  label,
  detail,
  tone,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  detail: string;
  tone: 'blue' | 'emerald' | 'amber' | 'slate';
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  };

  return (
    <div className="min-h-[116px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_55px_-42px_rgba(15,23,42,0.45)] transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ring-1", toneClasses[tone])}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  variant,
  onClearFilters,
}: {
  variant: 'no-projects' | 'filtered';
  onClearFilters?: () => void;
}) {
  const isFiltered = variant === 'filtered';

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isFiltered ? (
          <Filter className="h-8 w-8 text-slate-500 dark:text-slate-400" />
        ) : (
          <UploadCloud className="h-8 w-8 text-blue-600 dark:text-blue-300" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
        {isFiltered ? 'No projects match this view' : 'Start your project pipeline'}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
        {isFiltered
          ? 'Try clearing filters or changing your search, status, or type view.'
          : 'Upload a call, demo, webinar, founder update, or podcast. AudioRepurpose will turn it into transcripts, insights, and publish-ready drafts.'}
      </p>
      {isFiltered ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 dark:focus:ring-offset-slate-950"
        >
          Clear Filters
        </button>
      ) : (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_-18px_rgba(37,99,235,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:focus:ring-offset-slate-950"
          >
            <Upload className="h-4 w-4" />
            Add Source
          </Link>
          <Link
            href="/dashboard/studio/profile"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Set Up Profile
          </Link>
        </div>
      )}
    </div>
  );
}

function ProjectSourceTile({ project }: { project: Project }) {
  const icon = getSourceIconElement(project);
  const tone =
    project.status === 'failed' || project.status === 'cancelled'
      ? 'from-rose-500 to-red-600'
      : project.status === 'processing' || project.status === 'uploading'
        ? 'from-blue-600 to-cyan-600'
        : project.project_type === 'PODCAST'
          ? 'from-indigo-600 to-violet-600'
          : project.project_type === 'INTERVIEW'
            ? 'from-emerald-600 to-teal-600'
            : 'from-slate-800 to-blue-800';

  return (
    <div className={cn("flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-[0_16px_35px_-24px_rgba(15,23,42,0.7)]", tone)}>
      {icon}
    </div>
  );
}

function ProjectCardRow({
  project,
  assetCount,
  selectionMode,
  selected,
  starred,
  deleting,
  bulkDeleting,
  isDemoMode,
  formatRelativeDate,
  onToggleSelection,
  onToggleStar,
  onDelete,
}: {
  project: Project;
  assetCount: number;
  selectionMode: boolean;
  selected: boolean;
  starred: boolean;
  deleting: boolean;
  bulkDeleting: boolean;
  isDemoMode: boolean;
  formatRelativeDate: (date: string) => string;
  onToggleSelection: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
}) {
  const nextAction = getNextAction(project, assetCount);
  const createdAt = new Date(project.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const openHref = `/dashboard/projects?id=${project.id}`;
  const generateHref = `/dashboard/projects?id=${project.id}&generate=true`;

  return (
    <article
      className={cn(
        "group rounded-2xl border bg-white p-4 shadow-[0_18px_55px_-48px_rgba(15,23,42,0.55)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-[0_22px_70px_-50px_rgba(15,23,42,0.62)] focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-slate-900 dark:hover:bg-slate-900/80 dark:focus-within:ring-offset-slate-950",
        selected
          ? 'border-blue-300 bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-500/10'
          : 'border-slate-200 dark:border-slate-800 dark:hover:border-slate-700'
      )}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.75fr)_minmax(120px,0.55fr)_minmax(150px,0.7fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          {selectionMode && (
            <button
              type="button"
              onClick={onToggleSelection}
              className="mt-3 flex-shrink-0 rounded-md text-slate-500 transition-colors hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:text-blue-300"
              aria-label={selected ? `Deselect ${project.title || 'project'}` : `Select ${project.title || 'project'}`}
            >
              {selected ? (
                <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>
          )}
          <ProjectSourceTile project={project} />
          <div className="min-w-0">
            <Link
              href={openHref}
              onClick={(event) => {
                if (!selectionMode) return;
                event.preventDefault();
                onToggleSelection();
              }}
              className="block rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <h3 className="truncate text-sm font-semibold text-slate-950 transition-colors group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
                {project.title || 'Untitled'}
              </h3>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <ProjectTypeBadge type={project.project_type} />
              <span>{getSourceLabel(project)}</span>
              {project.audio_duration && <span>{formatDuration(project.audio_duration)}</span>}
            </div>
            {project.status === 'completed' && isAudioExpired(project) && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">Source audio expired</p>
            )}
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">{nextAction}</p>
          </div>
        </div>

        <div>
          <StatusBadge status={project.status} />
        </div>

        <div className="text-sm text-slate-900 dark:text-slate-100">
          <p className="font-semibold tabular-nums">{assetCount}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{assetCount === 1 ? 'asset' : 'assets'}</p>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p>{formatRelativeDate(project.created_at)}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{createdAt}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 md:justify-end md:border-t-0 md:pt-0">
          <button
            type="button"
            onClick={onToggleStar}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
              starred
                ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            )}
            aria-label={starred ? `Unstar ${project.title || 'project'}` : `Star ${project.title || 'project'}`}
          >
            <Star className={cn("h-4 w-4", starred && "fill-current")} />
          </button>

          <DropdownMenu
            align="right"
            portal
            trigger={
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={`Open actions for ${project.title || 'project'}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
          >
            <DropdownMenuItem onClick={() => { window.location.href = openHref; }}>
              <Eye className="h-4 w-4" />
              View project
            </DropdownMenuItem>
            {project.status === 'completed' && (
              <DropdownMenuItem onClick={() => { window.location.href = generateHref; }}>
                <Sparkles className="h-4 w-4" />
                Generate content
              </DropdownMenuItem>
            )}
            {!isDemoMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  disabled={deleting || bulkDeleting}
                  destructive
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete project
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenu>
        </div>
      </div>
    </article>
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [starredProjectIds, setStarredProjectIds] = useState<Set<string>>(new Set());
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

  const outputCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    outputs.forEach((output) => {
      counts[output.project_id] = (counts[output.project_id] || 0) + 1;
    });
    return counts;
  }, [outputs]);

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
      <DashboardPageShell maxWidth="7xl">
        <div className="animate-pulse space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="h-3 w-28 rounded bg-blue-100 dark:bg-blue-950" />
            <div className="mt-4 h-8 w-64 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
          <div className="h-96 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </DashboardPageShell>
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
    <DashboardPageShell maxWidth="7xl">
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
      <div className="space-y-6">
        <DashboardPageHeader
          icon={LayoutGrid}
          title="All Projects"
          description="Organize and manage every repurposing project in one place."
          actions={<DashboardHeaderAction href="/dashboard/upload" icon={Upload} variant="primary">New Project</DashboardHeaderAction>}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto_auto] lg:items-center">
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-white/15 dark:bg-[#0b1832] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <label className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | Project['status'])}
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-white/15 dark:bg-[#0b1832] dark:text-slate-100"
              >
                <option value="all">All</option>
                <option value="uploading">Uploading</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'all' | ProjectType)}
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-white/15 dark:bg-[#0b1832] dark:text-slate-100"
              >
                <option value="all">All</option>
                <option value="DEBATE">Debate</option>
                <option value="INTERVIEW">Interview</option>
                <option value="PODCAST">Podcast</option>
                <option value="MONOLOGUE">Monologue</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sort</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'recent' | 'oldest' | 'name')}
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-white/15 dark:bg-[#0b1832] dark:text-slate-100"
                aria-label="Sort projects"
              >
                <option value="recent">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </select>
            </label>
            {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                }}
                className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-white/10"
              >
                Clear filters
              </button>
            )}
          </div>
        </DashboardPageHeader>

        <div data-tour="hub-stats" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PremiumStatCard
            icon={<CheckCircle className="h-5 w-5" />}
            value={stats.completedProjects}
            label="Completed Projects"
            detail="Ready for content generation"
            tone="blue"
          />
          <PremiumStatCard
            icon={<FileText className="h-5 w-5" />}
            value={stats.totalContent}
            label="Content Assets"
            detail="Generated across workspace"
            tone="emerald"
          />
          <PremiumStatCard
            icon={<Clock className="h-5 w-5" />}
            value={`${stats.timeSavedHours}h`}
            label="Time Saved"
            detail="Estimated vs. manual work"
            tone="amber"
          />
          <PremiumStatCard
            icon={<CreditCard className="h-5 w-5" />}
            value={workspaceStatus.loading ? 'Checking...' : workspaceStatus.subscriptionPlanName || workspaceStatus.subscriptionStatus}
            label="Subscription / Credits"
            detail={workspaceStatus.subscriptionPlanName ? workspaceStatus.subscriptionStatus : 'Current billing state'}
            tone="slate"
          />
        </div>

        <DashboardPanel data-tour="hub-filters" className="overflow-hidden rounded-3xl bg-[#fbfaf7] dark:bg-slate-950">
          <div className="border-b border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Project List</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
                  {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all') && ` filtered from ${projects.length}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                      "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:focus:ring-offset-slate-950",
                      selectionMode
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                    )}
                  >
                    {selectionMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                    {selectionMode ? 'Cancel' : 'Select'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {selectionMode && filteredProjects.length > 0 && (
            <div className="border-b border-blue-100 bg-blue-50/80 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePagedProjectSelection}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200"
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
                  <span className="text-sm text-blue-800 dark:text-blue-200">{selectedProjectCount} selected</span>
                  {selectedProjectCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedProjectIds(new Set())}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
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
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Export selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingBulkDelete(true)}
                    disabled={selectedProjectCount === 0 || bulkDeleting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete selected
                  </button>
                </div>
              </div>
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <EmptyState
              variant={projects.length === 0 ? 'no-projects' : 'filtered'}
              onClearFilters={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setTypeFilter('all');
              }}
            />
          ) : (
            <div data-tour="hub-grid" className="p-3 sm:p-4">
              <div className="hidden px-4 pb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(140px,0.75fr)_minmax(120px,0.55fr)_minmax(150px,0.7fr)_auto]">
                <span>Project</span>
                <span>Status</span>
                <span>Assets</span>
                <span>Created</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="space-y-3">
                {pagedProjects.map((project) => (
                  <ProjectCardRow
                    key={project.id}
                    project={project}
                    assetCount={outputCountByProject[project.id] || 0}
                    selectionMode={selectionMode}
                    selected={selectedProjectIds.has(project.id)}
                    starred={starredProjectIds.has(project.id)}
                    deleting={deletingId === project.id}
                    bulkDeleting={bulkDeleting}
                    isDemoMode={isDemoMode}
                    formatRelativeDate={prefs.formatRelativeDate}
                    onToggleSelection={() => toggleProjectSelection(project.id)}
                    onToggleStar={() => {
                      setStarredProjectIds((current) => {
                        const next = new Set(current);
                        if (next.has(project.id)) {
                          next.delete(project.id);
                        } else {
                          next.add(project.id);
                        }
                        return next;
                      });
                    }}
                    onDelete={() => handleDelete(project.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredProjects.length > 0 && (
            <div className="border-t border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Showing {pagedProjects.length} of {filteredProjects.length} projects
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Page {hubPage} of {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setHubPage(hubPage - 1)}
                      disabled={hubPage <= 1}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setHubPage(hubPage + 1)}
                      disabled={hubPage >= totalPages}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DashboardPanel>
      </div>
    </DashboardPageShell>
  );
}
