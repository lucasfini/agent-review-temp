import {
  AgencyClientProfileValidationError,
  getAgencyClientProfile,
  mapAgencyClientProfileRow,
  normalizeAgencyClientProfileInput,
  upsertAgencyClientProfile,
  type AgencyClientProfileRow,
} from '@/lib/agency-client-profiles';

const row: AgencyClientProfileRow = {
  id: 'profile-1',
  client_id: 'client-1',
  business_overview: 'B2B SaaS platform',
  ideal_customer_profile: 'Seed-stage founders',
  positioning: 'Fastest way to publish founder content',
  offers_json: ['Content system', '', 'Launch plan'],
  competitors_json: ['Competitor A'],
  content_pillars_json: ['Founder POV', 'Customer proof'],
  customer_pain_points_json: ['No time to write'],
  voice_notes: 'Direct and practical',
  customer_service_tone: 'Calm and helpful',
  metadata_json: { source: 'qa' },
  created_at: '2026-06-07T00:00:00.000Z',
  updated_at: '2026-06-07T00:00:00.000Z',
};

describe('agency client profile helpers', () => {
  it('maps profile rows into app-facing objects', () => {
    expect(mapAgencyClientProfileRow(row)).toEqual({
      id: 'profile-1',
      clientId: 'client-1',
      businessOverview: 'B2B SaaS platform',
      idealCustomerProfile: 'Seed-stage founders',
      positioning: 'Fastest way to publish founder content',
      offers: ['Content system', 'Launch plan'],
      competitors: ['Competitor A'],
      contentPillars: ['Founder POV', 'Customer proof'],
      customerPainPoints: ['No time to write'],
      voiceNotes: 'Direct and practical',
      customerServiceTone: 'Calm and helpful',
      metadata: { source: 'qa' },
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z',
    });
  });

  it('normalizes camel and snake case profile fields', () => {
    expect(normalizeAgencyClientProfileInput({
      businessOverview: '  Overview  ',
      ideal_customer_profile: '  ICP  ',
      content_pillars: [' Founder POV ', '', 'Customer proof'],
      customerPainPoints: ['No time to write'],
      metadata: { source: 'manual' },
    })).toEqual({
      business_overview: 'Overview',
      ideal_customer_profile: 'ICP',
      content_pillars_json: ['Founder POV', 'Customer proof'],
      customer_pain_points_json: ['No time to write'],
      metadata_json: { source: 'manual' },
    });
  });

  it('rejects non-list profile arrays', () => {
    expect(() => normalizeAgencyClientProfileInput({
      offers: 'not an array',
    })).toThrow(AgencyClientProfileValidationError);
  });

  it('loads a profile by client id', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));

    const profile = await getAgencyClientProfile({ from } as any, 'client-1');

    expect(profile?.id).toBe('profile-1');
    expect(from).toHaveBeenCalledWith('agency_client_profiles');
    expect(eq).toHaveBeenCalledWith('client_id', 'client-1');
  });

  it('upserts one profile per client', async () => {
    const single = jest.fn().mockResolvedValue({ data: row, error: null });
    const select = jest.fn(() => ({ single }));
    const upsert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ upsert }));

    const profile = await upsertAgencyClientProfile({ from } as any, 'client-1', {
      businessOverview: 'Overview',
      offers: ['Offer'],
    });

    expect(profile.clientId).toBe('client-1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'client-1',
      business_overview: 'Overview',
      offers_json: ['Offer'],
    }), { onConflict: 'client_id' });
  });
});
