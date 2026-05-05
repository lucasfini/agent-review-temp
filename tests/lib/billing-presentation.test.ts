import {
  formatAnalysisSelectionSummary,
  formatAnalysisTargetLabel,
  formatContentSelectionSummary,
  formatUsageEventReason,
  formatWorkflowReason,
} from '@/lib/billing/presentation';

describe('billing presentation helpers', () => {
  test('formats upload analysis selections clearly', () => {
    expect(formatAnalysisSelectionSummary({
      namedSpeakers: true,
      summary: true,
      chapters: true,
    })).toBe('Transcript + Named speakers, Summary, and Chapters');
  });

  test('formats content block selections with readable labels', () => {
    expect(formatContentSelectionSummary(['twitter_threads', 'linkedin_posts'])).toBe('X Threads and LinkedIn Posts');
  });

  test('formats analysis job reason from target key', () => {
    expect(formatAnalysisTargetLabel('quotes')).toBe('Quotes');
    expect(formatWorkflowReason({
      workflowType: 'analysis_job',
      metadata: { targetKey: 'quotes' },
    })).toBe('Quotes generated');
  });

  test('formats upload workflow reason from analysis options', () => {
    expect(formatWorkflowReason({
      workflowType: 'upload_processing',
      metadata: {
        analysisOptions: {
          namedSpeakers: true,
          summary: true,
          chapters: true,
        },
      },
    })).toBe('Audio upload - Transcript + Named speakers, Summary, and Chapters');
  });

  test('formats provider usage events as product work', () => {
    expect(formatUsageEventReason({
      serviceName: 'OpenAI gpt-5-nano',
      provider: 'openai',
      metadata: { purpose: 'Key Takeaways' },
    })).toBe('Takeaways');

    expect(formatUsageEventReason({
      serviceName: 'OpenAI gpt-5',
      provider: 'openai',
      metadata: { purpose: 'Speaker Name Extraction' },
    })).toBe('Named speakers');

    expect(formatUsageEventReason({
      serviceName: 'AssemblyAI Transcription',
      provider: 'assemblyai',
      metadata: { durationMinutes: 42 },
    })).toBe('Transcription');
  });

  test('falls back to workflow labels instead of model names', () => {
    expect(formatUsageEventReason({
      serviceName: 'OpenAI gpt-5.2',
      provider: 'openai',
      workflowType: 'content_generation',
    })).toBe('Generated content');
  });
});
