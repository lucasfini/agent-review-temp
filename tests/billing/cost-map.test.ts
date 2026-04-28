/**
 * Unit Tests for Cost Map and Calculations
 */

import {
  COST_MAP,
  calculateServiceCost,
  calculateTokenCost,
  estimateTranscriptionCost,
  estimateAnalysisJobCost,
  formatCost,
  applyMargin,
  calculateMarginAmount,
  isValidServiceKey,
  getServiceInfo,
} from '@/lib/billing/cost-map';
import { prompts } from '@/lib/prompts/loader';

describe('COST_MAP', () => {
  test('should have all required AI services', () => {
    expect(COST_MAP.assemblyai_transcription).toBeDefined();
    expect(COST_MAP.openai_gpt4o_mini_input).toBeDefined();
    expect(COST_MAP.openai_gpt4o_mini_output).toBeDefined();
    expect(COST_MAP.claude_sonnet_input).toBeDefined();
    expect(COST_MAP.claude_sonnet_output).toBeDefined();
    expect(COST_MAP.claude_haiku_input).toBeDefined();
    expect(COST_MAP.claude_haiku_output).toBeDefined();
  });

  test('should keep transcription positioned as a low-friction entry price', () => {
    const assemblyai = COST_MAP.assemblyai_transcription;
    expect(assemblyai.providerRateDisplay).toBe('$0.21/hour');
    expect(assemblyai.billedRateDisplay).toBe('$0.39/hour');
    expect(assemblyai.billedRate).toBeCloseTo(0.39 / 3600, 10);
  });

  test('should use current GPT-5 family rates', () => {
    expect(COST_MAP.openai_gpt5_2_input.providerRate).toBeCloseTo(1.75 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_2_output.providerRate).toBeCloseTo(14 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_2_cached_input.providerRate).toBeCloseTo(0.175 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_input.providerRate).toBeCloseTo(1.25 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_output.providerRate).toBeCloseTo(10 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_mini_input.providerRate).toBeCloseTo(0.25 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_mini_output.providerRate).toBeCloseTo(2 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_nano_input.providerRate).toBeCloseTo(0.05 / 1_000_000, 12);
    expect(COST_MAP.openai_gpt5_nano_output.providerRate).toBeCloseTo(0.4 / 1_000_000, 12);
  });
});

describe('calculateServiceCost', () => {
  test('should calculate AssemblyAI cost correctly', () => {
    const durationSeconds = 3600; // 1 hour
    const result = calculateServiceCost('assemblyai_transcription', durationSeconds);

    expect(result.rawCost).toBeCloseTo(0.21, 4);
    expect(result.billedCost).toBeCloseTo(0.39, 4);
    expect(result.unitType).toBe('seconds');
  });

  test('should calculate OpenAI token cost correctly', () => {
    const inputTokens = 1_000_000;
    const result = calculateServiceCost('openai_gpt4o_mini_input', inputTokens);

    expect(result.rawCost).toBeCloseTo(0.15, 4);
    expect(result.billedCost).toBeCloseTo(0.2175, 4);
  });

  test('should throw error for invalid service key', () => {
    expect(() => {
      calculateServiceCost('invalid_service', 100);
    }).toThrow('Unknown service key: invalid_service');
  });

  test('should handle zero units', () => {
    const result = calculateServiceCost('assemblyai_transcription', 0);
    expect(result.rawCost).toBe(0);
    expect(result.billedCost).toBe(0);
  });
});

describe('calculateTokenCost', () => {
  test('should calculate combined token costs correctly', () => {
    const inputTokens = 1000;
    const outputTokens = 500;

    const result = calculateTokenCost(
      'openai_gpt4o_mini_input',
      'openai_gpt4o_mini_output',
      inputTokens,
      outputTokens
    );

    expect(result.breakdown.input.units).toBe(inputTokens);
    expect(result.breakdown.output.units).toBe(outputTokens);
    expect(result.billedCost).toBeGreaterThan(result.rawCost);
    expect(result.billedCost).toBeCloseTo(result.rawCost * 1.45, 6);
  });

  test('should handle Claude Sonnet costs', () => {
    const inputTokens = 10000;
    const outputTokens = 5000;

    const result = calculateTokenCost(
      'claude_sonnet_input',
      'claude_sonnet_output',
      inputTokens,
      outputTokens
    );

    // Claude Sonnet is more expensive than GPT-4o-mini
    const gptResult = calculateTokenCost(
      'openai_gpt4o_mini_input',
      'openai_gpt4o_mini_output',
      inputTokens,
      outputTokens
    );

    expect(result.billedCost).toBeGreaterThan(gptResult.billedCost);
  });
});

describe('estimateTranscriptionCost', () => {
  test('should estimate basic tier cost', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 3600, // 1 hour
      tier: 'basic',
    });

    expect(result.transcription).toBeCloseTo(0.39, 4);
    expect(result.aiProcessing).toBe(0); // Basic tier has no AI processing
    expect(result.total).toBe(result.transcription);
  });

  test('should estimate pro tier cost with AI processing', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 3600, // 1 hour
      tier: 'pro',
      analysisOptions: {
        namedSpeakers: true,
        summary: true,
      },
    });

    expect(result.transcription).toBeCloseTo(0.39, 4);
    expect(result.aiProcessing).toBeGreaterThan(0); // Pro includes name extraction and summary
    expect(result.total).toBeGreaterThan(result.transcription);
    expect(result.breakdown.length).toBeGreaterThan(1);
  });

  test('should estimate premium tier cost', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 3600, // 1 hour
      tier: 'premium',
      analysisOptions: {
        namedSpeakers: true,
        summary: true,
        chapters: true,
        takeaways: true,
        quotes: true,
        insights: true,
      },
    });

    expect(result.aiProcessing).toBeGreaterThan(0);
    expect(result.breakdown.length).toBeGreaterThan(3); // More services in premium
  });

  test('should handle short audio files', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 60, // 1 minute
      tier: 'basic',
    });

    expect(result.total).toBeLessThan(0.01); // Should be very cheap
  });
});

describe('estimateAnalysisJobCost', () => {
  test('should price insights using the configured model with pricing uplift', () => {
    const estimatedTranscriptLength = 24000;
    const estimatedTokens = Math.ceil(estimatedTranscriptLength / 4);
    const estimated = estimateAnalysisJobCost({
      targetKey: 'insights',
      estimatedTranscriptLength,
    });

    const model = prompts.audioRepurpose.insightExtraction.model;
    const expected = model.includes('gpt-5-nano')
      ? calculateTokenCost('openai_gpt5_nano_input', 'openai_gpt5_nano_output', estimatedTokens, 1200).billedCost
      : model.includes('gpt-5-mini')
        ? calculateTokenCost('openai_gpt5_mini_input', 'openai_gpt5_mini_output', estimatedTokens, 1200).billedCost
        : model.includes('gpt-5')
          ? calculateTokenCost('openai_gpt5_input', 'openai_gpt5_output', estimatedTokens, 1200).billedCost
          : calculateTokenCost('openai_gpt4o_mini_input', 'openai_gpt4o_mini_output', estimatedTokens, 1200).billedCost;

    expect(estimated).toBeCloseTo(Math.max(expected * 2.25, 0.10), 6);
  });

  test('should apply minimum charges to short analysis jobs', () => {
    expect(
      estimateAnalysisJobCost({
        targetKey: 'summary',
        estimatedTranscriptLength: 100,
      })
    ).toBe(0.04);

    expect(
      estimateAnalysisJobCost({
        targetKey: 'chapters',
        estimatedTranscriptLength: 100,
      })
    ).toBe(0.03);
  });

  test('should charge more for longer transcripts', () => {
    const shortEstimate = estimateAnalysisJobCost({
      targetKey: 'namedSpeakers',
      estimatedTranscriptLength: 4000,
    });
    const longEstimate = estimateAnalysisJobCost({
      targetKey: 'namedSpeakers',
      estimatedTranscriptLength: 400000,
    });

    expect(longEstimate).toBeGreaterThan(shortEstimate);
  });
});

describe('formatCost', () => {
  test('should format zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  test('should format small costs', () => {
    expect(formatCost(0.0001)).toBe('<$0.001');
    expect(formatCost(0.005)).toBe('$0.0050');
  });

  test('should format regular costs', () => {
    expect(formatCost(1.50)).toBe('$1.50');
    expect(formatCost(10.99)).toBe('$10.99');
  });

  test('should round to 2 decimal places', () => {
    expect(formatCost(1.999)).toBe('$2.00');
  });
});

describe('applyMargin', () => {
  test('should apply 45% margin correctly', () => {
    const rawCost = 1.0;
    const result = applyMargin(rawCost, 45);
    expect(result).toBeCloseTo(1.45, 6);
  });

  test('should apply custom margin', () => {
    const rawCost = 1.0;
    const result = applyMargin(rawCost, 50);
    expect(result).toBeCloseTo(1.50, 6);
  });

  test('should handle zero cost', () => {
    expect(applyMargin(0, 45)).toBe(0);
  });
});

describe('calculateMarginAmount', () => {
  test('should calculate margin amount correctly', () => {
    const rawCost = 1.0;
    const margin = calculateMarginAmount(rawCost, 45);
    expect(margin).toBeCloseTo(0.45, 6);
  });

  test('should use default 45% margin', () => {
    const rawCost = 1.0;
    const margin = calculateMarginAmount(rawCost);
    expect(margin).toBeCloseTo(0.45, 6);
  });
});

describe('isValidServiceKey', () => {
  test('should validate existing service keys', () => {
    expect(isValidServiceKey('assemblyai_transcription')).toBe(true);
    expect(isValidServiceKey('openai_gpt4o_mini_input')).toBe(true);
  });

  test('should reject invalid service keys', () => {
    expect(isValidServiceKey('invalid_key')).toBe(false);
    expect(isValidServiceKey('')).toBe(false);
  });
});

describe('getServiceInfo', () => {
  test('should return service info for valid keys', () => {
    const info = getServiceInfo('assemblyai_transcription');
    expect(info).toBeDefined();
    expect(info?.serviceKey).toBe('assemblyai_transcription');
    expect(info?.provider).toBe('assemblyai');
  });

  test('should return null for invalid keys', () => {
    const info = getServiceInfo('invalid_key');
    expect(info).toBeNull();
  });
});

describe('Cost Calculations Edge Cases', () => {
  test('should handle very large numbers', () => {
    const result = calculateServiceCost('openai_gpt4o_mini_input', 1_000_000_000);
    expect(result.rawCost).toBeGreaterThan(100);
    expect(result.billedCost).toBeGreaterThan(result.rawCost);
  });

  test('should handle very small numbers', () => {
    const result = calculateServiceCost('assemblyai_transcription', 1);
    expect(result.rawCost).toBeGreaterThan(0);
    expect(result.billedCost).toBeGreaterThan(result.rawCost);
  });

  test('should maintain precision for financial calculations', () => {
    const result = calculateServiceCost('assemblyai_transcription', 3723); // Random seconds
    expect(result.rawCost.toString()).toMatch(/^\d+\.\d{1,6}$/);
    expect(result.billedCost.toString()).toMatch(/^\d+\.\d{1,6}$/);
  });
});
