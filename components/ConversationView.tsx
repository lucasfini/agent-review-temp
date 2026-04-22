"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import { SpeakerSegment } from '@/lib/types';
import { formatTime } from '@/lib/time-utils';
import { useUserPrefs } from '@/lib/hooks/useUserPrefs';
import { formatReviewReason, getReviewItemsFromSpeakerData, getReviewSegmentIndicesFromSpeakerData } from '@/lib/speaker-review';
import {
  User,
  MessageCircle,
  Edit2,
  Check,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  TranscriptHighlight,
  scrollToHighlight,
  type Insight,
  type Category
} from '@/components/insights';
import type { AudioPlayerRef } from '@/lib/hooks/useSpeakerSample';
import { toast } from 'sonner';

interface ConversationViewProps {
  speakerData: {
    segments: SpeakerSegment[];
    speakers: Record<string, any>;
    detectionMetadata: {
      totalSpeakers: number;
      totalSegments: number;
      processedAt: string;
      error?: string;
    };
  };
  transcriptionText: string;
  className?: string;
  projectId?: string;
  onSpeakerUpdate?: (updatedSpeakerData: any) => void;
  filteredSpeakers?: Array<{
    speakerId: string;
    filterReason?: 'ad_read' | 'intro' | 'outro' | 'promo' | 'venue_announcement';
    confidence: number;
    evidence: string;
  }>;
  // External control for insights sidebar
  insightsSidebarOpen?: boolean;
  onInsightsSidebarChange?: (open: boolean) => void;
  onInsightsStatusChange?: (status: {
    count: number;
    loading: boolean;
    generating: boolean;
    refreshing: boolean;
  }) => void;
  onInsightsDataChange?: (insights: Array<{
    id: string;
    title: string;
    category: 'concept' | 'person' | 'tool';
    definition: string;
    significance: string;
    sources: Array<{ title: string; url: string; description?: string; type?: string }>;
    personProfile?: {
      whoTheyAre?: string;
      currentWork?: string;
      notableBackground?: string;
      whyRelevant?: string;
    };
    conceptProfile?: {
      plainEnglish?: string;
      coreMechanism?: string;
      inThisEpisode?: string;
      whyRelevant?: string;
      relatedIdeas?: string[];
    };
    toolProfile?: {
      whatItIs?: string;
      primaryUseCase?: string;
      whoUsesIt?: string;
      whyRelevant?: string;
      alternatives?: string[];
    };
    matchText?: string;
    matchVariants?: string[];
  }>) => void;
  triggerInsightGeneration?: number;
  triggerInsightRefresh?: number;
  insightsRefreshToken?: number;
  // Audio player ref for speaker sample playback
  audioPlayerRef?: RefObject<AudioPlayerRef | null>;
  // Raw audio element ref for transcript sync
  audioElementRef?: RefObject<HTMLAudioElement | null>;
  // Audio src — used as a dep so timeupdate effect re-runs when audio becomes available
  audioSrc?: string | null;
  showTimestamps?: boolean;
  selectedSpeaker?: string | null;
  // Lifted selection state (from ProjectsPage)
  selectedSegments?: Set<number>;
  onToggleSegmentSelection?: (index: number) => void;
  // Scroll to a segment triggered from the review sidebar
  scrollToSegmentIndex?: number | null;
  // Callback after a segment is confirmed
  onConfirmSegment?: (index: number) => void;
  onTranscriptInsightClick?: (insightId: string) => void;
}

interface InsightCard {
  entityId: string;
  label: string;
  category: 'person' | 'org' | 'concept' | 'product' | 'social' | 'tool';
  matchText: string;
  matchVariants?: string[];
  transcriptExcerpt: string;
  summary: string;
  confidence: number;
  sources?: Array<{ title: string; url?: string; type?: string; description?: string }>;
  updatedAt: string;
  status?: 'auto_detected' | 'user_highlight' | 'refreshing';
  costUsd?: number;
  origin?: 'speaker' | 'entity' | 'manual';
  // Premium-only fields
  relatedConcepts?: string[];
  whyItMatters?: string;
  relationships?: Array<{ type: string; entityId: string; description: string }>;
  personProfile?: {
    whoTheyAre?: string;
    currentWork?: string;
    notableBackground?: string;
    whyRelevant?: string;
  };
  conceptProfile?: {
    plainEnglish?: string;
    coreMechanism?: string;
    inThisEpisode?: string;
    whyRelevant?: string;
    relatedIdeas?: string[];
  };
  toolProfile?: {
    whatItIs?: string;
    primaryUseCase?: string;
    whoUsesIt?: string;
    whyRelevant?: string;
    alternatives?: string[];
  };
}

const resolveSpeakerId = (segment: SpeakerSegment) => segment.finalSpeakerId || segment.speakerId;

export default function ConversationView({
  speakerData,
  transcriptionText,
  className = "",
  projectId,
  onSpeakerUpdate,
  filteredSpeakers = [],
  insightsSidebarOpen,
  onInsightsSidebarChange,
  onInsightsStatusChange,
  onInsightsDataChange,
  triggerInsightGeneration,
  triggerInsightRefresh,
  insightsRefreshToken,
  audioPlayerRef,
  audioElementRef,
  audioSrc,
  showTimestamps: controlledShowTimestamps,
  selectedSpeaker: controlledSelectedSpeaker,
  selectedSegments: externalSelectedSegments,
  onToggleSegmentSelection,
  scrollToSegmentIndex,
  onConfirmSegment,
  onTranscriptInsightClick,
}: ConversationViewProps) {
  const showTimestamps = controlledShowTimestamps ?? true;
  const selectedSpeaker = controlledSelectedSpeaker ?? null;
  const { formatDate: formatUserDate } = useUserPrefs();
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [savingSpeaker, setSavingSpeaker] = useState<string | null>(null);
  const [pendingDeleteSpeaker, setPendingDeleteSpeaker] = useState<string | null>(null);
  const [deletingSpeaker, setDeletingSpeaker] = useState<string | null>(null);
  const [deleteAction, setDeleteAction] = useState<'delete' | 'reassign'>('reassign');
  const [reassignToSpeaker, setReassignToSpeaker] = useState<string>('');
  const [segmentReassigning, setSegmentReassigning] = useState<number | null>(null);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const [internalShowInlineInsights, setInternalShowInlineInsights] = useState(false);
  const reviewSegmentIndexSet = useMemo(
    () => new Set(getReviewSegmentIndicesFromSpeakerData(speakerData)),
    [speakerData]
  );
  const reviewItemReasonMap = useMemo(
    () => new Map(getReviewItemsFromSpeakerData(speakerData).map((item) => [item.index, item])),
    [speakerData]
  );


  // Use external control if provided, otherwise internal state
  const showInlineInsights = insightsSidebarOpen !== undefined ? insightsSidebarOpen : internalShowInlineInsights;
  const setShowInlineInsights = onInsightsSidebarChange || setInternalShowInlineInsights;

  // New state for AI-powered insights from database
  const [inlineInsightPresets, setInlineInsightPresets] = useState<InsightCard[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insightsRetryTick, setInsightsRetryTick] = useState(0);
  const insightsRetryAttemptRef = useRef(0);
  const insightsRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    insightsRetryAttemptRef.current = 0;
    setInsightsRetryTick(0);
    if (insightsRetryTimeoutRef.current) {
      clearTimeout(insightsRetryTimeoutRef.current);
      insightsRetryTimeoutRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (insightsRetryTimeoutRef.current) {
        clearTimeout(insightsRetryTimeoutRef.current);
      }
    };
  }, []);

  // Helper to check if a speaker is filtered
  const getFilterInfo = (speakerId: string) => {
    return filteredSpeakers.find(f => f.speakerId === speakerId);
  };

  // Helper to format filter reason for display
  const formatFilterReason = (reason?: string) => {
    if (!reason) return '';
    return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleEditSpeaker = (speakerId: string, currentName: string) => {
    setEditingSpeaker(speakerId);
    setEditingName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingSpeaker(null);
    setEditingName('');
  };

  const handleSaveSpeaker = async (speakerId: string) => {
    if (!projectId || !editingName.trim()) return;

    setSavingSpeaker(speakerId);
    
    try {
      // Create updated speaker data
      const updatedSpeakerData = {
        ...speakerData,
        speakers: {
          ...speakerData.speakers,
          [speakerId]: {
            ...speakerData.speakers[speakerId],
            finalName: editingName.trim(),
            customName: editingName.trim() // Flag to indicate user customization
          }
        }
      };

      // Save to backend
      const response = await fetch(`/api/projects/${projectId}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerId,
          newName: editingName.trim(),
          speakerData: updatedSpeakerData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update speaker name');
      }

      // Update parent component
      if (onSpeakerUpdate) {
        onSpeakerUpdate(updatedSpeakerData);
      }

      setEditingSpeaker(null);
      setEditingName('');
    } catch (error) {
      console.error('Error updating speaker name:', error);
      toast.error('Failed to update the speaker name. Please try again.');
    } finally {
      setSavingSpeaker(null);
    }
  };

  const handleDeleteSpeakerClick = (speakerId: string) => {
    if (pendingDeleteSpeaker === speakerId) {
      setPendingDeleteSpeaker(null);
      return;
    }
    setPendingDeleteSpeaker(speakerId);
    const otherSpeakers = Object.keys(speakerData.speakers).filter(id => id !== speakerId);
    if (otherSpeakers.length > 0) {
      setReassignToSpeaker(otherSpeakers[0]);
      setDeleteAction('reassign');
    } else {
      setReassignToSpeaker('');
      setDeleteAction('delete');
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectId || !pendingDeleteSpeaker) return;

    try {
      setDeletingSpeaker(pendingDeleteSpeaker);
      const response = await fetch(`/api/projects/${projectId}/speakers/${pendingDeleteSpeaker}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: deleteAction,
          reassignToSpeakerId: deleteAction === 'reassign' ? reassignToSpeaker : undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to delete speaker');
      }

      const data = await response.json();
      setPendingDeleteSpeaker(null);
      if (data.updatedSpeakerData && onSpeakerUpdate) {
        onSpeakerUpdate(data.updatedSpeakerData);
      }
    } catch (error) {
      console.error('Error deleting speaker:', error);
      toast.error('Failed to update the speaker roster. Please try again.');
    } finally {
      setDeletingSpeaker(null);
    }
  };

  const handleSegmentReassign = async (segmentIndex: number, newSpeakerId: string) => {
    if (!projectId || !newSpeakerId) return;

    try {
      setSegmentReassigning(segmentIndex);
      const response = await fetch(`/api/projects/${projectId}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segmentIndices: [segmentIndex],
          newSpeakerId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to reassign segment');
      }

      const data = await response.json();
      if (data.updatedSpeakerData && onSpeakerUpdate) {
        onSpeakerUpdate(data.updatedSpeakerData);
      }
      setSegmentReassigning(null);
    } catch (error) {
      console.error('Error reassigning segment:', error);
      toast.error('Failed to reassign the segment. Please try again.');
    } finally {
      setSegmentReassigning(null);
    }
  };

  const handleConfirmSegment = async (segmentIndex: number) => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: [segmentIndex], confirmOnly: true })
      });
      if (!response.ok) throw new Error('Failed to confirm segment');
      const data = await response.json();
      if (data.updatedSpeakerData && onSpeakerUpdate) {
        onSpeakerUpdate(data.updatedSpeakerData);
      }
      onConfirmSegment?.(segmentIndex);
    } catch (error) {
      console.error('Error confirming segment:', error);
      toast.error('Failed to confirm the segment. Please try again.');
    }
  };

  // Shift feature removed

  if (!speakerData || !speakerData.segments || speakerData.segments.length === 0) {
    return (
      <div className={`p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg ${className}`}>
        <div className="flex items-center space-x-3 text-yellow-700 dark:text-yellow-300">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Conversation Format Processing</span>
        </div>
        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-3 leading-relaxed">
          Speaker detection is being processed in the background. 
          Please refresh the page in a few moments to see the conversation format.
        </p>
      </div>
    );
  }

  // Check if speaker analysis had errors
  if (speakerData.detectionMetadata?.error) {
    return (
      <div className={`p-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-lg ${className}`}>
        <div className="flex items-center space-x-3 text-orange-700 dark:text-orange-800">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Conversation Format Partially Available</span>
        </div>
        <p className="text-sm text-orange-600 dark:text-orange-400 mt-3 leading-relaxed">
          Speaker segments are available but name detection failed. 
          Speakers will be shown as "Speaker 1", "Speaker 2", etc.
        </p>
      </div>
    );
  }

  const { segments, speakers, detectionMetadata } = speakerData;
  const speakerList = Object.keys(speakers);

  // Filter segments by selected speaker
  const segmentsWithIndex = useMemo(
    () => segments.map((segment, index) => ({ segment, index })),
    [segments]
  );

  const filteredSegments = useMemo(() => {
    if (selectedSpeaker) {
      return segmentsWithIndex.filter(({ segment }) => resolveSpeakerId(segment) === selectedSpeaker);
    }
    return segmentsWithIndex;
  }, [segmentsWithIndex, selectedSpeaker]);

  // Scroll to a segment when triggered from the review sidebar
  useEffect(() => {
    if (scrollToSegmentIndex == null) return;
    document.getElementById(`segment-${scrollToSegmentIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollToSegmentIndex]);

  // Track which segment is currently being spoken during audio playback
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // Scroll container ref + user-scroll detection
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  const seekAndPlay = useCallback((time: number) => {
    const audio = audioElementRef?.current;
    if (!audio) return;
    audio.currentTime = time;
    // Resume auto-scroll when user clicks a segment
    isUserScrollingRef.current = false;
    setAutoScrollPaused(false);
    audio.play().catch(() => undefined);
  }, [audioElementRef]);

  const resumeAutoScroll = useCallback(() => {
    isUserScrollingRef.current = false;
    setAutoScrollPaused(false);
  }, []);

  useEffect(() => {
    const audio = audioElementRef?.current;
    if (!audio) return;
    const segments = speakerData?.segments;
    if (!segments?.length) return;

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      let found: number | null = null;
      for (let i = 0; i < segments.length; i++) {
        if (t >= segments[i].startTime && t <= segments[i].endTime) {
          found = i;
          break;
        }
      }
      setActiveSegmentIndex(prev => (prev === found ? prev : found));
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, [audioElementRef, speakerData?.segments, audioSrc]);

  // Auto-scroll to the active segment while audio is playing
  useEffect(() => {
    if (activeSegmentIndex == null) return;
    if (autoScrollPaused || isUserScrollingRef.current) return;
    document.getElementById(`segment-${activeSegmentIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSegmentIndex, autoScrollPaused]);

  // Detect manual user scrolling to pause auto-scroll
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) return;
    const onUserScroll = () => {
      isUserScrollingRef.current = true;
      setAutoScrollPaused(true);
    };
    container.addEventListener('wheel', onUserScroll, { passive: true });
    container.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', onUserScroll);
      container.removeEventListener('touchmove', onUserScroll);
    };
  }, []);

  // Fetch AI-powered insights from database
  useEffect(() => {
    async function fetchInsights() {
      if (!projectId) {
        setInsightsLoading(false);
        return;
      }

      try {
        setInsightsLoading(true);
        setInsightsError(null);

        const response = await fetch(`/api/insights/${projectId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch insights');
        }

        // Transform database insights to InsightCard format
        const transformedInsights: InsightCard[] = (data.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept' | 'tool',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: insight.full_explanation || insight.simple_definition || '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          relatedConcepts: insight.related_concepts || undefined,
          whyItMatters: insight.why_it_matters || undefined,
          relationships: insight.relationships || undefined,
          personProfile: insight.person_profile ? {
            whoTheyAre: insight.person_profile.who_they_are,
            currentWork: insight.person_profile.current_work,
            notableBackground: insight.person_profile.notable_background,
            whyRelevant: insight.person_profile.why_relevant,
          } : undefined,
          conceptProfile: insight.concept_profile ? {
            plainEnglish: insight.concept_profile.plain_english,
            coreMechanism: insight.concept_profile.core_mechanism,
            inThisEpisode: insight.concept_profile.in_this_episode,
            whyRelevant: insight.concept_profile.why_relevant,
            relatedIdeas: insight.concept_profile.related_ideas || [],
          } : undefined,
          toolProfile: insight.tool_profile ? {
            whatItIs: insight.tool_profile.what_it_is,
            primaryUseCase: insight.tool_profile.primary_use_case,
            whoUsesIt: insight.tool_profile.who_uses_it,
            whyRelevant: insight.tool_profile.why_relevant,
            alternatives: insight.tool_profile.alternatives || [],
          } : undefined,
        }));

        setInlineInsightPresets(transformedInsights);

        if (insightsRetryTimeoutRef.current) {
          clearTimeout(insightsRetryTimeoutRef.current);
          insightsRetryTimeoutRef.current = null;
        }

        if (
          transformedInsights.length === 0 &&
          insightsRetryAttemptRef.current < 20
        ) {
          insightsRetryAttemptRef.current += 1;
          insightsRetryTimeoutRef.current = setTimeout(() => {
            setInsightsRetryTick((prev) => prev + 1);
          }, 5000);
        } else {
          insightsRetryAttemptRef.current = 0;
        }
      } catch (error) {
        console.error('[Insights] Failed to fetch:', error);
        setInsightsError(error instanceof Error ? error.message : 'Unknown error');
        // Fallback to empty array if fetch fails
        setInlineInsightPresets([]);
      } finally {
        setInsightsLoading(false);
      }
    }

    fetchInsights();
  }, [projectId, insightsRefreshToken, insightsRetryTick]);

  const [activeInsightIds, setActiveInsightIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setActiveInsightIds(prev => {
      if (!inlineInsightPresets.length) {
        return new Set();
      }
      if (prev.size === 0) {
        return new Set(inlineInsightPresets.map(card => card.entityId));
      }
      const next = new Set<string>();
      inlineInsightPresets.forEach(card => {
        if (prev.has(card.entityId)) {
          next.add(card.entityId);
        }
      });
      if (next.size === 0) {
        inlineInsightPresets.forEach(card => next.add(card.entityId));
      }
      return next;
    });
  }, [inlineInsightPresets]);

  const activeInlineInsights = useMemo(
    () => inlineInsightPresets.filter(card => activeInsightIds.has(card.entityId)),
    [inlineInsightPresets, activeInsightIds]
  );

  const activeInsightCard = useMemo(() => {
    if (!activeInsightId) return null;
    return inlineInsightPresets.find(card => card.entityId === activeInsightId) || null;
  }, [activeInsightId, inlineInsightPresets]);

  // Transform old InsightCard format to new Insight format for the new components
  const transformedInsights: Insight[] = useMemo(() => {
    return activeInlineInsights.map((card): Insight => {
      // Map categories to: person, concept, or tool
      let category: Category = 'concept';
      if (card.category === 'person') {
        category = 'person';
      } else if (card.category === 'tool' || card.category === 'org' || card.category === 'product') {
        category = 'tool';
      }
      // 'concept' and 'social' both map to 'concept'

      return {
        id: card.entityId,
        title: card.label,
        category,
        definition: card.summary || card.transcriptExcerpt || '',
        significance: card.whyItMatters || '',
        sources: (card.sources || []).map(s => ({
          title: s.title,
          url: s.url || '#',
          description: s.description,
          type: s.type,
        })),
        personProfile: card.personProfile,
        conceptProfile: card.conceptProfile,
        toolProfile: card.toolProfile,
        matchText: card.matchText,
        matchVariants: card.matchVariants,
      };
    });
  }, [activeInlineInsights]);

  // Handler for insight clicks - syncs sidebar and transcript
  const handleInsightClick = useCallback((insightId: string) => {
    setActiveInsightId((prev) => (prev === insightId ? null : insightId));
    onTranscriptInsightClick?.(insightId);
  }, [onTranscriptInsightClick]);

  const togglePresetInsight = (entityId: string) => {
    setActiveInsightIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-insight-trigger="true"]') || target.closest('[data-insight-panel="true"]')) {
        return;
      }
      setActiveInsightId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveInsightId(null);
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (activeInsightId && !activeInsightIds.has(activeInsightId)) {
      setActiveInsightId(null);
    }
  }, [activeInsightIds, activeInsightId]);


  const handleRefreshInsights = useCallback(async () => {
    if (!projectId || refreshingInsights) {
      return;
    }

    try {
      setRefreshingInsights(true);

      const response = await fetch(`/api/insights/${projectId}/refresh`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh insights');
      }

      // Refetch insights after successful refresh
      const fetchResponse = await fetch(`/api/insights/${projectId}`);
      const fetchData = await fetchResponse.json();

      if (fetchResponse.ok) {
        const transformedInsights: InsightCard[] = (fetchData.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept' | 'tool',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: insight.full_explanation || insight.simple_definition || '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          relatedConcepts: insight.related_concepts || undefined,
          whyItMatters: insight.why_it_matters || undefined,
          relationships: insight.relationships || undefined,
          personProfile: insight.person_profile ? {
            whoTheyAre: insight.person_profile.who_they_are,
            currentWork: insight.person_profile.current_work,
            notableBackground: insight.person_profile.notable_background,
            whyRelevant: insight.person_profile.why_relevant,
          } : undefined,
          conceptProfile: insight.concept_profile ? {
            plainEnglish: insight.concept_profile.plain_english,
            coreMechanism: insight.concept_profile.core_mechanism,
            inThisEpisode: insight.concept_profile.in_this_episode,
            whyRelevant: insight.concept_profile.why_relevant,
            relatedIdeas: insight.concept_profile.related_ideas || [],
          } : undefined,
          toolProfile: insight.tool_profile ? {
            whatItIs: insight.tool_profile.what_it_is,
            primaryUseCase: insight.tool_profile.primary_use_case,
            whoUsesIt: insight.tool_profile.who_uses_it,
            whyRelevant: insight.tool_profile.why_relevant,
            alternatives: insight.tool_profile.alternatives || [],
          } : undefined,
        }));

        setInlineInsightPresets(transformedInsights);
      }

      console.log(`[Insights] Refreshed: ${data.insight_count} insights`);
    } catch (error) {
      console.error('[Insights] Refresh failed:', error);
      toast.error('Failed to refresh insights. Please try again.');
    } finally {
      setRefreshingInsights(false);
    }
  }, [projectId, refreshingInsights]);

  // Report status changes to parent
  useEffect(() => {
    if (onInsightsStatusChange) {
      onInsightsStatusChange({
        count: inlineInsightPresets.length,
        loading: insightsLoading,
        generating: generatingInsights,
        refreshing: refreshingInsights,
      });
    }
  }, [inlineInsightPresets.length, insightsLoading, generatingInsights, refreshingInsights, onInsightsStatusChange]);

  // Report insights data changes to parent (for ContextSidebar)
  // Guard with !insightsLoading to prevent firing with [] during initial mount,
  // which would wipe out the project page's already-fetched insights data.
  useEffect(() => {
    if (onInsightsDataChange && !insightsLoading) {
      // Map InsightCard to Insight format expected by ContextSidebar
      const mappedInsights = inlineInsightPresets.map(card => {
        // Map category to allowed types
        let category: 'concept' | 'person' | 'tool' = 'concept';
        if (card.category === 'person') category = 'person';
        else if (card.category === 'tool' || card.category === 'org' || card.category === 'product') category = 'tool';

        return {
          id: card.entityId,
          title: card.label,
          category,
          definition: card.summary,
          significance: card.whyItMatters || card.transcriptExcerpt || '',
          sources: (card.sources || []).map(s => ({
            title: s.title,
            url: s.url || '',
            description: s.description,
            type: s.type,
          })),
          personProfile: card.personProfile,
          conceptProfile: card.conceptProfile,
          toolProfile: card.toolProfile,
          matchText: card.matchText,
          matchVariants: card.matchVariants,
        };
      });
      onInsightsDataChange(mappedInsights);
    }
  }, [inlineInsightPresets, onInsightsDataChange, insightsLoading]);

  // Generate insights for the first time
  const handleGenerateInsights = useCallback(async () => {
    if (!projectId || generatingInsights) {
      return;
    }

    try {
      setGeneratingInsights(true);

      // Call the refresh endpoint which also handles initial generation
      const response = await fetch(`/api/insights/${projectId}/refresh`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate insights');
      }

      // Fetch the newly generated insights
      const fetchResponse = await fetch(`/api/insights/${projectId}`);
      const fetchData = await fetchResponse.json();

      if (fetchResponse.ok) {
        const transformedInsights: InsightCard[] = (fetchData.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept' | 'tool',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: insight.full_explanation || insight.simple_definition || '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          relatedConcepts: insight.related_concepts || undefined,
          whyItMatters: insight.why_it_matters || undefined,
          relationships: insight.relationships || undefined,
          personProfile: insight.person_profile ? {
            whoTheyAre: insight.person_profile.who_they_are,
            currentWork: insight.person_profile.current_work,
            notableBackground: insight.person_profile.notable_background,
            whyRelevant: insight.person_profile.why_relevant,
          } : undefined,
          conceptProfile: insight.concept_profile ? {
            plainEnglish: insight.concept_profile.plain_english,
            coreMechanism: insight.concept_profile.core_mechanism,
            inThisEpisode: insight.concept_profile.in_this_episode,
            whyRelevant: insight.concept_profile.why_relevant,
            relatedIdeas: insight.concept_profile.related_ideas || [],
          } : undefined,
          toolProfile: insight.tool_profile ? {
            whatItIs: insight.tool_profile.what_it_is,
            primaryUseCase: insight.tool_profile.primary_use_case,
            whoUsesIt: insight.tool_profile.who_uses_it,
            whyRelevant: insight.tool_profile.why_relevant,
            alternatives: insight.tool_profile.alternatives || [],
          } : undefined,
        }));

        setInlineInsightPresets(transformedInsights);
      }

      console.log(`[Insights] Generated: ${data.insight_count} insights`);
    } catch (error) {
      console.error('[Insights] Generation failed:', error);
      toast.error('Failed to generate insights. Please try again.');
    } finally {
      setGeneratingInsights(false);
    }
  }, [projectId, generatingInsights]);

  // Track previous trigger value to detect changes
  const prevTriggerRef = useRef<number | undefined>(undefined);

  // Trigger generation from external control
  useEffect(() => {
    // Only trigger if the value actually changed (and is greater than 0)
    if (
      triggerInsightGeneration !== undefined &&
      triggerInsightGeneration > 0 &&
      triggerInsightGeneration !== prevTriggerRef.current &&
      !generatingInsights &&
      !insightsLoading &&
      inlineInsightPresets.length === 0
    ) {
      handleGenerateInsights();
    }
    prevTriggerRef.current = triggerInsightGeneration;
  }, [triggerInsightGeneration, generatingInsights, insightsLoading, inlineInsightPresets.length, handleGenerateInsights]);

  const prevRefreshTriggerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (
      triggerInsightRefresh !== undefined &&
      triggerInsightRefresh > 0 &&
      triggerInsightRefresh !== prevRefreshTriggerRef.current &&
      !refreshingInsights &&
      !generatingInsights
    ) {
      handleRefreshInsights();
    }
    prevRefreshTriggerRef.current = triggerInsightRefresh;
  }, [triggerInsightRefresh, refreshingInsights, generatingInsights, handleRefreshInsights]);

  // New highlight function using the redesigned TranscriptHighlight component
  const highlightSegmentText = (text: string): ReactNode => {
    if (!transformedInsights.length) {
      return text;
    }

    // Build matches
    const matches: Array<{
      start: number;
      end: number;
      insight: Insight;
      matchText: string;
    }> = [];

    transformedInsights.forEach((insight) => {
      const targets = [insight.matchText || insight.title];
      if (insight.matchVariants) {
        targets.push(...insight.matchVariants);
      }

      targets.forEach((target) => {
        if (!target) return;
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            insight,
            matchText: match[0],
          });

          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      });
    });

    if (!matches.length) {
      return text;
    }

    // Sort and remove overlaps
    const sorted = matches.sort((a, b) => a.start - b.start);
    const nonOverlapping: typeof matches = [];

    for (const match of sorted) {
      const last = nonOverlapping[nonOverlapping.length - 1];
      if (!last || match.start >= last.end) {
        nonOverlapping.push(match);
      }
    }

    // Build nodes
    const nodes: ReactNode[] = [];
    let cursor = 0;

    nonOverlapping.forEach((match, index) => {
      if (match.start > cursor) {
        nodes.push(
          <span key={`text-${index}-${cursor}`}>
            {text.slice(cursor, match.start)}
          </span>
        );
      }

      nodes.push(
        <TranscriptHighlight
          key={`insight-${match.insight.id}-${index}`}
          text={match.matchText}
          insight={match.insight}
          isActive={activeInsightId === match.insight.id}
          onClick={handleInsightClick}
        />
      );

      cursor = match.end;
    });

    if (cursor < text.length) {
      nodes.push(
        <span key={`text-tail-${cursor}`}>{text.slice(cursor)}</span>
      );
    }

    return nodes;
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Conversation Segments */}
      <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2" data-tour="conversation-feed">
        {/* Resume auto-scroll button — sticky at top when user has scrolled away */}
        {autoScrollPaused && (
          <div className="sticky top-2 z-10 flex justify-center mb-2 pointer-events-none">
            <button
              onClick={resumeAutoScroll}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              ↓ Resume follow-along
            </button>
          </div>
        )}
        <div className="space-y-4">
        {filteredSegments.map(({ segment, index: segmentIndex }, loopIdx) => {
          const segmentSpeakerId = resolveSpeakerId(segment);
          const speaker = speakers[segmentSpeakerId];

          // Safety check: skip segments with missing speaker data (can happen during reassignment)
          if (!speaker) {
            console.warn(`Speaker ${segmentSpeakerId} not found in speakers record`);
            return null;
          }

          const speakerName = getSpeakerDisplayName(speaker) || 'Unknown Speaker';
          const speakerRoleLabel = formatRoleLabel(speaker.role);
          const roleTooltip = speaker.roleSummary || (speaker.autoRoleAssigned ? 'Automatically assigned role' : '');
          const filterInfo = getFilterInfo(segmentSpeakerId);
          const isFiltered = !!filterInfo;
          const colorClass = getSpeakerColor(segmentSpeakerId);
          const duration = segment.endTime - segment.startTime;
          const isSelected = externalSelectedSegments?.has(segmentIndex) ?? false;
          const isActive = activeSegmentIndex === segmentIndex;

          // Additional safety: if speakerName is still empty/undefined, skip this segment
          if (!speakerName || speakerName.trim() === '') {
            console.warn(`Empty speaker name for segment ${segmentIndex}`);
            return null;
          }

          return (
            <div
              key={`${segmentSpeakerId}-${segmentIndex}`}
              id={`segment-${segmentIndex}`}
              {...(loopIdx === 0 ? { 'data-tour': 'speaker-bubble' } : {})}
              className={`flex space-x-3 p-4 rounded-xl transition-all duration-300 border group cursor-pointer ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
                  : isActive
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-2 border-blue-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button, input, a, label, select')) return;
                seekAndPlay(segment.startTime);
              }}
            >
              {projectId && (
                <div className="flex items-start pt-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSegmentSelection?.(segmentIndex)}
                    className="h-4 w-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Speaker Avatar */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass.replace('bg-blue-50', 'bg-blue-600').replace('bg-green-50', 'bg-green-600').replace('bg-purple-50', 'bg-purple-600').replace('bg-orange-50', 'bg-orange-600').replace('bg-pink-50', 'bg-pink-600').replace('bg-indigo-50', 'bg-indigo-600').replace(/text-\w+-600/, 'text-white')} border-2 border-white dark:border-slate-900`}>
                <span className="text-sm font-bold">
                  {speakerName.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Message Content */}
              <div className="flex-1 min-w-0">
                {/* Speaker Name and Timing */}
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isFiltered ? 'text-slate-500 italic' : colorClass.split(' ')[0]}`}>
                      {speakerName}
                    </span>
                    {isFiltered && filterInfo && (
                      <span
                        className="inline-flex items-center text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-400 border border-yellow-800/30"
                        title={`Filtered: ${filterInfo.evidence} (confidence: ${(filterInfo.confidence * 100).toFixed(0)}%)`}
                      >
                        {formatFilterReason(filterInfo.filterReason)}
                      </span>
                    )}
                    {!isFiltered && speakerRoleLabel && (
                      <span
                        className="inline-flex items-center text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                        title={roleTooltip}
                      >
                        {speakerRoleLabel}
                        {speaker.autoRoleAssigned && (
                          <span className="ml-1 text-[10px] font-semibold text-slate-500">
                            AUTO
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {showTimestamps && (
                    <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{formatTime(segment.startTime)}</span>
                      <span className="text-slate-500">•</span>
                      <span>{duration.toFixed(1)}s</span>
                      {reviewSegmentIndexSet.has(segmentIndex) && (
                        <span
                          className="text-yellow-600 cursor-help"
                          title={
                            (() => {
                              const item = reviewItemReasonMap.get(segmentIndex);
                              if (item?.reasons?.length) {
                                return `Needs review — ${item.reasons.map((reason) => formatReviewReason(reason)).join(', ')}`;
                              }
                              return segment.confidenceReason === 'transition_short'
                                ? 'Needs review — very short segment at a speaker-change boundary'
                                : segment.confidenceReason === 'role_mismatch'
                                ? "Needs review — segment duration is inconsistent with this speaker's typical role"
                                : 'Needs review — speaker assignment confidence is low or contradictory';
                            })()
                          }
                        >
                          ⚠️
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Message Text */}
                <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                  {highlightSegmentText(segment.text)}
                </div>

                {projectId && (
                  <div className="mt-2 flex items-center justify-end">
                    <div className="flex items-center gap-2 opacity-30 transition-opacity group-hover:opacity-100">
                      <label className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Reassign
                      </label>
                      <select
                        value={segmentSpeakerId}
                        onChange={(e) => {
                          if (e.target.value === segmentSpeakerId) return;
                          handleSegmentReassign(segmentIndex, e.target.value);
                        }}
                        disabled={segmentReassigning === segmentIndex}
                        className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-0 disabled:text-slate-400 dark:disabled:text-slate-500"
                      >
                        {speakerList.map((speakerId) => (
                          <option key={speakerId} value={speakerId}>
                            {getSpeakerDisplayName(speakers[speakerId])}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleConfirmSegment(segmentIndex)}
                        title="Mark as confirmed"
                        className="p-1 text-green-600 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="flex-shrink-0 border-t border-slate-200 px-4 pt-3 pb-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {selectedSpeaker ? (
          <span>
            Showing {filteredSegments.length} segments from {getSpeakerDisplayName(speakers[selectedSpeaker])}
          </span>
        ) : (
          <span>
            Total conversation: {segments.length} segments • 
            Processed on {formatUserDate(detectionMetadata.processedAt)}
          </span>
        )}
      </div>

    </div>
  );
}

const ENTITY_STOP_WORDS = new Set([
  // Greetings and pleasantries
  'thank you',
  'thank-you',
  'good morning',
  'good afternoon',
  'good evening',
  'nice to',

  // Time references
  'new episode',
  'today',
  'tonight',
  'this week',
  'next week',
  'last week',
  'this month',
  'next month',
  'this year',
  'last year',

  // Common phrases that get capitalized
  'you know',
  'i think',
  'i mean',
  'you see',
  'let me',
  'so yeah',
  'oh yeah',
  'right now',
  'of course',

  // Discourse markers
  'in fact',
  'in other words',
  'for example',
  'for instance',
  'to be honest',
  'to be fair'
]);

function formatRoleLabel(role?: string | null): string | null {
  if (!role) return null;
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveSpeakerInsightCards(speakerData: any): InsightCard[] {
  if (!speakerData || typeof speakerData !== 'object' || !speakerData.speakers) {
    return [];
  }

  const segments: SpeakerSegment[] = Array.isArray(speakerData.segments) ? speakerData.segments : [];
  const processedAt = speakerData?.detectionMetadata?.processedAt;

  return (Object.entries(speakerData.speakers)
    .map(([speakerId, speaker]: [string, any]) => {
      if (!speaker || typeof speaker !== 'object') return null;
      const label = getSpeakerDisplayName(speaker);
      const matchText = (speaker.extractedName?.name || label || '').trim();
      if (!matchText) return null;

      const matchVariants = [
        speaker.customName,
        speaker.finalName,
        speaker.fallbackName,
        ...(Array.isArray(speaker.extractedName?.nicknames) ? speaker.extractedName.nicknames : [])
      ]
        .filter(Boolean)
        .map((value: string) => value.trim())
        .filter(value => value.length > 1 && value !== matchText);

      const firstSegment =
        segments.find(segment => resolveSpeakerId(segment) === speakerId && segment.text?.trim()) ||
        segments.find(segment => segment.text?.toLowerCase().includes(matchText.toLowerCase()));

      const transcriptExcerpt = trimExcerpt(firstSegment?.text || '');
      const humanRole = formatRoleLabel(speaker.role);
      const summary =
        speaker.roleSummary ||
        speaker.summary ||
        (humanRole ? `${label} serves as the ${humanRole.toLowerCase()} in this conversation.` : `Track mentions of ${label} across the episode.`);

      const sources = Array.isArray(speaker.roleEvidence)
        ? speaker.roleEvidence
            .filter((evidence: unknown): evidence is string => typeof evidence === 'string' && evidence.trim().length > 0)
            .slice(0, 3)
            .map((evidence: string) => ({
              title: evidence,
              url: '',
              type: 'transcript'
            }))
        : [];

      return {
        entityId: `speaker-${speakerId}`,
        label,
        category: 'person',
        matchText,
        matchVariants,
        transcriptExcerpt: transcriptExcerpt || summary,
        summary,
        confidence: Math.min(0.99, Math.max(0.45, speaker.roleConfidence ?? speaker.confidence ?? 0.7)),
        sources,
        updatedAt: speaker.updated_at || processedAt || new Date().toISOString(),
        status: speaker.autoRoleAssigned ? 'auto_detected' : speaker.customName ? 'user_highlight' : undefined,
        origin: 'speaker'
      };
    })
    .filter(card => card !== null)) as InsightCard[];
}

function deriveEntityInsightCards(transcriptionText?: string, speakerData?: any): InsightCard[] {
  if (!transcriptionText || transcriptionText.trim().length < 40) {
    return [];
  }

  const matches = new Map<
    string,
    { phrase: string; count: number; contexts: string[]; matchVariants: string[] }
  >();

  // Enhanced entity regex to capture multi-word proper nouns
  const entityRegex = /([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*)+)/g;
  let match: RegExpExecArray | null;

  while ((match = entityRegex.exec(transcriptionText)) !== null) {
    const phrase = match[1].trim();
    if (shouldSkipEntityCandidate(phrase)) continue;

    const normalized = phrase.toLowerCase();
    const existing = matches.get(normalized);
    const context = extractSentenceAt(transcriptionText, match.index);

    if (existing) {
      existing.count += 1;
      // Store up to 3 different contexts
      if (existing.contexts.length < 3 && !existing.contexts.includes(context)) {
        existing.contexts.push(context);
      }
    } else {
      const variants: string[] = [];
      // Strip common corporate suffixes
      const stripped = phrase.replace(/,?\s+(Inc\.?|LLC|Ltd\.?|Corporation|Corp\.?|Labs|Studio|Media)$/i, '').trim();
      if (stripped && stripped !== phrase) {
        variants.push(stripped);
      }
      matches.set(normalized, {
        phrase,
        count: 1,
        contexts: [context],
        matchVariants: variants
      });
    }
  }

  // Filter and prioritize entities
  return Array.from(matches.values())
    .filter(meta => {
      // Must appear at least 2 times to be considered significant
      if (meta.count < 2) return false;

      // Filter out likely false positives
      const category = guessEntityCategory(meta.phrase);
      if (category === 'person' && meta.count < 3) {
        // People need to appear more often or be in speaker data
        const inSpeakers = speakerData?.speakers && Object.values(speakerData.speakers)
          .some((s: any) => s.finalName?.toLowerCase().includes(meta.phrase.toLowerCase()));
        return inSpeakers || meta.count >= 3;
      }

      return true;
    })
    .sort((a, b) => {
      // Prioritize by relevance: companies/products first, then by count
      const catA = guessEntityCategory(a.phrase);
      const catB = guessEntityCategory(b.phrase);
      const priority: Record<string, number> = { org: 3, product: 2, tool: 3, concept: 1, person: 0, social: 0 };
      const prioA = priority[catA] ?? 0;
      const prioB = priority[catB] ?? 0;

      if (prioA !== prioB) return prioB - prioA;
      return b.count - a.count;
    })
    .slice(0, 8) // Increase limit to show more relevant entities
    .map((meta, index) => {
      const category = guessEntityCategory(meta.phrase);
      const excerpt = trimExcerpt(meta.contexts[0]);
      const summary = buildContextualEntitySummary(meta.phrase, meta.count, category, meta.contexts);

      return {
        entityId: `entity-${slugifyId(meta.phrase)}-${index}`,
        label: meta.phrase,
        category,
        matchText: meta.phrase,
        matchVariants: meta.matchVariants,
        transcriptExcerpt: excerpt,
        summary,
        confidence: Math.min(0.95, 0.60 + (meta.count * 0.08)),
        sources: meta.contexts.slice(0, 3).map((ctx, idx) => ({
          title: trimExcerpt(ctx, 150),
          type: 'transcript',
          url: ''
        })),
        updatedAt: new Date().toISOString(),
        status: 'auto_detected',
        origin: 'entity'
      };
    });
}

function trimExcerpt(text: string, maxLength = 220): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entity';
}

function extractSentenceAt(text: string, index: number): string {
  if (!text) return '';
  let start = index;
  while (start > 0 && !'.!?'.includes(text[start - 1])) {
    start -= 1;
  }
  let end = index;
  while (end < text.length && !'.!?'.includes(text[end])) {
    end += 1;
  }
  return text.slice(start, end + 1).trim();
}

function guessEntityCategory(phrase: string): InsightCard['category'] {
  const lower = phrase.toLowerCase();

  // Organizations - companies, universities, agencies
  if (/\b(inc\.?|llc|ltd\.?|corporation|corp\.?|labs?|studio|media|agency|university|college|institute|foundation|group)\b/i.test(phrase)) {
    return 'org';
  }

  // Products - apps, platforms, technologies
  if (/\b(app|platform|product|program|podcast|show|service|software|api|tool|framework|library)\b/i.test(phrase)) {
    return 'product';
  }

  // Technical concepts
  if (/\b(AI|ML|learning|intelligence|neural|algorithm|model|data|cloud|system|technology)\b/i.test(phrase)) {
    return 'concept';
  }

  // Social/Media
  if (/\b(twitter|facebook|linkedin|instagram|youtube|tiktok|reddit)\b/i.test(lower)) {
    return 'social';
  }

  // Default to person for proper nouns
  return 'person';
}

function buildContextualEntitySummary(
  phrase: string,
  count: number,
  category: InsightCard['category'],
  contexts: string[]
): string {
  // Analyze contexts to extract meaning
  const contextText = contexts.join(' ').toLowerCase();

  let summary = '';

  switch (category) {
    case 'org':
      if (contextText.includes('founded') || contextText.includes('ceo') || contextText.includes('company')) {
        summary = `${phrase} is a company discussed ${count} times in this conversation. `;
      } else {
        summary = `${phrase} is an organization mentioned ${count} times. `;
      }
      break;

    case 'product':
      if (contextText.includes('built') || contextText.includes('created') || contextText.includes('launched')) {
        summary = `${phrase} is a product or platform referenced ${count} times. `;
      } else {
        summary = `${phrase} appears ${count} times as a tool or technology being discussed. `;
      }
      break;

    case 'concept':
      summary = `${phrase} is a key concept explored ${count} times throughout the episode. `;
      break;

    case 'social':
      summary = `${phrase} is mentioned ${count} times in the context of social media or online platforms. `;
      break;

    case 'person':
    default:
      if (contextText.includes('said') || contextText.includes('mentioned') || contextText.includes('talked about')) {
        summary = `${phrase} is referenced ${count} times in this conversation. `;
      } else {
        summary = `${phrase} appears ${count} times. `;
      }
  }

  // Add context hint
  summary += 'Click to see all mentions and context.';

  return summary;
}

function shouldSkipEntityCandidate(phrase: string): boolean {
  const normalized = phrase.toLowerCase();

  // Check against stop words
  if (ENTITY_STOP_WORDS.has(normalized)) return true;

  // Must be at least 4 characters
  if (normalized.length < 4) return true;

  // Skip pronouns and common words at start
  if (/^(i|we|you|they|this|that|there|here|when|where|what|which|who|how|why|the|and|but|or|so)\b/i.test(phrase)) return true;

  // Skip if all words are short (likely not an entity)
  const words = normalized.split(/\s+/);
  if (words.length === 1 && words[0].length < 4) return true;
  if (words.every(w => w.length < 3)) return true;

  // Skip generic terms
  const genericTerms = ['other hand', 'same time', 'long time', 'first time', 'every time', 'some people', 'lot of', 'kind of', 'sort of'];
  if (genericTerms.includes(normalized)) return true;

  // Skip if it starts with articles or prepositions
  if (/^(a|an|the|in|on|at|to|for|with|from|by)\s/i.test(phrase)) return true;

  return false;
}

function getInsightTargets(card: InsightCard): string[] {
  const seen = new Set<string>();
  const targets = [card.matchText, ...(card.matchVariants || [])];
  return targets
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(value => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

// Old InsightDetailPanel and InlineInsightsDrawer removed - now using components/insights
