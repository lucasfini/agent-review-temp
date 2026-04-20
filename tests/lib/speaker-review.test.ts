import { attachSpeakerAssignmentMetadata } from '@/lib/speaker-finalization';
import {
  formatReviewReason,
  getReviewItemsFromSpeakerData,
  getReviewSegmentIndicesFromSpeakerData,
  getSpeakerAssignmentConfidencePercent,
  isReviewSegment,
} from '@/lib/speaker-review';

describe('speaker review trust helpers', () => {
  test('uses stored speaker assignment confidence instead of raw segment confidence', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 10,
          text: 'Opening question.',
          confidence: 0.32,
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          id: 'speaker_1',
          finalName: 'Ed Elson',
          role: 'host',
          assignmentConfidence: 0.94,
          requiresReview: false,
          assignmentContradictions: [],
        },
      },
      detectionMetadata: {
        confidence: 0.32,
      },
    });

    expect(speakerData.detectionMetadata.speakerAssignmentConfidence).toBeGreaterThan(0.9);
    expect(getSpeakerAssignmentConfidencePercent(speakerData)).toBeGreaterThan(90);
  });

  test('selects review segments from cluster-level trust signals and legacy uncertain reasons', () => {
    const speakerData = {
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 8,
          text: 'This cluster should be reviewed.',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 8,
          endTime: 10,
          text: 'Tiny uncertain fragment.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_3',
          finalSpeakerId: 'speaker_3',
          startTime: 10,
          endTime: 20,
          text: 'Stable conversational answer.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Speaker 1',
          requiresReview: true,
          assignmentConfidence: 0.41,
          assignmentContradictions: ['vocative_conflict:Ed'],
        },
        speaker_2: {
          finalName: 'Speaker 2',
          assignmentConfidence: 0.9,
          assignmentContradictions: [],
        },
        speaker_3: {
          finalName: 'Mark Zandi',
          assignmentConfidence: 0.93,
          assignmentContradictions: [],
        },
      },
      detectionMetadata: {},
    };

    expect(getReviewSegmentIndicesFromSpeakerData(speakerData)).toEqual([0, 1]);
    expect(isReviewSegment(speakerData, speakerData.segments[0], 0)).toBe(true);
    expect(isReviewSegment(speakerData, speakerData.segments[1], 1)).toBe(true);
    expect(isReviewSegment(speakerData, speakerData.segments[2], 2)).toBe(false);
  });

  test('stores final trust summary inside pipeline diagnostics', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 12,
          text: 'Scott, what do you make of that?',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Ed Elson',
          role: 'host',
          assignmentConfidence: 0.88,
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {
        pipelineDiagnostics: {
          finalizationSnapshots: [],
        },
      },
    });

    expect(speakerData.detectionMetadata.pipelineDiagnostics.finalAssignmentConfidence).toBe(
      speakerData.detectionMetadata.speakerAssignmentConfidence
    );
    expect(speakerData.detectionMetadata.pipelineDiagnostics.finalReviewSummary.reviewCount).toBe(
      speakerData.detectionMetadata.speakerAssignmentReviewCount
    );
    expect(speakerData.detectionMetadata.pipelineDiagnostics.finalRecurringOwnership).toEqual([
      expect.objectContaining({
        speakerId: 'speaker_1',
        finalName: 'Ed Elson',
        role: 'host',
      }),
    ]);
  });

  test('confirmed review segments increase trust and drop out of the review queue', () => {
    const unconfirmed = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 4,
          text: 'Ed, what do you make of this?',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 4,
          endTime: 16,
          text: 'Longer answer from the same speaker cluster to provide context.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Scott Galloway',
          role: 'co_host',
          assignmentConfidence: 0.42,
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {},
    });

    const confirmed = attachSpeakerAssignmentMetadata({
      ...unconfirmed,
      segments: unconfirmed.segments.map((segment: any, index: number) => (
        index === 0
          ? {
              ...segment,
              status: 'confirmed',
              reviewStatus: 'confirmed',
              reviewConfirmedAt: '2026-04-20T12:00:00.000Z',
            }
          : segment
      )),
    });

    expect(confirmed.detectionMetadata.speakerAssignmentConfidence).toBeGreaterThan(
      unconfirmed.detectionMetadata.speakerAssignmentConfidence
    );
    expect(getReviewSegmentIndicesFromSpeakerData(unconfirmed)).toContain(0);
    expect(getReviewSegmentIndicesFromSpeakerData(confirmed)).not.toContain(0);
  });

  test('targeted review selector does not include an entire low-confidence speaker cluster', () => {
    const segments = Array.from({ length: 12 }, (_, index) => ({
      speakerId: 'speaker_2',
      finalSpeakerId: 'speaker_2',
      startTime: index * 10,
      endTime: (index * 10) + (index === 4 ? 14 : 6),
      text: index === 0
        ? 'Ed, what do they call Bigfoot in Europe?'
        : index === 1
          ? 'How are you doing today, Ed?'
          : index === 4
            ? 'This is a longer substantive turn that should be a representative sample for review.'
            : `Regular conversational turn ${index}.`,
      status: index === 8 ? 'uncertain' : 'confirmed',
      confidenceReason: index === 8 ? 'transition_short' : undefined,
    }));

    const speakerData = attachSpeakerAssignmentMetadata({
      segments,
      speakers: {
        speaker_2: {
          finalName: 'Scott Galloway',
          role: 'co_host',
          assignmentConfidence: 0.12,
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {},
    });

    const reviewIndices = getReviewSegmentIndicesFromSpeakerData(speakerData);
    expect(reviewIndices.length).toBeGreaterThan(0);
    expect(reviewIndices.length).toBeLessThanOrEqual(5);
    expect(reviewIndices.length).toBeLessThan(segments.length);
  });

  test('uses stored review items and formats review reasons for the UI', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 6,
          text: 'Scott, what do you make of this?',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Ed Elson',
          role: 'host',
          assignmentConfidence: 0.58,
          assignmentContradictions: ['vocative_conflict:Scott'],
          requiresReview: true,
        },
      },
      detectionMetadata: {},
    });

    const reviewItems = getReviewItemsFromSpeakerData(speakerData);
    expect(reviewItems).toEqual([
      expect.objectContaining({
        index: 0,
        speakerId: 'speaker_1',
        primaryReason: expect.any(String),
        label: expect.any(String),
      }),
    ]);
    expect(formatReviewReason(reviewItems[0].primaryReason)).toBe(reviewItems[0].label);
  });
});
