import {
  buildSpeakerPeopleInsights,
  mergeSpeakerPeopleInsights,
  rankPersonSources,
  type ExtractedInsight,
} from '@/lib/insight-extraction';

describe('insight extraction speaker enrichment', () => {
  const speakerData = {
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        finalName: 'Ed Elson',
        role: 'host',
        roleSummary: 'Ed Elson hosts the discussion and frames the market debate.',
        roleConfidence: 0.92,
        segmentCount: 8,
        totalDuration: 420,
        segments: [
          {
            text: 'Today we are asking whether markets are pricing the Iran escalation correctly.',
            startTime: 0,
            endTime: 18,
          },
        ],
      },
      speaker_2: {
        id: 'speaker_2',
        finalName: 'Justin Wolfers',
        role: 'guest',
        roleConfidence: 0.9,
        segmentCount: 6,
        totalDuration: 360,
        segments: [
          {
            text: 'The inflation question is whether oil stays elevated long enough to spill into core prices.',
            startTime: 19,
            endTime: 37,
          },
        ],
      },
      speaker_3: {
        id: 'speaker_3',
        finalName: 'Indeed Sponsored Jobs',
        role: 'advertiser',
        roleConfidence: 0.85,
        segmentCount: 1,
        totalDuration: 24,
        segments: [
          {
            text: 'Support for the show comes from Indeed Sponsored Jobs.',
            startTime: 38,
            endTime: 62,
          },
        ],
      },
    },
  };

  test('builds person insights for substantive speakers and skips advertisers', () => {
    const insights = buildSpeakerPeopleInsights(speakerData, 'Markets and Iran Risk');
    const ed = insights.find((insight) => insight.label === 'Ed Elson');

    expect(insights.map((insight) => insight.label)).toEqual(
      expect.arrayContaining(['Ed Elson', 'Justin Wolfers'])
    );
    expect(insights.map((insight) => insight.label)).not.toContain('Indeed Sponsored Jobs');
    expect(insights.every((insight) => insight.category === 'person')).toBe(true);
    expect(ed?.relationships?.some((relationship) => relationship.type === 'current_work')).toBe(true);
  });

  test('merges existing person insights with speaker-derived people and preserves explanations', () => {
    const extracted: ExtractedInsight[] = [
      {
        entity_id: 'justin-wolfers',
        label: 'Justin Wolfers',
        category: 'person',
        match_text: 'Justin Wolfers',
        transcript_excerpts: [],
        simple_definition: '',
        full_explanation: '',
        why_it_matters: '',
        confidence: 0.72,
      },
      {
        entity_id: 'oil-shock',
        label: 'Oil Shock',
        category: 'concept',
        match_text: 'oil shock',
        transcript_excerpts: [{ text: 'An oil shock would pressure inflation.' }],
        simple_definition: 'A sudden rise in oil prices.',
        full_explanation: 'A rapid price spike in oil that can raise costs and inflation.',
        why_it_matters: 'It changes the macro outlook discussed in the episode.',
        confidence: 0.88,
      },
    ];

    const merged = mergeSpeakerPeopleInsights(extracted, speakerData, 'Markets and Iran Risk');
    const justin = merged.find((insight) => insight.label === 'Justin Wolfers');
    const ed = merged.find((insight) => insight.label === 'Ed Elson');

    expect(merged.filter((insight) => insight.label === 'Justin Wolfers')).toHaveLength(1);
    expect(justin?.full_explanation).toContain('Justin Wolfers');
    expect(justin?.why_it_matters).toContain('Markets and Iran Risk');
    expect(justin?.relationships?.some((relationship) => relationship.type === 'person_summary')).toBe(true);
    expect(ed).toBeDefined();
    expect(merged.find((insight) => insight.label === 'Oil Shock')?.category).toBe('concept');
  });

  test('ranks wikipedia first for person sources', () => {
    const ranked = rankPersonSources([
      { title: 'Official Bio', url: 'https://example.com/bio', type: 'official' },
      { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Justin_Wolfers', type: 'wikipedia' },
    ]);

    expect(ranked[0].url).toContain('wikipedia.org');
  });
});
