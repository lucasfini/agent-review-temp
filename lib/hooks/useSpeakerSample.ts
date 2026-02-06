import { useCallback, useMemo, useRef } from 'react';
import type { SpeakerSegment } from '@/lib/types';

export interface AudioPlayerRef {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
}

export interface UseSpeakerSampleOptions {
  sampleDuration?: number; // How long to play (default: 5 seconds)
}

export interface UseSpeakerSampleResult {
  play: () => void;
  bestSegment: SpeakerSegment | null;
  hasSegments: boolean;
}

/**
 * Hook to play a sample of a speaker's voice from the transcript.
 * Finds the longest segment for the speaker to avoid short "Um" or "Yes" clips.
 */
export function useSpeakerSample(
  speakerId: string,
  segments: SpeakerSegment[],
  audioPlayerRef: React.RefObject<AudioPlayerRef | null>,
  options: UseSpeakerSampleOptions = {}
): UseSpeakerSampleResult {
  const { sampleDuration = 5 } = options;
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Find the longest segment for this speaker
  const bestSegment = useMemo(() => {
    const speakerSegments = segments.filter(seg => (seg.finalSpeakerId || seg.speakerId) === speakerId);

    if (speakerSegments.length === 0) {
      return null;
    }

    return speakerSegments.reduce((longest, current) => {
      const longestDuration = longest.endTime - longest.startTime;
      const currentDuration = current.endTime - current.startTime;
      return currentDuration > longestDuration ? current : longest;
    });
  }, [speakerId, segments]);

  const play = useCallback(() => {
    if (!bestSegment || !audioPlayerRef.current) {
      console.warn(`Cannot play sample: ${!bestSegment ? 'No segments found' : 'Audio player not ready'}`);
      return;
    }

    // Clear any existing stop timeout
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }

    const player = audioPlayerRef.current;

    // Seek to the start of the best segment
    player.seekTo(bestSegment.startTime);
    player.play();

    // Calculate actual play duration (don't exceed segment length)
    const segmentDuration = bestSegment.endTime - bestSegment.startTime;
    const actualDuration = Math.min(sampleDuration, segmentDuration);

    // Stop playback after the sample duration
    stopTimeoutRef.current = setTimeout(() => {
      player.pause();
    }, actualDuration * 1000);
  }, [bestSegment, audioPlayerRef, sampleDuration]);

  return {
    play,
    bestSegment,
    hasSegments: bestSegment !== null,
  };
}
