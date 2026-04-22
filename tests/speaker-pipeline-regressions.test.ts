import fs from 'fs';
import path from 'path';

import { classifyProjectType } from '@/lib/utils/classifyProjectType';
import { extractAnchors, solveConstraints, type AffinityMatrix, type Anchor } from '@/lib/constraint-solver';
import { __testUtils, detectSponsorSegments, enforceCleanClusterConsistency, runRefactoredSpeakerPipeline } from '@/lib/refactored-speaker-pipeline';
import { extractValidatedSelfIdName } from '@/lib/name-interference';
import { STRONG_SELF_ID_PATTERNS } from '@/lib/self-id-patterns';
import {
  applyNeighborSmoothing,
  collectSpeakerPipelineSnapshot,
  finalizeSpeakerAttributionForStorage,
  mergeDuplicateSpeakersByName,
} from '@/lib/speaker-finalization';
import {
  detectShowIdentityFromContext,
  detectGenericShowIdentityFromProjects,
  extractLearnedShowRosterFromProjects,
  mergeShowRosterEntries,
} from '@/lib/show-speaker-memory';
import type { SpeakerSegment } from '@/lib/types';
import type { GPTSpeaker } from '@/lib/gpt-speaker-intelligence';
import * as gptSpeakerIntelligence from '@/lib/gpt-speaker-intelligence';
import * as llmSegmentMapping from '@/lib/llm-segment-mapping';

jest.mock('@/lib/gpt-speaker-intelligence');
jest.mock('@/lib/llm-segment-mapping');

function loadIranExportSegments(): SpeakerSegment[] {
  const exportPath = path.join(
    process.cwd(),
    'docs/jsons',
    "Pricing_the_Iran_War's_Future_—_Are_Markets_Right-_-_Prof_G_Markets-export-2026-03-11.json"
  );
  if (!fs.existsSync(exportPath)) {
    return [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 20,
        text: 'Welcome back to Prof G Markets. Ed, what are we watching this week?',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 20,
        endTime: 36,
        text: 'Scott, investors are reacting to inflation data and oil volatility.',
      },
      {
        speakerId: 'Speaker_C',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'Speaker_C',
        startTime: 36,
        endTime: 50,
        text: 'Katie, how does Europe fit into that outlook?',
      },
      {
        speakerId: 'Speaker_D',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'Speaker_D',
        startTime: 50,
        endTime: 70,
        text: 'The European response has been more cautious, especially on rates.',
      },
    ];
  }

  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const speakers = data.projects[0].coreContent.conversation.speakers as Record<string, { segments: any[] }>;

  const rawSegments: SpeakerSegment[] = Object.values(speakers)
    .flatMap(speaker => speaker.segments)
    .map(segment => ({
      speakerId: segment.initialSpeakerId || segment.speakerId,
      initialSpeakerId: segment.initialSpeakerId || segment.speakerId,
      finalSpeakerId: segment.initialSpeakerId || segment.speakerId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text,
      confidence: segment.confidence ?? 0.8,
      status: segment.status ?? 'confirmed',
    }))
    .sort((a, b) => a.startTime - b.startTime);

  return rawSegments;
}

describe('speaker pipeline regressions', () => {
  test('resolves interview guest from host intro and host from show context', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: null, role: 'unknown', confidence: 0.62, source: 'test' },
      { id: 'speaker_3', name: null, role: 'unknown', confidence: 0.62, source: 'test' },
      { id: 'speaker_5', name: 'VCX', role: 'advertiser', confidence: 0.92, source: 'sponsor_detection' },
    ];

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 120,
        text: "Welcome to Prof G Markets. Scott is off for spring break, but he will be back next week. Here to help us answer these questions, we are joined by the chief economist at Moody's Analytics, Mark Zandi. Mark, good to have you on the program.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 120,
        endTime: 210,
        text: "Thanks for having me. I think the market is underestimating the inflation risk here and I think investors need to be careful about the second-order effects.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_5',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_5',
        startTime: 210,
        endTime: 260,
        text: 'This episode is brought to you by VCX. Use code PROFG to learn more.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNames(roster, segments, {
      projectType: 'INTERVIEW',
      title: "The “Ceasefire” Won't Save The Economy",
      filename: "The_“Ceasefire”_Won’t_Save_The_Economy-export-2026-04-15-test3.json",
    });

    const speaker1 = resolved.roster.find((speaker) => speaker.id === 'speaker_1');
    const speaker3 = resolved.roster.find((speaker) => speaker.id === 'speaker_3');
    const advertiser = resolved.roster.find((speaker) => speaker.id === 'speaker_5');

    expect(speaker1?.name).toBe('Ed Elson');
    expect(speaker1?.role).toBe('host');
    expect(speaker3?.name).toBe('Mark Zandi');
    expect(speaker3?.role).toBe('guest');
    expect(advertiser?.name).toBe('VCX');
  });

  test('maps host and guest names onto saved speaker data without changing sponsor speakers', () => {
    const speakerMap = {
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Speaker 2',
        role: 'unknown',
        segments: [],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Speaker 3',
        role: 'host',
        segments: [],
      },
      speaker_7: {
        id: 'speaker_7',
        finalName: 'Vanta',
        role: 'advertiser',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 11,
        endTime: 52,
        text: "This is our cold open. Welcome to Prof G Markets. Scott is still out, he's on spring break, but we have a very special episode for you today. Josh Brown. Josh, thank you for joining us.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 52,
        endTime: 88,
        text: "I love you guys. Most of your audience, Ed, are not sitting in that seat. They don't need to trade every headline.",
        confidence: 0.61,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 120,
        endTime: 188,
        text: "All right, let's start with our first story here. Josh, what do you make of how the markets reacted?",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_7',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_7',
        startTime: 500,
        endTime: 560,
        text: 'Support for the show comes from Vanta.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'Vanta',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        title: "Don't Try to Beat This Market — Here's What to Do Instead",
        filename: "Don't_Try_to_Beat_This_Market_—_Here's_What_to_Do_Instead-export-2026-04-15-test3.json",
      }
    );

    expect(resolved.speakers.speaker_2.finalName).toBe('Ed Elson');
    expect(resolved.speakers.speaker_2.role).toBe('host');
    expect(resolved.speakers.speaker_3.finalName).toBe('Josh Brown');
    expect(resolved.speakers.speaker_3.role).toBe('guest');
    expect(resolved.speakers.speaker_7.finalName).toBe('Vanta');
    expect(resolved.speakers.speaker_7.role).toBe('advertiser');
  });

  test('test4 market pattern anchors host on intro cluster and guest on reply cluster despite stale host role', () => {
    const speakerMap = {
      speaker_1: {
        id: 'speaker_1',
        finalName: 'Speaker 1',
        role: 'unknown',
        segments: [],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Ed Elson',
        role: 'host',
        segments: [],
      },
      speaker_7: {
        id: 'speaker_7',
        finalName: 'Vanta',
        role: 'advertiser',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 11.253,
        endTime: 51.738,
        text: "This is our cold open. Welcome to Prof G Markets. Scott is still out, he's on spring break, but we have a very special episode for you today. Today we are discussing the market's reaction to the tenuous ceasefire and we are also looking at an update on big tech and also the halo stocks with the man who actually invented the term halo. This has been all the rage on Wall Street recently. It is the new investment trade, the new investment thesis in the world of AI. And the guy who created it is here. He's in the building. Josh Brown. Josh, thank you for joining us.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 51.899,
        endTime: 52.926,
        text: 'I am not in the building.',
        confidence: 0.64,
        status: 'tentative',
        confidenceReason: 'transition_short',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 60.326,
        endTime: 88.571,
        text: "Sort of. But I like to work as much as possible when I'm on vacation. So this is me vacationing on a podcast. I love you guys. Most of your audience, Ed, are not sitting in that seat.",
        confidence: 0.61,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 102.194,
        endTime: 115.324,
        text: "It was a very good time. Well, we're very glad to have you on the show, Josh, and we want to get right into it.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_7',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_7',
        startTime: 500,
        endTime: 560,
        text: 'Support for the show comes from Vanta.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'Vanta',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'PODCAST',
        title: "Don't Try to Beat This Market — Here's What to Do Instead",
        filename: "Don't_Try_to_Beat_This_Market_—_Here's_What_to_Do_Instead-export-2026-04-15-test4.json",
      }
    );

    expect(resolved.speakers.speaker_1.finalName).toBe('Ed Elson');
    expect(resolved.speakers.speaker_1.role).toBe('host');
    expect(resolved.speakers.speaker_3.finalName).toBe('Josh Brown');
    expect(resolved.speakers.speaker_3.role).toBe('guest');
    expect(resolved.speakers.speaker_7.finalName).toBe('Vanta');
  });

  test('test4 ceasefire pattern anchors host on intro cluster and guest on dominant reply cluster', () => {
    const speakerMap = {
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Speaker 2',
        role: 'unknown',
        segments: [],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Speaker 3',
        role: 'unknown',
        segments: [],
      },
      speaker_5: {
        id: 'speaker_5',
        finalName: 'VCX',
        role: 'advertiser',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0.1,
        endTime: 123.867,
        text: "Welcome to Prof G Markets. Scott is off for spring break, but he will be back next week. In the meantime, we have a big episode to share with you today with one of our favorite Prof G Markets guests. So let's get right into it. Here to help us answer these questions, we are joined by the chief economist at Moody's Analytics, geopolitics, Mark Zandi. Mark, good to have you on the program. So at the beginning of the week, the question was, are we going to bomb Iran?",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 124.332,
        endTime: 209.689,
        text: "Feels pretty close to script, more or less. You know, the president has gone down this path in other ways, and when push comes to shove, when markets start to react, he figures out a way to pivot, to stand down, and to declare victory and hopefully move on.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_5',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_5',
        startTime: 800,
        endTime: 860,
        text: 'This episode is brought to you by VCX.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'INTERVIEW',
        title: "The “Ceasefire” Won't Save The Economy",
        filename: "The_“Ceasefire”_Won’t_Save_The_Economy-export-2026-04-15-test4.json",
      }
    );

    expect(resolved.speakers.speaker_2.finalName).toBe('Ed Elson');
    expect(resolved.speakers.speaker_2.role).toBe('host');
    expect(resolved.speakers.speaker_3.finalName).toBe('Mark Zandi');
    expect(resolved.speakers.speaker_3.role).toBe('guest');
    expect(resolved.speakers.speaker_5.finalName).toBe('VCX');
  });

  test('show memory anchors recurring host and co-host before guest naming on Prof G Markets', () => {
    const speakerMap = {
      speaker_1: {
        id: 'speaker_1',
        finalName: 'Prop Team Markets',
        role: 'guest',
        segments: [],
      },
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Ed Elson',
        role: 'co_host',
        segments: [],
      },
      speaker_4: {
        id: 'speaker_4',
        finalName: 'Speaker 4',
        role: 'host',
        segments: [],
      },
      speaker_5: {
        id: 'speaker_5',
        finalName: 'Profitemarkettour',
        role: 'advertiser',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_4',
        startTime: 21.833,
        endTime: 37.407,
        text: "He's got a Sasquatch. Welcome to Prop Team Markets. It's dad minus the vulgarity. Ed, how are you?",
        confidence: 0.64,
        status: 'tentative',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 37.488,
        endTime: 61.362,
        text: "I'm doing well. It's a beautiful day here in New York. It's finally spring here, so everyone's in a good mood. Everyone's feeling happy again. So am I. So I'm doing well.",
        confidence: 0.61,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 366.255,
        endTime: 471.719,
        text: "So with all eyes on the labor market, we thought it was a great time to bring in our resident labor market expert, Catherine Ann Edwards, PhD economist, economic policy consultant, and columnist for Bloomberg News. Catherine, it's always good to see you. I'm gonna jump right in here.",
        confidence: 0.61,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_2',
        startTime: 472.252,
        endTime: 532.138,
        text: "Zandi, I think, hit the nail right on the head. Layoffs are the biggest concern. What we're seeing in the labor market is a slowdown of the gears, right?",
        confidence: 0.55,
        status: 'uncertain',
      },
      {
        speakerId: 'speaker_5',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_5',
        startTime: 194.388,
        endTime: 237.578,
        text: 'You can go get your tickets at profitemarkettour.com.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'promo',
        sponsorName: 'Profitemarkettour',
      },
    ];

    const showIdentity = detectShowIdentityFromContext({
      title: 'Is the Labor Market About to Tip Us Into Recession?',
      filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test1.json',
      segments,
    });

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'PODCAST',
        title: 'Is the Labor Market About to Tip Us Into Recession?',
        filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test1.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );
    expect(resolved.speakers.speaker_1.finalName).toBe('Ed Elson');
    expect(resolved.speakers.speaker_1.role).toBe('host');
    expect(resolved.speakers.speaker_4.finalName).toBe('Scott Galloway');
    expect(resolved.speakers.speaker_4.role).toBe('co_host');
    expect(resolved.speakers.speaker_2.finalName).toBe('Catherine Ann Edwards');
    expect(resolved.speakers.speaker_2.role).toBe('guest');
    expect(resolved.speakers.speaker_5.finalName).toBe('Profitemarkettour');
  });

  test('does not auto-learn guests into recurring show memory', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Prof G Markets',
      filename: 'Prof_G_Markets_episode.json',
      segments: [],
    });

    const learned = extractLearnedShowRosterFromProjects(
      [
        {
          title: 'Prior Prof G Markets Episode',
          metadata: {
            originalFileName: 'Prof_G_Markets_prior_episode.json',
            fileName: 'Prof_G_Markets_prior_episode.json',
          },
          processing_completed_at: '2026-04-10T12:00:00.000Z',
          speaker_data: {
            speakers: {
              speaker_1: { finalName: 'Ed Elson', role: 'host' },
              speaker_2: { finalName: 'Scott Galloway', role: 'co_host' },
              speaker_3: { finalName: 'Kevin Gordon', role: 'guest' },
            },
          },
        },
      ],
      showIdentity
    );

    expect(learned).toEqual([
      expect.objectContaining({ name: 'Ed Elson', role: 'host', confidenceSource: 'auto_learned' }),
      expect.objectContaining({ name: 'Scott Galloway', role: 'co_host', confidenceSource: 'auto_learned' }),
    ]);
  });

  test('discovers generic recurring shows from repeated titles and reuses learned host/co-host memory', () => {
    const priorProjects = [
      {
        title: 'Hard Fork - OpenAI, Apple, and the Future of Search',
        metadata: {
          originalFileName: 'Hard_Fork_OpenAI_Apple_future_of_search.mp3',
          fileName: 'Hard_Fork_OpenAI_Apple_future_of_search.mp3',
        },
        processing_completed_at: '2026-04-10T12:00:00.000Z',
        speaker_data: {
          speakers: {
            speaker_1: { finalName: 'Kevin Roose', role: 'host' },
            speaker_2: { finalName: 'Casey Newton', role: 'co_host' },
          },
        },
      },
      {
        title: 'Hard Fork - The AI Copyright Mess',
        metadata: {
          originalFileName: 'Hard_Fork_AI_Copyright_Mess.mp3',
          fileName: 'Hard_Fork_AI_Copyright_Mess.mp3',
        },
        processing_completed_at: '2026-04-14T12:00:00.000Z',
        speaker_data: {
          speakers: {
            speaker_1: { finalName: 'Kevin Roose', role: 'host' },
            speaker_2: { finalName: 'Casey Newton', role: 'co_host' },
          },
        },
      },
    ];

    const genericIdentity = detectGenericShowIdentityFromProjects({
      title: 'Hard Fork - Google’s Antitrust Problem',
      filename: 'Hard_Fork_Google_Antitrust_Problem.mp3',
      projects: priorProjects as any,
    });

    expect(genericIdentity).toEqual(
      expect.objectContaining({
        id: expect.stringContaining('generic_'),
        displayName: 'Hard Fork',
      })
    );

    const learned = extractLearnedShowRosterFromProjects(priorProjects as any, genericIdentity);
    expect(learned).toEqual([
      expect.objectContaining({ name: 'Kevin Roose', role: 'host', confidenceSource: 'auto_learned' }),
      expect.objectContaining({ name: 'Casey Newton', role: 'co_host', confidenceSource: 'auto_learned' }),
    ]);
  });

  test('rejects sponsor-derived introduced names in conversational diagnostics', () => {
    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Ed Elson', role: 'host', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', role: 'unknown', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'VCX', role: 'advertiser', segments: [] },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 6,
        text: 'Introducing VCX, the public ticker for private tech.',
        confidence: 0.8,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 7,
        endTime: 24,
        text: 'Thanks for having me on.',
        confidence: 0.8,
        status: 'confirmed',
      },
    ];

    const snapshot = collectSpeakerPipelineSnapshot(
      'post-final-naming',
      segments,
      speakerMap,
      {
        projectType: 'PODCAST',
        title: 'Prof G Markets',
        filename: 'Prof_G_Markets_episode.json',
      }
    );

    expect(snapshot.conversationalNaming.introAnchorFound).toBe(false);
    expect(snapshot.conversationalNaming.introducedName).toBeNull();
    expect(snapshot.conversationalNaming.rejectedIntroducedNames).toContain('VCX');
  });

  test('ignores prior unrelated guest memory and keeps the new episode guest on the substantive cluster', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Is the Labor Market About to Tip Us Into Recession?',
      filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test2.json',
      segments: [],
    });
    const learnedRoster = extractLearnedShowRosterFromProjects(
      [
        {
          title: 'Prof G Markets Prior Guest Episode',
          metadata: {
            originalFileName: 'Prof_G_Markets_prior_guest_episode.json',
            fileName: 'Prof_G_Markets_prior_guest_episode.json',
          },
          processing_completed_at: '2026-04-10T12:00:00.000Z',
          speaker_data: {
            speakers: {
              speaker_1: { finalName: 'Ed Elson', role: 'host' },
              speaker_2: { finalName: 'Scott Galloway', role: 'co_host' },
              speaker_3: { finalName: 'Kevin Gordon', role: 'guest' },
            },
          },
        },
      ],
      showIdentity
    );

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Scott Galloway', role: 'co_host', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Ed Elson', role: 'host', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', role: 'unknown', segments: [] },
      speaker_4: { id: 'speaker_4', finalName: 'Speaker 4', role: 'unknown', segments: [] },
      speaker_5: { id: 'speaker_5', finalName: 'VCX', role: 'advertiser', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 7,
        text: "He's got a Sasquatch. Welcome to Prop Team Markets. It's dad minus the vulgarity. Ed, how are you?",
        confidence: 0.64,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 7,
        endTime: 17,
        text: "I don't know. Big meter. People have been complaining about how pornographic my jokes are.",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 360,
        endTime: 471,
        text: "So with all eyes on the labor market, we thought it was a great time to bring in our resident labor market expert, Catherine Ann Edwards, PhD economist, economic policy consultant, and columnist for Bloomberg News. Catherine, it's always good to see you. I'm gonna jump right in here.",
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_3',
        startTime: 472,
        endTime: 532,
        text: "When you look at the labor market right now, what concerns me most is layoffs and the general slowdown in hiring.",
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'speaker_4',
        startTime: 1774,
        endTime: 1804,
        text: 'Introducing VCX, the public ticker for private tech. VCX by Fundrise gives everyone the opportunity to invest in the next generation of innovation.',
        confidence: 0.62,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Is the Labor Market About to Tip Us Into Recession?',
        filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test2.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster, learnedRoster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Scott Galloway');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Ed Elson');
    expect(finalized.speakerDataSpeakers.speaker_3.finalName).toBe('Catherine Ann Edwards');
    expect(finalized.speakerDataSpeakers.speaker_3.role).toBe('guest');
    expect(finalized.snapshot.conversationalNaming.rejectedGuestMemoryCarryovers).toEqual([]);
    expect(finalized.snapshot.conversationalNaming.rejectedIntroducedNames).toContain('VCX');
  });

  test('moves full guest identity onto the dominant answer cluster and suppresses first-name-only mislabels', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Is the Labor Market About to Tip Us Into Recession?',
      filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test3.json',
      segments: [],
    });

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Catherine', role: 'co_host', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Ed Elson', role: 'host', fallbackName: 'Speaker 2', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'Catherine Ann Edwards', role: 'guest', fallbackName: 'Speaker 3', segments: [] },
      speaker_4: { id: 'speaker_4', finalName: 'Speaker 4', role: 'unknown', fallbackName: 'Speaker 4', segments: [] },
      speaker_5: { id: 'speaker_5', finalName: 'VCX', role: 'advertiser', fallbackName: 'Speaker 5', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 8,
        text: "He's got a Sasquatch. Welcome to Prof G Markets. It's dad minus the vulgarity. Ed, how are you?",
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 8,
        endTime: 18,
        text: "I'm good. Big meter. People have been complaining about how pornographic my jokes are.",
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 360,
        endTime: 471,
        text: "So with all eyes on the labor market, we thought it was a great time to bring in our resident labor market expert, Catherine Ann Edwards, PhD economist, economic policy consultant, and columnist for Bloomberg News. Catherine, it's always good to see you. I'm gonna jump right in here.",
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 471,
        endTime: 473,
        text: 'Thanks.',
        confidence: 0.55,
        status: 'tentative',
        confidenceReason: 'transition_short',
      },
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_4',
        startTime: 473,
        endTime: 565,
        text: "When you look at the labor market right now, what concerns me most is layoffs and the general slowdown in hiring. That's the thing I'd focus on first.",
        confidence: 0.85,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_4',
        startTime: 570,
        endTime: 648,
        text: "Openings and quits have both been softening for a while now, and I think that tells you employers are getting more cautious.",
        confidence: 0.85,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'speaker_3',
        startTime: 1774,
        endTime: 1785,
        text: 'Introducing VCX, the public ticker for private tech.',
        confidence: 0.7,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_5',
        initialSpeakerId: 'Speaker_E',
        finalSpeakerId: 'speaker_5',
        startTime: 1785,
        endTime: 1804,
        text: 'VCX by Fundrise gives everyone the opportunity to invest in the next generation of innovation.',
        confidence: 0.7,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Is the Labor Market About to Tip Us Into Recession?',
        filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-17-test3.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Scott Galloway');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Ed Elson');
    expect(finalized.speakerDataSpeakers.speaker_4.finalName).toBe('Catherine Ann Edwards');
    expect(finalized.speakerDataSpeakers.speaker_4.role).toBe('guest');
    expect(finalized.speakerDataSpeakers.speaker_3.finalName).toBe('Speaker 3');
    expect(finalized.snapshot.conversationalNaming.guestCandidateRankings.length).toBeGreaterThan(0);
    expect(finalized.snapshot.conversationalNaming.guestCandidateRankings.some((candidate) => (
      candidate.speakerId === 'speaker_1' &&
      candidate.rejectedReasons.includes('fragment_cluster')
    ))).toBe(true);
    expect(finalized.snapshot.conversationalNaming.suppressedGuestFirstNames).toContain('Catherine');
  });

  test('repairs swapped recurring host and co-host ownership before final storage', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Is the Labor Market About to Tip Us Into Recession?',
      filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-20-test4.json',
      segments: [],
    });

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Scott Galloway', role: 'co_host', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Ed Elson', role: 'host', fallbackName: 'Speaker 2', segments: [] },
      speaker_4: { id: 'speaker_4', finalName: 'Catherine Ann Edwards', role: 'guest', fallbackName: 'Speaker 4', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0.032,
        endTime: 6.925,
        text: "Today is number 13. That's the percentage of U.S. adults who believe Bigfoot is real. Ed, what do they call Bigfoot in Europe?",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 7.165,
        endTime: 7.534,
        text: "I don't know.",
        confidence: 0.7,
        status: 'tentative',
        confidenceReason: 'transition_short',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 21.833,
        endTime: 37.407,
        text: "He's got a Sasquatch. Welcome to Prop Team Markets. It's dad minus the vulgarity. Ed, how are you?",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 37.488,
        endTime: 47.46,
        text: "I'm doing well. It's a beautiful day here in New York. It's finally spring here, so everyone's in a good mood.",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_4',
        startTime: 472.252,
        endTime: 532.138,
        text: "When you look at the labor market right now, what concerns me most is layoffs and the general slowdown in hiring.",
        confidence: 0.82,
        status: 'confirmed',
      },
    ];

    const preSnapshot = collectSpeakerPipelineSnapshot(
      'pre-recurring-verification',
      finalSegments,
      speakerMap,
      {
        projectType: 'PODCAST',
        title: 'Is the Labor Market About to Tip Us Into Recession?',
        filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-20-test4.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );

    expect(preSnapshot.conversationalNaming.swapDetected).toBe(true);
    expect(preSnapshot.conversationalNaming.clusterOwnershipCandidates.some((entry) => (
      entry.name === 'Ed Elson' && entry.chosenSpeakerId === 'speaker_1'
    ))).toBe(true);

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Is the Labor Market About to Tip Us Into Recession?',
        filename: 'Is_the_Labor_Market_About_to_Tip_Us_Into_Recession--export-2026-04-20-test4.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Ed Elson');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Scott Galloway');
    expect(finalized.speakerDataSpeakers.speaker_1.requiresReview).toBeFalsy();
    expect(finalized.speakerDataSpeakers.speaker_2.requiresReview).toBeFalsy();
    expect(finalized.speakerDataSpeakers.speaker_2.assignmentConfidence).toBeGreaterThanOrEqual(0.82);
    expect(finalized.snapshot.assignmentTrust.segmentReviewIndices.length).toBeLessThanOrEqual(5);
  });

  test('precision mode clears recurring names and flags review when ownership evidence is contradictory', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Prof G Markets',
      filename: 'Prof_G_Markets_episode.json',
      segments: [],
    });

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Ed Elson', role: 'host', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Scott Galloway', role: 'co_host', fallbackName: 'Speaker 2', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 10,
        text: 'Ed, what are you watching this week?',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 10,
        endTime: 20,
        text: 'Scott, what do you make of that?',
        confidence: 0.8,
        status: 'confirmed',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Prof G Markets',
        filename: 'Prof_G_Markets_episode.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Speaker 1');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Speaker 2');
    expect(finalized.speakerDataSpeakers.speaker_1.requiresReview).toBe(true);
    expect(finalized.speakerDataSpeakers.speaker_2.requiresReview).toBe(true);
  });

  test('show memory anchors Pivot hosts and repairs swapped Kara/Scott ownership', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Kara Swisher Kash Patel is a “National Security Risk” Pivot - Pivot with Kara Swisher and Scott Galloway',
      filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
      segments: [],
    });

    expect(showIdentity?.displayName).toBe('Pivot');

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Scott Galloway', role: 'co_host', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Kara Swisher', role: 'host', fallbackName: 'Speaker 2', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 15,
        text: "Let's get into today's news, Scott. FBI Director Kash Patel just filed a defamation suit.",
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 15,
        endTime: 40,
        text: 'Look, I think The Atlantic reporting is thoughtful.',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 40,
        endTime: 48,
        text: 'What does Scott Galloway think?',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 48,
        endTime: 72,
        text: "Here's the bottom line, Kara, the markets love a winner.",
        confidence: 0.8,
        status: 'confirmed',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Pivot',
        filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Kara Swisher');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Scott Galloway');
    expect(finalized.speakerDataSpeakers.speaker_1.requiresReview).toBeFalsy();
    expect(finalized.speakerDataSpeakers.speaker_2.requiresReview).toBeFalsy();
  });

  test('built-in Pivot anchors beat weak learned co-hosts and clear mention-only names from dominant clusters', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Kara Swisher Kash Patel is a “National Security Risk” Pivot - Pivot with Kara Swisher and Scott Galloway',
      filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
      segments: [],
    });

    const learnedRoster = extractLearnedShowRosterFromProjects(
      [
        {
          title: 'Pivot prior episode',
          metadata: {
            originalFileName: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_prior.json',
            fileName: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_prior.json',
          },
          processing_completed_at: '2026-04-18T12:00:00.000Z',
          speaker_data: {
            speakers: {
              speaker_1: { finalName: 'Kara Swisher', role: 'host' },
              speaker_2: { finalName: 'Scott Galloway', role: 'co_host' },
              speaker_3: { finalName: 'Kristen Soltis Anderson', role: 'co_host' },
            },
          },
        },
      ] as any,
      showIdentity
    );

    expect(learnedRoster).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Kristen Soltis Anderson' }),
      ])
    );

    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Ron Conway', role: 'guest', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Kara Swisher', role: 'host', fallbackName: 'Speaker 2', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'Speaker 3', role: 'unknown', fallbackName: 'Speaker 3', segments: [] },
      speaker_4: { id: 'speaker_4', finalName: 'IP', role: 'guest', fallbackName: 'Speaker 4', segments: [] },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 28,
        text: "Let's get into today's news, Scott. What does Scott Galloway think about the Ron Conway comments?",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 28,
        endTime: 92,
        text: "Here's the bottom line, Kara, Washington loves a fight and Kash Patel is escalating one.",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_2',
        startTime: 92,
        endTime: 95,
        text: 'Exactly.',
        confidence: 0.62,
        status: 'tentative',
        confidenceReason: 'transition_short',
      },
      {
        speakerId: 'speaker_4',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'speaker_4',
        startTime: 120,
        endTime: 128,
        text: 'The IP fight is broader than people realize.',
        confidence: 0.8,
        status: 'confirmed',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'PODCAST',
        title: 'Pivot',
        filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
        showIdentity,
        showRoster: mergeShowRosterEntries(showIdentity?.roster, learnedRoster),
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_1.finalName).toBe('Kara Swisher');
    expect(finalized.speakerDataSpeakers.speaker_3.finalName).toBe('Scott Galloway');
    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Speaker 2');
    expect(finalized.speakerDataSpeakers.speaker_4.finalName).toBe('Speaker 4');
  });

  test('duplicate-name merge does not collapse two substantive conversational host clusters on recurring podcasts', () => {
    const showIdentity = detectShowIdentityFromContext({
      title: 'Pivot',
      filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
      segments: [],
    });

    const speakers = {
      speaker_1: { id: 'speaker_1', finalName: 'Scott Galloway', role: 'co_host', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Scott Galloway', role: 'co_host', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'SoFi', role: 'advertiser', segments: [] },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 24,
        text: "Let's get into today's news, Scott. What do you make of the hearings?",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 24,
        endTime: 63,
        text: "Here's the bottom line, Kara. Washington loves the theater of these fights, but the policy reality is more limited.",
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 63,
        endTime: 95,
        text: 'That is exactly why I wanted to start there, because the incentives are very different than the headlines suggest.',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 95,
        endTime: 142,
        text: 'And when you zoom out, the market impact is smaller than people think unless the fight broadens materially.',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_3',
        startTime: 142,
        endTime: 156,
        text: 'This episode is brought to you by SoFi.',
        confidence: 0.9,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'SoFi',
      },
    ];

    const merged = mergeDuplicateSpeakersByName(segments, speakers, {
      projectType: 'PODCAST',
      title: 'Pivot',
      filename: 'Pivot_with_Kara_Swisher_and_Scott_Galloway_episode.json',
      showIdentity,
      showRoster: mergeShowRosterEntries(showIdentity?.roster),
    });

    expect(merged.mergedCount).toBe(0);
    expect(new Set(merged.segments.map((segment) => (segment as any).finalSpeakerId || segment.speakerId))).toEqual(
      new Set(['speaker_1', 'speaker_2', 'speaker_3'])
    );
    expect(Object.keys(merged.speakers).sort()).toEqual(['speaker_1', 'speaker_2', 'speaker_3']);
  });

  test('one-off host intro self-identification names the host and keeps the guest episode-local', () => {
    const speakerMap = {
      speaker_1: { id: 'speaker_1', finalName: 'Speaker 1', role: 'unknown', fallbackName: 'Speaker 1', segments: [] },
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', role: 'unknown', fallbackName: 'Speaker 2', segments: [] },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 34,
        text: "I'm Joanna Coles. This is the Daily Beast podcast. Today we're talking to David Rothkopf about what else but RFK Jr. and Kid Rock's insane video. David Rothkopf, welcome back to the show.",
        confidence: 0.84,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 34,
        endTime: 75,
        text: "Great to be here. The reality is that they realize they're going to lose, and so they are using every conceivable tool in order to put their thumb on the scale.",
        confidence: 0.84,
        status: 'confirmed',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'PODCAST',
        title: "Here's the Proof Trump Knows He's Doomed",
        filename: 'Daily_Beast_Podcast_episode.json',
      }
    );
    expect(__testUtils.extractFullNameSelfIdentifiedName(segments[0].text || '')).toBe('Joanna Coles');
    expect(__testUtils.findEarlySelfIdentifiedHost(segments)).toEqual({
      speakerId: 'speaker_1',
      fullName: 'Joanna Coles',
      reason: 'early_host_self_id',
    });

    expect(resolved.speakers.speaker_1.finalName).toBe('Joanna Coles');
    expect(resolved.speakers.speaker_1.role).toBe('host');
    expect(resolved.speakers.speaker_2.finalName).toBe('David Rothkopf');
    expect(resolved.speakers.speaker_2.role).toBe('guest');
  });

  test('eponymous show titles anchor the host and block institution leakage for guests', () => {
    const speakerMap = {
      speaker_2: { id: 'speaker_2', finalName: 'Speaker 2', role: 'quoted_audio', fallbackName: 'Speaker 2', segments: [] },
      speaker_3: { id: 'speaker_3', finalName: 'Yale Law School', role: 'guest', fallbackName: 'Speaker 3', segments: [] },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0,
        endTime: 36,
        text: 'From New York Times Opinion, this is The Ezra Klein Show. Azab Ali is a professor at Yale Law School who specializes in international law. Azab Ali, welcome to the show.',
        confidence: 0.84,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 36,
        endTime: 78,
        text: 'Thank you for having me. It is made up of laws, and it sort of depends on where you sit.',
        confidence: 0.84,
        status: 'confirmed',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'PODCAST',
        title: 'The Ezra Klein Show',
        filename: 'The_Ezra_Klein_Show_episode.json',
      }
    );

    expect(resolved.speakers.speaker_2.finalName).toBe('Ezra Klein');
    expect(resolved.speakers.speaker_2.role).toBe('host');
    expect(resolved.speakers.speaker_3.finalName).toBe('Azab Ali');
    expect(resolved.speakers.speaker_3.finalName).not.toBe('Yale Law School');
  });

  test('clears show-title contamination instead of keeping it as a human identity', () => {
    const speakerMap = {
      speaker_1: {
        id: 'speaker_1',
        finalName: 'Prop Team Markets',
        role: 'guest',
        fallbackName: 'Speaker 1',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 12,
        text: 'Welcome to Prop Team Markets. Ed, how are you?',
        confidence: 0.61,
        status: 'confirmed',
      },
    ];

    const resolved = __testUtils.resolveConversationalHumanNamesInSpeakerMap(
      speakerMap,
      segments,
      {
        projectType: 'PODCAST',
        title: 'Prof G Markets',
        filename: 'Prof_G_Markets_episode.json',
      }
    );

    expect(resolved.speakers.speaker_1.finalName).toBe('Speaker 1');
  });

  test('splits merged sponsor reads before advertiser remapping', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Ed Elson', role: 'host', confidence: 0.95, source: 'test' },
    ];

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'speaker_1',
        startTime: 0,
        endTime: 95,
        text: 'Support for the show comes from SoFi. Visit sofi.com/markets to learn more. Support for the show comes from VCX, the public ticker for private tech. Visit getvcx.com for more info.',
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = detectSponsorSegments(segments, roster);
    const sponsorNames = result.segments.map((segment) => segment.sponsorName).filter(Boolean);

    expect(result.segments).toHaveLength(2);
    expect(sponsorNames).toEqual(['SoFi', 'VCX']);
    expect(result.segments[0].finalSpeakerId).not.toBe(result.segments[1].finalSpeakerId);
  });

  test('final route-style naming reruns on the stabilized segment map before speaker_data is stored', () => {
    const speakerMap = {
      speaker_1: {
        id: 'speaker_1',
        finalName: 'Ed Elson',
        role: 'host',
        segments: [],
      },
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Speaker 2',
        role: 'unknown',
        segments: [],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Speaker 3',
        role: 'unknown',
        segments: [],
      },
      speaker_5: {
        id: 'speaker_5',
        finalName: 'VCX',
        role: 'advertiser',
        segments: [],
      },
    };

    const finalSegments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0.1,
        endTime: 123.867,
        text: "Welcome to Prof G Markets. Scott is off for spring break, but he will be back next week. In the meantime, we have a big episode to share with you today with one of our favorite Prof G Markets guests. So let's get right into it. Here to help us answer these questions, we are joined by the chief economist at Moody's Analytics, geopolitics, Mark Zandi. Mark, good to have you on the program. So at the beginning of the week, the question was, are we going to bomb Iran?",
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_3',
        startTime: 124.332,
        endTime: 209.689,
        text: 'Feels pretty close to script, more or less. You know, the president has gone down this path in other ways, and when push comes to shove, when markets start to react, he figures out a way to pivot, to stand down, and to declare victory and hopefully move on. Ed, the real risk is what happens if the Strait of Hormuz closes.',
        confidence: 0.62,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_5',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_5',
        startTime: 800,
        endTime: 860,
        text: 'This episode is brought to you by VCX.',
        confidence: 0.85,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const finalized = finalizeSpeakerAttributionForStorage(
      speakerMap,
      finalSegments,
      {
        projectType: 'INTERVIEW',
        title: "The “Ceasefire” Won't Save The Economy",
        filename: "The_“Ceasefire”_Won’t_Save_The_Economy-export-2026-04-16-test6.json",
      }
    );

    expect(finalized.speakerDataSpeakers.speaker_2.finalName).toBe('Ed Elson');
    expect(finalized.speakerDataSpeakers.speaker_2.role).toBe('host');
    expect(finalized.speakerDataSpeakers.speaker_3.finalName).toBe('Mark Zandi');
    expect(finalized.speakerDataSpeakers.speaker_3.role).toBe('guest');
    expect(finalized.speakerDataSpeakers.speaker_5.finalName).toBe('VCX');
    expect(finalized.snapshot.conversationalNaming.hostSpeakerId).toBe('speaker_2');
    expect(finalized.snapshot.conversationalNaming.guestSpeakerId).toBe('speaker_3');
  });

  test('neighbor smoothing skips cross-cluster conversational drift for interview-style uploads', () => {
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0,
        endTime: 14,
        text: 'Welcome to Prof G Markets and thanks for joining us today.',
        confidence: 0.82,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_9',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_9',
        startTime: 14,
        endTime: 15.5,
        text: 'Absolutely.',
        confidence: 0.45,
        status: 'tentative',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 15.5,
        endTime: 33,
        text: 'Mark, let me start with the macro backdrop.',
        confidence: 0.84,
        status: 'confirmed',
      },
    ];

    const smoothed = applyNeighborSmoothing(segments, { projectType: 'INTERVIEW' });

    expect(smoothed.updatedSegments).toBe(0);
    expect(smoothed.skippedCrossCluster).toBe(1);
    expect(smoothed.segments[1].finalSpeakerId).toBe('speaker_9');
  });

  test('pipeline diagnostics record conversational drift after segment rewrites', () => {
    const speakerMap = {
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Speaker 2',
        role: 'unknown',
        segments: [],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Speaker 3',
        role: 'unknown',
        segments: [],
      },
    };

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'speaker_2',
        startTime: 0,
        endTime: 40,
        text: 'Welcome to Prof G Markets. Mark, good to have you with us.',
        confidence: 0.8,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'speaker_2',
        startTime: 40,
        endTime: 70,
        text: 'Thanks for having me. Ed, the inflation backdrop is still fragile.',
        confidence: 0.78,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_3',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'speaker_3',
        startTime: 70,
        endTime: 92,
        text: 'This episode is brought to you by VCX.',
        confidence: 0.9,
        status: 'confirmed',
        segmentKind: 'ad_read',
        sponsorName: 'VCX',
      },
    ];

    const snapshot = collectSpeakerPipelineSnapshot(
      'post-neighbor-smoothing',
      segments,
      speakerMap,
      {
        projectType: 'INTERVIEW',
        title: "The “Ceasefire” Won't Save The Economy",
        filename: "The_“Ceasefire”_Won’t_Save_The_Economy-export-2026-04-16-test6.json",
      }
    );

    expect(snapshot.conversationalDrift).toEqual([
      {
        speakerId: 'speaker_2',
        initialSpeakerIds: ['Speaker_A', 'Speaker_B'],
        segmentCount: 2,
      },
    ]);
    expect(snapshot.warnings).toContain(
      'speaker_2 owns multiple conversational initialSpeakerId values: Speaker_A, Speaker_B'
    );
  });

  test('classifies the Prof G Iran panel export as PODCAST instead of DEBATE', () => {
    const rawSegments = loadIranExportSegments();
    const transcript = rawSegments.map(segment => segment.text).join(' ');

    const result = classifyProjectType(rawSegments, transcript);

    expect(result.type).toBe('PODCAST');
    expect(result.metadata.speakerCount).toBe(4);
  });

  test('does not treat direct address as self-identification', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Ed Elson', role: 'host', confidence: 0.95, source: 'test' },
      { id: 'speaker_2', name: 'Justin Wolfers', role: 'guest', confidence: 0.95, source: 'test' },
      { id: 'speaker_3', name: 'Katie Martin', role: 'guest', confidence: 0.95, source: 'test' },
    ];

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 5,
        text: 'Katie, what do you think?',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 5,
        endTime: 12,
        text: "Apologies, Ed, I'm gonna send you an unemployment invoice.",
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const anchors = extractAnchors(segments, roster);
    const selfAnchors = anchors.filter(anchor => anchor.direction === 'self');

    expect(selfAnchors).toHaveLength(0);
  });

  test('rejects prefix-only and title-fragment self-identifications', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Dr. Alok Kanoja', role: 'host', confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Thor', role: 'guest', confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: { Speaker_A: 'speaker_1', Speaker_B: 'speaker_2' },
      confidence: { Speaker_A: 0.95, Speaker_B: 0.9 },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 8,
        text: 'My name is Dr. Alok Kanoja.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 8,
        endTime: 14,
        text: "It's been rough.",
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'An_Honest_Conversation_With_PirateSoftware.m4a',
      title: 'An Honest Conversation With @PirateSoftware',
    });

    expect(result.speakers.some((speaker) => speaker.name === 'Dr')).toBe(false);
    expect(result.speakers.some((speaker) => speaker.name === 'An Honest')).toBe(false);
    expect(result.speakers.some((speaker) => speaker.name === 'Thor')).toBe(true);
  });

  test('csp resolves titled self-identification to full roster name instead of orphan prefix', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Dr. Alok Kanoja', role: 'host', confidence: 0.95, source: 'test' },
      { id: 'speaker_2', name: 'Thor', role: 'guest', confidence: 0.85, source: 'test' },
    ];

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 8,
        text: 'Push. Welcome to another healthy gamer GG stream. My name is Dr. Alok Kanoja.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 8,
        endTime: 16,
        text: "It's been rough.",
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const anchors = extractAnchors(segments, roster);
    const selfAnchors = anchors.filter((anchor) => anchor.direction === 'self');

    expect(selfAnchors).toHaveLength(1);
    expect(selfAnchors[0]?.targetIdentityName).toBe('Dr. Alok Kanoja');
  });

  test('rejects capitalized adjective self-identifications like "I\'m Wrong"', () => {
    const extracted = extractValidatedSelfIdName(
      "That is the most arrogant statement on the planet, bro. Like, tell me I'm Wrong.",
      STRONG_SELF_ID_PATTERNS
    );

    expect(extracted).toBeNull();
  });

  test('rejects additional false-positive self-identifications from adjectives, fillers, and verbs', () => {
    const samples = [
      "I'm Curious.",
      "I'm Actually.",
      "I'm Trying.",
      "I'm Support.",
      "I'm Honest.",
      'I am Right now.',
    ];

    for (const sample of samples) {
      const extracted = extractValidatedSelfIdName(sample, STRONG_SELF_ID_PATTERNS);
      expect(extracted).toBeNull();
    }
  });

  test('still allows plausible short names after expanding interference lists', () => {
    expect(extractValidatedSelfIdName("I'm Thor.", STRONG_SELF_ID_PATTERNS)).toBe('Thor');
    expect(extractValidatedSelfIdName("I'm Mark.", STRONG_SELF_ID_PATTERNS)).toBe('Mark');
    expect(extractValidatedSelfIdName('My name is Dr. Alok Kanoja.', STRONG_SELF_ID_PATTERNS)).toBe('Dr. Alok Kanoja');
  });

  test('prevents two-speaker csp collapse onto host when roster matches diarization', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Dr. Alok Kanoja', role: 'host', confidence: 0.95, source: 'test' },
      { id: 'speaker_2', name: 'Thor', role: 'guest', confidence: 0.85, source: 'test' },
    ];

    const matrix: AffinityMatrix = {
      clusters: ['Speaker_A', 'Speaker_B'],
      identities: ['speaker_1', 'speaker_2'],
      scores: [
        [45.8, 1.5],
        [35.0, 5.8],
      ],
    };

    const assignments = solveConstraints(matrix, roster);

    expect(assignments).toHaveLength(2);
    expect(assignments.find((a) => a.clusterId === 'Speaker_A')?.identityId).toBe('speaker_1');
    expect(assignments.find((a) => a.clusterId === 'Speaker_B')?.identityId).toBe('speaker_2');
  });

  test('does not use there/their phonetic prefix to steal Thor segments', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Dr. Alok Kanoja', role: 'host', confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Thor', role: 'guest', confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: { Speaker_A: 'speaker_1', Speaker_B: 'speaker_2' },
      confidence: { Speaker_A: 0.95, Speaker_B: 0.9 },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 6,
        text: 'There we go. Okay.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 6,
        endTime: 12,
        text: "It's been rough.",
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'piratesoftware.m4a',
      title: 'An Honest Conversation With @PirateSoftware',
    });

    expect(result.segments[0].finalSpeakerId).toBe('speaker_1');
    expect(result.segments[1].finalSpeakerId).toBe('speaker_2');
  });

  test('preserves weak clusters by assigning unnamed fallback before weak named mapping', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Ed Elson', role: 'host', confidence: 0.95, source: 'test' },
      { id: 'speaker_2', name: 'Justin Wolfers', role: 'guest', confidence: 0.95, source: 'test' },
      { id: 'speaker_3', name: 'Katie Martin', role: 'guest', confidence: 0.95, source: 'test' },
      { id: 'speaker_4', name: null, role: 'unknown', confidence: 0.6, source: 'cluster_floor_enforcement' },
    ];

    const matrix: AffinityMatrix = {
      clusters: ['Speaker_B', 'Speaker_C', 'Speaker_D'],
      identities: roster.map(speaker => speaker.id),
      scores: [
        [0, 6.5, 0.2, 0.1],
        [0, 0.2, 6.4, 0.1],
        [0, 0.2, 0.2, 0.1],
      ],
    };

    const assignments = solveConstraints(
      matrix,
      roster,
      undefined,
      new Map([
        ['Speaker_B', 11],
        ['Speaker_C', 9],
        ['Speaker_D', 1],
      ])
    );

    expect(assignments.find(a => a.clusterId === 'Speaker_B')?.identityId).toBe('speaker_2');
    expect(assignments.find(a => a.clusterId === 'Speaker_C')?.identityId).toBe('speaker_3');
    expect(assignments.find(a => a.clusterId === 'Speaker_D')?.identityId).toBe('speaker_4');
  });

  test('retags single-segment sponsor reads without changing speaker ownership', () => {
    const roster: GPTSpeaker[] = [
      { id: 'speaker_1', name: 'Ed Elson', role: 'host', confidence: 0.95, source: 'test' },
      { id: 'speaker_2', name: 'Justin Wolfers', role: 'guest', confidence: 0.95, source: 'test' },
    ];

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        finalSpeakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        startTime: 100,
        endTime: 130,
        text: 'Support for the show comes from Indeed. When the pressure is on and you need to hire the right person for the job, Indeed Sponsored Jobs helps you stand out and hire faster.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'speaker_1',
        finalSpeakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        startTime: 131,
        endTime: 133,
        text: "We're back with Prof G Markets.",
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = detectSponsorSegments(segments, roster);
    const sponsorSpeaker = result.roster.find((speaker) => speaker.name === 'Indeed');
    expect(sponsorSpeaker).toBeDefined();
    expect(sponsorSpeaker?.role).toBe('advertiser');
    expect(result.segments[0].finalSpeakerId).toBe(sponsorSpeaker?.id);
    expect(result.segments[0].speakerId).toBe(sponsorSpeaker?.id);
    expect(result.segments[0].confidenceReason).toContain('sponsor-ad_read');
    expect(result.segments[0].segmentKind).toBe('ad_read');
    expect(result.segments[0].sponsorName).toBe('Indeed');
  });

  test('clean cluster consistency reverts partial heuristic splits on non-dirty clusters', () => {
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        finalSpeakerId: 'speaker_1',
        initialSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 10,
        text: 'Welcome back to the show.',
        confidence: 0.9,
        status: 'confirmed',
        attributionEvidence: 'raw_diarization',
      },
      {
        speakerId: 'speaker_2',
        finalSpeakerId: 'speaker_2',
        initialSpeakerId: 'Speaker_A',
        startTime: 10,
        endTime: 20,
        text: 'This should not be split away by a late heuristic.',
        confidence: 0.8,
        status: 'tentative',
        attributionEvidence: 'handoff',
      },
    ];

    const result = enforceCleanClusterConsistency(
      segments,
      new Map([['Speaker_A', 'speaker_1']]),
      new Set<string>()
    );

    expect(result.revertedClusters).toEqual(['Speaker_A']);
    expect(result.revertedSegments).toBe(1);
    expect(result.segments.every((segment) => segment.finalSpeakerId === 'speaker_1')).toBe(true);
  });

  test('legacy output keeps unnamed conversational speakers as Speaker N instead of Advertiser', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: null, role: 'advertiser', confidence: 0.75, source: 'test' },
        { id: 'speaker_2', name: 'Josh Brown', role: 'guest', confidence: 0.9, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    const result = await runRefactoredSpeakerPipeline(
      [
        {
          speakerId: 'Speaker_A',
          initialSpeakerId: 'Speaker_A',
          startTime: 0,
          endTime: 5,
          text: 'Welcome to the show. Scott is out this week.',
          confidence: 0.9,
          status: 'confirmed',
        },
        {
          speakerId: 'Speaker_B',
          initialSpeakerId: 'Speaker_B',
          startTime: 5,
          endTime: 10,
          text: "I'm Josh Brown. Glad to be here.",
          confidence: 0.9,
          status: 'confirmed',
        },
      ],
      {
        openaiApiKey: 'test',
        projectType: 'INTERVIEW',
        mappingMode: 'csp',
        title: "Don't Try to Beat This Market",
        filename: "Don't_Try_to_Beat_This_Market.m4a",
      }
    );

    const finalNames = Object.values(result.speakerData.speakers).map((speaker: any) => speaker.finalName);
    expect(finalNames).toContain('Josh Brown');
    expect(finalNames.some((name: string) => /^Speaker \d+$/.test(name))).toBe(true);
    expect(finalNames).not.toContain('Advertiser');
  });

  test('merges large orphaned invalid-name cluster into named host when direct-address evidence is strong', async () => {
    // Regression for: https://github.com/lucasfini/audiorepurpose
    // Scenario: AssemblyAI splits the host's voice across two diarization clusters.
    // GPT labels the primary cluster correctly ("Scott Galloway") but labels the
    // secondary cluster with a filler word ("Right"). After enforcement "Right" is
    // nulled, leaving a large unnamed cluster. The orphaned cluster should be merged
    // into the named host because its segments contain direct-address evidence
    // toward other known speakers (Ed, Katie).
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    // GPT Pass 1: speaker_5 is labelled "Right" (a filler) — enforcement will null it
    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Scott Galloway', role: 'host',    confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Ed Elson',       role: 'co_host', confidence: 0.85, source: 'test' },
        { id: 'speaker_3', name: 'Katie Martin',   role: 'guest',   confidence: 0.85, source: 'test' },
        { id: 'speaker_5', name: 'Right',          role: 'unknown', confidence: 0.50, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    // LLM mapping mock (CSP is the default mode; this is a fallback safety net)
    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
        Speaker_C: 'speaker_3',
        Speaker_D: 'speaker_5',
      },
      confidence: { Speaker_A: 0.95, Speaker_B: 0.85, Speaker_C: 0.85, Speaker_D: 0.5 },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    // Speaker_A — Scott's primary cluster (5 segs, has a self-ID for CSP)
    const speakerASegs: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 30, endTime: 40,
        text: 'My name is Scott Galloway. Welcome to the show.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 40, endTime: 50,
        text: "Let's get into the markets.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 50, endTime: 60,
        text: 'The S&P was up seventeen points this week.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 60, endTime: 70,
        text: 'We have a great guest today.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 70, endTime: 80,
        text: 'Stay with us through the break.',
        confidence: 0.9, status: 'confirmed',
      },
    ];

    // Speaker_B — Ed Elson cluster (3 segs, has a self-ID for CSP)
    const speakerBSegs: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 20, endTime: 30,
        text: "I'm Ed Elson. I'm doing well, thanks.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 80, endTime: 90,
        text: 'The bond market reaction was unusual.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 90, endTime: 100,
        text: "I agree that trade policy is the key variable.",
        confidence: 0.9, status: 'confirmed',
      },
    ];

    // Speaker_C — Katie Martin cluster (5 segs, has a self-ID for CSP)
    const speakerCSegs: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 100, endTime: 110,
        text: "I'm Katie Martin from the Financial Times.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 110, endTime: 120,
        text: 'European markets have been particularly interesting lately.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 120, endTime: 130,
        text: 'The German bund yield tells a very different story.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 130, endTime: 140,
        text: 'Investors are rotating out of dollar assets.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 140, endTime: 150,
        text: 'The FT has been covering this closely.',
        confidence: 0.9, status: 'confirmed',
      },
    ];

    // Speaker_D — Scott's orphaned cluster (7 segs, labelled "Right" by GPT).
    // Contains ≥2 direct-address hits toward Ed and Katie — the orphan-merge trigger.
    const speakerDSegs: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 0, endTime: 10,
        text: "Today's number is 42,000. Ed, true story, I saw this coming.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 10, endTime: 20,
        text: 'I could keep going. How are you, Ed?',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 150, endTime: 160,
        text: "That's a great point, Katie. The European angle is underreported.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 160, endTime: 170,
        text: 'I have been to Jackson Hole four times in five years.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 170, endTime: 180,
        text: 'The keynote was illuminating.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 180, endTime: 190,
        text: 'We will be right back after this break.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D', initialSpeakerId: 'Speaker_D', finalSpeakerId: 'Speaker_D',
        startTime: 190, endTime: 200,
        text: 'Thank you both for a fantastic discussion.',
        confidence: 0.9, status: 'confirmed',
      },
    ];

    const segments: SpeakerSegment[] = [
      ...speakerDSegs,   // starts at t=0, no self-ID → orphaned cluster
      ...speakerBSegs,   // Ed self-ID at t=20
      ...speakerASegs,   // Scott self-ID at t=30
      ...speakerCSegs,   // Katie self-ID at t=100
    ].sort((a, b) => a.startTime - b.startTime);

    const result = await runRefactoredSpeakerPipeline(segments, {
      openaiApiKey: 'test',
      filename: 'prof-g-markets.m4a',
    });

    // "Right" must not survive as a final speaker name
    expect(result.speakers.some(s => s.name === 'Right')).toBe(false);

    // A speaker named Scott Galloway must exist in the final roster
    const scott = result.speakers.find(s => s.name === 'Scott Galloway');
    expect(scott).toBeDefined();

    // The direct-address segments (originally Speaker_D) must belong to Scott
    const scottId = scott!.id;
    const edTrueStorySeg = result.segments.find(s => s.text.includes("Ed, true story"));
    const howAreYouEdSeg = result.segments.find(s => s.text.includes("How are you, Ed"));
    expect(edTrueStorySeg?.finalSpeakerId ?? edTrueStorySeg?.speakerId).toBe(scottId);
    expect(howAreYouEdSeg?.finalSpeakerId ?? howAreYouEdSeg?.speakerId).toBe(scottId);

    // Ed Elson must survive with his own segments intact (not collapsed to 1 or 0)
    const ed = result.speakers.find(s => s.name === 'Ed Elson');
    expect(ed).toBeDefined();
    const edSegCount = result.segments.filter(
      s => (s.finalSpeakerId ?? s.speakerId) === ed!.id
    ).length;
    expect(edSegCount).toBeGreaterThanOrEqual(2);
  });

  test('does not override named co-host with filename guest when GPT already found 3 named speakers', async () => {
    // Regression for the avg-duration guest heuristic guard:
    // If GPT already identified host + co-host + guest (3 named speakers), the
    // filename-guest heuristic must NOT reassign the co-host cluster to the guest
    // just because the co-host cluster has a higher average segment duration.
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    // GPT correctly identifies all 3 speakers
    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Scott Galloway', role: 'host',    confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Ed Elson',       role: 'co_host', confidence: 0.90, source: 'test' },
        { id: 'speaker_3', name: 'Katie Martin',   role: 'guest',   confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: { Speaker_A: 'speaker_1', Speaker_B: 'speaker_2', Speaker_C: 'speaker_3' },
      confidence: { Speaker_A: 0.95, Speaker_B: 0.90, Speaker_C: 0.85 },
      rawResponse: '{}',
      reasoning: 'test',
    } as any);

    // Speaker_B (Ed) has the longest avg duration — under the old code the heuristic
    // would rename Ed to "Katie Martin".  With the guard it must leave Ed alone.
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 0, endTime: 10, text: 'My name is Scott Galloway.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 10, endTime: 130,  // very long segment → highest avg duration
        text: "I'm Ed Elson. Let's get into our conversation with Katie Martin, markets columnist.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 130, endTime: 150, text: "I'm Katie Martin from the Financial Times.",
        confidence: 0.9, status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openaiApiKey: 'test',
      // Filename contains guest name — this is what triggers the guard
      filename: 'prof-g-markets-with-katie-martin.m4a',
      title: 'Prof G Markets with Katie Martin',
    });

    // Ed must NOT be renamed to Katie Martin
    expect(result.speakers.some(s => s.name === 'Ed Elson')).toBe(true);
    // Katie Martin must still exist (either under speaker_3 or from the title hint)
    expect(result.speakers.some(s => s.name === 'Katie Martin')).toBe(true);
    // They must be different speakers
    const ed = result.speakers.find(s => s.name === 'Ed Elson');
    const katie = result.speakers.find(s => s.name === 'Katie Martin');
    expect(ed?.id).not.toBe(katie?.id);
  });

  test('preserves guest-cluster ownership for hosting markers outside debate mode', async () => {
    // Regression for the hosting segment reclaim step:
    // When AssemblyAI merges co-host + guest into one cluster, the pipeline assigns
    // the whole cluster to the guest. Segments with "We'll be right back" / outros
    // and segments before the guest's formal introduction must go to the co-host.
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Scott Galloway', role: 'host',    confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Ed Elson',       role: 'co_host', confidence: 0.90, source: 'test' },
        { id: 'speaker_3', name: 'Katie Martin',   role: 'guest',   confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: { Speaker_A: 'speaker_1', Speaker_B: 'speaker_3' },
      confidence: { Speaker_A: 0.95, Speaker_B: 0.85 },
      rawResponse: '{}',
      reasoning: 'test',
    } as any);

    // Speaker_A — Scott (2 segs, self-ID)
    // Speaker_B — mixed Ed+Katie cluster (all attributed to speaker_3/Katie by CSP)
    const segments: SpeakerSegment[] = [
      // Scott
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 0, endTime: 10,
        text: 'My name is Scott Galloway. Welcome to Prof G Markets.',
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 10, endTime: 20,
        text: 'The S&P was down hard this week.',
        confidence: 0.9, status: 'confirmed',
      },
      // Ed's pre-intro banter (before Katie is formally introduced) — no self-ID so CSP uses Katie's anchor below
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 20, endTime: 30,
        text: "What happened to the jokes when our guests are on?",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 30, endTime: 40,
        text: 'What are you doing in Jackson Hole?',
        confidence: 0.9, status: 'confirmed',
      },
      // Ed formally introduces Katie (sets the intro timestamp boundary at t=100)
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 100, endTime: 110,
        text: "All right, let's get into our conversation with Katie Martin, markets columnist.",
        confidence: 0.9, status: 'confirmed',
      },
      // Katie's actual response — self-ID here (post-intro at t=110) anchors CSP: Speaker_B → Katie
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 110, endTime: 140,
        text: "I'm Katie Martin from the Financial Times. European markets have been particularly interesting.",
        confidence: 0.9, status: 'confirmed',
      },
      // Ed hosting — generic marker
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 200, endTime: 210,
        text: "We'll be right back after this break.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 250, endTime: 260,
        text: "We're back with Prof G Markets.",
        confidence: 0.9, status: 'confirmed',
      },
      // Ed thanking Katie — name-specific marker
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 300, endTime: 310,
        text: 'Thank you, Katie.',
        confidence: 0.9, status: 'confirmed',
      },
      // Ed outro — generic marker
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 310, endTime: 320,
        text: 'Thank you for listening to Prof G Markets. If you liked what you heard, subscribe.',
        confidence: 0.9, status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openaiApiKey: 'test',
      filename: 'prof-g-markets.m4a',
    });

    const ed = result.speakers.find(s => s.name === 'Ed Elson');
    const katie = result.speakers.find(s => s.name === 'Katie Martin');
    const scott = result.speakers.find(s => s.name === 'Scott Galloway');
    expect(ed).toBeDefined();
    expect(katie).toBeDefined();
    expect(scott).toBeDefined();

    const edId = ed!.id;
    const katieId = katie!.id;
    const scottId = scott!.id;

    // Conservative mode keeps this clean cluster with the guest speaker instead of reclaiming pieces.
    const thxKatieSeg = result.segments.find(s => s.text.includes('Thank you, Katie'));
    expect(thxKatieSeg?.finalSpeakerId ?? thxKatieSeg?.speakerId).toBe(katieId);

    const introSeg = result.segments.find(s => s.text.includes("conversation with Katie Martin"));
    expect(introSeg?.finalSpeakerId ?? introSeg?.speakerId).toBe(katieId);

    // Generic markers also stay with the same clean cluster.
    const rightBackSeg = result.segments.find(s => s.text.includes("We'll be right back"));
    expect(rightBackSeg?.finalSpeakerId ?? rightBackSeg?.speakerId).toBe(katieId);

    const weAreBackSeg = result.segments.find(s => s.text.includes("We're back with"));
    expect(weAreBackSeg?.finalSpeakerId ?? weAreBackSeg?.speakerId).toBe(katieId);

    const thxListenSeg = result.segments.find(s => s.text.includes('Thank you for listening'));
    expect(thxListenSeg?.finalSpeakerId ?? thxListenSeg?.speakerId).toBe(katieId);

    // Pre-intro banter: temporal window removed — guests legitimately speak early.
    // These segments stay with whatever the CSP assigned (Katie's cluster).
    const banterSeg = result.segments.find(s => s.text.includes('What are you doing in Jackson Hole'));
    expect(banterSeg?.finalSpeakerId ?? banterSeg?.speakerId).toBe(katieId);

    // Katie's actual interview answer stays with Katie
    const katieSeg = result.segments.find(s => s.text.includes('European markets have been'));
    expect(katieSeg?.finalSpeakerId ?? katieSeg?.speakerId).toBe(katieId);

  });

  test('keeps a clean guest cluster intact even when a formal intro appears later', async () => {
    // Regression guard: the old "pre-intro temporal window" logic reclaimed ALL guest-attributed
    // segments that appeared before the formal bio intro timestamp — even legitimate early guest speech.
    // The window has been removed. Only segments matching explicit markers should be reclaimed.
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Alice Chen', role: 'host',  confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Bob Smith',  role: 'guest', confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    // Speaker_A — Alice (host, self-ID so CSP can anchor her)
    // Speaker_B — mixed cluster: contains both Alice's intro line AND Bob's real speech,
    //             but CSP routes to Bob because Bob has a self-ID in the cluster.
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 0, endTime: 10,
        text: "I'm Alice Chen. Welcome to the show.",
        confidence: 0.9, status: 'confirmed',
      },
      // Bob's genuine early speech — should NOT be reclaimed even though a formal intro
      // appears later in the same cluster
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 20, endTime: 40,
        text: "I've been studying economic policy for fifteen years.",
        confidence: 0.9, status: 'confirmed',
      },
      // Alice's intro line voice-merged into Bob's cluster by diarization
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 80, endTime: 90,
        text: "Let's get into our conversation with Bob Smith, the economist.",
        confidence: 0.9, status: 'confirmed',
      },
      // Bob self-IDs here — CSP anchor maps Speaker_B → Bob
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 90, endTime: 110,
        text: "I'm Bob Smith. Thanks for having me on the show.",
        confidence: 0.9, status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openaiApiKey: 'test',
      filename: 'economics-show.m4a',
    });

    const alice = result.speakers.find(s => s.name === 'Alice Chen');
    const bob = result.speakers.find(s => s.name === 'Bob Smith');
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();

    const aliceId = alice!.id;
    const bobId = bob!.id;

    // Bob's early speech must stay with Bob — temporal window must NOT reclaim it
    const earlyGuestSeg = result.segments.find(s => s.text.includes('studying economic policy'));
    expect(earlyGuestSeg?.finalSpeakerId ?? earlyGuestSeg?.speakerId).toBe(bobId);

    // The formal intro line stays with Bob because the cluster is preserved intact.
    const introSeg = result.segments.find(s => s.text.includes('conversation with Bob Smith'));
    expect(introSeg?.finalSpeakerId ?? introSeg?.speakerId).toBe(bobId);

    // Bob's post-intro response stays with Bob
    const bobResponseSeg = result.segments.find(s => s.text.includes('Thanks for having me'));
    expect(bobResponseSeg?.finalSpeakerId ?? bobResponseSeg?.speakerId).toBe(bobId);
  });

  test('does not route generic outro to co-host when no guest-specific evidence exists in the guest cluster', async () => {
    // Regression guard: the old logic reclaimed generic markers ("Thank you for listening")
    // from a guest's cluster and routed them to the co_host unconditionally.
    // With the new gating requirement, generic markers are only reclaimed after a
    // guest-specific marker has fired for the same guest — proving the cluster is mixed.
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Alice Chen',  role: 'host',    confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Bob Smith',   role: 'co_host', confidence: 0.90, source: 'test' },
        { id: 'speaker_3', name: 'Carol Davis', role: 'guest',   confidence: 0.85, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A', initialSpeakerId: 'Speaker_A', finalSpeakerId: 'Speaker_A',
        startTime: 0, endTime: 10,
        text: "I'm Alice Chen. Welcome to today's episode.",
        confidence: 0.9, status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B', initialSpeakerId: 'Speaker_B', finalSpeakerId: 'Speaker_B',
        startTime: 10, endTime: 20,
        text: "I'm Bob Smith. Let's dive into today's topic.",
        confidence: 0.9, status: 'confirmed',
      },
      // Carol's cluster contains a generic outro — but NO guest-specific markers fire for Carol.
      // The generic marker should therefore NOT be reclaimed to Bob (co_host).
      {
        speakerId: 'Speaker_C', initialSpeakerId: 'Speaker_C', finalSpeakerId: 'Speaker_C',
        startTime: 20, endTime: 40,
        text: "I'm Carol Davis. Thank you for listening to today's show.",
        confidence: 0.9, status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openaiApiKey: 'test',
      filename: 'generic-show.m4a',
    });

    const bob = result.speakers.find(s => s.name === 'Bob Smith');
    const carol = result.speakers.find(s => s.name === 'Carol Davis');
    expect(bob).toBeDefined();
    expect(carol).toBeDefined();

    const bobId = bob!.id;
    const carolId = carol!.id;

    // "Thank you for listening" must NOT be reclaimed to Bob (the co_host)
    // because no guest-specific marker ("Thank you, Carol." / bio intro / "conversation with Carol")
    // appeared in Carol's cluster to prove it is mixed.
    const thxListenSeg = result.segments.find(s => s.text.includes('Thank you for listening'));
    expect(thxListenSeg?.finalSpeakerId ?? thxListenSeg?.speakerId).toBe(carolId);
    expect(thxListenSeg?.finalSpeakerId ?? thxListenSeg?.speakerId).not.toBe(bobId);
  });

  test('does not reuse advertiser slots for handoff-name recovery or merge them into people', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Ed Elson', role: 'host', confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: 'Justin Wolfers', role: 'guest', confidence: 0.85, source: 'test' },
        { id: 'speaker_3', name: 'Katie Martin', role: 'guest', confidence: 0.85, source: 'test' },
        { id: 'speaker_4', name: null, role: 'advertiser', confidence: 0.8, source: 'sponsor_detection' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
        Speaker_C: 'speaker_3',
        Speaker_D: 'speaker_4',
      },
      confidence: {
        Speaker_A: 0.95,
        Speaker_B: 0.8,
        Speaker_C: 0.8,
        Speaker_D: 0.8,
      },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 10,
        text: "I'm Ed Elson. Today's number, 42. Justin, what do you make of this?",
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 10,
        endTime: 20,
        text: 'I think the market reaction was weird.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_C',
        initialSpeakerId: 'Speaker_C',
        finalSpeakerId: 'Speaker_C',
        startTime: 20,
        endTime: 30,
        text: "I'm Katie Martin. European capital flows have been fascinating.",
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_D',
        initialSpeakerId: 'Speaker_D',
        finalSpeakerId: 'Speaker_D',
        startTime: 30,
        endTime: 45,
        text: 'Support for the show comes from Indeed Sponsored Jobs. Start hiring now.',
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'prof-g-markets.m4a',
    });

    expect(result.speakers.some((speaker) => speaker.role === 'advertiser')).toBe(true);
    expect(result.speakers.some((speaker) => speaker.name === 'Katie Martin')).toBe(true);
    expect(result.speakers.some((speaker) => speaker.name === 'Justin')).toBe(false);
  });

  test('demotes advertiser role when a mapped speaker has conversational turns', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: null, role: 'advertiser', confidence: 0.8, source: 'test' },
        { id: 'speaker_2', name: 'Josh Brown', role: 'guest', confidence: 0.9, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
      },
      confidence: {
        Speaker_A: 0.9,
        Speaker_B: 0.9,
      },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 8,
        text: 'Welcome to Prof G Markets. Let us get right into it.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 8,
        endTime: 20,
        text: "I'm Josh Brown. I think investors should stay disciplined.",
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 20,
        endTime: 40,
        text: 'Support for the show comes from Vanta. Visit vanta.com to learn more.',
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'prof-g-markets.m4a',
    });

    const segmentsBySpeaker = new Map<string, SpeakerSegment[]>();
    for (const segment of result.segments) {
      const speakerId = segment.finalSpeakerId || segment.speakerId;
      if (!segmentsBySpeaker.has(speakerId)) segmentsBySpeaker.set(speakerId, []);
      segmentsBySpeaker.get(speakerId)!.push(segment);
    }

    const advertiserWithConversation = result.speakers.find((speaker) => {
      if (speaker.role !== 'advertiser') return false;
      const ownedSegments = segmentsBySpeaker.get(speaker.id) || [];
      const hasConversation = ownedSegments.some(
        (segment) => (segment.segmentKind || 'conversation') === 'conversation'
      );
      return hasConversation;
    });

    expect(advertiserWithConversation).toBeUndefined();
  });

  test('strips human names from ad-only speakers after sponsor tagging', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: 'Mark Zandi', role: 'guest', confidence: 0.85, source: 'test' },
        { id: 'speaker_2', name: null, role: 'unknown', confidence: 0.7, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
      },
      confidence: {
        Speaker_A: 0.9,
        Speaker_B: 0.9,
      },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 18,
        text: 'Support for the show comes from ZBiotics. Visit zbiotics.com and use code PROFG.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 18,
        endTime: 40,
        text: 'Feels pretty close to script, more or less. Markets have been resilient.',
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'ceasefire-economy.m4a',
    });

    const sponsorSpeaker = result.speakers.find((speaker) => speaker.name === 'ZBiotics');
    expect(sponsorSpeaker).toBeDefined();
    expect(sponsorSpeaker?.role).toBe('advertiser');
    expect(result.segments[0].finalSpeakerId).toBe(sponsorSpeaker?.id);
    expect(result.speakerData.speakers[sponsorSpeaker!.id].finalName).toBe('ZBiotics');
  });

  test('names introduced interview guest from the reply cluster after a strong intro', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: null, role: 'unknown', confidence: 0.95, source: 'test' },
        { id: 'speaker_2', name: null, role: 'unknown', confidence: 0.95, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
      },
      confidence: {
        Speaker_A: 0.95,
        Speaker_B: 0.95,
      },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 35,
        text: "Welcome to Prof G Markets. Here to help us answer these questions, we are joined by the chief economist at Moody's Analytics, Mark Zandi. Mark, good to have you on the program.",
        confidence: 0.95,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_B',
        initialSpeakerId: 'Speaker_B',
        finalSpeakerId: 'Speaker_B',
        startTime: 36,
        endTime: 95,
        text: "Feels pretty close to script, more or less. You know, the president has gone down this path before, and markets have reacted in predictable ways.",
        confidence: 0.95,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 96,
        endTime: 120,
        text: "How has this adjusted your views of what's going to happen in the markets and perhaps in the economy in the US?",
        confidence: 0.95,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'ceasefire-economy.m4a',
      projectType: 'INTERVIEW',
    });

    const namedGuest = result.speakers.find((speaker) => speaker.name === 'Mark Zandi');
    expect(namedGuest).toBeDefined();
    expect(namedGuest?.role).toBe('guest');
    expect(result.segments[1].finalSpeakerId).toBe(namedGuest?.id);
  });

  test('maps host-read ads to sponsor speakers and reuses sponsor identities across multiple ad blocks', async () => {
    const mockedIdentify = jest.mocked(gptSpeakerIntelligence.identifySpeakersWithGPT);
    const mockedMapSegments = jest.mocked(llmSegmentMapping.mapSegmentsWithLLM);

    mockedIdentify.mockResolvedValueOnce({
      speakers: [
        { id: 'speaker_1', name: null, role: 'unknown', confidence: 0.8, source: 'test' },
        { id: 'speaker_2', name: 'Josh Brown', role: 'guest', confidence: 0.9, source: 'test' },
      ],
      rawResponse: '{}',
      validationErrors: [],
      costEstimate: 0,
    } as any);

    mockedMapSegments.mockResolvedValueOnce({
      mappings: {
        Speaker_A: 'speaker_1',
        Speaker_B: 'speaker_2',
      },
      confidence: {
        Speaker_A: 0.95,
        Speaker_B: 0.95,
      },
      rawResponse: '{}',
      reasoning: 'test mapping',
    } as any);

    const segments: SpeakerSegment[] = [
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 0,
        endTime: 12,
        text: 'Welcome back to Prof G Markets.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 12,
        endTime: 45,
        text: 'Support for the show comes from Vanta. Visit vanta.com/markets to learn more.',
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 46,
        endTime: 65,
        text: "We're back with Prof G Markets.",
        confidence: 0.9,
        status: 'confirmed',
      },
      {
        speakerId: 'Speaker_A',
        initialSpeakerId: 'Speaker_A',
        finalSpeakerId: 'Speaker_A',
        startTime: 66,
        endTime: 98,
        text: 'Support for this show comes from Vanta. Vanta keeps your business secure. Visit vanta.com/markets.',
        confidence: 0.9,
        status: 'confirmed',
      },
    ];

    const result = await runRefactoredSpeakerPipeline(segments, {
      openAIApiKey: 'test',
      filename: 'prof-g-markets.m4a',
      projectType: 'PODCAST',
    });

    const vantaSpeaker = result.speakers.find((speaker) => speaker.name === 'Vanta');
    expect(vantaSpeaker).toBeDefined();
    expect(vantaSpeaker?.role).toBe('advertiser');

    const vantaSegments = result.segments.filter((segment) => (segment.finalSpeakerId || segment.speakerId) === vantaSpeaker?.id);
    expect(vantaSegments).toHaveLength(2);
    expect(vantaSegments.every((segment) => segment.sponsorName === 'Vanta')).toBe(true);
  });

});
