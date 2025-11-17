"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Download, Share2, RefreshCw, Trash2, Zap, Play, MessageCircle, Crown, Star, Sparkles, BookOpen, Lightbulb, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Filter } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import ContentSelectionModal from '@/components/ContentSelectionModal';
import ConversationView from '@/components/ConversationView';
import type { CostEstimate } from '@/lib/cost-estimation';

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
  selected_content_types?: string[];
  estimated_cost?: number;
  actual_processing_cost?: number;
  audio_duration_seconds?: number;
  cost_breakdown?: {
    transcription: number;
    diarization: number;
    generation: number;
    provider: string;
  };
  transcription_segments?: string;
  speaker_data?: any;
  performance_level?: 'basic' | 'pro' | 'premium';
  ai_summary?: string;
  chapters?: Array<{
    title: string;
    start_time: number;
    end_time: number;
    description?: string;
  }>;
  key_takeaways?: Array<{
    takeaway: string;
    timestamp?: number;
  }>;
  social_quotes?: Array<{
    quote: string;
    speaker?: string;
    timestamp?: number;
    platform?: string;
  }>;
}

interface Output {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [showContentSelection, setShowContentSelection] = useState(false);
  const [selectedProjectForGeneration, setSelectedProjectForGeneration] = useState<Project | null>(null);
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [showConversationFormat, setShowConversationFormat] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'chapters' | 'takeaways' | 'quotes' | 'outputs'>('transcript');
  const [projectsSidebarOpen, setProjectsSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'basic' | 'pro' | 'premium'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name-asc' | 'name-desc'>('recent');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const { user } = useAuth();

  const parseSpeakerData = (data: any) => {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse speaker_data', error);
        return null;
      }
    }
    return data;
  };

  const parsedSpeakerData = useMemo(
    () => parseSpeakerData(selectedProject?.speaker_data),
    [selectedProject?.speaker_data]
  );

  // Filter and sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = [...projects];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(project =>
        project.title.toLowerCase().includes(searchLower) ||
        project.audio_file_name?.toLowerCase().includes(searchLower)
      );
    }

    // Apply tier filter
    if (tierFilter !== 'all') {
      filtered = filtered.filter(project => project.performance_level === tierFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name-asc':
          return a.title.localeCompare(b.title);
        case 'name-desc':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [projects, searchTerm, tierFilter, sortBy]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
    if (selectedProject) {
      await fetchProjectOutputs(selectedProject.id);
    }
    setRefreshing(false);
  };

  const handleGenerateContent = (project: Project) => {
    if (!project.transcription_text) {
      alert('Transcription not available for this project.');
      return;
    }
    setSelectedProjectForGeneration(project);
    setShowContentSelection(true);
  };

  const handleConfirmGeneration = async (
    selectedTypes: string[],
    estimate: CostEstimate,
    selectedModel?: { id: string; displayName?: string } | null,
    keywords?: Record<string, string>
  ) => {
    if (!selectedProjectForGeneration) return;

    try {
      const response = await fetch('/api/generate-selected-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectForGeneration.id,
          selectedContentTypes: selectedTypes,
          estimatedCost: estimate.totalCost,
          selectedModelId: selectedModel?.id,
          contentKeywords: keywords && Object.keys(keywords).length > 0 ? keywords : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start content generation');
      }

      // Refresh projects to show updated status
      await fetchProjects();
      
      // Show success message
      const modelLabel = selectedModel?.displayName || selectedModel?.id || 'selected model';
      const keywordNote = keywords && Object.keys(keywords).length > 0
        ? ` Keyword focus applied to ${Object.keys(keywords).length} selection(s).`
        : '';
      alert(`Content generation started! ${estimate.totalPieces} pieces will be generated for approximately $${estimate.totalCost.toFixed(2)} using ${modelLabel}.${keywordNote}`);
      
    } catch (error) {
      console.error('Error starting content generation:', error);
      throw error;
    }
  };


  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This will also delete all generated content and cannot be undone.')) {
      return;
    }

    setDeletingProject(projectId);

    try {
      // Cleanup cache reference before deleting project
      try {
        await fetch(`/api/projects/${projectId}/cleanup-cache`, {
          method: 'POST'
        });
        console.log('[DELETE] Cache reference cleaned up');
      } catch (cacheError) {
        console.warn('[DELETE] Cache cleanup failed (non-fatal):', cacheError);
        // Continue with deletion even if cache cleanup fails
      }

      // Delete all outputs first (due to foreign key constraints)
      const { error: outputsError } = await supabase
        .from('outputs')
        .delete()
        .eq('project_id', projectId);

      if (outputsError) {
        console.error('Error deleting outputs:', outputsError);
        alert('Failed to delete project outputs. Please try again.');
        return;
      }

      // Delete the project
      const { error: projectError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user?.id); // Ensure user can only delete their own projects

      if (projectError) {
        console.error('Error deleting project:', projectError);
        alert('Failed to delete project. Please try again.');
        return;
      }

      // Delete audio file from storage BEFORE updating state
      // This ensures we have access to project data
      const project = projects.find(p => p.id === projectId);
      if (project?.audio_file_name) {
        const fileName = `${projectId}/${project.audio_file_name}`;
        console.log(`[DELETE] Attempting to delete audio file: ${fileName}`);

        try {
          const { data: removeData, error: storageError } = await supabase.storage
            .from('audio-files')
            .remove([fileName]);

          if (storageError) {
            console.error('[DELETE] Failed to delete audio file:', storageError);
            // Continue anyway - don't block project deletion if storage cleanup fails
          } else {
            console.log('[DELETE] Audio file deleted successfully:', removeData);
          }
        } catch (storageError) {
          console.error('[DELETE] Error deleting audio file:', storageError);
          // Continue anyway - don't block project deletion if storage cleanup fails
        }
      } else {
        console.log('[DELETE] No audio file to delete for project:', projectId);
      }

      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));

      // Clear selected project if it was the deleted one
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setOutputs([]);
      }

    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
      
      // Set up real-time updates for projects
      const projectsSubscription = supabase
        .channel('projects_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'projects',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Project change detected:', payload);
            fetchProjects(); // Refresh projects when changes occur
          }
        )
        .subscribe();

      // Set up real-time updates for outputs if a project is selected
      let outputsSubscription: any = null;
      if (selectedProject) {
        outputsSubscription = supabase
          .channel('outputs_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'outputs',
              filter: `project_id=eq.${selectedProject.id}`,
            },
            (payload) => {
              console.log('Output change detected:', payload);
              fetchProjectOutputs(selectedProject.id);
            }
          )
          .subscribe();
      }

      return () => {
        projectsSubscription.unsubscribe();
        if (outputsSubscription) {
          outputsSubscription.unsubscribe();
        }
      };
    }
  }, [user, selectedProject?.id]);

  const fetchProjects = async () => {
    try {
      console.log('Fetching projects for user:', user?.id);

      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*, transcription_segments, speaker_data, performance_level, ai_summary, chapters, key_takeaways, social_quotes')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        return;
      }

      console.log('Fetched projects:', projectsData);
      const updatedProjects = projectsData || [];
      setProjects(updatedProjects);

      if (selectedProject) {
        const refreshedSelection = updatedProjects.find(
          (project) => project.id === selectedProject.id
        );
        if (refreshedSelection) {
          setSelectedProject(refreshedSelection);
        } else {
          setSelectedProject(null);
          setOutputs([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectOutputs = async (projectId: string) => {
    try {
      console.log('Fetching outputs for project:', projectId);
      
      const { data: outputsData, error } = await supabase
        .from('outputs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching outputs:', error);
        return;
      }

      console.log('Fetched outputs:', outputsData);
      setOutputs(outputsData || []);
    } catch (error) {
      console.error('Failed to fetch outputs:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const toggleOutputExpansion = (outputId: string) => {
    setExpandedOutputs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(outputId)) {
        newSet.delete(outputId);
      } else {
        newSet.add(outputId);
      }
      return newSet;
    });
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'twitter':
        return 'bg-blue-100 text-blue-800';
      case 'linkedin':
        return 'bg-blue-100 text-blue-700';
      case 'instagram':
        return 'bg-pink-100 text-pink-800';
      case 'general':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTierBadge = (tier: 'basic' | 'pro' | 'premium' | undefined) => {
    const tierConfig: Record<'basic' | 'pro' | 'premium', {
      icon: any;
      label: string;
      color: string;
      iconColor: string;
    }> = {
      basic: {
        icon: FileText,
        label: 'Basic',
        color: 'bg-gray-100 text-gray-700',
        iconColor: 'text-gray-500'
      },
      pro: {
        icon: Star,
        label: 'Pro',
        color: 'bg-blue-100 text-blue-700',
        iconColor: 'text-blue-600'
      },
      premium: {
        icon: Crown,
        label: 'Premium',
        color: 'bg-purple-100 text-purple-700',
        iconColor: 'text-purple-600'
      }
    };

    // Ensure we have a valid tier, fallback to basic
    const normalizedTier = (tier || 'basic') as 'basic' | 'pro' | 'premium';
    const validTier: 'basic' | 'pro' | 'premium' = ['basic', 'pro', 'premium'].includes(normalizedTier)
      ? normalizedTier
      : 'basic';

    const config = tierConfig[validTier];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className={`w-3 h-3 mr-1 ${config.iconColor}`} />
        {config.label}
      </span>
    );
  };

  const getContentAvailability = (project: Project) => {
    const tier = project.performance_level || 'basic';
    const features = [];

    // Basic tier - always available
    features.push({
      name: 'Transcription',
      available: !!project.transcription_text,
      icon: FileText,
      color: 'text-green-600'
    });

    features.push({
      name: 'Speakers',
      available: !!project.speaker_data,
      icon: MessageCircle,
      color: 'text-green-600',
      label: tier === 'basic' ? 'Generic' : 'Named'
    });

    // Pro tier and above
    if (tier === 'pro' || tier === 'premium') {
      features.push({
        name: 'AI Summary',
        available: !!project.ai_summary,
        icon: Sparkles,
        color: 'text-blue-600'
      });
    }

    // Premium tier only
    if (tier === 'premium') {
      features.push({
        name: 'Chapters',
        available: !!project.chapters && project.chapters.length > 0,
        icon: BookOpen,
        color: 'text-purple-600',
        count: project.chapters?.length
      });

      features.push({
        name: 'Key Takeaways',
        available: !!project.key_takeaways && project.key_takeaways.length > 0,
        icon: Lightbulb,
        color: 'text-purple-600',
        count: project.key_takeaways?.length
      });

      features.push({
        name: 'Social Quotes',
        available: !!project.social_quotes && project.social_quotes.length > 0,
        icon: MessageSquare,
        color: 'text-purple-600',
        count: project.social_quotes?.length
      });
    }

    return features;
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                Content Library
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your podcast transcriptions and AI-generated content
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          // Empty state
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Your library is empty</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by uploading your first podcast episode.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Upload Podcast
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* LEFT: Projects List (33% on desktop) - Collapsible */}
            <div
              className={`transition-all duration-300 ease-in-out border-r border-gray-200 pr-6 flex flex-col ${
                projectsSidebarOpen
                  ? 'w-full lg:w-1/3 opacity-100'
                  : 'w-0 opacity-0 overflow-hidden lg:pr-0'
              }`}
            >
              <div className="flex-shrink-0 space-y-4 mb-4">
                <h2 className="text-lg font-medium text-gray-900">Projects</h2>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                  {/* Tier Filter */}
                  <div className="flex-1 min-w-[140px]">
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value as 'all' | 'basic' | 'pro' | 'premium')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Tiers</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>

                  {/* Sort By */}
                  <div className="flex-1 min-w-[140px]">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'recent' | 'oldest' | 'name-asc' | 'name-desc')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="recent">Recently Uploaded</option>
                      <option value="oldest">Oldest First</option>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                    </select>
                  </div>
                </div>

                {/* Results count */}
                <div className="text-xs text-gray-500">
                  {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'project' : 'projects'}
                  {(searchTerm || tierFilter !== 'all') && ` (filtered from ${projects.length})`}
                </div>
              </div>

              {/* Scrollable Projects List */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
                {filteredAndSortedProjects.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm">No projects found</p>
                    {(searchTerm || tierFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setTierFilter('all');
                        }}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  filteredAndSortedProjects.map((project) => (
                <div
                  key={project.id}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    selectedProject?.id === project.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedProject(project);
                    setShowFullTranscription(false);
                    setShowConversationFormat(false);
                    setActiveTab('transcript'); // Reset to transcript tab
                    fetchProjectOutputs(project.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* LEFT SIDE: Title, Tier, Features */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-sm font-medium text-gray-900 truncate flex-1">
                          {project.title}
                        </h3>
                        {getStatusIcon(project.status)}
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        {getTierBadge(project.performance_level)}
                      </div>

                      {/* Content Availability Indicators */}
                      {project.status === 'completed' && (() => {
                        const features = getContentAvailability(project);
                        const isExpanded = expandedFeatures.has(project.id);
                        const displayFeatures = isExpanded ? features : features.slice(0, 1);
                        const hasMore = features.length > 1;

                        return (
                          <div className="flex flex-wrap gap-1.5 relative">
                            {displayFeatures.map((feature, idx) => {
                              const Icon = feature.icon;
                              return (
                                <div
                                  key={idx}
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                                    feature.available
                                      ? 'bg-green-50 text-green-700'
                                      : 'bg-gray-50 text-gray-400'
                                  }`}
                                  title={feature.available ? `${feature.name} available` : `${feature.name} not available`}
                                >
                                  <Icon className={`w-3 h-3 mr-1 ${feature.available ? feature.color : 'text-gray-400'}`} />
                                  <span className="font-medium">
                                    {feature.label || feature.name}
                                  </span>
                                  {feature.available && feature.count !== undefined && (
                                    <span className="ml-1 text-xs">({feature.count})</span>
                                  )}
                                  {feature.available && <CheckCircle className="w-3 h-3 ml-1" />}
                                </div>
                              );
                            })}
                            {hasMore && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFeatures(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(project.id)) {
                                      newSet.delete(project.id);
                                    } else {
                                      newSet.add(project.id);
                                    }
                                    return newSet;
                                  });
                                }}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium"
                                title={isExpanded ? 'Show less' : `Show ${features.length - 1} more features`}
                              >
                                {isExpanded ? 'Less' : `+${features.length - 1}`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* RIGHT SIDE: Metadata & Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                        {project.status === 'completed' && project.transcription_text && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateContent(project);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Generate content"
                          >
                            <Zap className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                          disabled={deletingProject === project.id}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete project"
                        >
                          {deletingProject === project.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* Metadata */}
                      <div className="text-xs text-gray-500 text-right space-y-1">
                        <div>{new Date(project.created_at).toLocaleDateString()}</div>
                        {project.audio_duration && (
                          <div>{formatDuration(project.audio_duration)}</div>
                        )}
                        {project.audio_file_size && (
                          <div>{formatFileSize(project.audio_file_size)}</div>
                        )}
                        {project.actual_processing_cost !== undefined && project.actual_processing_cost > 0 && (
                          <div className="text-blue-600 font-medium" title={`Provider: ${project.cost_breakdown?.provider || 'Unknown'}`}>
                            ${project.actual_processing_cost.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT: Tabbed Content (67% on desktop, or full width when sidebar closed) */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                projectsSidebarOpen ? 'w-full lg:w-2/3' : 'w-full'
              }`}
            >
              {selectedProject ? (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm h-[calc(100vh-12rem)] flex flex-col">
                  {/* Header with Tier Badge and Actions */}
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        {/* Toggle Projects Sidebar Button */}
                        <button
                          onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
                          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
                          title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
                        >
                          {projectsSidebarOpen ? (
                            <PanelLeftClose className="w-5 h-5" />
                          ) : (
                            <PanelLeftOpen className="w-5 h-5" />
                          )}
                        </button>
                        <div className="h-6 w-px bg-gray-300 flex-shrink-0" />
                        <h2 className="text-lg font-medium text-gray-900 truncate">{selectedProject.title}</h2>
                        <div className="flex-shrink-0">
                          {getTierBadge(selectedProject.performance_level)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleGenerateContent(selectedProject)}
                        className="inline-flex items-center px-3 py-1.5 border border-blue-600 text-sm font-medium rounded-md text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex-shrink-0 whitespace-nowrap"
                      >
                        <Zap className="w-4 h-4 mr-1.5" />
                        Generate Content
                      </button>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <div className="border-b border-gray-200 px-6">
                    <nav className="flex space-x-6" aria-label="Tabs">
                      <button
                        onClick={() => setActiveTab('transcript')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === 'transcript'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>Transcript</span>
                        </div>
                      </button>

                      {(selectedProject.performance_level === 'pro' || selectedProject.performance_level === 'premium') && selectedProject.ai_summary && (
                        <button
                          onClick={() => setActiveTab('summary')}
                          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'summary'
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Sparkles className="w-4 h-4" />
                            <span>Summary</span>
                          </div>
                        </button>
                      )}

                      {selectedProject.performance_level === 'premium' && selectedProject.chapters && selectedProject.chapters.length > 0 && (
                        <button
                          onClick={() => setActiveTab('chapters')}
                          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'chapters'
                              ? 'border-purple-500 text-purple-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <BookOpen className="w-4 h-4" />
                            <span>Chapters</span>
                          </div>
                        </button>
                      )}

                      {selectedProject.performance_level === 'premium' && selectedProject.key_takeaways && selectedProject.key_takeaways.length > 0 && (
                        <button
                          onClick={() => setActiveTab('takeaways')}
                          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'takeaways'
                              ? 'border-purple-500 text-purple-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Lightbulb className="w-4 h-4" />
                            <span>Takeaways</span>
                          </div>
                        </button>
                      )}

                      {selectedProject.performance_level === 'premium' && selectedProject.social_quotes && selectedProject.social_quotes.length > 0 && (
                        <button
                          onClick={() => setActiveTab('quotes')}
                          className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'quotes'
                              ? 'border-purple-500 text-purple-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <MessageSquare className="w-4 h-4" />
                            <span>Quotes</span>
                          </div>
                        </button>
                      )}

                      <button
                        onClick={() => setActiveTab('outputs')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === 'outputs'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Zap className="w-4 h-4" />
                          <span>Generated ({outputs.length})</span>
                        </div>
                      </button>
                    </nav>
                  </div>

                  {/* Tab Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {/* TRANSCRIPT TAB */}
                    {activeTab === 'transcript' && (
                      <div>
                        {selectedProject.transcription_text ? (
                          <div>
                            {/* Format Toggle */}
                            <div className="flex items-center space-x-2 mb-4">
                              <button
                                onClick={() => setShowConversationFormat(false)}
                                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                  !showConversationFormat
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                                }`}
                              >
                                <FileText className="w-4 h-4 mr-1.5" />
                                Text
                              </button>
                              <button
                                onClick={() => setShowConversationFormat(true)}
                                disabled={!parsedSpeakerData}
                                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                  showConversationFormat && parsedSpeakerData
                                    ? 'bg-blue-100 text-blue-700'
                                    : parsedSpeakerData
                                    ? 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    : 'text-gray-400 cursor-not-allowed border border-gray-200'
                                }`}
                                title={!parsedSpeakerData ? 'Speaker analysis in progress...' : 'Switch to conversation format'}
                              >
                                <MessageCircle className="w-4 h-4 mr-1.5" />
                                Conversation
                                {!parsedSpeakerData && <span className="ml-1">⏳</span>}
                              </button>
                            </div>

                            {/* Transcription Content */}
                            {showConversationFormat && parsedSpeakerData ? (
                              <ConversationView
                                speakerData={parsedSpeakerData}
                                transcriptionText={selectedProject.transcription_text}
                                className="bg-gray-50 rounded-md"
                                projectId={selectedProject.id}
                                userTier={selectedProject.performance_level || 'basic'}
                                onSpeakerUpdate={(updatedSpeakerData) => {
                                  setSelectedProject(prev => prev ? {
                                    ...prev,
                                    speaker_data: updatedSpeakerData
                                  } : null);
                                }}
                              />
                            ) : (
                              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-md">
                                {selectedProject.transcription_text}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            Processing transcription...
                          </div>
                        )}
                      </div>
                    )}

                    {/* SUMMARY TAB */}
                    {activeTab === 'summary' && selectedProject.ai_summary && (
                      <div>
                        <div className="flex items-center mb-4">
                          <Sparkles className="w-5 h-5 text-blue-600 mr-2" />
                          <h3 className="text-lg font-medium text-gray-900">AI Summary</h3>
                          <span className="ml-2 text-xs text-blue-600 font-medium">Pro Feature</span>
                        </div>
                        <div className="text-sm text-gray-700 leading-relaxed">
                          {selectedProject.ai_summary}
                        </div>
                      </div>
                    )}

                    {/* CHAPTERS TAB */}
                    {activeTab === 'chapters' && selectedProject.chapters && selectedProject.chapters.length > 0 && (
                      <div>
                        <div className="flex items-center mb-4">
                          <BookOpen className="w-5 h-5 text-purple-600 mr-2" />
                          <h3 className="text-lg font-medium text-gray-900">Chapters</h3>
                          <span className="ml-2 text-xs text-purple-600 font-medium">Premium Feature</span>
                        </div>
                        <div className="space-y-4">
                          {selectedProject.chapters.map((chapter, idx) => (
                            <div key={idx} className="border-l-4 border-purple-300 pl-4 py-2 bg-purple-50 rounded-r-md">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-base font-medium text-gray-900">{chapter.title}</span>
                                <span className="text-sm text-gray-600">
                                  {formatDuration(chapter.start_time)} - {formatDuration(chapter.end_time)}
                                </span>
                              </div>
                              {chapter.description && (
                                <p className="text-sm text-gray-700">{chapter.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* TAKEAWAYS TAB */}
                    {activeTab === 'takeaways' && selectedProject.key_takeaways && selectedProject.key_takeaways.length > 0 && (
                      <div>
                        <div className="flex items-center mb-4">
                          <Lightbulb className="w-5 h-5 text-purple-600 mr-2" />
                          <h3 className="text-lg font-medium text-gray-900">Key Takeaways</h3>
                          <span className="ml-2 text-xs text-purple-600 font-medium">Premium Feature</span>
                        </div>
                        <div className="space-y-3">
                          {selectedProject.key_takeaways.map((takeaway, idx) => (
                            <div key={idx} className="flex items-start space-x-3 p-3 bg-purple-50 rounded-md">
                              <CheckCircle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm text-gray-900">{takeaway.takeaway}</p>
                                {takeaway.timestamp !== undefined && (
                                  <span className="text-xs text-gray-500 mt-1">@ {formatDuration(takeaway.timestamp)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* QUOTES TAB */}
                    {activeTab === 'quotes' && selectedProject.social_quotes && selectedProject.social_quotes.length > 0 && (
                      <div>
                        <div className="flex items-center mb-4">
                          <MessageSquare className="w-5 h-5 text-purple-600 mr-2" />
                          <h3 className="text-lg font-medium text-gray-900">Social Quotes</h3>
                          <span className="ml-2 text-xs text-purple-600 font-medium">Premium Feature</span>
                        </div>
                        <div className="space-y-4">
                          {selectedProject.social_quotes.map((quote, idx) => (
                            <div key={idx} className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                              <p className="text-base text-gray-900 italic mb-3">"{quote.quote}"</p>
                              <div className="flex items-center justify-between text-sm text-gray-600">
                                <span>{quote.speaker && `- ${quote.speaker}`}</span>
                                <div className="flex items-center space-x-2">
                                  {quote.platform && (
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPlatformColor(quote.platform)}`}>
                                      {quote.platform}
                                    </span>
                                  )}
                                  {quote.timestamp !== undefined && (
                                    <span className="text-xs">@ {formatDuration(quote.timestamp)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* OUTPUTS TAB */}
                    {activeTab === 'outputs' && (
                      <div>
                        {outputs.length === 0 ? (
                          <div className="text-center py-12 bg-gray-50 rounded-lg">
                            <Clock className="mx-auto h-8 w-8 text-gray-400" />
                            <p className="mt-2 text-sm text-gray-500">
                              {selectedProject.status === 'processing'
                                ? 'Content is being generated...'
                                : selectedProject.transcription_text
                                ? 'Ready to generate content - click the button above!'
                                : 'No content generated yet'
                              }
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {outputs.map((output) => (
                              <div
                                key={output.id}
                                className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center space-x-3">
                                    <h3 className="text-sm font-medium text-gray-900">
                                      {output.title}
                                    </h3>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPlatformColor(output.platform)}`}>
                                      {output.platform}
                                    </span>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <button className="p-1 text-gray-400 hover:text-gray-600">
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    <button className="p-1 text-gray-400 hover:text-gray-600">
                                      <Download className="h-4 w-4" />
                                    </button>
                                    <button className="p-1 text-gray-400 hover:text-gray-600">
                                      <Share2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                                  <div className={expandedOutputs.has(output.id) ? '' : 'line-clamp-4'}>
                                    {output.content}
                                  </div>
                                  {output.content.length > 200 && (
                                    <button
                                      onClick={() => toggleOutputExpansion(output.id)}
                                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      {expandedOutputs.has(output.id) ? 'Show Less' : 'Show More'}
                                    </button>
                                  )}
                                </div>

                                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                                  <span>Type: {output.type.replace('_', ' ')}</span>
                                  <span>
                                    Generated: {new Date(output.created_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm h-[calc(100vh-12rem)] flex flex-col">
                  {/* Header with toggle button even when no project selected */}
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center space-x-3 min-w-0">
                      <button
                        onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
                        title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
                      >
                        {projectsSidebarOpen ? (
                          <PanelLeftClose className="w-5 h-5" />
                        ) : (
                          <PanelLeftOpen className="w-5 h-5" />
                        )}
                      </button>
                      <div className="h-6 w-px bg-gray-300 flex-shrink-0" />
                      <h2 className="text-lg font-medium text-gray-900 truncate">Project Details</h2>
                    </div>
                  </div>

                  {/* Empty state */}
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center py-12">
                      <FileText className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        Select a project
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Choose a project from the list to view details
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Selection Modal */}
        <ContentSelectionModal
          isOpen={showContentSelection && selectedProjectForGeneration !== null}
          onClose={() => {
            setShowContentSelection(false);
            setSelectedProjectForGeneration(null);
          }}
          onConfirm={handleConfirmGeneration}
          projectId={selectedProjectForGeneration?.id || ''}
          transcriptionText={selectedProjectForGeneration?.transcription_text || ''}
          projectTitle={selectedProjectForGeneration?.title || selectedProjectForGeneration?.audio_file_name || ''}
        />
      </div>
    </div>
  );
}
