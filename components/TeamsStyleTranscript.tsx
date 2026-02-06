"use client";

import { getSpeakerDisplayName } from '@/lib/name-extraction';
import { formatTimeHumanReadable } from '@/lib/time-utils';
import { SpeakerSegment } from '@/lib/types';

interface TeamsStyleTranscriptProps {
  speakerData: {
    segments: SpeakerSegment[];
    speakers: Record<string, any>;
  };
}

/**
 * Teams-style transcript component that displays speaker segments with human-readable timestamps
 * Mimics Microsoft Teams transcript format: "Speaker Name, Role Timestamp\nSegment text"
 */
export default function TeamsStyleTranscript({ speakerData }: TeamsStyleTranscriptProps) {
  const { segments, speakers } = speakerData;

  // Filter out empty segments
  const validSegments = segments.filter(segment => segment.text && segment.text.trim());

  if (!validSegments.length) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-md text-center">
        No transcript segments available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-md overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {validSegments.map((segment, index) => {
        const segmentSpeakerId = segment.finalSpeakerId || segment.speakerId;
        const speaker = speakers[segmentSpeakerId];

        // Safety check: skip segments with missing speaker data
        if (!speaker) {
          console.warn(`Speaker ${segmentSpeakerId} not found in speakers record`);
          return null;
        }

        const speakerName = getSpeakerDisplayName(speaker) || 'Unknown Speaker';
        const speakerRole = speaker?.role ? `, ${speaker.role}` : '';
        const timestamp = formatTimeHumanReadable(segment.startTime);

        return (
          <div key={`segment-${index}-${segmentSpeakerId}`} className="text-sm">
            {/* Speaker header line - Teams style */}
            <div className="font-medium text-gray-700 mb-0.5">
              {speakerName}{speakerRole} {timestamp}
            </div>
            {/* Segment text */}
            <div className="text-gray-800 leading-relaxed">
              {segment.text}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
