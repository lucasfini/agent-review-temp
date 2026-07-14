import {
  CampaignLibraryValidationError,
  canManageCampaignLibrary,
  createCampaign,
  createContentLibraryItem,
  mapCampaignRow,
  mapContentLibraryItemRow,
  normalizeCampaignInput,
  normalizeContentLibraryItemInput,
  listContentLibraryItems,
  updateCampaign,
  updateContentLibraryItem,
} from '@/lib/campaigns-content-library';

describe('campaign and content library helpers', () => {
  it('maps campaign rows into app-facing objects', () => {
    const mapped = mapCampaignRow({
      id: 'campaign-1',
      organization_id: 'org-1',
      client_id: null,
      shared_from_campaign_id: null,
      brand_voice_id: 'voice-1',
      name: 'Launch campaign',
      status: 'active',
      objective: 'Drive demo requests',
      audience: 'B2B founders',
      channels_json: ['LinkedIn', '', 'Newsletter'],
      start_date: '2026-06-05',
      end_date: '2026-07-05',
      owner_user_id: 'user-1',
      created_by: 'user-1',
      created_at: '2026-06-05T00:00:00.000Z',
      updated_at: '2026-06-05T00:00:00.000Z',
    });

    expect(mapped).toEqual({
      id: 'campaign-1',
      organizationId: 'org-1',
      clientId: null,
      sharedFromCampaignId: null,
      brandVoiceId: 'voice-1',
      name: 'Launch campaign',
      status: 'active',
      objective: 'Drive demo requests',
      audience: 'B2B founders',
      channels: ['LinkedIn', 'Newsletter'],
      startDate: '2026-06-05',
      endDate: '2026-07-05',
      approvalRequired: false,
      locked: false,
      ownerUserId: 'user-1',
      createdBy: 'user-1',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('maps content library rows into app-facing objects', () => {
    const mapped = mapContentLibraryItemRow({
      id: 'item-1',
      organization_id: 'org-1',
      client_id: null,
      creator_profile_id: 'profile-1',
      library_id: 'library-1',
      campaign_id: 'campaign-1',
      brand_voice_id: 'voice-1',
      project_id: 'project-1',
      output_id: 'output-1',
      title: 'Founder POV post',
      content_type: 'linkedin_post',
      platform: 'LinkedIn',
      status: 'approved',
      body: 'Draft body',
      excerpt: 'Draft excerpt',
      source_label: 'Manual draft',
      tags_json: ['Founder POV', 'launch'],
      metadata_json: { imported: false },
      published_at: null,
      created_by: 'user-1',
      created_at: '2026-06-05T00:00:00.000Z',
      updated_at: '2026-06-05T00:00:00.000Z',
    });

    expect(mapped).toEqual({
      id: 'item-1',
      organizationId: 'org-1',
      clientId: null,
      creatorProfileId: 'profile-1',
      libraryId: 'library-1',
      campaignId: 'campaign-1',
      brandVoiceId: 'voice-1',
      projectId: 'project-1',
      outputId: 'output-1',
      title: 'Founder POV post',
      contentType: 'linkedin_post',
      platform: 'LinkedIn',
      status: 'approved',
      body: 'Draft body',
      excerpt: 'Draft excerpt',
      sourceLabel: 'Manual draft',
      tags: ['Founder POV', 'launch'],
      metadata: { imported: false },
      publishedAt: null,
      scheduledFor: null,
      approvedByUserId: null,
      approvedAt: null,
      generationContextSnapshot: {},
      ownerUserId: null,
      locked: false,
      createdBy: 'user-1',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('normalizes campaign payloads and deduplicates channels', () => {
    expect(normalizeCampaignInput({
      name: '  Launch campaign  ',
      status: 'active',
      brandVoiceId: 'voice-1',
      channels: ['LinkedIn', 'linkedin', 'Newsletter', ''],
      startDate: '2026-06-05',
      end_date: '2026-07-05',
    })).toEqual({
      name: 'Launch campaign',
      status: 'active',
      brand_voice_id: 'voice-1',
      channels_json: ['LinkedIn', 'Newsletter'],
      start_date: '2026-06-05',
      end_date: '2026-07-05',
    });
  });

  it('validates and persists campaign brand voice references on create', async () => {
    const insertedPayloads: any[] = [];
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'brand_voices') {
          const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            is: jest.fn(() => builder),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'voice-1' }, error: null }),
          };
          return builder;
        }

        if (table === 'campaigns') {
          return {
            insert: jest.fn((payload: any) => {
              insertedPayloads.push(payload);
              return {
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: 'campaign-1',
                      organization_id: 'org-1',
                      client_id: null,
                      brand_voice_id: payload.brand_voice_id,
                      name: payload.name,
                      status: payload.status || 'draft',
                      objective: payload.objective || null,
                      audience: payload.audience || null,
                      channels_json: payload.channels_json || [],
                      start_date: payload.start_date || null,
                      end_date: payload.end_date || null,
                      owner_user_id: payload.owner_user_id,
                      created_by: payload.created_by,
                      created_at: '2026-06-05T00:00:00.000Z',
                      updated_at: '2026-06-05T00:00:00.000Z',
                    },
                    error: null,
                  }),
                })),
              };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const created = await createCampaign(supabase as any, 'org-1', 'user-1', {
      name: 'Launch campaign',
      brandVoiceId: 'voice-1',
    });

    expect(supabase.from).toHaveBeenCalledWith('brand_voices');
    expect(insertedPayloads[0]).toMatchObject({
      organization_id: 'org-1',
      name: 'Launch campaign',
      brand_voice_id: 'voice-1',
    });
    expect(created.brandVoiceId).toBe('voice-1');
  });

  it('rejects campaign brand voices outside the organization', async () => {
    const supabase = {
      from: jest.fn(() => {
        const builder = {
          select: jest.fn(() => builder),
          eq: jest.fn(() => builder),
          is: jest.fn(() => builder),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        return builder;
      }),
    };

    await expect(createCampaign(supabase as any, 'org-1', 'user-1', {
      name: 'Launch campaign',
      brandVoiceId: 'other-org-voice',
    })).rejects.toThrow('brandVoiceId must reference a record in this organization');
  });

  it('normalizes content library payloads', () => {
    expect(normalizeContentLibraryItemInput({
      title: '  Founder post  ',
      content_type: 'linkedin_post',
      status: 'in_review',
      tags: ['Launch', 'launch', 'Founder POV'],
      campaign_id: '',
      creatorProfileId: 'profile-1',
      library_id: 'library-1',
      metadata: { source: 'manual' },
    })).toEqual({
      title: 'Founder post',
      content_type: 'linkedin_post',
      status: 'in_review',
      tags_json: ['Launch', 'Founder POV'],
      campaign_id: null,
      creator_profile_id: 'profile-1',
      library_id: 'library-1',
      metadata_json: { source: 'manual' },
    });
  });

  it('allows content items to reference private studio collections when scoped by the route context', async () => {
    const insertedPayloads: any[] = [];
    const referenceBuilder = {
      select: jest.fn(() => referenceBuilder),
      eq: jest.fn(() => referenceBuilder),
      is: jest.fn(() => referenceBuilder),
      in: jest.fn(() => referenceBuilder),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'private-library-1' }, error: null }),
    };
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'content_libraries') {
          return referenceBuilder;
        }

        if (table === 'content_library_items') {
          return {
            insert: jest.fn((payload: any) => {
              insertedPayloads.push(payload);
              return {
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: 'item-1',
                      organization_id: 'org-1',
                      client_id: null,
                      creator_profile_id: null,
                      library_id: payload.library_id,
                      campaign_id: null,
                      brand_voice_id: null,
                      project_id: null,
                      output_id: null,
                      title: payload.title,
                      content_type: payload.content_type,
                      platform: null,
                      status: payload.status || 'draft',
                      body: null,
                      excerpt: null,
                      source_label: null,
                      tags_json: [],
                      metadata_json: {},
                      published_at: null,
                      created_by: payload.created_by,
                      created_at: '2026-06-05T00:00:00.000Z',
                      updated_at: '2026-06-05T00:00:00.000Z',
                    },
                    error: null,
                  }),
                })),
              };
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const created = await createContentLibraryItem(supabase as any, 'org-1', 'user-1', {
      title: 'Private collection draft',
      libraryId: 'private-library-1',
    }, {
      referenceOrganizationIds: ['personal-1', 'org-1'],
    });

    expect(referenceBuilder.in).toHaveBeenCalledWith('organization_id', ['personal-1', 'org-1']);
    expect(insertedPayloads[0]).toMatchObject({
      organization_id: 'org-1',
      library_id: 'private-library-1',
      title: 'Private collection draft',
    });
    expect(created.libraryId).toBe('private-library-1');
  });

  it('allows partial updates without requiring title or name', () => {
    expect(normalizeCampaignInput({ status: 'paused' }, { partial: true })).toEqual({ status: 'paused' });
    expect(normalizeContentLibraryItemInput({ status: 'approved' }, { partial: true })).toEqual({ status: 'approved' });
  });

  it('rejects invalid campaign and content payloads', () => {
    expect(() => normalizeCampaignInput({ name: '   ' })).toThrow(CampaignLibraryValidationError);
    expect(() => normalizeCampaignInput({ name: 'Campaign', status: 'shipping' })).toThrow(
      'status must be one of'
    );
    expect(() => normalizeCampaignInput({
      name: 'Campaign',
      startDate: '2026-07-05',
      endDate: '2026-06-05',
    })).toThrow('endDate must be on or after startDate');
    expect(() => normalizeContentLibraryItemInput({ title: 'Item', tags: 'launch' })).toThrow(
      'tags must be an array'
    );
    expect(() => normalizeContentLibraryItemInput({ title: 'Item', contentType: '   ' })).toThrow(
      'contentType is required'
    );
  });

  it('rejects empty update payloads before querying Supabase', async () => {
    const supabase = { from: jest.fn() };

    await expect(updateCampaign(supabase as any, 'org-1', 'campaign-1', {})).rejects.toThrow(
      CampaignLibraryValidationError
    );
    await expect(updateContentLibraryItem(supabase as any, 'org-1', 'item-1', {})).rejects.toThrow(
      CampaignLibraryValidationError
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects invalid content library list filters before querying Supabase', async () => {
    const supabase = { from: jest.fn() };

    await expect(listContentLibraryItems(supabase as any, 'org-1', {
      status: 'shipping',
    })).rejects.toThrow(CampaignLibraryValidationError);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('limits management to organization managers', () => {
    expect(canManageCampaignLibrary('owner', 'saas_customer')).toBe(true);
    expect(canManageCampaignLibrary('admin', 'saas_customer')).toBe(true);
    expect(canManageCampaignLibrary('editor', 'saas_customer')).toBe(true);
    expect(canManageCampaignLibrary('reader', 'saas_customer')).toBe(false);
    expect(canManageCampaignLibrary('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageCampaignLibrary('agency_admin', 'saas_customer')).toBe(false);
  });
});
