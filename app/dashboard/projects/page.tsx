"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Download, Share2, RefreshCw, Trash2, Zap, Play, MessageCircle, Crown, Star, Sparkles, BookOpen, Lightbulb, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Filter, Loader2, CheckSquare, Square, ListChecks, X, PanelRightOpen, PanelRightClose, ScanSearch, MoreHorizontal, Users, Mic, Radio, User, HelpCircle, Copy, Pencil, BarChart2 } from 'lucide-react';
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
  processing_stage?: string;
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

  // ─── Segment review / selection state (lifted from ConversationView) ───
  interface TouchupPreviewItem {
    index: number;
    oldSpeakerId: string;
    newSpeakerId: string;
    reason: string;
    confidence: number | null;
    segmentText: string;
    accepted: boolean;
  }
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [aiTouchupLoading, setAiTouchupLoading] = useState(false);
  const [aiTouchupResult, setAiTouchupResult] = useState<string | null>(null);
  const [touchupPreview, setTouchupPreview] = useState<TouchupPreviewItem[] | null>(null);
  const [applyingTouchup, setApplyingTouchup] = useState(false);
  const [scrollToSegmentIndex, setScrollToSegmentIndex] = useState<number | null>(null);

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

  const accuracyPercent = useMemo(() => {
    if (!parsedSpeakerData) return null;
    const metaConfidence = parsedSpeakerData?.detectionMetadata?.confidence;
    if (typeof metaConfidence === 'number' && metaConfidence > 0) {
      return Math.max(0, Math.min(1, metaConfidence)) * 100;
    }
    const segments = parsedSpeakerData?.segments ?? [];
    const confidences = segments
      .map((s: any) => s?.confidence)
      .filter((c: any) => typeof c === 'number');
    if (confidences.length === 0) return null;
    const avg = confidences.reduce((sum: number, c: number) => sum + c, 0) / confidences.length;
    return Math.max(0, Math.min(1, avg)) * 100;
  }, [parsedSpeakerData]);

  const hasUncertainSegments = useMemo(
    () => (parsedSpeakerData?.segments ?? []).some((s: any) =>
      s.status === 'uncertain' && (
        s.confidenceReason === 'acoustic_only' ||
        s.confidenceReason === 'transition_short' ||
        s.confidenceReason === 'role_mismatch'
      )
    ),
    [parsedSpeakerData?.segments]
  );

  // Reset segment selection when project changes
  useEffect(() => {
    setSelectedSegments(new Set());
    setTouchupPreview(null);
    setAiTouchupResult(null);
    setScrollToSegmentIndex(null);
  }, [selectedProject?.id]);

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

  // ─── Segment review handlers ───────────────────────────────────────────────
  const handleSelectAllUncertain = useCallback(() => {
    if (!parsedSpeakerData?.segments) return;
    const uncertainIndices = (parsedSpeakerData.segments as any[])
      .map((s, i) => ({ s, i }))
      .filter(({ s }) =>
        s.status === 'uncertain' && (
          s.confidenceReason === 'acoustic_only' ||
          s.confidenceReason === 'transition_short' ||
          s.confidenceReason === 'role_mismatch'
        )
      )
      .map(({ i }) => i);
    setSelectedSegments(new Set(uncertainIndices));
  }, [parsedSpeakerData?.segments]);

  const handleToggleSegmentSelection = useCallback((index: number) => {
    setSelectedSegments(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleAiTouchup = useCallback(async () => {
    if (!selectedProject?.id || selectedSegments.size === 0) return;
    setAiTouchupLoading(true);
    setAiTouchupResult(null);
    setTouchupPreview(null);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/touchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: Array.from(selectedSegments), dryRun: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Touch-up failed');
      const changed = (data.reassignments || []).filter((r: any) => r.oldSpeakerId !== r.newSpeakerId);
      if (changed.length === 0) {
        setAiTouchupResult(`AI found no changes needed for ${selectedSegments.size} segment${selectedSegments.size !== 1 ? 's' : ''}`);
        return;
      }
      setTouchupPreview(changed.map((r: any) => ({ ...r, accepted: true })));
    } catch (err) {
      setAiTouchupResult('Touch-up failed — try again');
    } finally {
      setAiTouchupLoading(false);
    }
  }, [selectedProject?.id, selectedSegments]);

  const handleApplyTouchup = useCallback(async () => {
    if (!selectedProject?.id || !touchupPreview) return;
    const approved = touchupPreview.filter(item => item.accepted);
    if (approved.length === 0) { setTouchupPreview(null); return; }
    setApplyingTouchup(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/touchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedReassignments: approved }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Apply failed');
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
      }
      setAiTouchupResult(`AI reassigned ${approved.length} segment${approved.length !== 1 ? 's' : ''}`);
      setTouchupPreview(null);
      setSelectedSegments(new Set());
    } catch (err) {
      setAiTouchupResult('Apply failed — try again');
    } finally {
      setApplyingTouchup(false);
    }
  }, [selectedProject?.id, touchupPreview]);

  const handleTogglePreviewItem = useCallback((index: number) => {
    setTouchupPreview(prev =>
      prev ? prev.map(item => item.index === index ? { ...item, accepted: !item.accepted } : item) : null
    );
  }, []);

  const handleConfirmSegment = useCallback(async (segmentIndex: number) => {
    if (!selectedProject?.id) return;
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: [segmentIndex], confirmOnly: true }),
      });
      if (!response.ok) throw new Error('Failed to confirm segment');
      const data = await response.json();
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
      }
      setSelectedSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentIndex);
        return next;
      });
    } catch (error) {
      console.error('Error confirming segment:', error);
    }
  }, [selectedProject?.id]);

  const handleSidebarSegmentReassign = useCallback(async (segmentIndex: number, newSpeakerId: string) => {
    if (!selectedProject?.id || !newSpeakerId) return;
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: [segmentIndex], newSpeakerId }),
      });
      if (!response.ok) throw new Error('Failed to reassign segment');
      const data = await response.json();
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
      }
    } catch (error) {
      console.error('Error reassigning segment from sidebar:', error);
    }
  }, [selectedProject?.id]);

  const handleAddSpeaker = useCallback(async (name: string, role: string) => {
    if (!selectedProject?.id) return;
    const res = await fetch(`/api/projects/${selectedProject.id}/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.updatedSpeakerData) {
      setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
    }
  }, [selectedProject?.id]);

  const handleDeleteSpeaker = useCallback(async (speakerId: string, action: 'reassign' | 'delete', targetId?: string) => {
    if (!selectedProject?.id) return;
    const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reassignToSpeakerId: targetId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.updatedSpeakerData) {
      setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
    }
  }, [selectedProject?.id]);
  // ─────────────────────────────────────────────────────────────────────────────

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

                    // Content panel now always visible (no tab to switch)
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

  const getProcessingStage = (project: Project): string => {
    if (project.processing_stage) return project.processing_stage;
    return 'Processing...';
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
        return <Clock className="h-5 w-5 text-slate-500" />;
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
       if (output.metadata.platform === 'Show Notes') return 'bg-indigo-100 text-indigo-300';
       if (output.metadata.platform === 'Quote Graphic') return 'bg-amber-100 text-amber-300';
       if (output.metadata.platform === 'Blog Post') return 'bg-emerald-100 text-emerald-800';
       if (output.metadata.platform === 'Email Newsletter') return 'bg-orange-100 text-orange-800';
    }

    switch (platform) {
      case 'twitter':
        return 'bg-blue-100 text-blue-300';
      case 'linkedin':
        return 'bg-blue-100 text-blue-400';
      case 'instagram':
        return 'bg-pink-100 text-pink-800';
      case 'general':
        return 'bg-slate-800 text-slate-100';
      default:
        return 'bg-slate-800 text-slate-100';
    }
  };

  // Returns icon letter + style for the output card platform icon
  const getOutputPlatformMeta = (output: Output): { letter: string; iconStyle: string } => {
    const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
    if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread') || rawPlatform === 'x') {
      return { letter: 'X', iconStyle: 'bg-slate-950 text-white border-slate-700' };
    }
    if (rawPlatform.includes('linkedin')) {
      return { letter: 'in', iconStyle: 'bg-blue-600 text-white border-blue-500' };
    }
    if (rawPlatform.includes('instagram')) {
      return { letter: 'IG', iconStyle: 'bg-pink-600 text-white border-pink-500' };
    }
    if (rawPlatform.includes('blog')) {
      return { letter: 'B', iconStyle: 'bg-green-700 text-white border-green-600' };
    }
    if (rawPlatform.includes('newsletter') || rawPlatform.includes('email')) {
      return { letter: '✉', iconStyle: 'bg-orange-600 text-white border-orange-500' };
    }
    if (rawPlatform.includes('show notes')) {
      return { letter: '♪', iconStyle: 'bg-indigo-600 text-white border-indigo-500' };
    }
    const displayName = output.metadata?.platform || output.platform || 'G';
    return { letter: displayName.charAt(0).toUpperCase(), iconStyle: 'bg-slate-700 text-white border-slate-600' };
  };

  const getOutputSubtitle = (output: Output): string => {
    const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
    const charCount = output.content.length;
    if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread')) {
      const posts = output.content.split(/\n\n+/).filter(p => p.trim().length > 0);
      return `${posts.length} posts • 280 chars each`;
    }
    return `${charCount.toLocaleString()} characters`;
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
        color: 'bg-slate-800/70 text-slate-300 border border-slate-700/60',
        iconColor: 'text-slate-400'
      },
      pro: {
        icon: Star,
        label: 'Pro',
        color: 'bg-blue-900/30 text-blue-300 border border-blue-800/40',
        iconColor: 'text-blue-300'
      },
      premium: {
        icon: Crown,
        label: 'Premium',
        color: 'bg-violet-900/30 text-violet-300 border border-violet-800/40',
        iconColor: 'text-violet-300'
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
        color: 'bg-amber-900/20 text-amber-400 border border-amber-800/30',
        iconColor: 'text-amber-600',
        description: 'Panel discussion with moderator',
      },
      INTERVIEW: {
        icon: Mic,
        label: 'Interview',
        color: 'bg-green-900/20 text-green-400 border border-green-800/30',
        iconColor: 'text-green-600',
        description: '1-on-1 Q&A format',
      },
      PODCAST: {
        icon: Radio,
        label: 'Podcast',
        color: 'bg-indigo-900/20 text-indigo-400 border border-indigo-800/30',
        iconColor: 'text-indigo-600',
        description: 'Conversational show',
      },
      MONOLOGUE: {
        icon: User,
        label: 'Monologue',
        color: 'bg-slate-800/50 text-slate-300 border border-slate-700',
        iconColor: 'text-slate-300',
        description: 'Single speaker',
      },
      OTHER: {
        icon: HelpCircle,
        label: 'Other',
        color: 'bg-slate-800/50 text-slate-400 border border-slate-700',
        iconColor: 'text-slate-400',
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
            <div className="h-8 bg-slate-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-slate-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page flex flex-col h-screen w-full overflow-hidden bg-slate-950">
      {/* Sticky Header Bar */}
      <header className="flex-shrink-0 h-12 bg-slate-900 border-b border-slate-700 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-slate-50">Content Library</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile sidebar toggles */}
          <button
            onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-md"
            title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
          >
            {projectsSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setContextSidebarOpen(!contextSidebarOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-md"
            title={contextSidebarOpen ? 'Hide details' : 'Show details'}
          >
            {contextSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        // Empty state - full width centered
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center py-12 px-8 bg-slate-900 rounded-lg shadow max-w-md">
            <FileText className="mx-auto h-12 w-12 text-slate-500" />
            <h3 className="mt-2 text-sm font-medium text-slate-50">Your library is empty</h3>
            <p className="mt-1 text-sm text-slate-400">
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
              className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r border-slate-800 bg-slate-900 flex flex-col overflow-hidden ${
                projectsSidebarOpen
                  ? 'w-80 lg:w-1/4 min-w-[280px] opacity-100'
                  : 'w-0 opacity-0'
              }`}
            >
              <div className="flex-shrink-0 p-5 pb-0 space-y-4">
                {/* Header with Select Toggle */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-slate-50">Projects</h2>
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
                        ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-900/60'
                        : 'text-slate-400 hover:bg-slate-800'
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
                    <div className="flex items-center justify-between bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-500/30">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleAllProjectSelection}
                          className="p-1 hover:bg-blue-900/40 rounded transition-colors"
                        >
                          {selectedProjectIds.size === filteredAndSortedProjects.length && filteredAndSortedProjects.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : selectedProjectIds.size > 0 ? (
                            <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-600/20" />
                          ) : (
                            <Square className="w-4 h-4 text-blue-600" />
                          )}
                        </button>
                        <span className="text-sm text-blue-400 font-medium">
                          {selectedProjectIds.size} selected
                        </span>
                      </div>
                      {selectedProjectIds.size > 0 && (
                        <button
                          onClick={() => setSelectedProjectIds(new Set())}
                          className="text-xs text-blue-400 hover:text-blue-300"
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                  {/* Tier Filter */}
                  <div className="flex-1 min-w-[140px]">
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value as 'all' | 'basic' | 'pro' | 'premium')}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <div className="text-xs text-slate-400">
                  {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'project' : 'projects'}
                  {(searchTerm || tierFilter !== 'all' || typeFilter !== 'all') && ` (filtered from ${projects.length})`}
                </div>
              </div>

              {/* Scrollable Projects List */}
              <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
                {filteredAndSortedProjects.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="mx-auto h-8 w-8 text-slate-500 mb-2" />
                    <p className="text-sm">No projects found</p>
                    {(searchTerm || tierFilter !== 'all' || typeFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setTierFilter('all');
                          setTypeFilter('all');
                        }}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-300"
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
                      className={`group p-4 rounded-xl transition-colors cursor-pointer border overflow-hidden ${
                        selectionMode && isProjectSelected
                          ? 'bg-blue-900/20 border-blue-400'
                          : isActive
                          ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500/50'
                          : 'bg-slate-800/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
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
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </div>
                          )}
                          <h3 className={`text-sm leading-snug text-slate-50 truncate ${
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
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            {availableCount > 0 && (
                              <span className="flex items-center px-1.5 py-0.5 bg-green-900/20 text-green-400 rounded text-[10px] font-medium">
                                {availableCount} Assets
                              </span>
                            )}
                            {pendingFeatures.length > 0 && (
                              <span
                                className="flex items-center px-1.5 py-0.5 bg-amber-900/20 text-amber-400 rounded text-[10px] font-medium"
                                title={`Generating: ${pendingLabel}`}
                              >
                                Generating {pendingFeatures.length}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Row: Metadata & Actions */}
                      <div className="flex items-end justify-between pt-2 border-t border-slate-800">
                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
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
                              className="p-1 text-slate-500 hover:text-blue-600 transition-colors rounded hover:bg-blue-900/20"
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
                            className="p-1 text-slate-500 hover:text-red-600 transition-colors rounded hover:bg-red-900/20"
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

            {/* MIDDLE COLUMN: Main Content Stage */}
            <main
              className={`flex-1 min-w-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
                !projectsSidebarOpen && !contextSidebarOpen ? 'lg:w-full' : 'lg:w-1/2'
              }`}
            >
              {selectedProject ? (
                <div className="h-full flex flex-col bg-[#0F172A]">
                  {/* Global Project Header */}
                  <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80">
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: sidebar toggle + badges */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
                          className="hidden lg:flex p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                          title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
                        >
                          {projectsSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>
                        <div className="hidden sm:flex items-center gap-1.5">
                          {getTierBadge(selectedProject.performance_level)}
                          {selectedProject.project_type && getProjectTypeBadge(selectedProject.project_type)}
                        </div>
                      </div>

                      {/* Center: Project title pill */}
                      <div className="flex-1 flex justify-center min-w-0 px-2">
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
                            className="bg-slate-800/50 text-slate-300 px-4 py-1.5 rounded-lg text-sm border border-blue-500/50 outline-none max-w-2xl w-full text-center"
                          />
                        ) : (
                          <button
                            className="group flex items-center gap-2 bg-slate-800/50 text-slate-300 px-4 py-1.5 rounded-lg text-sm hover:bg-slate-800 transition-colors max-w-2xl truncate border border-transparent hover:border-slate-700"
                            onClick={() => { setEditingTitleValue(selectedProject.title); setEditingProjectTitle(true); }}
                            title="Click to rename"
                          >
                            <span className="truncate">{selectedProject.title}</span>
                            <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </button>
                        )}
                      </div>

                      {/* Right: Status + actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {selectedProject.status === 'completed' && (
                          <div className="hidden sm:flex relative group">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium cursor-default whitespace-nowrap">
                              <CheckCircle className="w-3 h-3 flex-shrink-0" />
                              <span>Processing complete</span>
                            </div>
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 w-56">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Completed Tasks</p>
                              <div className="space-y-1.5 text-xs text-slate-300">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                  <span>Transcription (AssemblyAI)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                  <span>Speaker Attribution (AI Enhanced)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                  <span>Insight Extraction</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {selectedProject.status === 'processing' && (
                          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium whitespace-nowrap">
                            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            <span>{getProcessingStage(selectedProject)}</span>
                          </div>
                        )}
                        <DropdownMenu
                          align="right"
                          trigger={
                            <button
                              type="button"
                              className="p-1.5 text-slate-500 hover:text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
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
                        <button
                          onClick={() => handleGenerateContent(selectedProject)}
                          disabled={generatingProjects.has(selectedProject.id)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            generatingProjects.has(selectedProject.id)
                              ? 'bg-blue-900/20 text-blue-400'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {generatingProjects.has(selectedProject.id) ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                          ) : (
                            <><Zap className="w-4 h-4" />Generate</>
                          )}
                        </button>
                        <button
                          onClick={() => setContextSidebarOpen(!contextSidebarOpen)}
                          className="hidden lg:flex p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                          title={contextSidebarOpen ? 'Hide details panel' : 'Show details panel'}
                        >
                          {contextSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Transcript panel (full width) */}
                  <div className="flex flex-col min-h-0 flex-1 overflow-hidden">

                    {/* Transcript Panel */}
                    <div className="flex flex-col min-h-0 overflow-hidden">
                      {/* Panel Header */}
                      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-blue-400" />
                          <span className="text-slate-100 font-semibold text-sm">Transcript</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {parsedSpeakerData && (
                            <>
                              <label className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                                showTimestamps ? 'border-blue-800/30 bg-blue-900/20 text-blue-400' : 'border-slate-700 text-slate-500 hover:text-slate-400'
                              }`} title="Toggle timestamps">
                                <input type="checkbox" checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} className="sr-only" />
                                <Clock className="w-3 h-3" />
                              </label>
                              <button
                                onClick={() => setReaderView(v => !v)}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                  readerView ? 'border-blue-800/30 bg-blue-900/20 text-blue-400' : 'border-slate-700 text-slate-500 hover:text-slate-400'
                                }`}
                                title="Reader view"
                              >
                                <BookOpen className="w-3 h-3" />
                              </button>
                              <select
                                value={selectedSpeaker || ''}
                                onChange={(e) => setSelectedSpeaker(e.target.value || null)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors bg-transparent ${
                                  selectedSpeaker
                                    ? 'border-blue-800/30 bg-blue-900/20 text-blue-400'
                                    : 'border-slate-700 text-slate-500 hover:text-slate-400'
                                }`}
                              >
                                <option value="">All speakers</option>
                                {Object.keys(parsedSpeakerData.speakers || {}).map((speakerId) => (
                                  <option key={speakerId} value={speakerId}>
                                    {getSpeakerDisplayName(parsedSpeakerData.speakers[speakerId])}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Status notices */}
                      {(isProjectRefreshing || (projectPreviousStatus === 'processing' && selectedProject.status === 'completed')) && (
                        <div className="flex-shrink-0 px-4 py-2 bg-slate-900 border-b border-slate-800">
                          {isProjectRefreshing && (
                            <div className="flex items-center gap-2 text-blue-400 text-sm">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Refreshing speaker data...</span>
                            </div>
                          )}
                          {projectPreviousStatus === 'processing' && selectedProject.status === 'completed' && (
                            <div className="flex items-center gap-2 text-green-400 text-sm">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Processing complete!</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Audio Player */}
                      {audioUrl && (
                        <div className="flex-shrink-0 px-4 py-2 bg-slate-900 border-b border-slate-800 flex justify-end">
                          <audio ref={audioElementRef} src={audioUrl} controls className="h-8 w-48" preload="metadata" />
                        </div>
                      )}

                      {/* Transcript Body */}
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        {parsedSpeakerData ? (
                          readerView ? (
                            <div className="px-4 py-4 divide-y divide-slate-800/70">
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
                                    <span className="flex-shrink-0 text-[11px] font-mono text-slate-500 w-9 select-none">{timestamp}</span>
                                    <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>{speakerName}</span>
                                    <span className="text-[14px] text-slate-300 leading-relaxed">{segment.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <ConversationView
                              speakerData={parsedSpeakerData}
                              transcriptionText={selectedProject.transcription_text || ''}
                              projectId={selectedProject.id}
                              userTier={selectedProject.performance_level || 'basic'}
                              onSpeakerUpdate={(updatedSpeakerData) => {
                                setSelectedProject(prev => prev ? { ...prev, speaker_data: updatedSpeakerData } : null);
                                setProjects(prev => prev.map(project =>
                                  project.id === selectedProject.id ? { ...project, speaker_data: updatedSpeakerData } : project
                                ));
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
                              selectedSegments={selectedSegments}
                              onToggleSegmentSelection={handleToggleSegmentSelection}
                              scrollToSegmentIndex={scrollToSegmentIndex}
                              onConfirmSegment={handleConfirmSegment}
                            />
                          )
                        ) : selectedProject.transcription_text ? (
                          <div className="px-4 py-4">
                            <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {selectedProject.transcription_text}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center py-12 text-slate-400">
                              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-500" />
                              <p className="text-sm">Processing transcription...</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Transcript Footer */}
                      <div className="flex-shrink-0 border-t border-slate-800 px-4 py-3">
                        <p className="text-slate-500 text-xs">
                          {parsedSpeakerData?.detectionMetadata?.totalSpeakers ?? 0} speakers detected
                          {(selectedProject.audio_duration || selectedProject.audio_duration_seconds)
                            ? ` | ${formatDuration(selectedProject.audio_duration || selectedProject.audio_duration_seconds || 0)}`
                            : ''
                          }
                          {accuracyPercent !== null ? ` · ${accuracyPercent.toFixed(1)}% accuracy` : ''}
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                /* Empty state when no project selected */
                <div className="h-full flex items-center justify-center bg-[#0F172A]">
                  <div className="text-center py-12 px-6">
                    <FileText className="mx-auto h-12 w-12 text-slate-600" />
                    <h3 className="mt-3 text-sm font-medium text-slate-50">
                      Select a project
                    </h3>
                    <p className="mt-1 text-sm text-slate-400 max-w-xs">
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
              segments={parsedSpeakerData?.segments}
              selectedSegments={selectedSegments}
              hasUncertainSegments={hasUncertainSegments}
              onSelectAllUncertain={handleSelectAllUncertain}
              onClearSelection={() => setSelectedSegments(new Set())}
              onToggleSegmentSelection={handleToggleSegmentSelection}
              onScrollToSegment={(idx) => {
                setScrollToSegmentIndex(null);
                setTimeout(() => setScrollToSegmentIndex(idx), 0);
              }}
              onConfirmSegment={handleConfirmSegment}
              onSegmentReassign={handleSidebarSegmentReassign}
              onSpeakerAdd={handleAddSpeaker}
              onSpeakerDelete={handleDeleteSpeaker}
              aiTouchupLoading={aiTouchupLoading}
              onAiTouchup={handleAiTouchup}
              aiTouchupResult={aiTouchupResult}
              touchupPreview={touchupPreview}
              applyingTouchup={applyingTouchup}
              onApplyTouchup={handleApplyTouchup}
              onTogglePreviewItem={handleTogglePreviewItem}
              onDismissPreview={() => setTouchupPreview(null)}
              onSpeakerRename={async (speakerId, newName) => {
                if (!selectedProject?.id) return;
                const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'rename', newName }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (data.updatedSpeakerData) {
                  setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
                  setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
                }
              }}
              onSpeakerRoleChange={async (speakerId, newRole) => {
                if (!selectedProject?.id) return;
                const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'set_role', newRole }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (data.updatedSpeakerData) {
                  setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
                  setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, speaker_data: data.updatedSpeakerData } : p));
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
              outputs={outputs}
              onCopyOutput={handleCopyOutput}
              onDownloadOutput={handleDownloadOutput}
              onDeleteOutput={handleDeleteOutput}
              deletingOutput={deletingOutput}
              onGenerateContent={() => {
                if (selectedProject) {
                  setSelectedProjectForGeneration(selectedProject);
                  setShowContentSelection(true);
                }
              }}
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
