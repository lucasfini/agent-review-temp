import {
  buildAgencyGeneratedDraftInput,
  buildAgencySourcePrompt,
  normalizeAgencySourceGenerationRequest,
} from '@/lib/agency-source-generation';
import type { AgencySourceImport } from '@/lib/agency-source-imports';

const source: AgencySourceImport = {
  id: 'source-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  campaignId: null,
  provider: 'granola',
  sourceTitle: 'Customer interview',
  sourceUrl: null,
  rawText: 'Customer wants a faster weekly content workflow.',
  summary: 'Workflow pain points',
  metadata: {
    actionItems: ['Send proposal'],
  },
  importedBy: 'user-1',
  createdAt: '2026-06-08T00:00:00.000Z',
};

describe('agency source generation helpers', () => {
  it('normalizes generation requests and caps quantity by content type', () => {
    expect(normalizeAgencySourceGenerationRequest({
      client_id: 'client-1',
      content_type: 'linkedin_posts',
      channel: 'linkedin',
      quantity: 99,
      instructions: 'Use a practical tone.',
    }, 'source-1')).toMatchObject({
      sourceImportId: 'source-1',
      clientId: 'client-1',
      contentTypeId: 'linkedin_posts',
      channel: 'linkedin',
      quantity: 6,
    });
  });

  it('rejects mismatched source route/body ids', () => {
    expect(() => normalizeAgencySourceGenerationRequest({
      source_import_id: 'source-2',
      client_id: 'client-1',
    }, 'source-1')).toThrow('source_import_id does not match route source id');
  });

  it('builds prompt context from source, client profile, and selected output', () => {
    const prompt = buildAgencySourcePrompt({
      source,
      profile: {
        id: 'profile-1',
        clientId: 'client-1',
        businessOverview: 'B2B SaaS services firm',
        idealCustomerProfile: 'Founder-led SaaS teams',
        positioning: 'Done-for-you content operations',
        offers: ['Monthly content package'],
        competitors: [],
        contentPillars: ['Workflow leverage'],
        customerPainPoints: ['Inconsistent publishing'],
        voiceNotes: 'Clear, direct, useful',
        customerServiceTone: 'Plainspoken',
        metadata: {},
        createdAt: '2026-06-08T00:00:00.000Z',
        updatedAt: '2026-06-08T00:00:00.000Z',
      },
      context: null,
      contentTypeName: 'LinkedIn Posts',
      channel: 'linkedin',
      instructions: 'Turn this into one post.',
    });

    expect(prompt).toContain('=== AGENCY SOURCE MATERIAL ===');
    expect(prompt).toContain('Customer interview');
    expect(prompt).toContain('=== AGENCY CLIENT PROFILE ===');
    expect(prompt).toContain('B2B SaaS services firm');
    expect(prompt).toContain('Do not add unsupported claims');
    expect(prompt).toContain('Turn this into one post.');
  });

  it('builds internal draft input with source linkage metadata', () => {
    const draftInput = buildAgencyGeneratedDraftInput({
      request: {
        sourceImportId: 'source-1',
        clientId: 'client-1',
        campaignId: 'campaign-1',
        brandVoiceId: 'voice-1',
        contentTypeId: 'linkedin_posts',
        channel: 'linkedin',
        instructions: 'Use source only.',
        quantity: 1,
      },
      source,
      context: {
        campaign: null,
        brandVoice: null,
      },
      generated: {
        content: 'Generated draft body',
        metadata: { model: 'test-model' },
        wordCount: 3,
        characterCount: 20,
        costUSD: 0.01,
        tokensUsed: { input: 10, output: 20 },
      },
    });

    expect(draftInput).toMatchObject({
      clientId: 'client-1',
      campaignId: 'campaign-1',
      brandVoiceId: 'voice-1',
      contentType: 'linkedin_posts',
      platform: 'linkedin',
      status: 'review',
      body: 'Generated draft body',
      metadata: expect.objectContaining({
        agencyGenerated: true,
        generatedFromSourceImportId: 'source-1',
        sourceProvider: 'granola',
        requestedInstructions: 'Use source only.',
      }),
    });
  });
});
