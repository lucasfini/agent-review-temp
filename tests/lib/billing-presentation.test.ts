import {
  formatAnalysisSelectionSummary,
  formatAnalysisTargetLabel,
  formatContentSelectionSummary,
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
});
