import { __testUtils } from '@/lib/speaker-role-classifier';
import { SpeakerSegment } from '@/lib/types';

describe('speaker-role-classifier conservative guards', () => {
  test('preserves fallback display names instead of converting roles into identities', () => {
    const displayName = __testUtils.buildFallbackDisplayName('ad_reader', {
      id: 'speaker_2',
      fallbackName: 'Speaker 2',
      totalDuration: 42,
      segments: [],
    });

    expect(displayName).toBe('Speaker 2');
  });

  test('demotes ad-like roles when a speaker has conversational turns', () => {
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_1',
        startTime: 0,
        endTime: 10,
        text: 'Welcome back to the show. Let us get into the first story.',
        confidence: 0.9,
      },
      {
        speakerId: 'speaker_1',
        startTime: 10,
        endTime: 20,
        text: 'Support for the show comes from Vanta. Visit vanta.com.',
        confidence: 0.9,
        segmentKind: 'ad_read',
      },
    ];

    const nextRole = __testUtils.applyConservativeRoleGuards('ad_reader', {
      id: 'speaker_1',
      fallbackName: 'Speaker 1',
      totalDuration: 20,
      segments,
    });

    expect(nextRole).toBe('unknown');
  });

  test('keeps ad-like roles for pure ad segments', () => {
    const segments: SpeakerSegment[] = [
      {
        speakerId: 'speaker_4',
        startTime: 0,
        endTime: 12,
        text: 'Support for this episode comes from SoFi. Terms and conditions apply.',
        confidence: 0.9,
        segmentKind: 'ad_read',
      },
    ];

    const nextRole = __testUtils.applyConservativeRoleGuards('promo_voice', {
      id: 'speaker_4',
      fallbackName: 'Speaker 4',
      totalDuration: 12,
      segments,
    });

    expect(nextRole).toBe('promo_voice');
  });
});
