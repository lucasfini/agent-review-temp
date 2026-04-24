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

  test('finalization diagnostics preserve final speaker name provenance', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 0,
          endTime: 12,
          text: 'Thanks for having me.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_2: {
          id: 'speaker_2',
          finalName: 'David Rothkopf',
          role: 'guest',
          finalNameLocked: true,
          nameProvenance: ['direct_intro', 'guest_intro'],
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {
        pipelineDiagnostics: {
          finalizationSnapshots: [
            {
              stage: 'pre_final',
              conversationalNaming: {
                nameProvenance: [],
              },
            },
          ],
        },
      },
    });

    expect(
      speakerData.detectionMetadata.pipelineDiagnostics.finalizationSnapshots[0].conversationalNaming.nameProvenance
    ).toEqual([
      expect.objectContaining({
        speakerId: 'speaker_2',
        finalName: 'David Rothkopf',
        provenance: ['direct_intro', 'guest_intro'],
        finalNameLocked: true,
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

  test('unresolved uncertain conversational segments create targeted review items even without speaker-level review flags', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 8,
          text: "Let's get into today's news, Scott.",
          status: 'uncertain',
          confidenceReason: 'acoustic_only',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 8,
          endTime: 28,
          text: 'Longer substantive turn that should still count as the same conversational cluster.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Kara Swisher',
          role: 'host',
          assignmentConfidence: null,
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {},
    });

    expect(speakerData.detectionMetadata.speakerAssignmentReviewCount).toBeGreaterThan(0);
    expect(getReviewSegmentIndicesFromSpeakerData(speakerData)).toContain(0);
    expect(getReviewItemsFromSpeakerData(speakerData)[0]).toEqual(
      expect.objectContaining({
        index: 0,
        primaryReason: expect.stringContaining('uncertain:'),
      })
    );
  });

  test('stable interview speakers with repeated short boundaries keep high trust and narrow review', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 7,
          text: 'David, how seriously should we take these threats?',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 7.2,
          endTime: 9,
          text: 'Right.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 9,
          endTime: 42,
          text: 'Very serious. The reality is that they know they are going to lose and they are trying to put their thumb on the scale in every conceivable way.',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 42.2,
          endTime: 43.4,
          text: 'Yeah.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 43.5,
          endTime: 50,
          text: 'What about the Democrats?',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 50,
          endTime: 84,
          text: 'They need to understand that the institutions are only as strong as the people willing to defend them in public.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Joanna Coles',
          role: 'host',
          assignmentConfidence: 0.9,
          assignmentContradictions: [],
          requiresReview: false,
        },
        speaker_2: {
          finalName: 'David Rothkopf',
          role: 'guest',
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {},
    });

    expect(speakerData.speakers.speaker_2.assignmentConfidence).toBeGreaterThanOrEqual(0.88);
    expect(speakerData.detectionMetadata.speakerAssignmentConfidence).toBeGreaterThan(0.9);
    expect(speakerData.detectionMetadata.speakerAssignmentReviewCount).toBeLessThanOrEqual(2);
  });

  test('panel intros with corroborated ownership suppress repeated acknowledgement review noise', () => {
    const speakerData = attachSpeakerAssignmentMetadata({
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 42,
          text: "Hello and welcome. I'm Greer Jackson, and today we have Caroline Steele, Akshat Vohrati, and Justin Rowlett on the panel.",
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 42.1,
          endTime: 43.2,
          text: 'Hi.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 43.3,
          endTime: 47,
          text: 'Caroline, tell us about the new series.',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 47,
          endTime: 78,
          text: "I've spent the last few months trying to find somewhere on Earth unaffected by humans, and the search taught me a lot about how we define untouched nature.",
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_3',
          finalSpeakerId: 'speaker_3',
          startTime: 78.2,
          endTime: 79.3,
          text: 'Lovely to be here.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 79.4,
          endTime: 82,
          text: 'Akshat, good to have you here.',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_3',
          finalSpeakerId: 'speaker_3',
          startTime: 82,
          endTime: 112,
          text: 'Nice to be here. The green jobs market is changing because adaptation work is expanding faster than many people expected.',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_4',
          finalSpeakerId: 'speaker_4',
          startTime: 112.2,
          endTime: 113.1,
          text: 'Yeah.',
          status: 'uncertain',
          confidenceReason: 'transition_short',
        },
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 113.2,
          endTime: 116,
          text: 'Justin, what do you think?',
          status: 'confirmed',
        },
        {
          speakerId: 'speaker_4',
          finalSpeakerId: 'speaker_4',
          startTime: 116,
          endTime: 150,
          text: 'I think the most important part is that climate reporting now requires domain expertise in science, policy, and labor markets at the same time.',
          status: 'confirmed',
        },
      ],
      speakers: {
        speaker_1: {
          finalName: 'Greer Jackson',
          role: 'host',
          assignmentConfidence: 0.92,
          assignmentContradictions: [],
          requiresReview: false,
        },
        speaker_2: {
          finalName: 'Caroline Steele',
          role: 'guest',
          assignmentContradictions: [],
          requiresReview: false,
        },
        speaker_3: {
          finalName: 'Akshat Vohrati',
          role: 'guest',
          assignmentContradictions: [],
          requiresReview: false,
        },
        speaker_4: {
          finalName: 'Justin Rowlett',
          role: 'guest',
          assignmentContradictions: [],
          requiresReview: false,
        },
      },
      detectionMetadata: {},
    });

    expect(speakerData.detectionMetadata.speakerAssignmentConfidence).toBeGreaterThan(0.85);
    expect(speakerData.detectionMetadata.speakerAssignmentReviewCount).toBeLessThanOrEqual(3);
    expect(speakerData.detectionMetadata.pipelineDiagnostics.finalReviewSummary.calibrationSummary).toEqual(
      expect.objectContaining({
        panelCorroborationApplied: true,
      })
    );
  });
});
