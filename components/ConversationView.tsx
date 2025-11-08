"use client";

import { useState } from 'react';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import { SpeakerSegment, formatTime } from '@/lib/speaker-detection';
import { Clock, User, MessageCircle, Edit2, Check, X } from 'lucide-react';

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
  const filteredSegments = selectedSpeaker 
    ? segments.filter(segment => segment.speakerId === selectedSpeaker)
    : segments;

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
                      <button
                        onClick={() => handleEditSpeaker(speakerId, currentName)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-gray-700 transition-opacity"
                        title="Edit speaker name"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Conversation Segments */}
      <div className="space-y-4 max-h-96 overflow-y-auto p-2">
        {filteredSegments.map((segment, index) => {
          const speaker = speakers[segment.speakerId];
          const speakerName = getSpeakerDisplayName(speaker);
          const colorClass = getSpeakerColor(segment.speakerId);
          const duration = segment.endTime - segment.startTime;

          return (
            <div
              key={`${segment.speakerId}-${index}`}
              className="flex space-x-4 p-4 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
            >
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
                  <span className={`text-sm font-semibold ${colorClass.split(' ')[0]}`}>
                    {speakerName}
                  </span>
                  {showTimestamps && (
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span className="font-mono">{formatTime(segment.startTime)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{duration.toFixed(1)}s</span>
                      {segment.confidence < 0.8 && (
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

                {/* Message Text */}
                <div className="text-sm text-gray-800 leading-relaxed break-words">
                  {segment.text}
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