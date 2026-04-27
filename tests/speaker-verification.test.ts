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

  test('keeps protected host identity when verifier flags only some host segments as quoted audio', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.86,
      proposals: [{
        repairType: 'classifyQuotedAudio',
        targetSpeakerId: 'speaker_1',
        proposedName: 'Jane Coaston',
        proposedRole: 'host',
        evidenceSegmentIndices: [1],
        confidence: 0.8,
        reason: 'One segment is Trump podium audio inside the host cluster.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, "I'm Jane Coaston and this is What A Day.", 0, 12),
      seg('speaker_1', 1, 'Tonight, I am inviting every legislator to join with my administration.', 20, 40),
      seg('speaker_2', 2, 'This is a substantive response from another guest participant in the discussion.', 45, 70),
      seg('speaker_2', 3, 'Another substantive answer from the same guest keeps the file risky enough for verification.', 75, 105),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jane Coaston', 'host', 0.95),
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', fallbackName: 'Speaker 2', role: 'unknown', assignmentConfidence: 0.6, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'What A Day State of the Union',
      filename: 'what-a-day.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_1.finalName).toBe('Jane Coaston');
    expect(result.speakers.speaker_1.role).toBe('host');
    expect(result.segments[1].segmentKind).toBe('quoted_audio');
    expect(result.segments[0].segmentKind).toBe('conversation');
    expect(result.diagnostics.acceptedRepairs[0]?.reason).toBe('accepted_segment_level_quoted_audio_for_protected_speaker');
  });

  test('allows whole-cluster quoted audio classification for anonymous clip clusters', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.88,
      proposals: [{
        repairType: 'classifyQuotedAudio',
        targetSpeakerId: 'speaker_3',
        proposedName: null,
        proposedRole: 'quoted_audio',
        evidenceSegmentIndices: [1, 2],
        confidence: 0.86,
        reason: 'Anonymous cluster is entirely quoted rally audio.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'The show starts with a host setup and then quoted tape.', 0, 12),
      seg('speaker_3', 1, 'President Trump said this at the rally and the crowd responded.', 15, 35),
      seg('speaker_3', 2, 'This quote from the podium continued for several sentences.', 35, 55),
      seg('speaker_2', 3, 'This is a separate substantive anonymous guest response that keeps verification triggered.', 60, 90),
      seg('speaker_2', 4, 'Another substantive guest response follows.', 95, 120),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Host Person', 'host', 0.95),
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', fallbackName: 'Speaker 2', role: 'unknown', assignmentConfidence: 0.6, requiresReview: true },
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', fallbackName: 'Speaker 3', role: 'unknown', assignmentConfidence: 0.6, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Clip Test',
      filename: 'clip.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_3.role).toBe('quoted_audio');
    expect(result.segments[1].segmentKind).toBe('quoted_audio');
    expect(result.segments[2].segmentKind).toBe('quoted_audio');
  });

  test('preserves advertiser names when verifier clears advertiser clusters', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.9,
      proposals: [{
        repairType: 'clearName',
        targetSpeakerId: 'speaker_5',
        proposedName: null,
        proposedRole: 'advertiser',
        evidenceSegmentIndices: [2],
        confidence: 0.93,
        reason: 'Sponsor read should not become a human participant.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'Host setup for this episode.', 0, 10),
      seg('speaker_2', 1, 'This is a substantive anonymous guest answer that triggers verification.', 10, 40),
      seg('speaker_5', 2, 'This episode is brought to you by Smalls. Visit smalls dot com and use code podcast.', 50, 80, {
        segmentKind: 'ad_read',
        sponsorName: 'Smalls',
      }),
      seg('speaker_2', 3, 'Another substantive anonymous guest answer continues here.', 90, 120),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jane Coaston', 'host', 0.95),
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', fallbackName: 'Speaker 2', role: 'unknown', assignmentConfidence: 0.6, requiresReview: true },
      speaker_5: { id: 'speaker_5', finalName: 'Smalls', fallbackName: 'Smalls', name: 'Smalls', role: 'advertiser', assignmentConfidence: 0.8 },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Advertiser Test',
      filename: 'ad.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_5.finalName).toBe('Smalls');
    expect(result.speakers.speaker_5.role).toBe('advertiser');
    expect(result.segments[2].segmentKind).toBe('ad_read');
    expect(result.diagnostics.acceptedRepairs[0]?.reason).toBe('accepted_advertiser_demotion');
  });

  test('marks demoted advertiser cluster segments as ad reads', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.9,
      proposals: [{
        repairType: 'demote',
        targetSpeakerId: 'speaker_2',
        proposedName: null,
        proposedRole: 'advertiser',
        evidenceSegmentIndices: [2, 3],
        confidence: 0.86,
        reason: 'Cluster is sponsor copy.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'Joining me today is Derek Thompson.', 0, 10),
      seg('speaker_3', 1, 'This is the substantive guest answer.', 10, 40),
      seg('speaker_2', 2, 'This episode is brought to you by 3 Day Blinds with a limited time offer.', 45, 70),
      seg('speaker_2', 3, 'Use code podcast at checkout to save on your order.', 70, 90),
      seg('speaker_3', 4, 'Another substantive guest answer keeps the dominant cluster clear.', 95, 125),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jon Favreau', 'host', 0.95),
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', fallbackName: 'Speaker 2', role: 'unknown', assignmentConfidence: 0.55, requiresReview: true },
      speaker_3: namedSpeaker('speaker_3', 'Derek Thompson', 'guest', 0.88),
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'Offline with Jon Favreau',
      filename: 'offline.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_2.role).toBe('advertiser');
    expect(result.segments[2].segmentKind).toBe('ad_read');
    expect(result.segments[3].segmentKind).toBe('ad_read');
  });

  test('accepts residual second guest binding when verifier has clean enough evidence', async () => {
    mockCreate.mockResolvedValueOnce(mockJsonResponse('gpt-5.2', {
      overallConfidence: 0.86,
      proposals: [{
        repairType: 'bindIntroName',
        targetSpeakerId: 'speaker_4',
        proposedName: 'Matt Berg',
        proposedRole: 'guest',
        evidenceSegmentIndices: [0, 3],
        confidence: 0.72,
        reason: 'Intro names Greg Walters and Matt Berg; Greg is already bound and speaker_4 is the remaining substantive guest cluster.',
      }],
    }));
    const segments = [
      seg('speaker_1', 0, 'I spoke with my colleagues Greg Walters and Matt Berg.', 0, 12),
      seg('speaker_2', 1, 'Thanks for having us.', 12, 15),
      seg('speaker_4', 2, 'Thanks for having us.', 15, 18),
      seg('speaker_4', 3, 'This is a substantive answer from the remaining second guest cluster.', 20, 50),
      seg('speaker_4', 4, 'Another substantive answer follows from the same second guest.', 55, 90),
    ];
    const speakers = {
      speaker_1: namedSpeaker('speaker_1', 'Jane Coaston', 'host', 0.95),
      speaker_2: namedSpeaker('speaker_2', 'Greg Walters', 'guest', 0.8),
      speaker_4: { id: 'speaker_4', finalName: 'Speaker 4', fallbackName: 'Speaker 4', role: 'unknown', assignmentConfidence: 0.6, requiresReview: true },
    };

    const result = await runControlledSpeakerVerification(segments, speakers, {
      title: 'What A Day',
      filename: 'what-a-day.mp3',
      openaiApiKey: 'test-key',
    });

    expect(result.speakers.speaker_4.finalName).toBe('Matt Berg');
    expect(result.speakers.speaker_4.role).toBe('guest');
  });
});
