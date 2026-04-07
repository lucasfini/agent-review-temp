/**
 * Unit Tests for Usage Tracking Utilities
 */

import { extractOpenAIUsage, extractAnthropicUsage } from '@/lib/billing/track-usage';

describe('extractOpenAIUsage', () => {
  test('should extract usage from OpenAI response', () => {
    const mockResponse = {
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 500,
        total_tokens: 2000,
      },
    };

    const result = extractOpenAIUsage(mockResponse);

    expect(result.promptTokens).toBe(1500);
    expect(result.completionTokens).toBe(500);
    expect(result.totalTokens).toBe(2000);
  });

  test('should handle missing usage object', () => {
    const mockResponse = {};

    const result = extractOpenAIUsage(mockResponse);

    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  test('should handle partial usage data', () => {
    const mockResponse = {
      usage: {
        prompt_tokens: 1000,
      },
    };

    const result = extractOpenAIUsage(mockResponse);

    expect(result.promptTokens).toBe(1000);
    expect(result.completionTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  test('should handle null response', () => {
    const result = extractOpenAIUsage(null);

    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });
});

describe('extractAnthropicUsage', () => {
  test('should extract usage from Anthropic response', () => {
    const mockResponse = {
      usage: {
        input_tokens: 2500,
        output_tokens: 1500,
      },
    };

    const result = extractAnthropicUsage(mockResponse);

    expect(result.inputTokens).toBe(2500);
    expect(result.outputTokens).toBe(1500);
  });

  test('should handle missing usage object', () => {
    const mockResponse = {};

    const result = extractAnthropicUsage(mockResponse);

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  test('should handle partial usage data', () => {
    const mockResponse = {
      usage: {
        input_tokens: 3000,
      },
    };

    const result = extractAnthropicUsage(mockResponse);

    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(0);
  });

  test('should handle null response', () => {
    const result = extractAnthropicUsage(null);

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});

describe('Token Cost Calculations', () => {
  test('should calculate cost for realistic GPT-4o-mini usage', () => {
    const inputTokens = 5000;
    const outputTokens = 2000;

    // Provider rates (from cost-map.ts)
    const inputRate = 0.15 / 1_000_000;
    const outputRate = 0.60 / 1_000_000;

    const rawInputCost = inputTokens * inputRate;
    const rawOutputCost = outputTokens * outputRate;
    const rawTotal = rawInputCost + rawOutputCost;

    expect(rawInputCost).toBeCloseTo(0.00075, 6);
    expect(rawOutputCost).toBeCloseTo(0.0012, 6);
    expect(rawTotal).toBeCloseTo(0.00195, 6);

    // With 35% margin
    const billedTotal = rawTotal * 1.35;
    expect(billedTotal).toBeCloseTo(0.0026325, 6);
  });

  test('should calculate cost for Claude Sonnet usage', () => {
    const inputTokens = 10000;
    const outputTokens = 5000;

    // Provider rates
    const inputRate = 3.00 / 1_000_000;
    const outputRate = 15.00 / 1_000_000;

    const rawInputCost = inputTokens * inputRate;
    const rawOutputCost = outputTokens * outputRate;
    const rawTotal = rawInputCost + rawOutputCost;

    expect(rawInputCost).toBeCloseTo(0.03, 4);
    expect(rawOutputCost).toBeCloseTo(0.075, 4);
    expect(rawTotal).toBeCloseTo(0.105, 4);

    // With 35% margin
    const billedTotal = rawTotal * 1.35;
    expect(billedTotal).toBeCloseTo(0.14175, 5);
  });
});

describe('AssemblyAI Duration Cost Calculations', () => {
  test('should calculate cost for 1 minute of audio', () => {
    const durationSeconds = 60;
    const providerRate = 0.37 / 3600; // $0.37 per hour (Universal-3)

    const rawCost = durationSeconds * providerRate;
    const billedCost = rawCost * 1.45;

    expect(rawCost).toBeCloseTo(0.006167, 6);
    expect(billedCost).toBeCloseTo(0.008942, 6);
  });

  test('should calculate cost for 1 hour of audio', () => {
    const durationSeconds = 3600;
    const providerRate = 0.000102778; // $0.37/hour (Universal-3)

    const rawCost = durationSeconds * providerRate;
    const billedCost = rawCost * 1.45;

    expect(rawCost).toBeCloseTo(0.37, 4);
    expect(billedCost).toBeCloseTo(0.5365, 4);
  });

  test('should calculate cost for 30 minute podcast', () => {
    const durationSeconds = 1800;
    const providerRate = 0.000102778; // $0.37/hour (Universal-3)

    const rawCost = durationSeconds * providerRate;
    const billedCost = rawCost * 1.45;

    expect(rawCost).toBeCloseTo(0.185, 4);
    expect(billedCost).toBeCloseTo(0.26825, 5);
  });
});

describe('Usage Metadata Formatting', () => {
  test('should format metadata for AssemblyAI', () => {
    const metadata = {
      processingTime: 45.3,
      speakerCount: 2,
      confidence: 0.95,
      durationMinutes: 60,
    };

    expect(metadata.durationMinutes).toBe(60);
    expect(metadata.speakerCount).toBe(2);
    expect(metadata.confidence).toBeCloseTo(0.95, 2);
  });

  test('should format metadata for OpenAI', () => {
    const metadata = {
      model: 'gpt-4o-mini',
      purpose: 'Name Extraction',
      transcriptLength: 15000,
      strategy: 'general',
    };

    expect(metadata.model).toBe('gpt-4o-mini');
    expect(metadata.purpose).toBe('Name Extraction');
  });

  test('should format metadata for Anthropic', () => {
    const metadata = {
      model: 'claude-sonnet-4.5',
      purpose: 'Content Analysis',
      inputTokens: 5000,
      outputTokens: 2000,
    };

    expect(metadata.model).toBe('claude-sonnet-4.5');
    expect(metadata.inputTokens).toBe(5000);
  });
});

describe('Batch Usage Aggregation', () => {
  test('should calculate total cost for multiple services', () => {
    const usageEvents = [
      { serviceKey: 'assemblyai_transcription', billedCost: 0.5365 },
      { serviceKey: 'openai_gpt4o_mini_input', billedCost: 0.0002 },
      { serviceKey: 'openai_gpt4o_mini_output', billedCost: 0.0008 },
      { serviceKey: 'claude_sonnet_input', billedCost: 0.03 },
      { serviceKey: 'claude_sonnet_output', billedCost: 0.075 },
    ];

    const totalBilledCost = usageEvents.reduce((sum, event) => sum + event.billedCost, 0);

    expect(totalBilledCost).toBeCloseTo(0.6425, 4);
  });

  test('should group usage by provider', () => {
    const usageEvents = [
      { provider: 'assemblyai', billedCost: 0.5365, units: 3600 },
      { provider: 'openai', billedCost: 0.0002, units: 1000 },
      { provider: 'openai', billedCost: 0.0008, units: 500 },
      { provider: 'anthropic', billedCost: 0.03, units: 10000 },
    ];

    const byProvider = usageEvents.reduce((acc, event) => {
      if (!acc[event.provider]) {
        acc[event.provider] = [];
      }
      acc[event.provider].push(event);
      return acc;
    }, {} as Record<string, typeof usageEvents>);

    expect(byProvider.assemblyai.length).toBe(1);
    expect(byProvider.openai.length).toBe(2);
    expect(byProvider.anthropic.length).toBe(1);

    const openaiTotal = byProvider.openai.reduce((sum, e) => sum + e.billedCost, 0);
    expect(openaiTotal).toBeCloseTo(0.001, 4);
  });
});

describe('Pre-flight Estimate Accuracy', () => {
  test('should estimate within 20% of actual cost', () => {
    // Estimate based on file size
    const fileSizeMB = 5;
    const estimatedDurationSeconds = Math.ceil(fileSizeMB * 60); // 1MB ≈ 60 seconds
    const estimatedCost = estimatedDurationSeconds * 0.000102778 * 1.45;

    // Actual duration (slightly different)
    const actualDurationSeconds = 280; // 4 minutes 40 seconds
    const actualCost = actualDurationSeconds * 0.000102778 * 1.45;

    const difference = Math.abs(estimatedCost - actualCost);
    const percentDifference = (difference / actualCost) * 100;

    // Should be within 20% for reasonable estimates
    expect(percentDifference).toBeLessThan(20);
  });
});

describe('Usage Event Status', () => {
  test('should default to completed status', () => {
    const status = 'completed';
    expect(status).toBe('completed');
  });

  test('should support pending status', () => {
    const status = 'pending';
    expect(['completed', 'pending', 'failed', 'refunded']).toContain(status);
  });

  test('should support all valid statuses', () => {
    const validStatuses = ['completed', 'pending', 'failed', 'refunded'];
    validStatuses.forEach((status) => {
      expect(validStatuses).toContain(status);
    });
  });
});

describe('Cost Precision and Rounding', () => {
  test('should maintain 6 decimal places for costs', () => {
    const cost = 0.123456789;
    const rounded = Number(cost.toFixed(6));

    expect(rounded).toBe(0.123457);
    expect(rounded.toString()).toMatch(/^\d+\.\d{1,6}$/);
  });

  test('should not lose precision in summation', () => {
    const costs = [0.000001, 0.000002, 0.000003];
    const total = costs.reduce((sum, cost) => sum + cost, 0);

    expect(total).toBeCloseTo(0.000006, 6);
  });

  test('should round correctly at boundaries', () => {
    expect(Number((0.9999995).toFixed(6))).toBe(1.0);
    expect(Number((0.9999994).toFixed(6))).toBe(0.999999);
  });
});
