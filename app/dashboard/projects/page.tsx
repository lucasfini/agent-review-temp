"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Download, Share2, RefreshCw, Trash2, Zap, Play, MessageCircle, Crown, Star, Sparkles, BookOpen, Lightbulb, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Filter, Loader2, CheckSquare, Square, ListChecks, X, PanelRightOpen, PanelRightClose, ScanSearch, MoreHorizontal, Users, Mic, Radio, User, HelpCircle, Copy, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import { useCoverageProgress } from '@/lib/context/coverage-progress';
import ContentSelectionModal from '@/components/ContentSelectionModal';
import ExportModal, { type ExportPayload } from '@/components/ExportModal';
import { exportContent } from '@/lib/export-utils';
import ConversationView from '@/components/ConversationView';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import TeamsStyleTranscript from '@/components/TeamsStyleTranscript';
import ContextSidebar from '@/components/ContextSidebar';
import type { CostEstimate } from '@/lib/cost-estimation';
import type { ContentBlock } from '@/lib/content-types';
import type { AudioPlayerRef } from '@/lib/hooks/useSpeakerSample';
import { useProjectRefresh, useSpeakerDataRefresh } from '@/lib/hooks/useProjectRefresh';

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
  selected_content_types?: string[];
  estimated_cost?: number;
  audio_duration_seconds?: number;
  transcription_segments?: string;
  speaker_data?: any;
  performance_level?: 'basic' | 'pro' | 'premium';
  project_type?: ProjectType;
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
  metadata?: any;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const selectedProjectRef = useRef<string | null>(null);

  // Audio player refs for speaker sample playback
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const audioPlayerRef = useRef<AudioPlayerRef | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [showContentSelection, setShowContentSelection] = useState(false);
  const [selectedProjectForGeneration, setSelectedProjectForGeneration] = useState<Project | null>(null);
  const [generatingProjects, setGeneratingProjects] = useState<Set<string>>(new Set());
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'transcript' | 'outputs'>('transcript');
  const [readerView, setReaderView] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [projectsSidebarOpen, setProjectsSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'basic' | 'pro' | 'premium'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name-asc' | 'name-desc'>('recent');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  // Insights control state
  const [insightsSidebarOpen, setInsightsSidebarOpen] = useState(false);
  const [insightsStatus, setInsightsStatus] = useState<{ count: number; loading: boolean; generating: boolean }>({ count: 0, loading: true, generating: false });
  const [triggerInsightGeneration, setTriggerInsightGeneration] = useState(0);
  const [insightsRefreshToken, setInsightsRefreshToken] = useState(0);
  const [insightsData, setInsightsData] = useState<Array<{
    id: string;
    title: string;
    category: 'concept' | 'person' | 'tool';
    definition: string;
    significance: string;
    sources: Array<{ title: string; url: string }>;
    matchText?: string;
    matchVariants?: string[];
  }>>([]);

  // Right sidebar (Context) state
  const [contextSidebarOpen, setContextSidebarOpen] = useState(true);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);

  // Export selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProjects, setExportProjects] = useState<Array<Project & { outputs: Output[] }>>([]);

  // Coverage analysis state
  const { runningCoverageIds, startCoverage, stopCoverage } = useCoverageProgress();

  // Audio URL state for speaker sample playback
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Project type filter
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectType>('all');

  // Project title inline rename
  const [editingProjectTitle, setEditingProjectTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Per-output delete tracking
  const [deletingOutput, setDeletingOutput] = useState<string | null>(null);

  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Keep ref in sync with selectedProject for use in realtime callbacks
  useEffect(() => {
    selectedProjectRef.current = selectedProject?.id || null;
  }, [selectedProject?.id]);

  // ============================================================
  // STALE DATA FIX: Watch for status completion and refresh
  // When a project transitions to 'completed', the speaker data
  // may be updated by the debate correction algorithm. This hook
  // ensures we fetch the FRESH data after processing completes.
  // ============================================================
  const {
    project: refreshedProject,
    isRefreshing: isProjectRefreshing,
    previousStatus: projectPreviousStatus,
  } = useProjectRefresh(selectedProject?.id, {
    completionDelay: 2000, // Wait 2s after completion before final refresh
    pollingInterval: 3000,
    debug: true, // Enable logging to track refresh cycles
    onRefresh: (freshProject) => {
      console.log('[REFRESH] Got fresh project data:', {
        id: freshProject.id,
        status: freshProject.status,
        hasSpeakerData: !!freshProject.speaker_data,
        speakerNames: freshProject.speaker_data?.speakers
          ? Object.values(freshProject.speaker_data.speakers)
              .map((s: any) => s.finalName || s.fallbackName)
              .filter(Boolean)
          : [],
      });

      // Update the selected project with fresh data
      // IMPORTANT: Use ref instead of selectedProject to avoid stale closure issues
      // when user switches projects while refresh is pending
      if (freshProject && selectedProjectRef.current === freshProject.id) {
        setSelectedProject(freshProject);

        // Also update in the projects list
        setProjects((prev) =>
          prev.map((p) => (p.id === freshProject.id ? freshProject : p))
        );
      }
    },
  });

  // Secondary hook: specifically watch for speaker data updates
  // This handles the case where speaker_data is written AFTER status completion
  useSpeakerDataRefresh(
    selectedProject?.id,
    selectedProject?.speaker_data,
    (newSpeakerData) => {
      console.log('[SPEAKER_REFRESH] Got updated speaker data');
      // Use ref to get current project ID to avoid stale closure issues
      const currentProjectId = selectedProjectRef.current;
      if (currentProjectId && selectedProject && currentProjectId === selectedProject.id) {
        const updatedProject = {
          ...selectedProject,
          speaker_data: newSpeakerData,
        };
        setSelectedProject(updatedProject);
        setProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? updatedProject : p))
        );
      }
    }
  );

  // Wire up audio player methods for speaker sample playback
  useEffect(() => {
    if (audioElementRef.current) {
      audioPlayerRef.current = {
        seekTo: (time: number) => {
          if (audioElementRef.current) {
            audioElementRef.current.currentTime = time;
          }
        },
        play: () => {
          audioElementRef.current?.play();
        },
        pause: () => {
          audioElementRef.current?.pause();
        },
      };
    }
  }, [selectedProject?.id, audioUrl]);

  // Fetch signed URL for audio playback when project changes
  useEffect(() => {
    async function fetchAudioUrl() {
      if (!selectedProject?.id || !selectedProject?.audio_file_name) {
        setAudioUrl(null);
        return;
      }

      try {
        const filePath = `${selectedProject.id}/${selectedProject.audio_file_name}`;
        const { data, error } = await supabase.storage
          .from('audio-files')
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (error) {
          console.error('Failed to get signed URL:', error);
          setAudioUrl(null);
          return;
        }

        setAudioUrl(data.signedUrl);
      } catch (err) {
        console.error('Error fetching audio URL:', err);
        setAudioUrl(null);
      }
    }

    fetchAudioUrl();
  }, [selectedProject?.id, selectedProject?.audio_file_name]);

  // Insights are fetched by ConversationView and reported back via onInsightsDataChange / onInsightsStatusChange callbacks.
  // No independent fetch needed here — single source of truth avoids race conditions.

  // Auto-select project from URL query parameter
  useEffect(() => {
    const projectId = searchParams.get('id');
    const shouldGenerate = searchParams.get('generate') === 'true';

    if (projectId && projects.length > 0 && !loading) {
      const projectToSelect = projects.find(p => p.id === projectId);
      if (projectToSelect && selectedProject?.id !== projectId) {
        setSelectedProject(projectToSelect);
        setShowFullTranscription(false);
        setActiveTab('transcript');
        fetchProjectOutputs(projectId);
        // Reset insights state — ConversationView will fetch and report back
        setInsightsData([]);
        setInsightsStatus({ count: 0, loading: true, generating: false });

        // If generate=true is in URL, open the content generation modal
        if (shouldGenerate && projectToSelect.transcription_text) {
          setSelectedProjectForGeneration(projectToSelect);
          setShowContentSelection(true);
        }
      }
    }
  }, [searchParams, projects, loading]);

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

  useEffect(() => {
    setSelectedSpeaker(null);
  }, [selectedProject?.id]);

  // Auto-refresh insights shortly after completion so they appear without page reload.
  useEffect(() => {
    if (!selectedProject?.id) return;
    if (selectedProject.status !== 'completed') return;
    if (insightsStatus.generating) return;
    if (insightsStatus.count > 0) return;

    let attempts = 0;
    const maxAttempts = 15;
    const intervalMs = 6000;
    const interval = setInterval(() => {
      attempts += 1;
      setInsightsRefreshToken(prev => prev + 1);
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [selectedProject?.id, selectedProject?.status, insightsStatus.count, insightsStatus.generating]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(project => project.project_type === typeFilter);
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
  }, [projects, searchTerm, tierFilter, typeFilter, sortBy]);

  const handleRefresh = async () => {
    setRefreshing(true);

    // Fetch fresh generation progress state
    await fetchGenerationProgress();

    // Fetch projects and outputs
    await fetchProjects();
    // Use ref to get current selection to avoid stale closure
    const currentSelectedId = selectedProjectRef.current;
    if (currentSelectedId) {
      await fetchProjectOutputs(currentSelectedId);
    }

    setRefreshing(false);
  };

  const handleGenerateContent = (project: Project) => {
    if (!project.transcription_text) {
      showToast('Transcription not available for this project.');
      return;
    }
    setSelectedProjectForGeneration(project);
    setShowContentSelection(true);
  };

  const handleConfirmGeneration = async (
    blocks: any[],
    estimate: CostEstimate,
    selectedModel?: { id: string; displayName?: string } | null
  ) => {
    if (!selectedProjectForGeneration) return;

    try {
      const response = await fetch('/api/generate-selected-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectForGeneration.id,
          blocks,
          estimatedCost: estimate.totalCost,
          selectedModelId: selectedModel?.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start content generation');
      }

      // Add project to generating set immediately
      setGeneratingProjects((prev) => new Set(prev).add(selectedProjectForGeneration.id));

      // Close content selection modal
      setShowContentSelection(false);
      setSelectedProjectForGeneration(null);

    } catch (error) {
      console.error('Error starting content generation:', error);
      throw error;
    }
  };

  // Output action handlers
  const handleDownloadOutput = (output: Output) => {
    const blob = new Blob([`${output.title}\n\n${output.content}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${output.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded', 'success');
  };

  const handleCopyOutput = async (output: Output) => {
    try {
      await navigator.clipboard.writeText(output.content);
      showToast('Copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy — try selecting the text manually');
    }
  };

  const handleDeleteOutput = async (outputId: string) => {
    setDeletingOutput(outputId);
    try {
      const { error } = await supabase.from('outputs').delete().eq('id', outputId);
      if (error) throw error;
      setOutputs(prev => prev.filter(o => o.id !== outputId));
      showToast('Output deleted', 'success');
    } catch {
      showToast('Failed to delete output');
    } finally {
      setDeletingOutput(null);
    }
  };

  // Project title inline rename
  const handleSaveProjectTitle = async () => {
    if (!selectedProject || !editingTitleValue.trim()) {
      setEditingProjectTitle(false);
      return;
    }
    if (editingTitleValue.trim() === selectedProject.title) {
      setEditingProjectTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitleValue.trim() })
      });
      if (!response.ok) throw new Error('Failed to rename');
      const newTitle = editingTitleValue.trim();
      setSelectedProject(prev => prev ? { ...prev, title: newTitle } : null);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, title: newTitle } : p));
      showToast('Project renamed', 'success');
    } catch {
      showToast('Failed to rename project');
    } finally {
      setSavingTitle(false);
      setEditingProjectTitle(false);
    }
  };

  // Export functionality helpers
  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const toggleAllProjectSelection = () => {
    if (selectedProjectIds.size === filteredAndSortedProjects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(filteredAndSortedProjects.map(p => p.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedProjectIds(new Set());
  };

  const prepareExportForProjects = async (projectIds: string[]) => {
    // Fetch fresh project data + outputs for each selected project
    const projectsWithOutputs = await Promise.all(
      projectIds.map(async (projectId) => {
        const fallbackProject = projects.find(p => p.id === projectId);
        if (!fallbackProject) return null;

        const { data: projectData } = await supabase
          .from('projects')
          .select('id, title, transcription_text, ai_summary, chapters, key_takeaways, social_quotes, speaker_data')
          .eq('id', projectId)
          .single();

        const { data: outputsData } = await supabase
          .from('outputs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        const project = projectData || fallbackProject;

        return {
          ...project,
          outputs: outputsData || [],
          // Include core content fields for export
          transcription_text: (project as any).transcription_text,
          ai_summary: (project as any).ai_summary,
          chapters: (project as any).chapters,
          key_takeaways: (project as any).key_takeaways,
          social_quotes: (project as any).social_quotes,
          speaker_data: (project as any).speaker_data,
        };
      })
    );

    const validProjects = projectsWithOutputs.filter(p => p !== null) as Array<Project & { outputs: Output[] }>;
    setExportProjects(validProjects);
    setShowExportModal(true);
  };

  const handleBulkExport = async () => {
    if (selectedProjectIds.size === 0) return;
    await prepareExportForProjects(Array.from(selectedProjectIds));
  };

  const handleSingleExport = async (project: Project) => {
    await prepareExportForProjects([project.id]);
  };

  const handleExport = async (payload: ExportPayload) => {
    console.log('[EXPORT] Handling export with payload:', JSON.stringify(payload, null, 2));

    // Prepare projects data for export (including core content)
    const projectsForExport = exportProjects.map(p => ({
      id: p.id,
      title: p.title,
      outputs: p.outputs.map(o => ({
        id: o.id,
        title: o.title,
        content: o.content,
        platform: o.platform,
        type: o.type,
        created_at: o.created_at,
        metadata: o.metadata,
      })),
      // Include core content fields
      transcription_text: (p as any).transcription_text,
      ai_summary: (p as any).ai_summary,
      chapters: (p as any).chapters,
      key_takeaways: (p as any).key_takeaways,
      social_quotes: (p as any).social_quotes,
      speaker_data: (p as any).speaker_data,
    }));

    // Call the export utility
    const result = await exportContent(
      projectsForExport,
      payload.export_manifest,
      payload.format
    );

    if (result.success) {
      console.log('[EXPORT] Success:', result.message);
    } else {
      console.error('[EXPORT] Failed:', result.message);
      alert(`Export failed: ${result.message}`);
    }

    // Exit selection mode after export
    exitSelectionMode();
  };

  // Run Coverage Analysis for a project
  const handleRunCoverage = async (project: Project) => {
    if (!user?.id || !project.id || !project.transcription_text) return;

    startCoverage(project.id, project.title);

    try {
      const response = await fetch(`/api/projects/${project.id}/run-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          force: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Coverage analysis failed');
      }

      console.log('[Coverage] Analysis complete:', result);
    } catch (error: any) {
      console.error('[Coverage] Analysis failed:', error);
    } finally {
      stopCoverage(project.id);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user?.id) return;
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
        showToast('Failed to delete project outputs. Please try again.');
        return;
      }

      // Delete the project
      const { error: projectError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user.id); // Ensure user can only delete their own projects

      if (projectError) {
        console.error('Error deleting project:', projectError);
        showToast('Failed to delete project. Please try again.');
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
      showToast('An unexpected error occurred. Please try again.');
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
      fetchGenerationProgress(); // Restore loading state on page load

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
        const subscribedProjectId = selectedProject.id;
        outputsSubscription = supabase
          .channel('outputs_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'outputs',
              filter: `project_id=eq.${subscribedProjectId}`,
            },
            (payload) => {
              console.log('Output change detected:', payload);
              // Only fetch if this project is still selected (use ref for current value)
              if (selectedProjectRef.current === subscribedProjectId) {
                fetchProjectOutputs(subscribedProjectId);
              }
            }
          )
          .subscribe();
      }

      // Set up real-time updates for generation progress
      const generationProgressSubscription = supabase
        .channel('generation_progress_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'generation_progress',
          },
          (payload) => {
            console.log('[REALTIME] Generation progress event:', payload.eventType, payload);

            // Handle INSERT and UPDATE events
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const data = payload.new as any;

              if (data && data.project_id) {
                console.log('[REALTIME] Project:', data.project_id, 'Status:', data.status);

                // Add to generating set if status is preparing or generating
                if (data.status === 'preparing' || data.status === 'generating') {
                  console.log('[REALTIME] Adding to generating set:', data.project_id);
                  setGeneratingProjects((prev) => new Set(prev).add(data.project_id));
                }

                // Remove from generating set if completed or failed
                if (data.status === 'completed' || data.status === 'failed') {
                  console.log('[REALTIME] Removing from generating set:', data.project_id);
                  setGeneratingProjects((prev) => {
                    const next = new Set(prev);
                    next.delete(data.project_id);
                    return next;
                  });

                  // Refresh data AFTER updating state (not inside setState)
                  console.log('[REALTIME] Refreshing projects...');
                  fetchProjects();

                  // Use ref to check selected project (avoids stale closure)
                  if (selectedProjectRef.current === data.project_id) {
                    console.log('[REALTIME] Refreshing outputs for selected project...');
                    fetchProjectOutputs(data.project_id);

                    // Switch to outputs tab on successful completion
                    if (data.status === 'completed') {
                      setActiveTab('outputs');
                    }
                  }
                }
              }
            }

            // Handle DELETE events (cleanup after status update)
            if (payload.eventType === 'DELETE') {
              const data = payload.old as any;

              if (data && data.project_id) {
                console.log('[REALTIME] Progress entry deleted for project:', data.project_id);

                // Remove from generating set (in case it wasn't already removed)
                setGeneratingProjects((prev) => {
                  const next = new Set(prev);
                  next.delete(data.project_id);
                  return next;
                });
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('[REALTIME] Generation progress subscription status:', status);
        });

      return () => {
        console.log('[REALTIME] Unsubscribing from channels...');
        projectsSubscription.unsubscribe();
        generationProgressSubscription.unsubscribe();
        if (outputsSubscription) {
          outputsSubscription.unsubscribe();
        }
      };
    }
  }, [user, selectedProject?.id]);

  // Fetch current generation progress on page load
  const fetchGenerationProgress = async () => {
    try {
      if (!user?.id) return;

      // Get all projects for this user that are currently generating
      const { data: progressData, error } = await supabase
        .from('generation_progress')
        .select('project_id, status')
        .in('status', ['preparing', 'generating']);

      if (error) {
        console.error('Error fetching generation progress:', error);
        return;
      }

      if (progressData && progressData.length > 0) {
        const generatingIds = progressData.map((p: any) => p.project_id);
        setGeneratingProjects(new Set(generatingIds));
        console.log('Restored generation state for projects:', generatingIds);
      }
    } catch (error) {
      console.error('Exception fetching generation progress:', error);
    }
  };

  // Poll for generation completion as a reliable fallback (realtime can be flaky)
  useEffect(() => {
    if (generatingProjects.size === 0) return;

    console.log('[POLL] Starting poll for', generatingProjects.size, 'generating projects');

    const pollInterval = setInterval(async () => {
      const projectIds = Array.from(generatingProjects);
      console.log('[POLL] Checking status for projects:', projectIds);

      try {
        // Check if any of the generating projects have completed (no progress entry = completed)
        const { data: progressData, error } = await supabase
          .from('generation_progress')
          .select('project_id, status')
          .in('project_id', projectIds);

        if (error) {
          console.error('[POLL] Error checking progress:', error);
          return;
        }

        // Find projects that are no longer in progress (completed or failed)
        const stillGenerating = new Set(
          (progressData || [])
            .filter((p: any) => p.status === 'preparing' || p.status === 'generating')
            .map((p: any) => p.project_id)
        );

        const completedProjects = projectIds.filter(id => !stillGenerating.has(id));

        if (completedProjects.length > 0) {
          console.log('[POLL] Detected completed projects:', completedProjects);

          // Remove completed projects from generating set
          setGeneratingProjects(prev => {
            const next = new Set(prev);
            completedProjects.forEach(id => next.delete(id));
            return next;
          });

          // Refresh data
          fetchProjects();

          // Refresh outputs if selected project completed
          const selectedId = selectedProjectRef.current;
          if (selectedId && completedProjects.includes(selectedId)) {
            console.log('[POLL] Refreshing outputs for completed project:', selectedId);
            fetchProjectOutputs(selectedId);
            setActiveTab('outputs');
          }
        }
      } catch (error) {
        console.error('[POLL] Exception checking progress:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log('[POLL] Stopping poll');
      clearInterval(pollInterval);
    };
  }, [generatingProjects.size]);

  const fetchProjects = async () => {
    try {
      if (!user?.id) {
        console.log('No user ID available');
        return;
      }

      console.log('Fetching projects for user:', user.id);

      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*, transcription_segments, speaker_data, performance_level, project_type, ai_summary, chapters, key_takeaways, social_quotes')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

      if (error) {
        console.error('Error fetching projects:', error);
        return;
      }

      console.log('Fetched projects:', projectsData);
      const updatedProjects = projectsData || [];
      setProjects(updatedProjects);

      // Use ref to get current selection to avoid stale closure issues
      // when this function is called from realtime subscription callbacks
      const currentSelectedId = selectedProjectRef.current;
      if (currentSelectedId) {
        const refreshedSelection = updatedProjects.find(
          (project) => project.id === currentSelectedId
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

  const getPlatformColor = (output: Output) => {
    const platform = output.platform;
    
    // Check metadata for specific platform types
    if (output.metadata?.platform) {
       if (output.metadata.platform === 'Show Notes') return 'bg-indigo-100 text-indigo-800';
       if (output.metadata.platform === 'Quote Graphic') return 'bg-amber-100 text-amber-800';
       if (output.metadata.platform === 'Blog Post') return 'bg-emerald-100 text-emerald-800';
       if (output.metadata.platform === 'Email Newsletter') return 'bg-orange-100 text-orange-800';
    }

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

  const getPlatformDisplayName = (output: Output) => {
    // Prioritize metadata platform label
    if (output.metadata?.platform && output.metadata.platform !== 'General') {
      return output.metadata.platform;
    }
    
    // Fallback if metadata.platform_label exists
    if (output.metadata?.platform_label) {
      return output.metadata.platform_label;
    }

    const platform = output.platform;
    switch (platform) {
      case 'twitter':
        return 'X';
      case 'linkedin':
        return 'LinkedIn';
      case 'instagram':
        return 'Instagram';
      case 'email':
        return 'Email';
      case 'blog':
        return 'Blog';
      case 'general':
        return 'General';
      default:
        return platform;
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

  const getProjectTypeBadge = (type: ProjectType | undefined) => {
    if (!type) return null;

    const typeConfig: Record<ProjectType, {
      icon: any;
      label: string;
      color: string;
      iconColor: string;
      description: string;
    }> = {
      DEBATE: {
        icon: Users,
        label: 'Debate',
        color: 'bg-amber-50 text-amber-700 border border-amber-200',
        iconColor: 'text-amber-600',
        description: 'Panel discussion with moderator',
      },
      INTERVIEW: {
        icon: Mic,
        label: 'Interview',
        color: 'bg-green-50 text-green-700 border border-green-200',
        iconColor: 'text-green-600',
        description: '1-on-1 Q&A format',
      },
      PODCAST: {
        icon: Radio,
        label: 'Podcast',
        color: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        iconColor: 'text-indigo-600',
        description: 'Conversational show',
      },
      MONOLOGUE: {
        icon: User,
        label: 'Monologue',
        color: 'bg-slate-50 text-slate-700 border border-slate-200',
        iconColor: 'text-slate-600',
        description: 'Single speaker',
      },
      OTHER: {
        icon: HelpCircle,
        label: 'Other',
        color: 'bg-gray-50 text-gray-600 border border-gray-200',
        iconColor: 'text-gray-500',
        description: 'Unclassified format',
      },
    };

    const config = typeConfig[type];
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}
        title={config.description}
      >
        <Icon className={`w-2.5 h-2.5 mr-0.5 ${config.iconColor}`} />
        {config.label}
      </span>
    );
  };

  const getContentAvailability = (project: Project) => {
    const tier = project.performance_level || 'basic';
    const features = [];
    const aiProcessing = (project.speaker_data as any)?.detectionMetadata?.aiProcessing || {};

    // Basic tier - always available
    features.push({
      name: 'Transcription',
      available: !!project.transcription_text,
      pending: false,
      icon: FileText,
      color: 'text-green-600'
    });

    features.push({
      name: 'Speakers',
      available: !!project.speaker_data,
      pending: false,
      icon: MessageCircle,
      color: 'text-green-600',
      label: tier === 'basic' ? 'Generic' : 'Named'
    });

    // Pro tier and above
    if (tier === 'pro' || tier === 'premium') {
      features.push({
        name: 'AI Summary',
        available: !!project.ai_summary,
        pending: aiProcessing.summary === false,
        icon: Sparkles,
        color: 'text-blue-600'
      });
    }

    // Premium tier only
    if (tier === 'premium') {
      features.push({
        name: 'Chapters',
        available: !!project.chapters && project.chapters.length > 0,
        pending: aiProcessing.chapters === false,
        icon: BookOpen,
        color: 'text-purple-600',
        count: project.chapters?.length
      });

      features.push({
        name: 'Key Takeaways',
        available: !!project.key_takeaways && project.key_takeaways.length > 0,
        pending: aiProcessing.takeaways === false,
        icon: Lightbulb,
        color: 'text-purple-600',
        count: project.key_takeaways?.length
      });

      features.push({
        name: 'Social Quotes',
        available: !!project.social_quotes && project.social_quotes.length > 0,
        pending: aiProcessing.quotes === false,
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
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-50">
      {/* Sticky Header Bar */}
      <header className="flex-shrink-0 h-12 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-900">Content Library</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile sidebar toggles */}
          <button
            onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
          >
            {projectsSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setContextSidebarOpen(!contextSidebarOpen)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title={contextSidebarOpen ? 'Hide details' : 'Show details'}
          >
            {contextSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        // Empty state - full width centered
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center py-12 px-8 bg-white rounded-lg shadow max-w-md">
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
        </div>
      ) : (
        /* 3-Column Dashboard Layout */
        <div className="flex flex-1 overflow-hidden">
            {/* LEFT COLUMN: Projects List (25% on desktop) - Collapsible */}
            <aside
              className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r border-gray-200 bg-gray-50/30 flex flex-col overflow-hidden ${
                projectsSidebarOpen
                  ? 'w-80 lg:w-1/4 min-w-[280px] opacity-100'
                  : 'w-0 opacity-0'
              }`}
            >
              <div className="flex-shrink-0 p-5 pb-0 space-y-4">
                {/* Header with Select Toggle */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Projects</h2>
                  <button
                    onClick={() => {
                      if (selectionMode) {
                        exitSelectionMode();
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      selectionMode
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {selectionMode ? (
                      <>
                        <X className="w-4 h-4 mr-1.5" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <ListChecks className="w-4 h-4 mr-1.5" />
                        Select
                      </>
                    )}
                  </button>
                </div>

                {/* Selection Mode Header */}
                {selectionMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleAllProjectSelection}
                          className="p-1 hover:bg-blue-100 rounded transition-colors"
                        >
                          {selectedProjectIds.size === filteredAndSortedProjects.length && filteredAndSortedProjects.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : selectedProjectIds.size > 0 ? (
                            <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-600/20" />
                          ) : (
                            <Square className="w-4 h-4 text-blue-600" />
                          )}
                        </button>
                        <span className="text-sm text-blue-700 font-medium">
                          {selectedProjectIds.size} selected
                        </span>
                      </div>
                      {selectedProjectIds.size > 0 && (
                        <button
                          onClick={() => setSelectedProjectIds(new Set())}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {/* Export Button - shown when projects are selected */}
                    {selectedProjectIds.size > 0 && (
                      <button
                        onClick={handleBulkExport}
                        className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export {selectedProjectIds.size} Project{selectedProjectIds.size !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                )}

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

                  {/* Type Filter */}
                  <div className="w-full">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as 'all' | ProjectType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Types</option>
                      <option value="DEBATE">Debate</option>
                      <option value="INTERVIEW">Interview</option>
                      <option value="PODCAST">Podcast</option>
                      <option value="MONOLOGUE">Monologue</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                {/* Results count */}
                <div className="text-xs text-gray-500">
                  {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'project' : 'projects'}
                  {(searchTerm || tierFilter !== 'all' || typeFilter !== 'all') && ` (filtered from ${projects.length})`}
                </div>
              </div>

              {/* Scrollable Projects List */}
              <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
                {filteredAndSortedProjects.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm">No projects found</p>
                    {(searchTerm || tierFilter !== 'all' || typeFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setTierFilter('all');
                          setTypeFilter('all');
                        }}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  filteredAndSortedProjects.map((project) => {
                    const isProjectSelected = selectedProjectIds.has(project.id);
                    const isActive = selectedProject?.id === project.id;
                    return (
                    <div
                      key={project.id}
                      className={`group p-4 rounded-xl transition-all cursor-pointer border-2 overflow-hidden shadow-sm ${
                        selectionMode && isProjectSelected
                          ? 'bg-blue-50 border-blue-400 shadow-blue-100'
                          : isActive
                          ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-100'
                          : 'bg-white border-transparent hover:border-gray-200 hover:shadow-md'
                      }`}
                      onClick={() => {
                        if (selectionMode) {
                          toggleProjectSelection(project.id);
                          return;
                        }
                        // Update URL to match selection, preventing "sticky" URL param from reverting selection
                        router.push(`/dashboard/projects?id=${project.id}`);
                        setSelectedProject(project);
                        setShowFullTranscription(false);
                        setActiveTab('transcript');
                        setInsightsSidebarOpen(false);
                        setInsightsStatus({ count: 0, loading: true, generating: false });
                        setInsightsData([]);
                        setTriggerInsightGeneration(0);
                        fetchProjectOutputs(project.id);
                      }}
                    >
                      {(() => {
                        const availability = getContentAvailability(project);
                        const pendingFeatures = availability.filter(f => f.pending && !f.available);
                        const availableCount = availability.filter(f => f.available).length;
                        const pendingLabel = pendingFeatures.map(f => f.name).join(', ');
                        return (
                          <>
                      {/* Top Row: Checkbox (selection mode), Title & Status */}
                      <div className="flex justify-between items-start mb-1.5 gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {selectionMode && (
                            <div className="flex-shrink-0 mt-0.5">
                              {isProjectSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          )}
                          <h3 className={`text-sm leading-snug text-gray-900 truncate ${
                            selectedProject?.id === project.id ? 'font-semibold' : 'font-medium'
                          }`} title={project.title}>
                            {project.title}
                          </h3>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          {getStatusIcon(project.status)}
                        </div>
                      </div>

                      {/* Middle Row: Tier & Features */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {getTierBadge(project.performance_level)}
                        
                        {/* Compact Content Indicators */}
                        {project.status === 'completed' && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            {availableCount > 0 && (
                              <span className="flex items-center px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium">
                                {availableCount} Assets
                              </span>
                            )}
                            {pendingFeatures.length > 0 && (
                              <span
                                className="flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium"
                                title={`Generating: ${pendingLabel}`}
                              >
                                Generating {pendingFeatures.length}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Row: Metadata & Actions */}
                      <div className="flex items-end justify-between pt-2 border-t border-gray-100">
                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                          <span>{new Date(project.created_at).toLocaleDateString()}</span>
                          {project.audio_duration && (
                            <span>{formatDuration(project.audio_duration)}</span>
                          )}
{project.project_type && getProjectTypeBadge(project.project_type)}
                        </div>

                        {/* Hover Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {project.status === 'completed' && project.transcription_text && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateContent(project);
                              }}
                              disabled={generatingProjects.has(project.id)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50"
                              title={generatingProjects.has(project.id) ? "Generating..." : "Generate content"}
                            >
                              {generatingProjects.has(project.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project.id);
                            }}
                            disabled={deletingProject === project.id}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded hover:bg-red-50"
                            title="Delete project"
                          >
                            {deletingProject === project.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  );
                  })
                )}
              </div>

            </aside>

            {/* MIDDLE COLUMN: Main Content Stage (50% on desktop) */}
            <main
              className={`flex-1 min-w-0 overflow-y-auto transition-all duration-300 ease-in-out ${
                !projectsSidebarOpen && !contextSidebarOpen ? 'lg:w-full' : 'lg:w-1/2'
              }`}
            >
              {selectedProject ? (
                <div className="h-full flex flex-col bg-white">
                  {/* Header with Tier Badge and Actions */}
                  <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        {/* Toggle Projects Sidebar Button - desktop only */}
                        <button
                          onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
                          className="hidden lg:flex p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
                          title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
                        >
                          {projectsSidebarOpen ? (
                            <PanelLeftClose className="w-4 h-4" />
                          ) : (
                            <PanelLeftOpen className="w-4 h-4" />
                          )}
                        </button>
                        {editingProjectTitle ? (
                          <input
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveProjectTitle();
                              if (e.key === 'Escape') setEditingProjectTitle(false);
                            }}
                            onBlur={handleSaveProjectTitle}
                            disabled={savingTitle}
                            autoFocus
                            className="text-base font-medium text-gray-900 truncate border-b-2 border-blue-400 outline-none bg-transparent min-w-0 flex-1"
                          />
                        ) : (
                          <button
                            className="group flex items-center gap-1.5 min-w-0 text-left"
                            onClick={() => {
                              setEditingTitleValue(selectedProject.title);
                              setEditingProjectTitle(true);
                            }}
                            title="Click to rename"
                          >
                            <h2 className="text-base font-medium text-gray-900 truncate">{selectedProject.title}</h2>
                            <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </button>
                        )}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {getTierBadge(selectedProject.performance_level)}
                          {selectedProject.project_type && getProjectTypeBadge(selectedProject.project_type)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* More Actions Dropdown */}
                        <DropdownMenu
                          align="right"
                          trigger={
                            <button
                              type="button"
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                              <span className="sr-only">More actions</span>
                            </button>
                          }
                        >
                          <DropdownMenuItem
                            onClick={() => handleRunCoverage(selectedProject)}
                            disabled={runningCoverageIds.has(selectedProject.id) || !selectedProject.transcription_text}
                          >
                            {runningCoverageIds.has(selectedProject.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ScanSearch className="w-4 h-4" />
                            )}
                            {runningCoverageIds.has(selectedProject.id) ? 'Analyzing...' : 'Run Analysis'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSingleExport(selectedProject)}>
                            <Download className="w-4 h-4" />
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                          </DropdownMenuItem>
                        </DropdownMenu>

                        {/* Generate Content Button (Primary) */}
                        <button
                          onClick={() => handleGenerateContent(selectedProject)}
                          disabled={generatingProjects.has(selectedProject.id)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            generatingProjects.has(selectedProject.id)
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {generatingProjects.has(selectedProject.id) ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              Generate
                            </>
                          )}
                        </button>

                        {/* Toggle Context Sidebar Button - desktop only */}
                        <button
                          onClick={() => setContextSidebarOpen(!contextSidebarOpen)}
                          className="hidden lg:flex p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
                          title={contextSidebarOpen ? 'Hide details panel' : 'Show details panel'}
                        >
                          {contextSidebarOpen ? (
                            <PanelRightClose className="w-4 h-4" />
                          ) : (
                            <PanelRightOpen className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <div className="flex-shrink-0 border-b border-gray-200 px-4">
                    <nav className="flex items-center justify-between" aria-label="Tabs">
                      <div className="flex space-x-4">
                        <button
                          onClick={() => setActiveTab('transcript')}
                          className={`py-2.5 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'transcript'
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <FileText className="w-4 h-4" />
                            <span>Transcript</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setActiveTab('outputs')}
                          className={`py-2.5 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'outputs'
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <Zap className="w-4 h-4" />
                            <span>Generated Content</span>
                            {outputs.length > 0 && (
                              <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                {outputs.length}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>

                      {activeTab === 'transcript' && parsedSpeakerData && (
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <label
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                              showTimestamps
                                ? 'border-blue-200 bg-blue-50 text-blue-600'
                                : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={showTimestamps}
                              onChange={(e) => setShowTimestamps(e.target.checked)}
                              className="sr-only"
                            />
                            <Clock className="w-3.5 h-3.5" />
                            <span>Timestamps</span>
                          </label>

                          <select
                            value={selectedSpeaker || ''}
                            onChange={(e) => setSelectedSpeaker(e.target.value || null)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              selectedSpeaker
                                ? 'border-blue-200 bg-blue-50 text-blue-600'
                                : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <option value="">All speakers</option>
                            {Object.keys(parsedSpeakerData.speakers || {}).map((speakerId) => (
                              <option key={speakerId} value={speakerId}>
                                {getSpeakerDisplayName(parsedSpeakerData.speakers[speakerId])}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => setReaderView(v => !v)}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              readerView
                                ? 'border-blue-200 bg-blue-50 text-blue-600'
                                : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Reader view</span>
                          </button>
                        </div>
                      )}
                    </nav>
                  </div>

                  {/* Tab Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto bg-gray-50/50">
                    {/* TRANSCRIPT TAB - ConversationView with plain-text fallback */}
                    {activeTab === 'transcript' && (
                      <div className="h-full flex flex-col">
                        {parsedSpeakerData ? (
                          <div className="h-full flex flex-col">
                            {/* Status Notices */}
                            {(isProjectRefreshing || (projectPreviousStatus === 'processing' && selectedProject.status === 'completed')) && (
                              <div className="flex-shrink-0 px-2 py-1.5 bg-white border-b border-gray-100">
                                <div className="max-w-3xl mx-auto">
                                  {isProjectRefreshing && (
                                    <div className="flex items-center gap-2 text-blue-600 text-sm">
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                      <span>Refreshing speaker data...</span>
                                    </div>
                                  )}
                                  {projectPreviousStatus === 'processing' && selectedProject.status === 'completed' && (
                                    <div className="flex items-center gap-2 text-green-600 text-sm">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      <span>Processing complete!</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Audio Player for Speaker Samples */}
                            {audioUrl && (
                              <div className="flex-shrink-0 px-2 py-1.5 bg-white border-b border-gray-100">
                                <div className="max-w-3xl mx-auto flex justify-end">
                                  <audio
                                    ref={audioElementRef}
                                    src={audioUrl}
                                    controls
                                    className="h-8 w-48"
                                    preload="metadata"
                                  />
                                </div>
                              </div>
                            )}

                            {readerView ? (
                              /* Reader View — clean, scannable transcript */
                              <div className="flex-1 overflow-y-auto px-4 py-4">
                                <div className="max-w-3xl mx-auto divide-y divide-gray-100">
                                  {parsedSpeakerData.segments.map((segment: any, i: number) => {
                                    const speakerId = segment.finalSpeakerId || segment.speakerId;
                                    const speaker = parsedSpeakerData.speakers[speakerId];
                                    const speakerName = speaker?.finalName || speaker?.fallbackName || speaker?.name || speakerId;
                                    const colorClass = getSpeakerColor(speakerId);
                                    const mins = Math.floor((segment.startTime || 0) / 60);
                                    const secs = Math.floor((segment.startTime || 0) % 60);
                                    const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;
                                    return (
                                      <div key={i} className="flex items-baseline gap-3 py-2.5">
                                        <span className="flex-shrink-0 text-[11px] font-mono text-gray-400 w-9 select-none">{timestamp}</span>
                                        <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>{speakerName}</span>
                                        <span className="text-[14px] text-gray-800 leading-relaxed">{segment.text}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              /* Conversation View — full editing controls */
                              <div className="flex-1 overflow-y-auto px-2 py-2">
                                <div className="max-w-3xl mx-auto">
                                  <ConversationView
                                    speakerData={parsedSpeakerData}
                                    transcriptionText={selectedProject.transcription_text || ''}
                                    projectId={selectedProject.id}
                                    userTier={selectedProject.performance_level || 'basic'}
                                    onSpeakerUpdate={(updatedSpeakerData) => {
                                      setSelectedProject(prev => prev ? {
                                        ...prev,
                                        speaker_data: updatedSpeakerData
                                      } : null);
                                      setProjects(prev =>
                                        prev.map(project =>
                                          project.id === selectedProject.id
                                            ? { ...project, speaker_data: updatedSpeakerData }
                                            : project
                                        )
                                      );
                                    }}
                                    insightsSidebarOpen={insightsSidebarOpen}
                                    onInsightsSidebarChange={setInsightsSidebarOpen}
                                    onInsightsStatusChange={setInsightsStatus}
                                    onInsightsDataChange={setInsightsData}
                                    triggerInsightGeneration={triggerInsightGeneration}
                                    insightsRefreshToken={insightsRefreshToken}
                                    audioPlayerRef={audioPlayerRef}
                                    showTimestamps={showTimestamps}
                                    selectedSpeaker={selectedSpeaker}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : selectedProject.transcription_text ? (
                          <div className="flex-1 overflow-y-auto px-2 py-2">
                            <div className="max-w-3xl mx-auto text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {selectedProject.transcription_text}
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="text-center py-12 text-gray-500">
                              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-300" />
                              <p className="text-sm">Processing transcription...</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* GENERATED CONTENT TAB */}
                    {activeTab === 'outputs' && (
                      <div className="px-2 py-2">
                        <div className="max-w-3xl mx-auto">
                          {outputs.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-100">
                              <Clock className="mx-auto h-10 w-10 text-gray-300" />
                              <p className="mt-3 text-sm text-gray-500">
                                {selectedProject.status === 'processing'
                                  ? 'Content is being generated...'
                                  : selectedProject.transcription_text
                                  ? 'Ready to generate content - click Generate above'
                                  : 'No content generated yet'
                                }
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {outputs.map((output) => (
                                <div
                                  key={output.id}
                                  className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                                >
                                {/* Header: Badges & Title */}
                                <div className="mb-4">
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPlatformColor(output)}`}>
                                      {getPlatformDisplayName(output)}
                                    </span>
                                    {output.metadata?.theme && (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                        {output.metadata.theme}
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="text-base font-semibold text-gray-900 leading-tight">
                                    {output.title}
                                  </h3>
                                </div>

                                {/* Content: Quote Style */}
                                <div className="pl-4 border-l-4 border-gray-200 py-1 mb-5">
                                  <div className={`text-sm text-gray-700 whitespace-pre-wrap leading-relaxed ${expandedOutputs.has(output.id) ? '' : 'line-clamp-4'}`}>
                                    {output.content}
                                  </div>
                                  {output.content.length > 200 && (
                                    <button
                                      onClick={() => toggleOutputExpansion(output.id)}
                                      className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                                    >
                                      {expandedOutputs.has(output.id) ? 'Show Less' : 'Show More'}
                                    </button>
                                  )}
                                </div>

                                {/* Footer: Date & Actions */}
                                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                  <span className="text-xs text-gray-400">
                                    Generated {new Date(output.created_at).toLocaleDateString()}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => toggleOutputExpansion(output.id)}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title={expandedOutputs.has(output.id) ? 'Collapse' : 'Expand'}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDownloadOutput(output)}
                                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                      title="Download as .txt"
                                    >
                                      <Download className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleCopyOutput(output)}
                                      className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
                                      title="Copy to clipboard"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteOutput(output.id)}
                                      disabled={deletingOutput === output.id}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                      title="Delete"
                                    >
                                      {deletingOutput === output.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty state when no project selected */
                <div className="h-full flex items-center justify-center bg-gray-50/30">
                  <div className="text-center py-12 px-6">
                    <FileText className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-3 text-sm font-medium text-gray-900">
                      Select a project
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 max-w-xs">
                      Choose a project from the list on the left to view its details and content
                    </p>
                  </div>
                </div>
              )}
            </main>

            {/* RIGHT COLUMN: Context Sidebar (25% on desktop) */}
            <ContextSidebar
              speakers={parsedSpeakerData?.speakers}
              onSpeakerClick={(speakerId) => setActiveSpeakerId(speakerId)}
              activeSpeakerId={activeSpeakerId}
              projectId={selectedProject?.id}
              onSpeakerRename={async (speakerId, newName) => {
                if (!selectedProject?.id) return;

                const response = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'rename',
                    newName
                  })
                });

                if (response.ok) {
                  const refreshed = await fetch(`/api/projects/${selectedProject.id}`);
                  if (refreshed.ok) {
                    const updatedProject = await refreshed.json();
                    setSelectedProject(prev => prev ? {
                      ...prev,
                      speaker_data: updatedProject.speaker_data
                    } : null);
                  }
                }
              }}
              onSpeakerMerge={async (sourceSpeakerId, targetSpeakerId) => {
                if (!selectedProject?.id) return;
                if (sourceSpeakerId === targetSpeakerId) return;

                // Merge: delete source, reassign its segments to target
                const response = await fetch(`/api/projects/${selectedProject.id}/speakers/${sourceSpeakerId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'reassign',
                    reassignToSpeakerId: targetSpeakerId
                  })
                });

                if (response.ok) {
                  const refreshed = await fetch(`/api/projects/${selectedProject.id}`);
                  if (refreshed.ok) {
                    const updatedProject = await refreshed.json();
                    setSelectedProject(prev => prev ? {
                      ...prev,
                      speaker_data: updatedProject.speaker_data
                    } : null);
                  }
                }
              }}
              insights={insightsData}
              activeInsightId={activeInsightId}
              onInsightClick={(insightId) => setActiveInsightId(prev => prev === insightId ? null : insightId)}
              insightsLoading={insightsStatus.loading}
              insightsGenerating={insightsStatus.generating}
              onGenerateInsights={() => setTriggerInsightGeneration(prev => prev + 1)}
              summary={selectedProject?.ai_summary}
              chapters={selectedProject?.chapters || []}
              takeaways={selectedProject?.key_takeaways || []}
              quotes={selectedProject?.social_quotes || []}
              tier={selectedProject?.performance_level || 'basic'}
              contentLoading={selectedProject?.status === 'processing' || isProjectRefreshing}
              isOpen={contextSidebarOpen}
              onClose={() => setContextSidebarOpen(false)}
              className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
                contextSidebarOpen ? 'w-72 lg:w-1/4 min-w-[280px] opacity-100' : 'w-0 opacity-0'
              }`}
            />
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

        {/* Export Modal */}
        <ExportModal
          isOpen={showExportModal}
          onClose={() => {
            setShowExportModal(false);
            setExportProjects([]);
          }}
          projects={exportProjects}
          onExport={handleExport}
        />

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white animate-in slide-in-from-top-2 duration-200 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success'
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />
            }
            <span>{toast.message}</span>
          </div>
        )}

    </div>
  );
}
