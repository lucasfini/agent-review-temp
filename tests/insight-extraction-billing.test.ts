describe('insight extraction billing', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('does not track or debit usage when the model returns no usable insights', async () => {
    jest.doMock('@/lib/ai-providers/multi-provider', () => ({
      getAICompletion: jest.fn().mockResolvedValue({
        provider: 'openai',
        content: JSON.stringify({ insights: [] }),
        usage: {
          inputTokens: 1000,
          outputTokens: 20,
          totalTokens: 1020,
        },
      }),
    }));

    jest.doMock('@/lib/billing/track-usage', () => ({
      trackOpenAIUsage: jest.fn().mockResolvedValue({
        usageEventId: 'usage-1',
        billedCost: 0.01,
        rawCost: 0.005,
      }),
      trackAnthropicUsage: jest.fn(),
    }));

    const { extractInsightsWithHaiku } = await import('@/lib/insight-extraction');
    const { trackOpenAIUsage } = await import('@/lib/billing/track-usage');

    const result = await extractInsightsWithHaiku(
      'A transcript with no extractable insight entities.',
      null,
      'Empty episode',
      'user-1',
      'project-1'
    );

    expect(result.insights).toEqual([]);
    expect(trackOpenAIUsage).not.toHaveBeenCalled();
  });
});
