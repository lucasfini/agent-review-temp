import fs from 'fs';
import path from 'path';

import { classifyProjectType } from '@/lib/utils/classifyProjectType';
import { extractAnchors, solveConstraints, type AffinityMatrix, type Anchor } from '@/lib/constraint-solver';
import { detectSponsorSegments, runRefactoredSpeakerPipeline } from '@/lib/refactored-speaker-pipeline';
import { extractValidatedSelfIdName } from '@/lib/name-interference';
import { STRONG_SELF_ID_PATTERNS } from '@/lib/self-id-patterns';
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

  test('retags single-segment sponsor reads as advertiser content', () => {
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
    const advertiser = result.roster.find(speaker => speaker.role === 'advertiser');

    expect(advertiser).toBeDefined();
    expect(result.segments[0].finalSpeakerId).toBe(advertiser?.id);
    expect(result.segments[0].confidenceReason).toContain('sponsor-ad-read');
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

  test('reclaims generic hosting markers and pre-intro segments from guest cluster to co-host', async () => {
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

    // Guest-specific markers → Ed (co_host, the interviewer)
    const thxKatieSeg = result.segments.find(s => s.text.includes('Thank you, Katie'));
    expect(thxKatieSeg?.finalSpeakerId ?? thxKatieSeg?.speakerId).toBe(edId);

    const introSeg = result.segments.find(s => s.text.includes("conversation with Katie Martin"));
    expect(introSeg?.finalSpeakerId ?? introSeg?.speakerId).toBe(edId);

    // Generic markers are gated on guest-specific evidence and route to the primary HOST (Scott),
    // not the co_host — generic CTAs/outros are not inherently co_host-specific.
    const rightBackSeg = result.segments.find(s => s.text.includes("We'll be right back"));
    expect(rightBackSeg?.finalSpeakerId ?? rightBackSeg?.speakerId).toBe(scottId);

    const weAreBackSeg = result.segments.find(s => s.text.includes("We're back with"));
    expect(weAreBackSeg?.finalSpeakerId ?? weAreBackSeg?.speakerId).toBe(scottId);

    const thxListenSeg = result.segments.find(s => s.text.includes('Thank you for listening'));
    expect(thxListenSeg?.finalSpeakerId ?? thxListenSeg?.speakerId).toBe(scottId);

    // Pre-intro banter: temporal window removed — guests legitimately speak early.
    // These segments stay with whatever the CSP assigned (Katie's cluster).
    const banterSeg = result.segments.find(s => s.text.includes('What are you doing in Jackson Hole'));
    expect(banterSeg?.finalSpeakerId ?? banterSeg?.speakerId).toBe(katieId);

    // Katie's actual interview answer stays with Katie
    const katieSeg = result.segments.find(s => s.text.includes('European markets have been'));
    expect(katieSeg?.finalSpeakerId ?? katieSeg?.speakerId).toBe(katieId);

    // Ed must own the guest-specific segments (intro + thank-you = at least 2)
    const edSegCount = result.segments.filter(
      s => (s.finalSpeakerId ?? s.speakerId) === edId
    ).length;
    expect(edSegCount).toBeGreaterThanOrEqual(2);
  });

  test('does not reclaim early guest speech when the formal intro appears later in the same cluster', async () => {
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

    // The formal intro line should be reclaimed to Alice (guest-specific marker)
    const introSeg = result.segments.find(s => s.text.includes('conversation with Bob Smith'));
    expect(introSeg?.finalSpeakerId ?? introSeg?.speakerId).toBe(aliceId);

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

});
