import { useCallback, useState } from 'react';
import { shiftSpeakerLabels, realignSpeakerLabels } from '@/lib/utils/shiftSpeakerLabels';

type Segment = {
  id: string;
  speakerId: string;
  text: string;
  startTime: number;
};

type ShiftDirection = 'forward' | 'backward';

interface UseShiftCascadeOptions {
  onSegmentsChange: (segments: Segment[]) => void;
  speakerOrder: string[]; // e.g., ['speaker_A', 'speaker_B', 'speaker_C']
}

interface ShiftHistory {
  segments: Segment[];
  timestamp: number;
}

/**
 * Hook for managing speaker label shift operations with undo support.
 */
export function useShiftCascade(
  segments: Segment[],
  { onSegmentsChange, speakerOrder }: UseShiftCascadeOptions
) {
  const [history, setHistory] = useState<ShiftHistory[]>([]);

  // Save current state before making changes
  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-9), { segments, timestamp: Date.now() }]);
  }, [segments]);

  /**
   * Shift all labels forward or backward from a segment
   */
  const shiftFrom = useCallback(
    (segmentId: string, direction: ShiftDirection) => {
      saveToHistory();
      const result = shiftSpeakerLabels(segments, segmentId, direction, speakerOrder);
      onSegmentsChange(result.segments);
      return result.affectedCount;
    },
    [segments, speakerOrder, onSegmentsChange, saveToHistory]
  );

  /**
   * Realign labels by specifying the correct speaker at a segment
   * All following segments will shift to maintain the rotation
   */
  const realignFrom = useCallback(
    (segmentId: string, correctSpeakerId: string) => {
      saveToHistory();
      const result = realignSpeakerLabels(segments, segmentId, correctSpeakerId, speakerOrder);
      onSegmentsChange(result.segments);
      return result.affectedCount;
    },
    [segments, speakerOrder, onSegmentsChange, saveToHistory]
  );

  /**
   * Undo the last shift operation
   */
  const undo = useCallback(() => {
    if (history.length === 0) return false;

    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    onSegmentsChange(lastState.segments);
    return true;
  }, [history, onSegmentsChange]);

  return {
    shiftFrom,
    realignFrom,
    undo,
    canUndo: history.length > 0,
  };
}
