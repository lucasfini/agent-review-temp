import { sanitizeRoster } from '@/lib/speaker-intelligence';

describe('sanitizeRoster null safety', () => {
  test('does not throw when roster contains null names and emits guard diagnostic', () => {
    const diagnostics: string[] = [];

    const result = sanitizeRoster(
      [
        {
          id: 'speaker_1',
          name: null,
          role: 'unknown',
          confidence: 0.72,
          source: 'test',
          aliases: [],
        },
        {
          id: 'speaker_2',
          name: 'Ed Elson',
          role: 'host',
          confidence: 0.93,
          source: 'test',
          aliases: [],
        },
        {
          id: 'speaker_3',
          name: null,
          role: 'unknown',
          confidence: 0.61,
          source: 'test',
          aliases: [],
        },
      ] as any,
      {
        mode: 'strict',
        targetCount: 2,
        diagnostics,
      }
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(diagnostics).toContain('sanitize_null_name_guard_applied');
  });
});
