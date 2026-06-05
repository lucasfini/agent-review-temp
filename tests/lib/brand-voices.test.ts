import {
  BrandVoiceValidationError,
  canManageBrandVoice,
  mapBrandVoiceRow,
  normalizeBrandVoiceInput,
  updateBrandVoice,
} from '@/lib/brand-voices';

describe('brand voice helpers', () => {
  it('maps database rows into app-facing brand voice objects', () => {
    const mapped = mapBrandVoiceRow({
      id: 'voice-1',
      organization_id: 'org-1',
      client_id: null,
      name: 'Default voice',
      description: 'Clear B2B positioning',
      tone: 'Direct and useful',
      audience: 'Startup founders',
      content_pillars_json: ['Founder POV', '', 'Customer proof'],
      writing_examples_json: ['Example post'],
      banned_phrases_json: ['game-changing'],
      cta_preferences: 'Ask for a reply',
      created_by: 'user-1',
      created_at: '2026-06-05T00:00:00.000Z',
      updated_at: '2026-06-05T00:00:00.000Z',
    });

    expect(mapped).toEqual({
      id: 'voice-1',
      organizationId: 'org-1',
      clientId: null,
      name: 'Default voice',
      description: 'Clear B2B positioning',
      tone: 'Direct and useful',
      audience: 'Startup founders',
      contentPillars: ['Founder POV', 'Customer proof'],
      writingExamples: ['Example post'],
      bannedPhrases: ['game-changing'],
      ctaPreferences: 'Ask for a reply',
      createdBy: 'user-1',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('normalizes create payloads and deduplicates list fields', () => {
    expect(normalizeBrandVoiceInput({
      name: '  Acme Voice  ',
      tone: '  Expert but plainspoken  ',
      contentPillars: ['Founder POV', 'founder pov', 'Customer proof', ''],
      writing_examples: ['Example one'],
      banned_phrases_json: ['Unlock your potential'],
      cta_preferences: '  Invite readers to book a demo  ',
    })).toEqual({
      name: 'Acme Voice',
      tone: 'Expert but plainspoken',
      content_pillars_json: ['Founder POV', 'Customer proof'],
      writing_examples_json: ['Example one'],
      banned_phrases_json: ['Unlock your potential'],
      cta_preferences: 'Invite readers to book a demo',
    });
  });

  it('allows partial update payloads without requiring a name', () => {
    expect(normalizeBrandVoiceInput({
      audience: 'B2B operators',
    }, { partial: true })).toEqual({
      audience: 'B2B operators',
    });
  });

  it('normalizes empty partial update payloads to no fields', () => {
    expect(normalizeBrandVoiceInput({
      organization_id: 'org-1',
    } as any, { partial: true })).toEqual({});
  });

  it('rejects empty update payloads before querying Supabase', async () => {
    const supabase = { from: jest.fn() };

    await expect(updateBrandVoice(supabase as any, 'org-1', 'voice-1', {
      organization_id: 'org-1',
    } as any)).rejects.toThrow(BrandVoiceValidationError);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads', () => {
    expect(() => normalizeBrandVoiceInput({ name: '   ' })).toThrow(BrandVoiceValidationError);
    expect(() => normalizeBrandVoiceInput({ name: 'Voice', contentPillars: 'Founder POV' })).toThrow(
      'contentPillars must be an array'
    );
  });

  it('limits brand voice management to organization managers', () => {
    expect(canManageBrandVoice('owner', 'saas_customer')).toBe(true);
    expect(canManageBrandVoice('admin', 'saas_customer')).toBe(true);
    expect(canManageBrandVoice('member', 'saas_customer')).toBe(false);
    expect(canManageBrandVoice('agency_admin', 'internal_agency')).toBe(true);
    expect(canManageBrandVoice('agency_admin', 'saas_customer')).toBe(false);
  });
});
