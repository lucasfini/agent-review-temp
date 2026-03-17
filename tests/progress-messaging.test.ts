import { calculateOverallProgress, getUserFacingProcessingMessage } from '@/lib/tier-progress-config';

describe('progress messaging', () => {
  test('removes model names from user-facing progress copy', () => {
    const message = getUserFacingProcessingMessage(
      'premium',
      'name_extraction',
      'Running speaker attribution (GPT-5 + GPT-5-nano)...'
    );

    expect(message).not.toMatch(/gpt|assemblyai|deepgram/i);
    expect(message).toBe('Running speaker attribution...');
  });

  test('falls back to neutral stage descriptions when no message is provided', () => {
    expect(getUserFacingProcessingMessage('basic', 'transcribing')).toBe(
      'Turning your audio into a transcript...'
    );
  });

  test('calculates overall progress across stages', () => {
    expect(calculateOverallProgress('premium', 'transcribing', 50)).toBe(23);
  });
});
