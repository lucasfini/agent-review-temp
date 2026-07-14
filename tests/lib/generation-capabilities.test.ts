import {
  getAnalysisCompatibility,
  getProjectGenerationCapabilities,
  getTextOnlyGenerationNotice,
  hasProjectPlayableAudio,
} from '@/lib/generation-capabilities';

describe('generation capabilities', () => {
  it('classifies Notion-style imports as text-only and disables speaker/timestamp add-ons', () => {
    const project = {
      transcription_text: 'Reply to Alex. Book dentist. Send Jamie the deck.',
      transcription_segments: [],
      speaker_data: null,
      metadata: { source: 'notion' },
    };

    expect(getProjectGenerationCapabilities(project)).toMatchObject({
      hasTranscriptText: true,
      hasTimedSegments: false,
      hasSpeakerSegments: false,
      isTextOnlyImport: true,
      sourceLabel: 'Notion import',
    });
    expect(getAnalysisCompatibility(project, 'namedSpeakers')).toMatchObject({
      compatible: false,
      reason: expect.stringContaining('diarized speaker segments'),
    });
    expect(getAnalysisCompatibility(project, 'chapters')).toMatchObject({
      compatible: false,
      reason: expect.stringContaining('Timestamped chapters'),
    });
    expect(getAnalysisCompatibility(project, 'summary')).toEqual({ compatible: true });
    expect(getTextOnlyGenerationNotice(project)).toContain('Notion import has text only');
    expect(hasProjectPlayableAudio({ ...project, audio_file_name: 'notes.txt' })).toBe(false);
  });

  it('allows speaker and chapter add-ons when timed and speaker segments exist', () => {
    const project = {
      transcription_text: 'Speaker one says hello. Speaker two replies.',
      transcription_segments: [{ text: 'hello', start: 0, end: 1 }],
      speaker_data: {
        speakers: { speaker_1: { finalName: 'Speaker 1' } },
        segments: [{ speakerId: 'speaker_1', text: 'hello', startTime: 0, endTime: 1 }],
      },
      metadata: { source: 'upload' },
    };

    expect(getProjectGenerationCapabilities(project)).toMatchObject({
      hasTranscriptText: true,
      hasTimedSegments: true,
      hasSpeakerSegments: true,
      isTextOnlyImport: false,
    });
    expect(getAnalysisCompatibility(project, 'namedSpeakers')).toEqual({ compatible: true });
    expect(getAnalysisCompatibility(project, 'chapters')).toEqual({ compatible: true });
    expect(getTextOnlyGenerationNotice(project)).toBeNull();
    expect(hasProjectPlayableAudio({ ...project, audio_file_name: 'interview.mp3' })).toBe(true);
  });

  it('does not treat text file sources as playable audio', () => {
    expect(hasProjectPlayableAudio({
      audio_file_name: 'customer-notes.txt',
      metadata: { source: 'upload' },
    })).toBe(false);
    expect(hasProjectPlayableAudio({
      audio_file_name: 'granola-notes.txt',
      metadata: { source: 'granola' },
    })).toBe(false);
    expect(hasProjectPlayableAudio({
      audio_file_name: 'meeting.m4a',
      metadata: { source: 'granola' },
    })).toBe(false);
    expect(hasProjectPlayableAudio({
      audio_file_name: 'meeting.webm',
      metadata: { source: 'upload' },
    })).toBe(true);
  });
});
