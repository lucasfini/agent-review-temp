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
}

interface InsightCard {
  entityId: string;
  label: string;
  category: 'person' | 'org' | 'concept' | 'product' | 'social';
  matchText: string;
  transcriptExcerpt: string;
  summary: string;
  confidence: number;
  sources: Array<{ title: string; url: string; type?: string }>;
  updatedAt: string;
  status?: 'auto_detected' | 'user_highlight' | 'refreshing';
  costUsd?: number;
}

export default function ConversationView({ 
  speakerData, 
  transcriptionText, 
  className = "",
  projectId,
  onSpeakerUpdate
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

  const formatRoleLabel = (role?: string | null) => {
    if (!role) return null;
    return role
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
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

  const mockInsights: InsightCard[] = useMemo(() => [
    {
      entityId: 'jessica-tarlov',
      label: 'Jessica Tarlov',
      category: 'person',
      matchText: 'Jessica Tarlov',
      transcriptExcerpt: '…as Jessica Tarlov mentioned about consumer trust…',
      summary: 'Jessica Tarlov is a political strategist and Fox News contributor known for consumer behavior research. Mentioned here regarding trust gaps in financial storytelling.',
      confidence: 0.93,
      sources: [
        { title: 'Fox News Bio', url: 'https://www.foxnews.com/person/t/jessica-tarlov', type: 'profile' },
        { title: 'LinkedIn', url: 'https://www.linkedin.com/in/jessica-tarlov/' }
      ],
      updatedAt: new Date().toISOString(),
      status: 'auto_detected',
      costUsd: 0.004
    },
    {
      entityId: 'deep-sea-labs',
      label: 'Deep Sea Labs Accelerator',
      category: 'org',
      matchText: 'Deep Sea Labs Accelerator',
      transcriptExcerpt: '…partnering with the Deep Sea Labs Accelerator to roll out the pilot…',
      summary: 'Deep Sea Labs Accelerator is a startup program focused on audio-first creators. Current cohort emphasizes community marketing automation.',
      confidence: 0.88,
      sources: [
        { title: 'Deep Sea Labs – Programs', url: 'https://deepsealabs.com/programs', type: 'site' },
        { title: 'TechCrunch coverage', url: 'https://techcrunch.com/' }
      ],
      updatedAt: new Date().toISOString(),
      status: 'user_highlight',
      costUsd: 0.006
    }
  ], []);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-insight-popover="true"]')) {
        setActiveInsightId(null);
      }
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

  const highlightSegmentText = (text: string) => {
    const matches: Array<{
      start: number;
      end: number;
      card: InsightCard;
      matchText: string;
    }> = [];

    mockInsights.forEach(card => {
      const escaped = card.matchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          card,
          matchText: match[0]
        });
      }
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
          data-insight-popover="true"
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
          {activeInsightId === match.card.entityId && (
            <InsightPopover
              card={match.card}
              onClose={() => setActiveInsightId(null)}
            />
          )}
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3 flex-wrap">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h4 className="text-sm font-medium text-gray-900">
            Conversation Format
          </h4>
          <span className="text-xs text-gray-500">
            {detectionMetadata.totalSpeakers} speaker{detectionMetadata.totalSpeakers !== 1 ? 's' : ''} • {detectionMetadata.totalSegments} segments
          </span>
        </div>

        <div className="flex items-center space-x-3 flex-wrap">
          {/* Timestamp Toggle */}
          <label className="flex items-center space-x-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Clock className="h-3 w-3" />
            <span>Timestamps</span>
          </label>

          {/* Speaker Filter */}
          <select
            value={selectedSpeaker || ''}
            onChange={(e) => setSelectedSpeaker(e.target.value || null)}
            className="text-xs border border-gray-300 rounded px-3 py-1.5 bg-white"
          >
            <option value="">All speakers</option>
            {speakerList.map(speakerId => (
              <option key={speakerId} value={speakerId}>
                {getSpeakerDisplayName(speakers[speakerId])}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Speaker Legend */}
      {!selectedSpeaker && speakerList.length > 1 && (
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
    </div>
  );
}

function InsightPopover({
  card,
  onClose
}: {
  card: InsightCard;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-20 mt-2 w-80 max-w-xs sm:max-w-sm bg-white border border-gray-200 rounded-xl shadow-xl p-4 space-y-3"
      data-insight-popover="true"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-600 font-semibold">
            Insight • {card.category.toUpperCase()}
          </p>
          <p className="text-base font-semibold text-gray-900">{card.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close insight"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-gray-600">
        {card.summary}
      </p>
      <div className="rounded-md bg-gray-50 p-2">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
          Transcript context
        </p>
        <p className="text-xs text-gray-700">“{card.transcriptExcerpt}”</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
          Sources
        </p>
        <div className="space-y-1.5">
          {card.sources.map(source => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-xs text-blue-600 hover:text-blue-800"
            >
              <span className="truncate">{source.title}</span>
              <ExternalLink className="h-3 w-3 ml-2 flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>Updated {new Date(card.updatedAt).toLocaleDateString()}</span>
        {card.costUsd !== undefined && (
          <span>Cost: ${card.costUsd.toFixed(3)}</span>
        )}
      </div>
      <button
        type="button"
        className="w-full inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-200 rounded-lg hover:bg-amber-200 transition-colors"
      >
        Run deeper research
      </button>
    </div>
  );
}
