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

  test('should have 35% margin on all paid services', () => {
    Object.entries(COST_MAP).forEach(([key, service]) => {
      if (service.provider !== 'local') {
        expect(service.marginPercent).toBe(35);
      }
    });
  });

  test('should have correct billed rates with 35% markup', () => {
    const assemblyai = COST_MAP.assemblyai_transcription;
    const expectedBilledRate = assemblyai.providerRate * 1.35;
    expect(assemblyai.billedRate).toBeCloseTo(expectedBilledRate, 10);
  });

  test('local services should be free', () => {
    const pyannote = COST_MAP.pyannote_diarization;
    expect(pyannote.providerRate).toBe(0);
    expect(pyannote.billedRate).toBe(0);
    expect(pyannote.marginPercent).toBe(0);
  });
});

describe('calculateServiceCost', () => {
  test('should calculate AssemblyAI cost correctly', () => {
    const durationSeconds = 3600; // 1 hour
    const result = calculateServiceCost('assemblyai_transcription', durationSeconds);

    expect(result.rawCost).toBeCloseTo(0.27, 4);
    expect(result.billedCost).toBeCloseTo(0.3645, 4);
    expect(result.marginPercent).toBe(35);
    expect(result.unitType).toBe('seconds');
  });

  test('should calculate OpenAI token cost correctly', () => {
    const inputTokens = 1_000_000;
    const result = calculateServiceCost('openai_gpt4o_mini_input', inputTokens);

    expect(result.rawCost).toBeCloseTo(0.15, 4);
    expect(result.billedCost).toBeCloseTo(0.2025, 4);
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
    expect(result.billedCost).toBeCloseTo(result.rawCost * 1.35, 6);
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

    expect(result.transcription).toBeCloseTo(0.3645, 4);
    expect(result.aiProcessing).toBe(0); // Basic tier has no AI processing
    expect(result.total).toBe(result.transcription);
  });

  test('should estimate pro tier cost with AI processing', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 3600, // 1 hour
      tier: 'pro',
    });

    expect(result.transcription).toBeCloseTo(0.3645, 4);
    expect(result.aiProcessing).toBeGreaterThan(0); // Pro includes name extraction and summary
    expect(result.total).toBeGreaterThan(result.transcription);
    expect(result.breakdown.length).toBeGreaterThan(1);
  });

  test('should estimate premium tier cost', () => {
    const result = estimateTranscriptionCost({
      durationSeconds: 3600, // 1 hour
      tier: 'premium',
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
  test('should price insights using the configured insight extraction model', () => {
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

    expect(estimated).toBeCloseTo(expected, 6);
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
  test('should apply 35% margin correctly', () => {
    const rawCost = 1.0;
    const result = applyMargin(rawCost, 35);
    expect(result).toBeCloseTo(1.35, 6);
  });

  test('should apply custom margin', () => {
    const rawCost = 1.0;
    const result = applyMargin(rawCost, 50);
    expect(result).toBeCloseTo(1.50, 6);
  });

  test('should handle zero cost', () => {
    expect(applyMargin(0, 35)).toBe(0);
  });
});

describe('calculateMarginAmount', () => {
  test('should calculate margin amount correctly', () => {
    const rawCost = 1.0;
    const margin = calculateMarginAmount(rawCost, 35);
    expect(margin).toBeCloseTo(0.35, 6);
  });

  test('should use default 35% margin', () => {
    const rawCost = 1.0;
    const margin = calculateMarginAmount(rawCost);
    expect(margin).toBeCloseTo(0.35, 6);
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
    const result = calculateServiceCost('assemblyai_transcription', 0.001);
    expect(result.rawCost).toBeGreaterThan(0);
    expect(result.billedCost).toBeGreaterThan(result.rawCost);
  });

  test('should maintain precision for financial calculations', () => {
    const result = calculateServiceCost('assemblyai_transcription', 3723); // Random seconds
    expect(result.rawCost.toString()).toMatch(/^\d+\.\d{1,6}$/);
    expect(result.billedCost.toString()).toMatch(/^\d+\.\d{1,6}$/);
  });
});
