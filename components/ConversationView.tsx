"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import { SpeakerSegment } from '@/lib/types';
import { formatTime } from '@/lib/time-utils';
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
  userTier?: 'basic' | 'pro' | 'premium'; // User's subscription tier
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
  }) => void;
  onInsightsDataChange?: (insights: Array<{
    id: string;
    title: string;
    category: 'concept' | 'person' | 'tool';
    definition: string;
    significance: string;
    sources: Array<{ title: string; url: string }>;
    matchText?: string;
    matchVariants?: string[];
  }>) => void;
  triggerInsightGeneration?: number;
  insightsRefreshToken?: number;
  // Audio player ref for speaker sample playback
  audioPlayerRef?: RefObject<AudioPlayerRef | null>;
  showTimestamps?: boolean;
  selectedSpeaker?: string | null;
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
}

const resolveSpeakerId = (segment: SpeakerSegment) => segment.finalSpeakerId || segment.speakerId;

export default function ConversationView({
  speakerData,
  transcriptionText,
  className = "",
  projectId,
  onSpeakerUpdate,
  userTier = 'basic',
  filteredSpeakers = [],
  insightsSidebarOpen,
  onInsightsSidebarChange,
  onInsightsStatusChange,
  onInsightsDataChange,
  triggerInsightGeneration,
  insightsRefreshToken,
  audioPlayerRef,
  showTimestamps: controlledShowTimestamps,
  selectedSpeaker: controlledSelectedSpeaker
}: ConversationViewProps) {
  const showTimestamps = controlledShowTimestamps ?? true;
  const selectedSpeaker = controlledSelectedSpeaker ?? null;
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [savingSpeaker, setSavingSpeaker] = useState<string | null>(null);
  const [pendingDeleteSpeaker, setPendingDeleteSpeaker] = useState<string | null>(null);
  const [deletingSpeaker, setDeletingSpeaker] = useState<string | null>(null);
  const [deleteAction, setDeleteAction] = useState<'delete' | 'reassign'>('reassign');
  const [reassignToSpeaker, setReassignToSpeaker] = useState<string>('');
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [bulkReassignTarget, setBulkReassignTarget] = useState<string>('');
  const [bulkReassigning, setBulkReassigning] = useState(false);
  const [segmentReassigning, setSegmentReassigning] = useState<number | null>(null);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const [internalShowInlineInsights, setInternalShowInlineInsights] = useState(false);


  // Use external control if provided, otherwise internal state
  const showInlineInsights = insightsSidebarOpen !== undefined ? insightsSidebarOpen : internalShowInlineInsights;
  const setShowInlineInsights = onInsightsSidebarChange || setInternalShowInlineInsights;

  // New state for AI-powered insights from database
  const [inlineInsightPresets, setInlineInsightPresets] = useState<InsightCard[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [aiTouchupLoading, setAiTouchupLoading] = useState(false);
  const [aiTouchupResult, setAiTouchupResult] = useState<string | null>(null);

  // Preview state for dry-run touch-up
  interface TouchupPreviewItem {
    index: number;
    oldSpeakerId: string;
    newSpeakerId: string;
    reason: string;
    confidence: number | null;
    segmentText: string;
    accepted: boolean;
  }
  const [touchupPreview, setTouchupPreview] = useState<TouchupPreviewItem[] | null>(null);
  const [applyingTouchup, setApplyingTouchup] = useState(false);

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
      alert('Failed to update speaker name. Please try again.');
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
      alert('Failed to delete speaker. Please try again.');
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
      alert('Failed to reassign segment. Please try again.');
    } finally {
      setSegmentReassigning(null);
    }
  };

  const handleBulkReassign = async (newSpeakerId: string) => {
    if (!projectId || selectedSegments.size === 0 || !newSpeakerId) return;

    try {
      setBulkReassigning(true);
      const response = await fetch(`/api/projects/${projectId}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segmentIndices: Array.from(selectedSegments),
          newSpeakerId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to reassign segments');
      }

      const data = await response.json();
      if (data.updatedSpeakerData && onSpeakerUpdate) {
        onSpeakerUpdate(data.updatedSpeakerData);
      }
      setSelectedSegments(new Set());
      setBulkReassigning(false);
    } catch (error) {
      console.error('Error reassigning segments:', error);
      alert('Failed to reassign segments. Please try again.');
    } finally {
      setBulkReassigning(false);
    }
  };

  const handleAiTouchup = async () => {
    if (!projectId || selectedSegments.size === 0) return;
    setAiTouchupLoading(true);
    setAiTouchupResult(null);
    setTouchupPreview(null);
    try {
      // Dry run: get Claude's suggestions without writing to DB
      const response = await fetch(`/api/projects/${projectId}/segments/touchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: Array.from(selectedSegments), dryRun: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Touch-up failed');

      // Only show changed suggestions in the preview
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
  };

  const togglePreviewItem = (index: number) => {
    setTouchupPreview(prev =>
      prev ? prev.map(item => item.index === index ? { ...item, accepted: !item.accepted } : item) : null
    );
  };

  const handleApplyTouchup = async () => {
    if (!projectId || !touchupPreview) return;
    const approved = touchupPreview.filter(item => item.accepted);
    if (approved.length === 0) {
      setTouchupPreview(null);
      return;
    }
    setApplyingTouchup(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/segments/touchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedReassignments: approved })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Apply failed');
      setAiTouchupResult(`AI reassigned ${approved.length} segment${approved.length !== 1 ? 's' : ''}`);
      setTouchupPreview(null);
      setSelectedSegments(new Set());
      if (data.updatedSpeakerData && onSpeakerUpdate) {
        onSpeakerUpdate(data.updatedSpeakerData);
      }
    } catch (err) {
      setAiTouchupResult('Apply failed — try again');
    } finally {
      setApplyingTouchup(false);
    }
  };

  const toggleSegmentSelection = (index: number) => {
    const newSelection = new Set(selectedSegments);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedSegments(newSelection);
  };

  // Shift feature removed

  if (!speakerData || !speakerData.segments || speakerData.segments.length === 0) {
    return (
      <div className={`p-6 bg-yellow-50 border border-yellow-200 rounded-lg ${className}`}>
        <div className="flex items-center space-x-3 text-yellow-800">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Conversation Format Processing</span>
        </div>
        <p className="text-sm text-yellow-700 mt-3 leading-relaxed">
          Speaker detection is being processed in the background. 
          Please refresh the page in a few moments to see the conversation format.
        </p>
      </div>
    );
  }

  // Check if speaker analysis had errors
  if (speakerData.detectionMetadata?.error) {
    return (
      <div className={`p-6 bg-orange-50 border border-orange-200 rounded-lg ${className}`}>
        <div className="flex items-center space-x-3 text-orange-800">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Conversation Format Partially Available</span>
        </div>
        <p className="text-sm text-orange-700 mt-3 leading-relaxed">
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

  const hasUncertainSegments = useMemo(
    () => segments.some(s =>
      s.status === 'uncertain' && (
        s.confidenceReason === 'acoustic_only' ||
        s.confidenceReason === 'transition_short' ||
        s.confidenceReason === 'role_mismatch'
      )
    ),
    [segments]
  );

  const filteredSegments = useMemo(() => {
    if (selectedSpeaker) {
      return segmentsWithIndex.filter(({ segment }) => resolveSpeakerId(segment) === selectedSpeaker);
    }
    return segmentsWithIndex;
  }, [segmentsWithIndex, selectedSpeaker]);

  useEffect(() => {
    if (!bulkReassignTarget || (bulkReassignTarget && !speakerList.includes(bulkReassignTarget))) {
      setBulkReassignTarget(speakerList[0] || '');
    }
  }, [speakerList, bulkReassignTarget]);

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

        const response = await fetch(`/api/insights/${projectId}?tier=${userTier}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch insights');
        }

        // Transform database insights to InsightCard format
        const transformedInsights: InsightCard[] = (data.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: userTier === 'premium'
            ? insight.full_explanation
            : userTier === 'pro'
            ? insight.simple_definition
            : '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          // Premium-only fields
          relatedConcepts: userTier === 'premium' ? insight.related_concepts : undefined,
          whyItMatters: userTier === 'premium' ? insight.why_it_matters : undefined,
          relationships: userTier === 'premium' ? insight.relationships : undefined
        }));

        setInlineInsightPresets(transformedInsights);
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
  }, [projectId, userTier, insightsRefreshToken]);

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
        })),
        matchText: card.matchText,
        matchVariants: card.matchVariants,
      };
    });
  }, [activeInlineInsights]);

  // Handler for insight clicks - syncs sidebar and transcript
  const handleInsightClick = useCallback((insightId: string) => {
    setActiveInsightId((prev) => (prev === insightId ? null : insightId));
  }, []);

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


  const handleRefreshInsights = async () => {
    if (!projectId || userTier !== 'premium' || refreshingInsights) {
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
      const fetchResponse = await fetch(`/api/insights/${projectId}?tier=${userTier}`);
      const fetchData = await fetchResponse.json();

      if (fetchResponse.ok) {
        const transformedInsights: InsightCard[] = (fetchData.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: userTier === 'premium'
            ? insight.full_explanation
            : userTier === 'pro'
            ? insight.simple_definition
            : '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          // Premium-only fields
          relatedConcepts: userTier === 'premium' ? insight.related_concepts : undefined,
          whyItMatters: userTier === 'premium' ? insight.why_it_matters : undefined,
          relationships: userTier === 'premium' ? insight.relationships : undefined
        }));

        setInlineInsightPresets(transformedInsights);
      }

      console.log(`[Insights] Refreshed: ${data.insight_count} insights`);
    } catch (error) {
      console.error('[Insights] Refresh failed:', error);
      alert('Failed to refresh insights. Please try again.');
    } finally {
      setRefreshingInsights(false);
    }
  };

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
  }, [triggerInsightGeneration, generatingInsights, insightsLoading, inlineInsightPresets.length]);

  // Report status changes to parent
  useEffect(() => {
    if (onInsightsStatusChange) {
      onInsightsStatusChange({
        count: inlineInsightPresets.length,
        loading: insightsLoading,
        generating: generatingInsights,
      });
    }
  }, [inlineInsightPresets.length, insightsLoading, generatingInsights, onInsightsStatusChange]);

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
        else if (card.category === 'tool') category = 'tool';

        return {
          id: card.entityId,
          title: card.label,
          category,
          definition: card.summary,
          significance: card.whyItMatters || card.transcriptExcerpt || '',
          sources: (card.sources || []).map(s => ({
            title: s.title,
            url: s.url || '',
          })),
          matchText: card.matchText,
          matchVariants: card.matchVariants,
        };
      });
      onInsightsDataChange(mappedInsights);
    }
  }, [inlineInsightPresets, onInsightsDataChange, insightsLoading]);

  // Generate insights for the first time
  const handleGenerateInsights = async () => {
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
      const fetchResponse = await fetch(`/api/insights/${projectId}?tier=${userTier}`);
      const fetchData = await fetchResponse.json();

      if (fetchResponse.ok) {
        const transformedInsights: InsightCard[] = (fetchData.insights || []).map((insight: any) => ({
          entityId: insight.entity_id,
          label: insight.label,
          category: insight.category as 'person' | 'concept' | 'tool',
          matchText: insight.match_text,
          matchVariants: insight.match_variants || [],
          transcriptExcerpt: insight.transcript_excerpts?.[0]?.text || '',
          summary: userTier === 'premium'
            ? insight.full_explanation
            : userTier === 'pro'
            ? insight.simple_definition
            : '',
          confidence: insight.confidence || 0.8,
          sources: insight.external_sources || [],
          updatedAt: insight.updated_at || new Date().toISOString(),
          status: insight.status || 'auto_detected',
          origin: 'entity' as const,
          relatedConcepts: userTier === 'premium' ? insight.related_concepts : undefined,
          whyItMatters: userTier === 'premium' ? insight.why_it_matters : undefined,
          relationships: userTier === 'premium' ? insight.relationships : undefined
        }));

        setInlineInsightPresets(transformedInsights);
      }

      console.log(`[Insights] Generated: ${data.insight_count} insights`);
    } catch (error) {
      console.error('[Insights] Generation failed:', error);
      alert('Failed to generate insights. Please try again.');
    } finally {
      setGeneratingInsights(false);
    }
  };

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
      {/* Conversation Header */}
      <div className="flex-shrink-0 p-4 pb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {/* Conversation Info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-50 text-blue-600">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Conversation</h4>
              <p className="text-xs text-gray-500">
                {detectionMetadata.totalSpeakers} speaker{detectionMetadata.totalSpeakers !== 1 ? 's' : ''} • {detectionMetadata.totalSegments} segments
              </p>
            </div>
          </div>

        </div>

      </div>

      {/* Bulk Selection Controls */}
      {projectId && (selectedSegments.size > 0 || hasUncertainSegments) && (
        <div className="flex-shrink-0 mx-4 mb-3 p-4 border border-blue-100 bg-blue-50 rounded-lg text-xs text-blue-900 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {selectedSegments.size > 0 && (
              <span className="font-medium">
                {selectedSegments.size} segment{selectedSegments.size === 1 ? '' : 's'} selected
              </span>
            )}
            {selectedSegments.size > 0 && (
              <button
                onClick={() => setSelectedSegments(new Set(filteredSegments.map(({ index }) => index)))}
                className="px-2 py-1 rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
              >
                Select Visible
              </button>
            )}
            {selectedSegments.size > 0 && (
              <button
                onClick={() => setSelectedSegments(new Set())}
                className="px-2 py-1 rounded border border-transparent text-blue-700 hover:bg-blue-100"
              >
                Clear Selection
              </button>
            )}
            {hasUncertainSegments && (
              <button
                onClick={() => setSelectedSegments(new Set(
                  segmentsWithIndex
                    .filter(({ segment }) =>
                      segment.status === 'uncertain' && (
                        segment.confidenceReason === 'acoustic_only' ||
                        segment.confidenceReason === 'transition_short' ||
                        segment.confidenceReason === 'role_mismatch'
                      )
                    )
                    .map(({ index }) => index)
                ))}
                className="px-2 py-1 rounded border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
              >
                ⚠️ Select all uncertain
              </button>
            )}
          </div>
          {selectedSegments.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Reassign selected to:</span>
              <select
                value={bulkReassignTarget}
                onChange={(e) => setBulkReassignTarget(e.target.value)}
                className="border border-blue-200 rounded px-2 py-1 bg-white text-blue-900"
              >
                {speakerList.map((speakerId) => (
                  <option key={speakerId} value={speakerId}>
                    {getSpeakerDisplayName(speakers[speakerId])}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleBulkReassign(bulkReassignTarget)}
                disabled={
                  !bulkReassignTarget || selectedSegments.size === 0 || bulkReassigning
                }
                className={`inline-flex items-center px-3 py-1.5 rounded text-white text-xs font-semibold ${
                  !bulkReassignTarget || selectedSegments.size === 0 || bulkReassigning
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {bulkReassigning ? (
                  <span className="flex items-center space-x-1">
                    <span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" />
                    <span>Updating…</span>
                  </span>
                ) : (
                  'Apply'
                )}
              </button>
              <button
                onClick={handleAiTouchup}
                disabled={aiTouchupLoading || selectedSegments.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 disabled:cursor-not-allowed"
              >
                {aiTouchupLoading ? (
                  <><span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" /> AI analyzing…</>
                ) : (
                  <>✦ Touch-up with AI</>
                )}
              </button>
              {aiTouchupResult && (
                <span className="text-xs text-blue-700 font-medium">{aiTouchupResult}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Touch-up Preview Panel */}
      {touchupPreview && (
        <div className="flex-shrink-0 mx-4 mb-3 p-4 border border-violet-200 bg-violet-50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-violet-900">
              ✦ AI Corrections ({touchupPreview.filter(i => i.accepted).length} of {touchupPreview.length} selected)
            </span>
            <button
              onClick={() => setTouchupPreview(null)}
              className="text-violet-400 hover:text-violet-700"
              aria-label="Discard preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {touchupPreview.map((item) => {
              const oldSpk = speakers[item.oldSpeakerId];
              const newSpk = speakers[item.newSpeakerId];
              const oldName = getSpeakerDisplayName(oldSpk) || item.oldSpeakerId;
              const newName = getSpeakerDisplayName(newSpk) || item.newSpeakerId;
              return (
                <div
                  key={item.index}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-opacity ${
                    item.accepted ? 'bg-white border-violet-200' : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.accepted}
                    onChange={() => togglePreviewItem(item.index)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium flex-wrap">
                      <span className="text-gray-400">Seg {item.index}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-red-500 line-through">{oldName}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-700 font-semibold">{newName}</span>
                      {item.confidence != null && (
                        <span className="ml-auto text-gray-400 font-normal">
                          {Math.round(item.confidence * 100)}% confident
                        </span>
                      )}
                    </div>
                    {item.segmentText && (
                      <p className="text-xs text-gray-600 truncate">
                        &ldquo;{item.segmentText}&rdquo;
                      </p>
                    )}
                    {item.reason && (
                      <p className="text-xs text-gray-500 italic">{item.reason}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleApplyTouchup}
              disabled={applyingTouchup || touchupPreview.every(i => !i.accepted)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 disabled:cursor-not-allowed"
            >
              {applyingTouchup ? (
                <><span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" /> Applying…</>
              ) : (
                `Apply ${touchupPreview.filter(i => i.accepted).length} change${touchupPreview.filter(i => i.accepted).length !== 1 ? 's' : ''}`
              )}
            </button>
            <button
              onClick={() => setTouchupPreview(null)}
              className="px-3 py-1.5 rounded text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Conversation Segments */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-4">
        {filteredSegments.map(({ segment, index: segmentIndex }) => {
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
          const isSelected = selectedSegments.has(segmentIndex);

          // Additional safety: if speakerName is still empty/undefined, skip this segment
          if (!speakerName || speakerName.trim() === '') {
            console.warn(`Empty speaker name for segment ${segmentIndex}`);
            return null;
          }

          return (
            <div
              key={`${segmentSpeakerId}-${segmentIndex}`}
              className="flex space-x-3 p-4 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100 group"
            >
              {projectId && (
                <div className="flex items-start pt-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSegmentSelection(segmentIndex)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Speaker Avatar */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass} border-2 border-white shadow-md`}>
                <span className="text-sm font-bold">
                  {speakerName.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Message Content */}
              <div className="flex-1 min-w-0">
                {/* Speaker Name and Timing */}
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isFiltered ? 'text-gray-400 italic' : colorClass.split(' ')[0]}`}>
                      {speakerName}
                    </span>
                    {isFiltered && filterInfo && (
                      <span
                        className="inline-flex items-center text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200"
                        title={`Filtered: ${filterInfo.evidence} (confidence: ${(filterInfo.confidence * 100).toFixed(0)}%)`}
                      >
                        {formatFilterReason(filterInfo.filterReason)}
                      </span>
                    )}
                    {!isFiltered && speakerRoleLabel && (
                      <span
                        className="inline-flex items-center text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                        title={roleTooltip}
                      >
                        {speakerRoleLabel}
                        {speaker.autoRoleAssigned && (
                          <span className="ml-1 text-[10px] font-semibold text-gray-400">
                            AUTO
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {showTimestamps && (
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span className="font-mono">{formatTime(segment.startTime)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{duration.toFixed(1)}s</span>
                      {segment.status === 'uncertain' && (
                        segment.confidenceReason === 'acoustic_only' ||
                        segment.confidenceReason === 'transition_short' ||
                        segment.confidenceReason === 'role_mismatch') && (
                        <span
                          className="text-yellow-600 cursor-help"
                          title={
                            segment.confidenceReason === 'transition_short'
                              ? 'Uncertain — very short segment at a speaker-change boundary'
                              : segment.confidenceReason === 'role_mismatch'
                              ? "Uncertain — segment duration is inconsistent with this speaker's typical role"
                              : 'Uncertain — assigned by acoustic similarity only'
                          }
                        >
                          ⚠️
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Message Text */}
                <div className="text-sm text-gray-800 leading-relaxed break-words">
                  {highlightSegmentText(segment.text)}
                </div>

                {projectId && (
                  <div className="mt-2 flex items-center justify-end">
                    <div className="flex items-center gap-2 opacity-30 transition-opacity group-hover:opacity-100">
                      <label className="text-[11px] uppercase tracking-wide text-gray-400">
                        Reassign
                      </label>
                      <select
                        value={segmentSpeakerId}
                        onChange={(e) => {
                          if (e.target.value === segmentSpeakerId) return;
                          handleSegmentReassign(segmentIndex, e.target.value);
                        }}
                        disabled={segmentReassigning === segmentIndex || bulkReassigning}
                        className="text-xs bg-transparent border border-transparent rounded px-1.5 py-0.5 text-gray-700 hover:border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-0 disabled:text-gray-400"
                      >
                        {speakerList.map((speakerId) => (
                          <option key={speakerId} value={speakerId}>
                            {getSpeakerDisplayName(speakers[speakerId])}
                          </option>
                        ))}
                      </select>
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
      <div className="flex-shrink-0 px-4 pb-4 text-xs text-gray-500 pt-4 border-t border-gray-200">
        {selectedSpeaker ? (
          <span>
            Showing {filteredSegments.length} segments from {getSpeakerDisplayName(speakers[selectedSpeaker])}
          </span>
        ) : (
          <span>
            Total conversation: {segments.length} segments • 
            Processed on {new Date(detectionMetadata.processedAt).toLocaleDateString()}
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
