type Segment = {
  id: string;
  speakerId: string;
  text: string;
  startTime: number;
};

type ShiftDirection = 'forward' | 'backward';

interface ShiftResult {
  segments: Segment[];
  affectedCount: number;
}

/**
 * Shifts speaker labels for all segments starting from a given segment.
 * Used to fix "diarization drift" where labels become off-by-one.
 *
 * @param segments - Array of segments sorted by startTime
 * @param fromSegmentId - The segment ID where the shift starts
 * @param direction - 'forward' pushes labels down, 'backward' pulls labels up
 * @param speakerOrder - Ordered list of speaker IDs to cycle through
 * @returns New segments array with shifted labels and count of affected segments
 *
 * @example
 * // Original: [A, A, B, B, A] - but segment 3 should be A, not B
 * // After forward shift from segment 3: [A, A, A, B, B]
 */
export function shiftSpeakerLabels(
  segments: Segment[],
  fromSegmentId: string,
  direction: ShiftDirection,
  speakerOrder: string[]
): ShiftResult {
  if (speakerOrder.length === 0) {
    return { segments, affectedCount: 0 };
  }

  // Find the starting index
  const startIndex = segments.findIndex(seg => seg.id === fromSegmentId);
  if (startIndex === -1) {
    return { segments, affectedCount: 0 };
  }

  // Create a map for quick speaker index lookup
  const speakerIndexMap = new Map(speakerOrder.map((id, idx) => [id, idx]));

  // Clone segments to avoid mutation
  const newSegments = segments.map(seg => ({ ...seg }));

  // Shift all segments from startIndex onwards
  for (let i = startIndex; i < newSegments.length; i++) {
    const segment = newSegments[i];
    const currentIndex = speakerIndexMap.get(segment.speakerId);

    if (currentIndex === undefined) {
      // Speaker not in order list, skip
      continue;
    }

    let newIndex: number;
    if (direction === 'forward') {
      // Push labels down: A->B, B->C, etc.
      newIndex = (currentIndex + 1) % speakerOrder.length;
    } else {
      // Pull labels up: B->A, C->B, etc.
      newIndex = (currentIndex - 1 + speakerOrder.length) % speakerOrder.length;
    }

    segment.speakerId = speakerOrder[newIndex];
  }

  return {
    segments: newSegments,
    affectedCount: newSegments.length - startIndex,
  };
}

/**
 * Alternative: Shift labels by reassigning from a specific point using the
 * speaker at the clicked segment as the "correct" speaker for that position.
 *
 * This assumes the user clicks on a segment and says "this should be Speaker X"
 * and all following segments should shift accordingly.
 *
 * @param segments - Array of segments sorted by startTime
 * @param fromSegmentId - The segment ID where correction starts
 * @param correctSpeakerId - The speaker ID that should be at this segment
 * @param speakerOrder - Ordered list of speaker IDs to maintain rotation
 */
export function realignSpeakerLabels(
  segments: Segment[],
  fromSegmentId: string,
  correctSpeakerId: string,
  speakerOrder: string[]
): ShiftResult {
  const startIndex = segments.findIndex(seg => seg.id === fromSegmentId);
  if (startIndex === -1 || speakerOrder.length === 0) {
    return { segments, affectedCount: 0 };
  }

  const currentSpeakerId = segments[startIndex].speakerId;
  const speakerIndexMap = new Map(speakerOrder.map((id, idx) => [id, idx]));

  const currentIdx = speakerIndexMap.get(currentSpeakerId);
  const correctIdx = speakerIndexMap.get(correctSpeakerId);

  if (currentIdx === undefined || correctIdx === undefined) {
    return { segments, affectedCount: 0 };
  }

  // Calculate the offset needed
  const offset = correctIdx - currentIdx;
  if (offset === 0) {
    return { segments, affectedCount: 0 };
  }

  const newSegments = segments.map((seg, i) => {
    if (i < startIndex) return { ...seg };

    const segCurrentIdx = speakerIndexMap.get(seg.speakerId);
    if (segCurrentIdx === undefined) return { ...seg };

    const newIdx = (segCurrentIdx + offset + speakerOrder.length) % speakerOrder.length;
    return { ...seg, speakerId: speakerOrder[newIdx] };
  });

  return {
    segments: newSegments,
    affectedCount: newSegments.length - startIndex,
  };
}
