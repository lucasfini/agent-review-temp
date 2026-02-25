'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, UserCheck, AlertTriangle } from 'lucide-react';

type Segment = {
  id: string;
  speakerId: string;
  finalSpeakerId?: string;
  text: string;
  startTime: number;
  endTime?: number;
};

interface Speaker {
  id: string;
  name: string;
  color?: string;
}

interface TranscriptSegmentWithShiftProps {
  segment: Segment;
  index: number;
  speaker: Speaker;
  speakers: Speaker[];
  onShiftDown: (segmentId: string) => number;
  onShiftUp: (segmentId: string) => number;
  onReassign: (segmentId: string, newSpeakerId: string) => void;
  formatTime?: (seconds: number) => string;
  isLowConfidence?: boolean;
}

export function TranscriptSegmentWithShift({
  segment,
  index,
  speaker,
  speakers,
  onShiftDown,
  onShiftUp,
  onReassign,
  formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },
  isLowConfidence = false,
}: TranscriptSegmentWithShiftProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReassignSubmenu, setShowReassignSubmenu] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowReassignSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMenu(false);
        setShowReassignSubmenu(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const showFeedback = (type: 'success' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleShiftDown = () => {
    const count = onShiftDown(segment.id);
    showFeedback('success', `Shifted ${count} segments down`);
    setShowMenu(false);
  };

  const handleShiftUp = () => {
    const count = onShiftUp(segment.id);
    showFeedback('success', `Shifted ${count} segments up`);
    setShowMenu(false);
  };

  const handleReassign = (newSpeakerId: string) => {
    onReassign(segment.id, newSpeakerId);
    showFeedback('info', `Reassigned to ${speakers.find(s => s.id === newSpeakerId)?.name || newSpeakerId}`);
    setShowMenu(false);
    setShowReassignSubmenu(false);
  };

  const speakerColor = speaker.color || '#3B82F6';

  return (
    <div className="group relative flex gap-3 py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors">
      {/* Segment Number */}
      <div className="flex-shrink-0 w-8 text-xs text-gray-400 pt-1 text-right">
        #{index + 1}
      </div>

      {/* Speaker Label with Menu Trigger */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-all hover:ring-2 hover:ring-offset-1"
          style={{
            backgroundColor: speakerColor + '15',
            color: speakerColor,
            borderLeft: `3px solid ${speakerColor}`,
          }}
        >
          {speaker.name}
          {isLowConfidence && (
            <span title="Low confidence">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            </span>
          )}
          <MoreHorizontal className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Fix Speaker Drift
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Shift all labels from here onwards
              </p>
            </div>

            {/* Shift Down */}
            <button
              onClick={handleShiftDown}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-100 text-blue-600">
                <ChevronDown className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-medium">Shift Labels Down</p>
                <p className="text-xs text-gray-400">A→B, B→C, C→A...</p>
              </div>
            </button>

            {/* Shift Up */}
            <button
              onClick={handleShiftUp}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-purple-100 text-purple-600">
                <ChevronUp className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-medium">Shift Labels Up</p>
                <p className="text-xs text-gray-400">C→B, B→A, A→C...</p>
              </div>
            </button>

            <div className="border-t border-gray-100 my-1" />

            {/* Reassign to Specific Speaker */}
            <div className="relative">
              <button
                onClick={() => setShowReassignSubmenu(!showReassignSubmenu)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 text-gray-600">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <span className="font-medium">This should be...</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showReassignSubmenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Reassign Submenu */}
              {showReassignSubmenu && (
                <div className="border-t border-gray-100 bg-gray-50 py-1">
                  {speakers
                    .filter(s => s.id !== (segment.finalSpeakerId || segment.speakerId))
                    .map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleReassign(s.id)}
                        className="w-full flex items-center gap-2 px-6 py-2 text-sm text-gray-700 hover:bg-white transition-colors"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: s.color || '#6B7280' }}
                        />
                        {s.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 w-14 text-xs text-gray-400 pt-1 font-mono">
        {formatTime(segment.startTime)}
      </div>

      {/* Segment Text */}
      <p className="flex-1 text-sm text-gray-800 leading-relaxed">
        {segment.text}
      </p>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`absolute -top-10 left-12 px-3 py-1.5 rounded-md text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 ${
            feedback.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example Parent Component Usage
// ============================================================================

/*
import { useShiftCascade } from '@/lib/hooks/useShiftCascade';
import { TranscriptSegmentWithShift } from '@/components/TranscriptSegmentWithShift';

function TranscriptEditor() {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);

  const speakers = [
    { id: 'speaker_A', name: 'Emily Chen', color: '#3B82F6' },
    { id: 'speaker_B', name: 'John Smith', color: '#10B981' },
    { id: 'speaker_C', name: 'Sarah Johnson', color: '#8B5CF6' },
  ];

  const speakerOrder = speakers.map(s => s.id);

  const { shiftFrom, undo, canUndo } = useShiftCascade(segments, {
    onSegmentsChange: setSegments,
    speakerOrder,
  });

  const handleReassign = async (segmentId: string, newSpeakerId: string) => {
    // Call your API to reassign a single segment
    await fetch(`/api/projects/${projectId}/segments/reassign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segmentIndices: [segments.findIndex(s => s.id === segmentId)],
        newSpeakerId,
      }),
    });
    // Refresh segments...
  };

  return (
    <div>
      {canUndo && (
        <button onClick={undo} className="mb-4 text-sm text-blue-600">
          Undo last shift
        </button>
      )}

      <div className="divide-y divide-gray-100">
        {segments.map((segment, index) => (
          <TranscriptSegmentWithShift
            key={segment.id}
            segment={segment}
            index={index}
            speaker={speakers.find(s => s.id === (segment.finalSpeakerId || segment.speakerId)) || { id: segment.finalSpeakerId || segment.speakerId, name: segment.finalSpeakerId || segment.speakerId }}
            speakers={speakers}
            onShiftDown={(id) => shiftFrom(id, 'forward')}
            onShiftUp={(id) => shiftFrom(id, 'backward')}
            onReassign={handleReassign}
          />
        ))}
      </div>
    </div>
  );
}
*/
