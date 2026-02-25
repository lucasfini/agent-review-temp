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
  Crown,
  Star,
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

// ============================================================================
// TYPES
// ============================================================================

type ProjectType = 'DEBATE' | 'INTERVIEW' | 'PODCAST' | 'MONOLOGUE' | 'OTHER';

interface Project {
  id: string;
  title: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  created_at: string;
  audio_duration?: number;
  audio_file_size?: number;
  audio_file_name?: string;
  processing_time_seconds?: number;
  transcription_text?: string;
  performance_level?: 'basic' | 'pro' | 'premium';
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

function formatRelativeDate(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: Project['status'] }) {
  const config = {
    completed: { variant: 'success' as const, icon: CheckCircle, label: 'Completed' },
    processing: { variant: 'info' as const, icon: Loader2, label: 'Processing' },
    uploading: { variant: 'warning' as const, icon: Loader2, label: 'Uploading' },
    failed: { variant: 'destructive' as const, icon: AlertCircle, label: 'Failed' }
  };

  const { variant, icon: Icon, label } = config[status] || config.failed;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={cn("h-3 w-3", status === 'processing' && "animate-spin")} />
      {label}
    </Badge>
  );
}

function TierBadge({ tier }: { tier?: Project['performance_level'] }) {
  if (!tier) return null;

  const config = {
    basic: { variant: 'secondary' as const, icon: null, label: 'Basic' },
    pro: { variant: 'pro' as const, icon: Star, label: 'Pro' },
    premium: { variant: 'premium' as const, icon: Crown, label: 'Premium' }
  };

  const { variant, icon: Icon, label } = config[tier] || config.basic;

  return (
    <Badge variant={variant} className="gap-1">
      {Icon && <Icon className="h-3 w-3" />}
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
      className: 'bg-amber-900/20 text-amber-400 border-amber-800/30',
      description: 'Panel discussion with moderator',
    },
    INTERVIEW: {
      icon: Mic,
      label: 'Interview',
      className: 'bg-green-900/20 text-green-400 border-green-800/30',
      description: '1-on-1 Q&A format',
    },
    PODCAST: {
      icon: Radio,
      label: 'Podcast',
      className: 'bg-indigo-900/20 text-indigo-400 border-indigo-800/30',
      description: 'Conversational show',
    },
    MONOLOGUE: {
      icon: User,
      label: 'Solo',
      className: 'bg-slate-800 text-slate-300 border-slate-700',
      description: 'Single speaker',
    },
    OTHER: {
      icon: HelpCircle,
      label: 'Other',
      className: 'bg-slate-800 text-slate-400 border-slate-700',
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
      <div className="rounded-full bg-slate-800 p-4 mb-4">
        <FolderOpen className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-100 mb-1">No projects yet</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-sm">
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
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Project['status']>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'basic' | 'pro' | 'premium'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    // Estimate time saved: 10x multiplier (1 hour audio = 10 hours manual work)
    const timeSavedHours = Math.round(totalAudioMinutes / 60 * 10);

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

    // Tier filter
    if (tierFilter !== 'all') {
      result = result.filter(p => p.performance_level === tierFilter);
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
  }, [projects, searchTerm, statusFilter, tierFilter, sortBy]);

  // Output counts by project
  const outputCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    outputs.forEach(o => {
      counts[o.project_id] = (counts[o.project_id] || 0) + 1;
    });
    return counts;
  }, [outputs]);

  // Delete handler
  const handleDelete = async (projectId: string) => {
    if (!user?.id) return;
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setDeletingId(projectId);

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-800 rounded w-48" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-slate-800 rounded-lg" />
              ))}
            </div>
            <div className="h-96 bg-slate-800 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Project Hub</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your audio projects and generated content
            </p>
          </div>
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="h-4 w-4" />
            New Project
          </Link>
        </div>

        {/* Collapsible Stats Row */}
        <CollapsibleStatsRow title="Key Metrics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              trend={stats.totalContent > 0 ? {
                value: 12,
                direction: 'up',
                label: 'vs last week'
              } : undefined}
            />
            <KPICard
              title="Time Saved"
              value={`${stats.timeSavedHours}h`}
              icon={<Clock className="h-5 w-5" />}
              subtitle="Estimated manual work"
            />
            <KPICard
              title="Processing Time"
              value={formatDuration(stats.totalProcessingTime)}
              icon={<Zap className="h-5 w-5" />}
              subtitle="Total compute time"
            />
          </div>
        </CollapsibleStatsRow>

        {/* Filters & Search Bar */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 shadow-sm">
          <div className="p-4 border-b border-slate-800">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Filter Toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                  showFilters
                    ? "bg-blue-900/20 border-blue-700 text-blue-400"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
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
                className="px-3 py-2 text-sm border border-slate-700 rounded-lg bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recent">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2 py-1 text-sm border border-slate-700 rounded bg-slate-800 text-slate-200"
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Tier:</span>
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value as any)}
                    className="px-2 py-1 text-sm border border-slate-700 rounded bg-slate-800 text-slate-200"
                  >
                    <option value="all">All</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                {(statusFilter !== 'all' || tierFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setTierFilter('all');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-300"
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
              <div className="py-12 text-center text-slate-400">
                No projects match your filters
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/40">
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Project</th>
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Status</th>
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Tier</th>
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Duration</th>
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Content</th>
                    <th className="text-left font-medium text-slate-400 px-4 py-3">Created</th>
                    <th className="text-right font-medium text-slate-400 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredProjects.map((project) => (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/projects?id=${project.id}`}
                          className="block"
                        >
                          <div className="font-medium text-slate-200 group-hover:text-blue-400 transition-colors">
                            {project.title || 'Untitled'}
                          </div>
                          {project.audio_file_name && (
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">
                              {project.audio_file_name}
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <TierBadge tier={project.performance_level} />
                          <ProjectTypeBadge type={project.project_type} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {project.audio_duration
                          ? formatDuration(project.audio_duration)
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <FileText className="h-3.5 w-3.5" />
                          {outputCountByProject[project.id] || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatRelativeDate(project.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/dashboard/projects?id=${project.id}`}
                            className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {project.status === 'completed' && (
                            <Link
                              href={`/dashboard/projects?id=${project.id}&generate=true`}
                              className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors"
                              title="Generate Content"
                            >
                              <Sparkles className="h-4 w-4" />
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(project.id)}
                            disabled={deletingId === project.id}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === project.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer with count */}
          {filteredProjects.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-800 bg-slate-800/30 text-xs text-slate-500">
              Showing {filteredProjects.length} of {projects.length} projects
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
