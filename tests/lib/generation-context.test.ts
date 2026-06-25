import {
  buildGenerationContextMetadata,
  buildGenerationContextPrompt,
  GenerationContextValidationError,
  readGenerationContextIds,
  resolveGenerationContext,
} from '@/lib/generation-context';

function createFakeSupabase() {
  const tables: Record<string, any[]> = {
    creator_profiles: [
      {
        id: 'profile-1',
        organization_id: 'org-1',
        client_id: null,
        name: 'Founder Profile',
        website: 'https://example.com',
        positioning: 'Practical operator-led creator.',
        audience: 'Creators and small teams',
        content_goal: 'Turn source audio into useful posts.',
        is_default: true,
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
      {
        id: 'private-profile-1',
        organization_id: 'personal-1',
        client_id: null,
        name: 'Private Profile',
        website: null,
        positioning: 'Personal creator context.',
        audience: 'Private audience',
        content_goal: 'Personal draft quality.',
        is_default: false,
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
    ],
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
      {
        id: 'voice-2',
        organization_id: 'org-1',
        client_id: null,
        name: 'Operator Voice',
        description: 'Plainspoken and specific.',
        tone: 'direct',
        audience: 'Founder operators',
        content_pillars_json: ['operator lessons'],
        writing_examples_json: ['Start with the hard tradeoff.'],
        banned_phrases_json: ['synergy'],
        cta_preferences: 'Ask for a practical reply.',
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
      {
        id: 'private-voice-1',
        organization_id: 'personal-1',
        client_id: null,
        name: 'Private Voice',
        description: 'Personal tone guidance.',
        tone: 'plainspoken',
        audience: 'Private audience',
        content_pillars_json: ['personal lessons'],
        writing_examples_json: [],
        banned_phrases_json: [],
        cta_preferences: null,
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
    content_libraries: [
      {
        id: 'library-1',
        organization_id: 'org-1',
        client_id: null,
        name: 'Launch Library',
        description: 'Drafts for launch content.',
        created_by: 'user-1',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z',
      },
    ],
    organizations: [
      {
        id: 'org-1',
        owner_user_id: 'owner-1',
        type: 'saas_customer',
        name: 'Team Workspace',
        created_at: '2026-06-05T00:00:00.000Z',
      },
      {
        id: 'personal-1',
        owner_user_id: 'user-1',
        type: 'personal_legacy',
        name: 'User Workspace',
        created_at: '2026-06-05T00:00:00.000Z',
      },
    ],
  };

  return {
    from(table: string) {
      const filters: Array<{ field: string; value: unknown; type: 'eq' | 'is' | 'in' }> = [];
      const builder = {
        select: jest.fn(() => builder),
        eq: jest.fn((field: string, value: unknown) => {
          filters.push({ field, value, type: 'eq' });
          return builder;
        }),
        in: jest.fn((field: string, value: unknown) => {
          filters.push({ field, value, type: 'in' });
          return builder;
        }),
        is: jest.fn((field: string, value: unknown) => {
          filters.push({ field, value, type: 'is' });
          return builder;
        }),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        maybeSingle: jest.fn(async () => {
          const row = (tables[table] || []).find((candidate) => filters.every((filter) => {
            if (filter.type === 'is') return candidate[filter.field] === filter.value;
            if (filter.type === 'in') return Array.isArray(filter.value) && filter.value.includes(candidate[filter.field]);
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
      creatorProfileId: 'profile-1',
      brand_voice_id: ' voice-1 ',
      campaignId: 'campaign-1',
      library_id: 'library-1',
    })).toEqual({
      creatorProfileId: 'profile-1',
      brandVoiceId: 'voice-1',
      campaignId: 'campaign-1',
      libraryId: 'library-1',
    });
  });

  it('rejects malformed context ids', () => {
    expect(() => readGenerationContextIds({ brand_voice_id: 123 })).toThrow(GenerationContextValidationError);
  });

  it('resolves campaign context and its associated brand voice inside the organization', async () => {
    const context = await resolveGenerationContext(
      createFakeSupabase() as any,
      'org-1',
      {
        creatorProfileId: 'profile-1',
        brandVoiceId: null,
        campaignId: 'campaign-1',
        libraryId: 'library-1',
      }
    );

    expect(context.creatorProfile?.id).toBe('profile-1');
    expect(context.brandVoice?.id).toBe('voice-1');
    expect(context.campaign?.id).toBe('campaign-1');
    expect(context.library?.id).toBe('library-1');

    const prompt = buildGenerationContextPrompt(context, {
      contentTypeId: 'linkedin_posts',
      contentTypeName: 'LinkedIn Posts',
      channel: 'linkedin',
    });

    expect(prompt).toContain('Founder Profile');
    expect(prompt).toContain('Sharp B2B Voice');
    expect(prompt).toContain('Launch campaign');
    expect(prompt).toContain('Selected channel: linkedin');
    expect(prompt).toContain('Context priority rules');
    expect(prompt).toContain('Transcript and cleaned summary are the factual source of truth');
    expect(prompt).toContain('Brand voice is the primary writing style guide');
    expect(prompt).toContain('Creator profile defines whose point of view');
    expect(prompt).toContain('Plan context is the campaign brief');

    expect(buildGenerationContextMetadata(context, { channel: 'linkedin' })).toMatchObject({
      creatorProfileId: 'profile-1',
      creatorProfilePositioning: 'Practical operator-led creator.',
      brandVoiceId: 'voice-1',
      brandVoiceTone: 'confident',
      campaignId: 'campaign-1',
      campaignObjective: 'Drive qualified trials.',
      libraryId: 'library-1',
      selectedChannel: 'linkedin',
      promptVersion: 'studio-context-v1',
    });
  });

  it('lets an explicit brand voice override the selected campaign voice', async () => {
    const context = await resolveGenerationContext(
      createFakeSupabase() as any,
      'org-1',
      {
        creatorProfileId: null,
        brandVoiceId: 'voice-2',
        campaignId: 'campaign-1',
        libraryId: null,
      }
    );

    expect(context.campaign?.id).toBe('campaign-1');
    expect(context.brandVoice?.id).toBe('voice-2');

    const prompt = buildGenerationContextPrompt(context, {
      contentTypeName: 'LinkedIn Posts',
      channel: 'linkedin',
    });

    expect(prompt).toContain('Operator Voice');
    expect(prompt).not.toContain('Sharp B2B Voice');
  });

  it('resolves private Studio assets when a user context is supplied', async () => {
    const context = await resolveGenerationContext(
      createFakeSupabase() as any,
      'org-1',
      {
        creatorProfileId: 'private-profile-1',
        brandVoiceId: 'private-voice-1',
        campaignId: null,
        libraryId: null,
      },
      { userId: 'user-1' }
    );

    expect(context.creatorProfile?.id).toBe('private-profile-1');
    expect(context.brandVoice?.id).toBe('private-voice-1');
  });

  it('does not use library-only context as prompt guidance', () => {
    expect(buildGenerationContextPrompt({
      creatorProfile: null,
      brandVoice: null,
      campaign: null,
      library: {
        id: 'library-1',
        organizationId: 'org-1',
        clientId: null,
        name: 'Launch Library',
        description: 'Drafts for launch content.',
        createdBy: 'user-1',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    })).toBe('');
  });

  it('rejects context ids outside the requested organization', async () => {
    await expect(resolveGenerationContext(
      createFakeSupabase() as any,
      'org-2',
      { creatorProfileId: null, brandVoiceId: 'voice-1', campaignId: null, libraryId: null }
    )).rejects.toMatchObject({
      status: 404,
      message: 'Brand voice not found',
    });
  });
});
