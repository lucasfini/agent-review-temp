import {
  CampaignLibraryValidationError,
  canManageCampaignLibrary,
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
      brandVoiceId: 'voice-1',
      name: 'Launch campaign',
      status: 'active',
      objective: 'Drive demo requests',
      audience: 'B2B founders',
      channels: ['LinkedIn', 'Newsletter'],
      startDate: '2026-06-05',
      endDate: '2026-07-05',
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
      createdBy: 'user-1',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('normalizes campaign payloads and deduplicates channels', () => {
    expect(normalizeCampaignInput({
      name: '  Launch campaign  ',
      status: 'active',
      channels: ['LinkedIn', 'linkedin', 'Newsletter', ''],
      startDate: '2026-06-05',
      end_date: '2026-07-05',
    })).toEqual({
      name: 'Launch campaign',
      status: 'active',
      channels_json: ['LinkedIn', 'Newsletter'],
      start_date: '2026-06-05',
      end_date: '2026-07-05',
    });
  });

  it('normalizes content library payloads', () => {
    expect(normalizeContentLibraryItemInput({
      title: '  Founder post  ',
      content_type: 'linkedin_post',
      status: 'review',
      tags: ['Launch', 'launch', 'Founder POV'],
      campaign_id: '',
      metadata: { source: 'manual' },
    })).toEqual({
      title: 'Founder post',
      content_type: 'linkedin_post',
      status: 'review',
      tags_json: ['Launch', 'Founder POV'],
      campaign_id: null,
      metadata_json: { source: 'manual' },
    });
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
    expect(canManageCampaignLibrary('member', 'saas_customer')).toBe(false);
    expect(canManageCampaignLibrary('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageCampaignLibrary('agency_admin', 'saas_customer')).toBe(false);
  });
});
