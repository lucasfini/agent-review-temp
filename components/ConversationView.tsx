"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import { SpeakerSegment } from '@/lib/types';
import { formatTime } from '@/lib/time-utils';
import {
  Clock,
  User,
  MessageCircle,
  Edit2,
  Check,
  X,
  Trash2,
  AlertTriangle,
  PanelRightOpen,
  PanelRightClose,
  Lightbulb,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Undo2
} from 'lucide-react';
import { shiftSpeakerLabels } from '@/lib/utils/shiftSpeakerLabels';
import {
  InsightsSidebar,
  TranscriptHighlight,
  scrollToHighlight,
  type Insight,
  type Category
} from '@/components/insights';
import { SpeakerManagerModal } from '@/components/SpeakerManagerModal';
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
  // Audio player ref for speaker sample playback
  audioPlayerRef?: RefObject<AudioPlayerRef | null>;
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
  audioPlayerRef
}: ConversationViewProps) {
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
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

  // Shift cascade state for fixing diarization drift
  const [shiftHistory, setShiftHistory] = useState<SpeakerSegment[][]>([]);
  const [lastShiftInfo, setLastShiftInfo] = useState<{ count: number; direction: string } | null>(null);

  // Use external control if provided, otherwise internal state
  const showInlineInsights = insightsSidebarOpen !== undefined ? insightsSidebarOpen : internalShowInlineInsights;
  const setShowInlineInsights = onInsightsSidebarChange || setInternalShowInlineInsights;

  // New state for AI-powered insights from database
  const [inlineInsightPresets, setInlineInsightPresets] = useState<InsightCard[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);

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

      setPendingDeleteSpeaker(null);
      // Refresh page to get updated data
      window.location.reload();
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

      // Refresh page to get updated data
      setSegmentReassigning(null);
      window.location.reload();
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

      // Clear selection and refresh
      setSelectedSegments(new Set());
      setBulkReassigning(false);
      window.location.reload();
    } catch (error) {
      console.error('Error reassigning segments:', error);
      alert('Failed to reassign segments. Please try again.');
    } finally {
      setBulkReassigning(false);
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

  // Shift cascade handlers for fixing diarization drift
  const handleShiftCascade = async (fromIndex: number, direction: 'forward' | 'backward') => {
    if (!projectId || !speakerData?.segments) return;

    const speakerOrder = Object.keys(speakerData.speakers);
    if (speakerOrder.length < 2) return;

    // Save current state for undo
    setShiftHistory(prev => [...prev.slice(-9), speakerData.segments]);

    // Create segment with ID for the shift function
    const segmentsWithIds = speakerData.segments.map((seg: SpeakerSegment, i: number) => ({
      ...seg,
      id: `segment-${i}`,
    }));

    const result = shiftSpeakerLabels(
      segmentsWithIds,
      `segment-${fromIndex}`,
      direction,
      speakerOrder
    );

    if (result.affectedCount === 0) return;

    // Build updated speaker data
    const updatedSegments = result.segments.map(({ id, ...seg }) => seg);
    const updatedSpeakerData = {
      ...speakerData,
      segments: updatedSegments,
      detectionMetadata: {
        ...speakerData.detectionMetadata,
        lastModified: new Date().toISOString(),
        lastModificationType: 'shift_cascade',
      },
    };

    // Save to backend
    try {
      const response = await fetch(`/api/projects/${projectId}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerId: '_shift_cascade',
          newName: '_shift_cascade',
          speakerData: updatedSpeakerData,
        }),
      });

      if (response.ok && onSpeakerUpdate) {
        onSpeakerUpdate(updatedSpeakerData);
        setLastShiftInfo({ count: result.affectedCount, direction });
        setTimeout(() => setLastShiftInfo(null), 3000);
      }
    } catch (error) {
      console.error('Shift cascade failed:', error);
      // Revert on error
      setShiftHistory(prev => prev.slice(0, -1));
    }
  };

  const handleUndoShift = async () => {
    if (!projectId || shiftHistory.length === 0) return;

    const previousSegments = shiftHistory[shiftHistory.length - 1];
    const updatedSpeakerData = {
      ...speakerData,
      segments: previousSegments,
    };

    try {
      const response = await fetch(`/api/projects/${projectId}/speakers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerId: '_undo_shift',
          newName: '_undo_shift',
          speakerData: updatedSpeakerData,
        }),
      });

      if (response.ok && onSpeakerUpdate) {
        onSpeakerUpdate(updatedSpeakerData);
        setShiftHistory(prev => prev.slice(0, -1));
      }
    } catch (error) {
      console.error('Undo shift failed:', error);
    }
  };

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
  }, [projectId, userTier]);

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

  useEffect(() => {
    if (!showInlineInsights) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowInlineInsights(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', handleKey);
    };
  }, [showInlineInsights]);

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
  useEffect(() => {
    if (onInsightsDataChange) {
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
  }, [inlineInsightPresets, onInsightsDataChange]);

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
        // Auto-open sidebar after generation
        setShowInlineInsights(true);
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

          {/* Only show internal Insights button when NOT controlled externally */}
          {insightsSidebarOpen === undefined && (
            <>
              {/* Divider */}
              <div className="h-8 w-px bg-gray-200 hidden sm:block" />

              {/* Insights Button - Only shown when not externally controlled */}
              <button
                type="button"
                onClick={() => {
                  if (inlineInsightPresets.length === 0 && !insightsLoading && !generatingInsights) {
                    handleGenerateInsights();
                  } else {
                    setShowInlineInsights(!showInlineInsights);
                  }
                }}
                disabled={generatingInsights || insightsLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                  showInlineInsights
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : generatingInsights || insightsLoading
                    ? 'bg-gray-50 text-gray-400 cursor-wait'
                    : inlineInsightPresets.length === 0
                    ? 'bg-gray-50 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className={`flex items-center justify-center h-7 w-7 rounded-full ${
                  showInlineInsights ? 'bg-amber-100' : 'bg-white border border-gray-200'
                }`}>
                  {generatingInsights ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  ) : insightsLoading ? (
                    <div className="h-3 w-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  ) : inlineInsightPresets.length === 0 ? (
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Lightbulb className={`h-3.5 w-3.5 ${showInlineInsights ? 'text-amber-600' : 'text-gray-500'}`} />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">
                    {generatingInsights
                      ? 'Generating...'
                      : insightsLoading
                      ? 'Loading...'
                      : inlineInsightPresets.length === 0
                      ? 'Generate Insights'
                      : 'Insights'}
                  </p>
                  {!generatingInsights && !insightsLoading && inlineInsightPresets.length > 0 && (
                    <p className="text-xs text-gray-500">{transformedInsights.length} found</p>
                  )}
                </div>
                {showInlineInsights && inlineInsightPresets.length > 0 && (
                  <PanelRightClose className="h-4 w-4 ml-1 text-amber-500" />
                )}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer border border-gray-200 rounded-full px-3 py-1.5 bg-white">
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Clock className="h-3 w-3" />
            <span>Timestamps</span>
          </label>

          <select
            value={selectedSpeaker || ''}
            onChange={(e) => setSelectedSpeaker(e.target.value || null)}
            className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white"
          >
            <option value="">All speakers</option>
            {speakerList.map(speakerId => (
              <option key={speakerId} value={speakerId}>
                {getSpeakerDisplayName(speakers[speakerId])}
              </option>
            ))}
          </select>

          {speakerList.length > 1 && (
            <>
              {/* Undo Shift Button */}
              {shiftHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoShift}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <Undo2 className="h-3 w-3" />
                  Undo Shift
                </button>
              )}

              {/* Shift Feedback Toast */}
              {lastShiftInfo && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200 animate-pulse">
                  Shifted {lastShiftInfo.count} segments {lastShiftInfo.direction === 'forward' ? 'down' : 'up'}
                </span>
              )}

              {/* Speaker Manager Modal with Play Sample */}
              {audioPlayerRef && (
                <SpeakerManagerModal
                  speakerData={speakerData}
                  audioPlayerRef={audioPlayerRef}
                  onRename={(speakerId, newName) => {
                    // Reuse existing rename logic
                    if (!projectId) return;

                    const updatedSpeakerData = {
                      ...speakerData,
                      speakers: {
                        ...speakerData.speakers,
                        [speakerId]: {
                          ...speakerData.speakers[speakerId],
                          finalName: newName,
                          customName: newName
                        }
                      }
                    };

                    // Save to backend
                    fetch(`/api/projects/${projectId}/speakers`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        speakerId,
                        newName,
                        speakerData: updatedSpeakerData
                      })
                    }).then(response => {
                      if (response.ok && onSpeakerUpdate) {
                        onSpeakerUpdate(updatedSpeakerData);
                      }
                    }).catch(console.error);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Bulk Selection Controls */}
      {projectId && selectedSegments.size > 0 && (
        <div className="flex-shrink-0 mx-4 mb-3 p-4 border border-blue-100 bg-blue-50 rounded-lg text-xs text-blue-900 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {selectedSegments.size} segment{selectedSegments.size === 1 ? '' : 's'} selected
            </span>
            <button
              onClick={() => setSelectedSegments(new Set(filteredSegments.map(({ index }) => index)))}
              className="px-2 py-1 rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
            >
              Select Visible
            </button>
            <button
              onClick={() => setSelectedSegments(new Set())}
              className="px-2 py-1 rounded border border-transparent text-blue-700 hover:bg-blue-100"
            >
              Clear Selection
            </button>
          </div>
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
              className="flex space-x-3 p-4 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
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
                      {segment.confidence !== undefined && segment.confidence < 0.8 && (
                        <span
                          className="text-yellow-600 cursor-help"
                          title="Low confidence speaker detection"
                        >
                          ⚠️
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {projectId && (
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
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
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                      >
                        {speakerList.map((speakerId) => (
                          <option key={speakerId} value={speakerId}>
                            {getSpeakerDisplayName(speakers[speakerId])}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Shift Cascade Buttons */}
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400 mr-1">
                        Shift
                      </span>
                      <button
                        onClick={() => handleShiftCascade(segmentIndex, 'backward')}
                        className="p-1 rounded hover:bg-purple-100 text-purple-600 transition-colors"
                        title="Shift labels up from here (C→B, B→A)"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleShiftCascade(segmentIndex, 'forward')}
                        className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors"
                        title="Shift labels down from here (A→B, B→C)"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Message Text */}
                <div className="text-sm text-gray-800 leading-relaxed break-words">
                  {highlightSegmentText(segment.text)}
                </div>
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

      {/* Insights Sidebar */}
      {showInlineInsights && transformedInsights.length > 0 && (
        <div className="fixed top-0 right-0 h-full w-80 z-40 shadow-xl">
          <InsightsSidebar
            insights={transformedInsights}
            activeInsightId={activeInsightId}
            onInsightClick={handleInsightClick}
            onClose={() => setShowInlineInsights(false)}
          />
        </div>
      )}
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
