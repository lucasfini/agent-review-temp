"use client";

import { useState, useMemo, useEffect, type ReactNode } from 'react';
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
  Lightbulb,
  ExternalLink
} from 'lucide-react';

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
}

interface InsightCard {
  entityId: string;
  label: string;
  category: 'person' | 'org' | 'concept' | 'product' | 'social';
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

export default function ConversationView({
  speakerData,
  transcriptionText,
  className = "",
  projectId,
  onSpeakerUpdate,
  userTier = 'basic'
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
  const [showInlineInsights, setShowInlineInsights] = useState(false);
  const [showSpeakerLegend, setShowSpeakerLegend] = useState(false);
  const [researchingInsightId, setResearchingInsightId] = useState<string | null>(null);

  // New state for AI-powered insights from database
  const [inlineInsightPresets, setInlineInsightPresets] = useState<InsightCard[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);

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
      return segmentsWithIndex.filter(({ segment }) => segment.speakerId === selectedSpeaker);
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

  const handleRunDeepResearch = (card: InsightCard) => {
    const query = card.summary || card.label || card.matchText;
    if (!query) return;
    setResearchingInsightId(card.entityId);
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      setResearchingInsightId(prev => (prev === card.entityId ? null : prev));
    }, 800);
  };

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

  const highlightSegmentText = (text: string) => {
    const matches: Array<{
      start: number;
      end: number;
      card: InsightCard;
      matchText: string;
    }> = [];

    activeInlineInsights.forEach(card => {
      getInsightTargets(card).forEach((target, variantIndex) => {
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!escaped) {
          return;
        }
        const regex = new RegExp(escaped, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            card,
            matchText: match[0]
          });
          // Prevent infinite loops for zero-width matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      });
    });

    if (!matches.length) {
      return text;
    }

    const ordered = matches.sort((a, b) => a.start - b.start);
    const nodes: ReactNode[] = [];
    let cursor = 0;

    ordered.forEach((match, index) => {
      if (match.start > cursor) {
        nodes.push(
          <span key={`text-${index}-${cursor}`}>
            {text.slice(cursor, match.start)}
          </span>
        );
      }

      nodes.push(
        <span
          key={`insight-${match.card.entityId}-${index}`}
          className="relative inline-block"
          data-insight-trigger="true"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveInsightId(prev => prev === match.card.entityId ? null : match.card.entityId);
            }}
            className="inline-flex items-center gap-1 px-1 rounded-sm bg-amber-50 text-amber-900 underline decoration-dotted decoration-amber-500 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
          >
            <span>{match.matchText}</span>
            <Lightbulb className="h-3 w-3" />
          </button>
        </span>
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
    <div className={`space-y-6 p-4 ${className}`}>
      {/* Conversation Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-50 text-blue-600">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Conversation Format</h4>
            <p className="text-xs text-gray-500">
              {detectionMetadata.totalSpeakers} speaker{detectionMetadata.totalSpeakers !== 1 ? 's' : ''} • {detectionMetadata.totalSegments} segments
            </p>
          </div>
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

          {inlineInsightPresets.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInlineInsights(prev => !prev)}
              className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 border ${
                showInlineInsights ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-amber-200 text-amber-700 bg-white'
              }`}
            >
              <Lightbulb className="h-3 w-3" />
              Inline insights ({activeInlineInsights.length}/{inlineInsightPresets.length})
            </button>
          )}

          {userTier === 'premium' && inlineInsightPresets.length > 0 && (
            <button
              type="button"
              onClick={handleRefreshInsights}
              disabled={refreshingInsights}
              className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 border ${
                refreshingInsights
                  ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'border-blue-200 text-blue-700 bg-white hover:bg-blue-50'
              }`}
              title="Regenerate insights with latest AI models"
            >
              {refreshingInsights ? (
                <>
                  <span className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh insights
                </>
              )}
            </button>
          )}

          {insightsLoading && (
            <span className="text-xs text-gray-500 px-2">Loading insights...</span>
          )}

          {speakerList.length > 1 && (
            <button
              type="button"
              onClick={() => setShowSpeakerLegend(prev => !prev)}
              className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 border ${
                showSpeakerLegend ? 'border-gray-400 bg-gray-100 text-gray-800' : 'border-gray-200 text-gray-600 bg-white'
              }`}
            >
              <User className="h-3 w-3" />
              Speakers ({speakerList.length})
            </button>
          )}
        </div>
      </div>

      {/* Inline Insight Presets */}
      {/* Speaker Legend */}
      {showSpeakerLegend && !selectedSpeaker && speakerList.length > 1 && (
        <div className="flex flex-wrap gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-xs font-medium text-gray-700 self-center">Speakers:</span>
          {speakerList.map(speakerId => {
            const speaker = speakers[speakerId];
            const colorClass = getSpeakerColor(speakerId);
            const currentName = getSpeakerDisplayName(speaker);
            const isEditing = editingSpeaker === speakerId;
            const isSaving = savingSpeaker === speakerId;
            
            return (
              <div
                key={speakerId}
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${colorClass} border border-gray-300 group relative`}
              >
                <User className="h-3 w-3 mr-1.5" />
                
                {isEditing ? (
                  <div className="flex items-center space-x-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveSpeaker(speakerId);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded bg-white text-gray-900"
                      autoFocus
                      disabled={isSaving}
                    />
                    <button
                      onClick={() => handleSaveSpeaker(speakerId)}
                      disabled={isSaving || !editingName.trim()}
                      className="p-0.5 text-green-600 hover:text-green-800 disabled:opacity-50"
                      title="Save"
                    >
                      {isSaving ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-green-600 border-t-transparent" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="p-0.5 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <span>{currentName}</span>
                    {projectId && (
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditSpeaker(speakerId, currentName)}
                          className="p-0.5 text-gray-500 hover:text-gray-700"
                          title="Edit speaker name"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteSpeakerClick(speakerId)}
                          className="p-0.5 text-red-500 hover:text-red-700"
                          title="Delete speaker"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {pendingDeleteSpeaker === speakerId && (
                  <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg space-y-3 text-xs text-gray-600 z-10">
                    <div className="flex items-center space-x-2 text-red-600 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Delete {currentName}?</span>
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] uppercase tracking-wide text-gray-400">
                      {Object.keys(speakers).length > 1 && (
                        <label className="flex items-center space-x-1">
                          <input
                            type="radio"
                            name={`delete-action-${speakerId}`}
                            value="reassign"
                            checked={deleteAction === 'reassign'}
                            onChange={() => setDeleteAction('reassign')}
                          />
                          <span>Reassign</span>
                        </label>
                      )}
                      <label className="flex items-center space-x-1">
                        <input
                          type="radio"
                          name={`delete-action-${speakerId}`}
                          value="delete"
                          checked={deleteAction === 'delete'}
                          onChange={() => setDeleteAction('delete')}
                        />
                        <span>Remove Segments</span>
                      </label>
                    </div>
                    {deleteAction === 'reassign' && Object.keys(speakers).length > 1 ? (
                      <select
                        value={reassignToSpeaker}
                        onChange={(e) => setReassignToSpeaker(e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-gray-800 bg-white"
                      >
                        {Object.keys(speakers)
                          .filter(id => id !== speakerId)
                          .map(id => (
                            <option key={id} value={id}>
                              {getSpeakerDisplayName(speakers[id])}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <p className="text-gray-500">
                        Segments assigned to this speaker will be removed.
                      </p>
                    )}
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setPendingDeleteSpeaker(null)}
                        className="px-2 py-1 text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmDelete}
                        disabled={deletingSpeaker === speakerId}
                        className="inline-flex items-center px-3 py-1.5 rounded bg-red-600 text-white font-semibold disabled:opacity-50"
                      >
                        {deletingSpeaker === speakerId ? (
                          <span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Selection Controls */}
      {projectId && selectedSegments.size > 0 && (
        <div className="p-4 border border-blue-100 bg-blue-50 rounded-lg text-xs text-blue-900 space-y-3">
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
      <div className="space-y-4 max-h-96 overflow-y-auto p-2">
        {filteredSegments.map(({ segment, index: segmentIndex }) => {
          const speaker = speakers[segment.speakerId];

          // Safety check: skip segments with missing speaker data (can happen during reassignment)
          if (!speaker) {
            console.warn(`Speaker ${segment.speakerId} not found in speakers record`);
            return null;
          }

          const speakerName = getSpeakerDisplayName(speaker) || 'Unknown Speaker';
          const speakerRoleLabel = formatRoleLabel(speaker.role);
          const roleTooltip = speaker.roleSummary || (speaker.autoRoleAssigned ? 'Automatically assigned role' : '');
          const colorClass = getSpeakerColor(segment.speakerId);
          const duration = segment.endTime - segment.startTime;
          const isSelected = selectedSegments.has(segmentIndex);

          // Additional safety: if speakerName is still empty/undefined, skip this segment
          if (!speakerName || speakerName.trim() === '') {
            console.warn(`Empty speaker name for segment ${segmentIndex}`);
            return null;
          }

          return (
            <div
              key={`${segment.speakerId}-${segmentIndex}`}
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
                    <span className={`text-sm font-semibold ${colorClass.split(' ')[0]}`}>
                      {speakerName}
                    </span>
                    {speakerRoleLabel && (
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
                    <label className="text-[11px] uppercase tracking-wide text-gray-400">
                      Reassign
                    </label>
                    <select
                      value={segment.speakerId}
                      onChange={(e) => {
                        if (e.target.value === segment.speakerId) return;
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

      {/* Footer Stats */}
      <div className="text-xs text-gray-500 pt-4 mt-4 border-t border-gray-200">
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

      {activeInsightCard && (
        <InsightDetailPanel
          card={activeInsightCard}
          onClose={() => setActiveInsightId(null)}
          onRunResearch={() => handleRunDeepResearch(activeInsightCard)}
          isResearching={researchingInsightId === activeInsightCard.entityId}
        />
      )}

      {showInlineInsights && inlineInsightPresets.length > 0 && (
        <InlineInsightsDrawer
          cards={inlineInsightPresets}
          activeInsightIds={activeInsightIds}
          togglePreset={togglePresetInsight}
          activeCount={activeInlineInsights.length}
          totalCount={inlineInsightPresets.length}
          onClose={() => setShowInlineInsights(false)}
        />
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

  return Object.entries(speakerData.speakers)
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
        segments.find(segment => segment.speakerId === speakerId && segment.text?.trim()) ||
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
    .filter((card): card is InsightCard => Boolean(card));
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
      const priority = { org: 3, product: 2, concept: 1, person: 0, social: 0 };
      const prioA = priority[catA] || 0;
      const prioB = priority[catB] || 0;

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

function InsightDetailPanel({
  card,
  onClose,
  onRunResearch,
  isResearching
}: {
  card: InsightCard;
  onClose: () => void;
  onRunResearch: () => void;
  isResearching: boolean;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 z-30 w-full max-w-lg bg-white border border-gray-200 shadow-2xl rounded-2xl p-5 space-y-4"
      data-insight-panel="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">
            Insight • {card.category.toUpperCase()}
          </span>
          {card.status && (
            <span className="text-[11px] uppercase tracking-wide text-gray-400">
              {card.status.replace('_', ' ')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close insight details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-base font-semibold text-gray-900 leading-relaxed">
        {card.summary || card.transcriptExcerpt}
      </p>

      {card.whyItMatters && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">Why it matters</p>
          <p className="text-sm text-gray-700 leading-relaxed">
            {card.whyItMatters}
          </p>
        </div>
      )}

      {card.relatedConcepts && card.relatedConcepts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">Related concepts</p>
          <div className="flex flex-wrap gap-2">
            {card.relatedConcepts.map((concept, idx) => (
              <span
                key={idx}
                className="inline-block px-2 py-1 text-xs bg-amber-50 text-amber-800 rounded-md border border-amber-200"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Transcript context</p>
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800 leading-relaxed">
          "{card.transcriptExcerpt}"
        </div>
      </div>
      {card.sources && card.sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Sources</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {card.sources.map((source, idx) => (
              <div key={`${source.title}-${idx}`} className="space-y-1 border border-gray-100 rounded-lg p-2">
                <span className="text-sm text-gray-800 leading-relaxed block">
                  {source.title}
                </span>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="uppercase tracking-wide text-gray-400">
                    {source.type || 'note'}
                  </span>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800"
                    >
                      View <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Updated {new Date(card.updatedAt).toLocaleDateString()}</span>
        {card.origin && <span className="capitalize">{card.origin} insight</span>}
      </div>
      <button
        type="button"
        onClick={onRunResearch}
        disabled={isResearching}
        className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition disabled:opacity-60"
      >
        {isResearching ? 'Opening research...' : 'Run deeper research'}
      </button>
    </div>
  );
}

function InlineInsightsDrawer({
  cards,
  activeInsightIds,
  togglePreset,
  activeCount,
  totalCount,
  onClose
}: {
  cards: InsightCard[];
  activeInsightIds: Set<string>;
  togglePreset: (id: string) => void;
  activeCount: number;
  totalCount: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        className="hidden md:block flex-1 bg-black/30 backdrop-blur-sm"
        aria-label="Close inline insights overlay"
        onClick={onClose}
      />
      <div className="ml-auto flex h-full w-full max-w-full md:max-w-md bg-white shadow-2xl ring-1 ring-black/10 flex-col">
        <div className="px-4 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">Inline Insights</p>
            <p className="text-sm text-gray-600">
              Toggle highlights to surface takeaways directly inside the transcript.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
          {activeCount}/{totalCount} active
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cards.map((card) => {
            const isActive = activeInsightIds.has(card.entityId);
            const subtitleParts: string[] = [];
            if (card.category) subtitleParts.push(card.category);
            if (card.origin === 'speaker') subtitleParts.push('speaker');
            if (card.origin === 'takeaway') subtitleParts.push('takeaway');
            if (card.origin === 'entity') subtitleParts.push('entity');

            return (
              <button
                key={card.entityId}
                type="button"
                onClick={() => togglePreset(card.entityId)}
                className={`w-full text-left rounded-xl border p-4 transition shadow-sm ${
                  isActive ? 'border-amber-400 bg-amber-50/80' : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{card.label}</p>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      {subtitleParts.join(' • ')}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isActive ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isActive ? 'Active' : 'Enable'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-600 line-clamp-3">{card.summary}</p>
                <div className="mt-2 text-[11px] text-gray-500 line-clamp-2">{card.transcriptExcerpt}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
