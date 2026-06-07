import {
  agencyDraftClientIdFrom,
  normalizeAgencyDraftInput,
  validateAgencyDraftReferences,
} from '@/lib/agency-drafts';

function referenceSupabase(rowsByTable: Record<string, Array<{ id: string; organization_id: string; client_id: string | null }>>) {
  return {
    from: jest.fn((table: string) => {
      const filters: Record<string, string> = {};
      const builder = {
        select: jest.fn(() => builder),
        eq: jest.fn((field: string, value: string) => {
          filters[field] = value;
          return builder;
        }),
        maybeSingle: jest.fn(async () => {
          const rows = rowsByTable[table] || [];
          const data = rows.find((row) => (
            row.organization_id === filters.organization_id
            && row.id === filters.id
          )) || null;
          return { data, error: null };
        }),
      };
      return builder;
    }),
  };
}

describe('agency draft helpers', () => {
  it('normalizes agency draft input to content library columns', () => {
    expect(normalizeAgencyDraftInput({
      clientId: 'client-1',
      title: ' Founder POV draft ',
      contentType: 'linkedin_post',
      platform: 'LinkedIn',
      status: 'review',
      body: 'Draft body',
      tags: ['founder', 'launch'],
      metadata: { deliveryNotes: 'Send in client packet' },
    })).toEqual({
      client_id: 'client-1',
      title: 'Founder POV draft',
      content_type: 'linkedin_post',
      platform: 'LinkedIn',
      status: 'review',
      body: 'Draft body',
      tags_json: ['founder', 'launch'],
      metadata_json: { deliveryNotes: 'Send in client packet' },
    });
  });

  it('extracts optional client ids from camel or snake case input', () => {
    expect(agencyDraftClientIdFrom({ clientId: 'client-1' })).toBe('client-1');
    expect(agencyDraftClientIdFrom({ client_id: 'client-2' })).toBe('client-2');
    expect(agencyDraftClientIdFrom({ client_id: '' })).toBeNull();
  });

  it('validates campaign and brand voice references inside the agency organization', async () => {
    const supabase = referenceSupabase({
      campaigns: [{ id: 'campaign-1', organization_id: 'agency-org', client_id: 'client-1' }],
      brand_voices: [{ id: 'voice-1', organization_id: 'agency-org', client_id: 'client-1' }],
    });

    await expect(validateAgencyDraftReferences(supabase as any, 'agency-org', {
      campaignId: 'campaign-1',
      brandVoiceId: 'voice-1',
    }, { clientId: 'client-1' })).resolves.toBeUndefined();
  });

  it('rejects references outside the agency organization', async () => {
    const supabase = referenceSupabase({
      campaigns: [{ id: 'campaign-1', organization_id: 'other-org', client_id: 'client-1' }],
    });

    await expect(validateAgencyDraftReferences(supabase as any, 'agency-org', {
      campaignId: 'campaign-1',
    })).rejects.toThrow('campaignId must reference a record in this agency organization');
  });

  it('rejects references for a different agency client', async () => {
    const supabase = referenceSupabase({
      brand_voices: [{ id: 'voice-1', organization_id: 'agency-org', client_id: 'other-client' }],
    });

    await expect(validateAgencyDraftReferences(supabase as any, 'agency-org', {
      brandVoiceId: 'voice-1',
    }, { clientId: 'client-1' })).rejects.toThrow('brandVoiceId must belong to the selected agency client');
  });
});
