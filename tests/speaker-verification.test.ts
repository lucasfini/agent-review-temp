import type { SpeakerSegment } from '@/lib/types';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

jest.mock('@/lib/billing/track-usage', () => ({
  trackOpenAIUsage: jest.fn().mockResolvedValue(undefined),
}));

import { runControlledSpeakerVerification } from '@/lib/speaker-verification';

function seg(
  speakerId: string,
  index: number,
  text: string,
  startTime: number,
  endTime: number,
  extra: Partial<SpeakerSegment> = {}
): SpeakerSegment {
  return {
    speakerId,
    finalSpeakerId: speakerId,
    initialSpeakerId: speakerId,
    startTime,
    endTime,
    text,
    confidence: 0.9,
    segmentKind: 'conversation',
    ...extra,
  };
}

function namedSpeaker(id: string, name: string, role = 'guest', confidence = 0.9) {
  return {
    id,
    finalName: name,
    fallbackName: name,
    name,
    role,
    roleConfidence: confidence,
    assignmentConfidence: confidence,
    finalNameLocked: true,
    nameProvenance: ['test'],
  };
}

function mockJsonResponse(model: string, payload: any) {
  return {
    model,
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe('controlled speaker verification', () => {
  test('skips clean high-trust speaker maps without calling GPT', async () => {
    const segments = [
      seg('speaker_1', 0, 'Welcome to the show. Today we are joined by our guest.', 0, 8),
      seg('speaker_2', 1, 'Thanks for having me. This is a substantive answer with enough words to be stable.', 8, 22),
      seg('speaker_1', 2, 'Let me ask a follow-up question about the main topic.', 22, 30),
      seg('speaker_2', 3, 'The answer is detailed and continues the same coherent guest perspective.', 30, 45),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Host Person', 'host', 0.95),
      speaker_2: namedSpeaker('speaker_2', 'Guest Person', 'guest', 0.94),
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Clean Interview',
      filename: 'clean.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.diagnostics.skipped).toBe(true);
    expect(result.diagnostics.modelsAttempted).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('deterministically clears duplicate named guest fragments on ad-heavy clusters', async () => {
    const segments = [
      seg('speaker_1', 0, 'Welcome back. My guest is Derek Thompson.', 0, 7),
      seg('speaker_3', 1, 'Thanks for having me. This long interview answer establishes the real guest cluster with substance.', 7, 30),
      seg('speaker_3', 2, 'Here is another substantive answer that clearly belongs to the same interview guest.', 35, 58),
      seg('speaker_2', 3, 'This episode is brought to you by a sponsor with ad copy and promo language.', 60, 75, {
        segmentKind: 'ad_read',
        sponsorName: 'Sponsor',
      }),
      seg('speaker_2', 4, 'Sure.', 76, 77),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jon Favreau', 'host', 0.95),
      speaker_2: namedSpeaker('speaker_2', 'Derek Thompson', 'guest', 0.84),
      speaker_3: namedSpeaker('speaker_3', 'Derek Thompson', 'guest', 0.88),
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Offline with Jon Favreau',
      filename: 'offline.mp3',
    });

    expect(result.speakers.speaker_3.finalName).toBe('Derek Thompson');
    expect(result.speakers.speaker_2.finalName).toBe('Speaker 2');
    expect(result.diagnostics.deterministicRepairs.some((repair) => repair.repairType === 'clear_duplicate_fragment_name')).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('accepts a safe medium verifier rename for an anonymous substantive guest cluster', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.91,
      proposals: [{
        repairType: 'rename',
        targetSpeakerId: 'speaker_3',
        proposedName: 'Travis Kavulla',
        proposedRole: 'guest',
        evidenceSegmentIndices: [0, 2],
        confidence: 0.86,
        reason: 'Title names Travis Kavulla and speaker_3 owns dominant reply answers.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'Today our perfect guest joins us to explain electricity prices.', 0, 10),
      seg('speaker_2', 1, 'This is a co-host setup question.', 10, 18),
      seg('speaker_3', 2, 'It is great to be here. This is a long answer about utility regulation and electric bills.', 18, 45),
      seg('speaker_3', 3, 'Another substantive answer continues the same guest perspective on the grid and market structure.', 52, 84),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Joe Weisenthal', 'host', 0.9),
      speaker_2: namedSpeaker('speaker_2', 'Tracy Alloway', 'co_host', 0.9),
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', fallbackName: 'Speaker 3', role: 'unknown', assignmentConfidence: 0.62, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Travis Kavulla Explains Why Electric Bills Shot Up Odd Lots',
      filename: 'odd-lots.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_3.finalName).toBe('Travis Kavulla');
    expect(result.speakers.speaker_3.role).toBe('guest');
    expect(result.diagnostics.modelsAttempted).toEqual(['gpt-5.2']);
    expect(result.diagnostics.acceptedRepairs).toHaveLength(1);
  });

  test('rejects unsafe verifier proposals that put human names on ad-heavy clusters', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.9,
      proposals: [{
        repairType: 'rename',
        targetSpeakerId: 'speaker_2',
        proposedName: 'Derek Thompson',
        proposedRole: 'guest',
        evidenceSegmentIndices: [2],
        confidence: 0.88,
        reason: 'Mistakenly assigns ad cluster to guest.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'Welcome to the show with Derek Thompson.', 0, 8),
      seg('speaker_3', 1, 'Thanks for having me. This substantive answer is the actual guest cluster.', 8, 35),
      seg('speaker_2', 2, 'This sponsor message includes promotional copy and offer details.', 40, 55, {
        segmentKind: 'ad_read',
        sponsorName: 'Sponsor',
      }),
      seg('speaker_2', 3, 'And now use code podcast at checkout.', 55, 65, {
        segmentKind: 'ad_read',
        sponsorName: 'Sponsor',
      }),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jon Favreau', 'host', 0.95),
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', fallbackName: 'Speaker 2', role: 'unknown', assignmentConfidence: 0.5, requiresReview: true },
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', fallbackName: 'Speaker 3', role: 'unknown', assignmentConfidence: 0.55, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Offline with Jon Favreau',
      filename: 'offline.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_2.finalName).toBe('Speaker 2');
    expect(result.diagnostics.acceptedRepairs).toHaveLength(0);
    expect(result.diagnostics.rejectedRepairs[0]?.reason).toBe('target_cluster_ad_or_promo_heavy');
  });

  test('escalates to heavy when medium finds no repair for a high-risk anonymous guest case', async () => {
    mockCreate
      .mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
        overallConfidence: 0.95,
        proposals: [],
      }))
      .mockResolvedValueOnce(mockJsonResponse('gpt-5', {
        overallConfidence: 0.9,
        proposals: [{
          repairType: 'rename',
          targetSpeakerId: 'speaker_4',
          proposedName: 'Malala Yousafzai',
          proposedRole: 'guest',
          evidenceSegmentIndices: [0, 3],
          confidence: 0.87,
          reason: 'Direct-address cue and next substantive reply bind Malala to speaker_4.',
        }],
      }));
    const segments = [
      seg('speaker_1', 0, 'We are joined by two guests today to discuss education and human rights.', 0, 11),
      seg('speaker_4', 1, 'Thank you. This is a substantive answer about education and Afghan women resisting the Taliban.', 11, 35),
      seg('speaker_4', 2, 'The second answer continues with enough detail to make this an obvious participant cluster.', 40, 62),
      seg('speaker_4', 3, 'Another answer explains the documentary and the advocacy work in a sustained way.', 70, 94),
      seg('speaker_4', 4, 'This answer keeps the same point of view and provides additional participant context.', 100, 124),
      seg('speaker_4', 5, 'The final answer is also substantive and clearly belongs to the same guest.', 130, 154),
      seg('speaker_3', 6, 'This is another guest answer from a different participant.', 160, 176),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Tommy Vietor', 'host', 0.95),
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', fallbackName: 'Speaker 3', role: 'unknown', assignmentConfidence: 0.62, requiresReview: true },
      speaker_4: { id: 'speaker_4', finalName: 'Speaker 4', fallbackName: 'Speaker 4', role: 'unknown', assignmentConfidence: 0.62, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Pod Save the World Interview',
      filename: 'pod-save.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.diagnostics.modelsAttempted).toEqual(['gpt-5.2', 'gpt-5']);
    expect(result.diagnostics.escalationReason).toBe('medium_no_repair_for_high_risk_case');
    expect(result.speakers.speaker_4.finalName).toBe('Malala Yousafzai');
  });

  test('falls back to gpt-5 when a configured verifier model is unavailable', async () => {
    process.env.SPEAKER_VERIFIER_MODEL = 'gpt-5.5-medium';
    mockCreate
      .mockRejectedValueOnce(new Error('404 The model `gpt-5.5-medium` does not exist or you do not have access to it.'))
      .mockResolvedValueOnce(mockJsonResponse('gpt-5', {
        overallConfidence: 0.91,
        proposals: [{
          repairType: 'rename',
          targetSpeakerId: 'speaker_3',
          proposedName: 'Travis Kavulla',
          proposedRole: 'guest',
          evidenceSegmentIndices: [0, 2],
          confidence: 0.86,
          reason: 'Fallback verifier assigns safe title guest.',
        }],
      }));
    const segments = [
      seg('speaker_1', 0, 'Today our perfect guest joins us to explain electricity prices.', 0, 10),
      seg('speaker_3', 1, 'It is great to be here. This is a long answer about utility regulation and electric bills.', 18, 45),
      seg('speaker_3', 2, 'Another substantive answer continues the same guest perspective on the grid.', 52, 84),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Joe Weisenthal', 'host', 0.9),
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', fallbackName: 'Speaker 3', role: 'unknown', assignmentConfidence: 0.62, requiresReview: true },
    };

    try {
      const result = await runControlledSpeakerVerification(segments, speakers, {
        title: 'Odd Lots Electricity Prices',
        filename: 'odd-lots.mp3',
        openaiApiKey: 'test-key',
      });

      expect(result.diagnostics.modelsAttempted).toEqual(['gpt-5.5-medium', 'gpt-5']);
      expect(result.diagnostics.escalationReason).toBe('model_unavailable:gpt-5.5-medium');
      expect(result.speakers.speaker_3.finalName).toBe('Travis Kavulla');
    } finally {
      delete process.env.SPEAKER_VERIFIER_MODEL;
    }
  });
});
