'use client';

import { useState, RefObject } from 'react';
import { Play, Loader2, MoreHorizontal, Check, X } from 'lucide-react';
import { TableRow, TableCell } from '@/components/ui/table';
import { useSpeakerSample, AudioPlayerRef } from '@/lib/hooks/useSpeakerSample';
import type { SpeakerSegment, SpeakerProfile } from '@/lib/types';

interface SpeakerRowProps {
  speaker: SpeakerProfile;
  segments: SpeakerSegment[];
  audioPlayerRef: RefObject<AudioPlayerRef | null>;
  onRename: (speakerId: string, newName: string) => void;
  onMergeRequest: (speakerId: string) => void;
}

export function SpeakerRow({
  speaker,
  segments,
  audioPlayerRef,
  onRename,
  onMergeRequest,
}: SpeakerRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(speaker.name || speaker.fallbackName || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { play, hasSegments, bestSegment } = useSpeakerSample(
    speaker.id,
    segments,
    audioPlayerRef,
    { sampleDuration: 5 }
  );

  const handlePlaySample = () => {
    if (!hasSegments) return;

    setIsPlaying(true);
    play();

    // Reset playing state after sample duration
    const duration = bestSegment
      ? Math.min(5, bestSegment.endTime - bestSegment.startTime)
      : 5;
    setTimeout(() => setIsPlaying(false), duration * 1000);
  };

  const handleSave = () => {
    if (name.trim() && name !== (speaker.name || speaker.fallbackName || '')) {
      onRename(speaker.id, name.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(speaker.name || speaker.fallbackName || '');
    setIsEditing(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayName = speaker.name || speaker.fallbackName || `Speaker ${speaker.id}`;

  return (
    <TableRow>
      {/* Play Sample */}
      <TableCell className="w-16">
        <button
          onClick={handlePlaySample}
          disabled={!hasSegments || isPlaying}
          className={`
            flex items-center justify-center w-9 h-9 rounded-full
            transition-all duration-200
            ${hasSegments
              ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
            ${isPlaying ? 'animate-pulse' : ''}
          `}
          title={hasSegments ? 'Play 5s sample' : 'No audio segments'}
        >
          {isPlaying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>
      </TableCell>

      {/* Speaker Name */}
      <TableCell>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={handleSave}
              className="p-1 text-green-600 hover:text-green-800"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <span className="font-medium">{displayName}</span>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                title="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-28 rounded-md border bg-white shadow-md z-10">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setIsEditing(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onMergeRequest(speaker.id);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                  >
                    Merge
                  </button>
                </div>
              )}
            </div>
            {speaker.role && (
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                {speaker.role}
              </span>
            )}
          </div>
        )}
      </TableCell>

      {/* Segment Count */}
      <TableCell className="text-right text-gray-600">
        {speaker.segmentCount}
      </TableCell>

      {/* Duration */}
      <TableCell className="text-right text-gray-600 font-mono text-sm">
        {formatDuration(speaker.totalDuration)}
      </TableCell>
    </TableRow>
  );
}
