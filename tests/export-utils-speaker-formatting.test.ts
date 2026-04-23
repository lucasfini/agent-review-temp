import { __testUtils } from '@/lib/export-utils';

describe('export speaker formatting', () => {
  test('surfaces sponsor speakers directly and omits redundant ad tags', () => {
    const speakerData = {
      speakers: {
        speaker_1: {
          finalName: 'Vanta',
          role: 'advertiser',
        },
        speaker_2: {
          finalName: 'Josh Brown',
          role: 'guest',
        },
      },
      segments: [
        {
          speakerId: 'speaker_1',
          finalSpeakerId: 'speaker_1',
          startTime: 0,
          endTime: 5,
          text: 'Support for the show comes from Vanta.',
          segmentKind: 'ad_read',
          sponsorName: 'Vanta',
        },
        {
          speakerId: 'speaker_2',
          finalSpeakerId: 'speaker_2',
          startTime: 5,
          endTime: 10,
          text: 'Thanks for having me.',
          segmentKind: 'conversation',
        },
      ],
    };

    const orderMap = __testUtils.buildSpeakerOrderMap(speakerData);

    expect(__testUtils.getIdentityFirstSpeakerName(speakerData, 'speaker_1', orderMap)).toBe('Vanta');
    expect(__testUtils.getIdentityFirstSpeakerName(speakerData, 'speaker_2', orderMap)).toBe('Josh Brown');
    expect(__testUtils.formatConversationSegmentTag(speakerData.segments[0], 'Vanta')).toBe('');
  });

  test('markdown conversation export keeps sponsor names visible', () => {
    const project = {
      id: 'project_1',
      title: 'Prof G Markets',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Vanta',
            role: 'advertiser',
          },
          speaker_2: {
            finalName: 'Josh Brown',
            role: 'guest',
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 5,
            text: 'Support for the show comes from Vanta.',
            segmentKind: 'ad_read',
            sponsorName: 'Vanta',
          },
          {
            speakerId: 'speaker_2',
            finalSpeakerId: 'speaker_2',
            startTime: 5,
            endTime: 10,
            text: 'Thanks for having me.',
            segmentKind: 'conversation',
          },
        ],
      },
    };

    const markdown = __testUtils.formatCoreContentAsMarkdown(project as any, 'conversation');

    expect(markdown).toContain('**Vanta**');
    expect(markdown).toContain('**Josh Brown**');
    expect(markdown).not.toContain('**Advertiser**');
  });

  test('json conversation export includes detection metadata diagnostics', () => {
    const project = {
      id: 'project_1',
      title: 'Prof G Markets',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Ed Elson',
            role: 'host',
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 5,
            text: 'Welcome to Prof G Markets.',
            segmentKind: 'conversation',
          },
        ],
        detectionMetadata: {
          pipelineDiagnostics: {
            showIdentity: {
              id: 'prof_g_markets',
              displayName: 'Prof G Markets',
            },
          },
        },
      },
    };

    const json = __testUtils.formatAsJSON(
      [project as any],
      [{ projectId: 'project_1', projectTitle: 'Prof G Markets', selectedBlockIds: [], selectedCoreContent: ['conversation'] }]
    );
    const parsed = JSON.parse(json);

    expect(parsed.projects[0].coreContent.conversation.detectionMetadata.pipelineDiagnostics.showIdentity.displayName).toBe('Prof G Markets');
  });

  test('json conversation export preserves speaker trust fields and review items', () => {
    const project = {
      id: 'project_1',
      title: 'Pivot',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Kara Swisher',
            role: 'host',
            assignmentConfidence: 0.61,
            assignmentContradictions: ['vocative_conflict:Scott'],
            requiresReview: true,
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 6,
            text: "Let's get into today's news, Scott.",
            status: 'uncertain',
            confidenceReason: 'acoustic_only',
            segmentKind: 'conversation',
          },
        ],
        detectionMetadata: {
          speakerAssignmentConfidence: 0.63,
          speakerAssignmentReviewCount: 1,
          speakerAssignmentBreakdown: {
            reviewItems: [
              {
                index: 0,
                speakerId: 'speaker_1',
                reasons: ['uncertain:acoustic_only', 'anchor_turn'],
                primaryReason: 'uncertain:acoustic_only',
              },
            ],
          },
        },
      },
    };

    const json = __testUtils.formatAsJSON(
      [project as any],
      [{ projectId: 'project_1', projectTitle: 'Pivot', selectedBlockIds: [], selectedCoreContent: ['conversation'] }]
    );
    const parsed = JSON.parse(json);
    const conversation = parsed.projects[0].coreContent.conversation;

    expect(conversation.speakers.speaker_1.assignmentConfidence).toBe(0.61);
    expect(conversation.speakers.speaker_1.assignmentContradictions).toEqual(['vocative_conflict:Scott']);
    expect(conversation.speakers.speaker_1.requiresReview).toBe(true);
    expect(conversation.detectionMetadata.speakerAssignmentReviewCount).toBe(1);
    expect(conversation.detectionMetadata.speakerAssignmentBreakdown.reviewItems).toHaveLength(1);
    expect(conversation.speakerRoster[0].requiresReview).toBe(true);
  });

  test('json debug export includes raw speaker diagnostics without changing normal conversation shape', () => {
    const project = {
      id: 'project_1',
      title: 'Lex Fridman Podcast',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Lex Fridman',
            role: 'host',
            finalNameLocked: true,
            nameProvenance: ['self_id'],
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 6,
            text: 'This is the Lex Fridman Podcast.',
            segmentKind: 'conversation',
          },
        ],
        detectionMetadata: {
          pipelineDiagnostics: {
            collapsePreventionApplied: true,
            collapsePreventionResolved: true,
          },
        },
      },
    };

    const json = __testUtils.formatAsJSON(
      [project as any],
      [{ projectId: 'project_1', projectTitle: 'Lex Fridman Podcast', selectedBlockIds: [], selectedCoreContent: ['conversation'] }],
      { debug: true }
    );
    const parsed = JSON.parse(json);
    const conversation = parsed.projects[0].coreContent.conversation;

    expect(conversation.speakers.speaker_1.finalName).toBe('Lex Fridman');
    expect(conversation.debug.exportMode).toBe('debug');
    expect(conversation.debug.rawSpeakerData.speakers.speaker_1.finalNameLocked).toBe(true);
    expect(conversation.debug.pipelineDiagnostics.collapsePreventionResolved).toBe(true);
  });

  test('normal json export omits debug speaker payload unless diagnostic mode is requested', () => {
    const project = {
      id: 'project_1',
      title: 'Lex Fridman Podcast',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Lex Fridman',
            role: 'host',
            finalNameLocked: true,
            nameProvenance: ['self_id'],
          },
        },
        segments: [],
        detectionMetadata: {
          pipelineDiagnostics: {
            collapsePreventionResolved: true,
          },
        },
      },
    };

    const json = __testUtils.formatAsJSON(
      [project as any],
      [{ projectId: 'project_1', projectTitle: 'Lex Fridman Podcast', selectedBlockIds: [], selectedCoreContent: ['conversation'] }]
    );
    const parsed = JSON.parse(json);

    expect(parsed.projects[0].coreContent.conversation.debug).toBeUndefined();
  });

  test('json export excludes unselected projects instead of emitting id-title stubs', () => {
    const selectedProject = {
      id: 'project_1',
      title: 'Selected Project',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Host One',
            role: 'host',
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 4,
            text: 'Welcome back.',
            segmentKind: 'conversation',
          },
        ],
      },
    };

    const unselectedProject = {
      id: 'project_2',
      title: 'Unselected Project',
      outputs: [],
      speaker_data: {
        speakers: {
          speaker_1: {
            finalName: 'Should Not Export',
            role: 'host',
          },
        },
        segments: [
          {
            speakerId: 'speaker_1',
            finalSpeakerId: 'speaker_1',
            startTime: 0,
            endTime: 4,
            text: 'This should not be in the file.',
            segmentKind: 'conversation',
          },
        ],
      },
    };

    const json = __testUtils.formatAsJSON(
      [selectedProject as any, unselectedProject as any],
      [{ projectId: 'project_1', projectTitle: 'Selected Project', selectedBlockIds: [], selectedCoreContent: ['conversation'] }]
    );
    const parsed = JSON.parse(json);

    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].id).toBe('project_1');
    expect(parsed.projects[0].coreContent.conversation.speakers.speaker_1.finalName).toBe('Host One');
  });
});
