// Speaker segment utilities
import { SpeakerSegment, DetectedSpeaker } from './types';

/**
 * Group speaker segments by speaker ID
 */
export function groupSegmentsBySpeaker(
  segments: SpeakerSegment[]
): Record<string, DetectedSpeaker> {
  const speakers: Record<string, DetectedSpeaker> = {};

  for (const segment of segments) {
    if (!speakers[segment.speakerId]) {
      speakers[segment.speakerId] = {
        id: segment.speakerId,
        segments: [],
        totalDuration: 0,
        segmentCount: 0,
        fallbackName: segment.speakerId
      };
    }

    speakers[segment.speakerId].segments.push(segment);
    speakers[segment.speakerId].totalDuration += segment.endTime - segment.startTime;
    speakers[segment.speakerId].segmentCount++;
  }

  return speakers;
}
