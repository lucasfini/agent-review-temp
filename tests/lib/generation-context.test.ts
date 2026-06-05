import {
  buildGenerationContextMetadata,
  buildGenerationContextPrompt,
  GenerationContextValidationError,
  readGenerationContextIds,
  resolveGenerationContext,
} from '@/lib/generation-context';

function createFakeSupabase() {
  const tables: Record<string, any[]> = {
    brand_voices: [
      {
        id: 'voice-1',
        organization_id: 'org-1',
        client_id: null,
        name: 'Sharp B2B Voice',
        description: 'Direct, practical, and concrete.',
        tone: 'confident',
        audience: 'B2B SaaS operators',
        content_pillars_json: ['distribution', 'retention'],
        writing_examples_json: ['Lead with the business problem.'],
        banned_phrases_json: ['game-changer'],
        cta_preferences: 'Invite a focused demo.',
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
    ],
    campaigns: [
      {
        id: 'campaign-1',
        organization_id: 'org-1',
        client_id: null,
        brand_voice_id: 'voice-1',
        name: 'Launch campaign',
        status: 'active',
        objective: 'Drive qualified trials.',
        audience: 'RevOps leaders',
        channels_json: ['linkedin', 'email'],
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        owner_user_id: 'user-1',
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
    ],
  };

  return {
    from(table: string) {
      const filters: Array<{ field: string; value: unknown; type: 'eq' | 'is' }> = [];
      const builder = {
        select: jest.fn(() => builder),
        eq: jest.fn((field: string, value: unknown) => {
          filters.push({ field, value, type: 'eq' });
          return builder;
        }),
        is: jest.fn((field: string, value: unknown) => {
          filters.push({ field, value, type: 'is' });
          return builder;
        }),
        maybeSingle: jest.fn(async () => {
          const row = (tables[table] || []).find((candidate) => filters.every((filter) => {
            if (filter.type === 'is') return candidate[filter.field] === filter.value;
            return candidate[filter.field] === filter.value;
          }));
          return { data: row || null, error: null };
        }),
      };
      return builder;
    },
  };
}

describe('generation context helpers', () => {
  it('reads snake_case and camelCase context ids', () => {
    expect(readGenerationContextIds({
      brand_voice_id: ' voice-1 ',
      campaignId: 'campaign-1',
    })).toEqual({
      brandVoiceId: 'voice-1',
      campaignId: 'campaign-1',
    });
  });

  it('rejects malformed context ids', () => {
    expect(() => readGenerationContextIds({ brand_voice_id: 123 })).toThrow(GenerationContextValidationError);
  });

  it('resolves campaign context and its associated brand voice inside the organization', async () => {
    const context = await resolveGenerationContext(
      createFakeSupabase() as any,
      'org-1',
      { brandVoiceId: null, campaignId: 'campaign-1' }
    );

    expect(context.brandVoice?.id).toBe('voice-1');
    expect(context.campaign?.id).toBe('campaign-1');

    const prompt = buildGenerationContextPrompt(context, {
      contentTypeId: 'linkedin_posts',
      contentTypeName: 'LinkedIn Posts',
      channel: 'linkedin',
    });

    expect(prompt).toContain('Sharp B2B Voice');
    expect(prompt).toContain('Launch campaign');
    expect(prompt).toContain('Selected channel: linkedin');

    expect(buildGenerationContextMetadata(context, { channel: 'linkedin' })).toMatchObject({
      brandVoiceId: 'voice-1',
      campaignId: 'campaign-1',
      selectedChannel: 'linkedin',
    });
  });

  it('rejects context ids outside the requested organization', async () => {
    await expect(resolveGenerationContext(
      createFakeSupabase() as any,
      'org-2',
      { brandVoiceId: 'voice-1', campaignId: null }
    )).rejects.toMatchObject({
      status: 404,
      message: 'Brand voice not found',
    });
  });
});
