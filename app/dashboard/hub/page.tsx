"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  Search,
  Filter,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Play,
  Trash2,
  Eye,
  Zap,
  FolderOpen,
  TrendingUp,
  Calendar,
  Sparkles,
  Users,
  Mic,
  Radio,
  User,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import { KPICard, CollapsibleStatsRow } from '@/components/ui/kpi-card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DemoTour } from '@/components/demo/DemoTour';
import { emitProjectMutation } from '@/lib/project-events';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/confirm-modal';
import { useUserPrefs } from '@/lib/hooks/useUserPrefs';

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

interface Stats {
  totalProjects: number;
  completedProjects: number;
  totalProcessingTime: number;
  totalContent: number;
  timeSavedHours: number;
}

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

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}


function isAudioExpired(project: Project): boolean {
  if (project.audio_deleted_at) return true;
  if (!project.audio_expires_at) return false;
  return new Date(project.audio_expires_at).getTime() <= Date.now();
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
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">No projects yet</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        Upload your first audio file to start generating content automatically.
      </p>
      <Link
        href="/dashboard/upload"
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Upload Audio
      </Link>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProjectHubPage() {
  const { user, isDemoMode } = useAuth();
  const prefs = useUserPrefs();
  const [projects, setProjects] = useState<Project[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Project['status']>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectType>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [hubPage, setHubPage] = useState(1);

  // Fetch data
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // Fetch projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }) as { data: Project[] | null; error: any };

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Fetch outputs count
      const { data: outputsData, error: outputsError } = await supabase
        .from('outputs')
        .select('id, project_id, type, platform, status, created_at')
        .eq('user_id', user.id) as { data: Output[] | null; error: any };

      if (outputsError) throw outputsError;
      setOutputs(outputsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Computed stats
  const stats = useMemo<Stats>(() => {
    const completedProjects = projects.filter(p => p.status === 'completed').length;
    const totalProcessingTime = projects.reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0);
    const totalAudioMinutes = projects.reduce((sum, p) => sum + ((p.audio_duration || 0) / 60), 0);
    // Time saved = transcription time (5× audio) + per-piece content creation time
    const CONTENT_TIME_MINUTES: Record<string, number> = {
      twitter_thread:    30,
      linkedin_post:     45,
      instagram_caption: 20,
      blog_post:         120,
      email_newsletter:  90,
      show_notes:        45,
      quote_graphic:     15,
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

  useEffect(() => {
    setHubPage(1);
  }, [searchTerm, statusFilter, typeFilter, sortBy]);

  useEffect(() => {
    if (hubPage > totalPages) {
      setHubPage(totalPages);
    }
  }, [hubPage, totalPages]);

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
      toast.success('Project deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete project');
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">All Projects</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Your full project history and usage overview
            </p>
          </div>
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors self-start sm:self-auto"
          >
            <Upload className="h-4 w-4" />
            New Project
          </Link>
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
                  <div key={project.id} className="p-4 space-y-3">
                    {/* Title + status */}
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/dashboard/projects?id=${project.id}`}
                        className="flex-1 min-w-0"
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
                          disabled={deletingId === project.id}
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
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/projects?id=${project.id}`}
                            className="block"
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
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            {project.status === 'completed' && (
                              <Link
                                href={`/dashboard/projects?id=${project.id}&generate=true`}
                                className="p-1.5 text-slate-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                title="Generate Content"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Link>
                            )}
                            {!isDemoMode && (
                              <button
                                type="button"
                                onClick={() => handleDelete(project.id)}
                                disabled={deletingId === project.id}
                                className="p-1.5 text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
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
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                        hubPage <= 1
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
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                        hubPage >= totalPages
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
      {isDemoMode && <DemoTour chapter="hub" />}
    </div>
  );
}
