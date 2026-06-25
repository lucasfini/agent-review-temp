import {
  AgencyClientValidationError,
  createAgencyClient,
  listAgencyClients,
  mapAgencyClientRow,
  normalizeAgencyClientInput,
  updateAgencyClient,
  type AgencyClientRow,
} from '@/lib/agency-clients';

const row: AgencyClientRow = {
  id: 'client-1',
  organization_id: 'org-1',
  name: 'Acme',
  website: 'https://example.com',
  industry: 'SaaS',
  primary_contact_name: 'Avery',
  primary_contact_email: 'avery@example.com',
  package_type: 'founder-content',
  status: 'active',
  notes: 'Priority client',
  created_by: 'user-1',
  created_at: '2026-06-06T00:00:00.000Z',
  updated_at: '2026-06-06T00:00:00.000Z',
};

describe('agency client helpers', () => {
  it('maps agency client rows into app-facing objects', () => {
    expect(mapAgencyClientRow(row)).toEqual({
      id: 'client-1',
      organizationId: 'org-1',
      name: 'Acme',
      website: 'https://example.com',
      industry: 'SaaS',
      primaryContactName: 'Avery',
      primaryContactEmail: 'avery@example.com',
      packageType: 'founder-content',
      status: 'active',
      notes: 'Priority client',
      createdBy: 'user-1',
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
    });
  });

  it('normalizes create payloads and supports snake_case aliases', () => {
    expect(normalizeAgencyClientInput({
      name: '  Acme  ',
      primary_contact_name: '  Avery  ',
      primary_contact_email: '  avery@example.com  ',
      package_type: '  founder-content  ',
      status: 'lead',
      website: '',
    })).toEqual({
      name: 'Acme',
      primary_contact_name: 'Avery',
      primary_contact_email: 'avery@example.com',
      package_type: 'founder-content',
      status: 'lead',
      website: null,
    });
  });

  it('rejects invalid statuses', () => {
    expect(() => normalizeAgencyClientInput({
      name: 'Acme',
      status: 'done',
    })).toThrow(AgencyClientValidationError);
  });

  it('rejects empty update payloads before querying Supabase', async () => {
    await expect(updateAgencyClient({} as any, 'org-1', 'client-1', {})).rejects.toThrow(
      'No agency client fields provided'
    );
  });

  it('lists clients scoped to the requested internal agency organization', async () => {
    const order = jest.fn().mockResolvedValue({ data: [row], error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));

    const clients = await listAgencyClients({ from } as any, 'org-1');

    expect(clients).toHaveLength(1);
    expect(from).toHaveBeenCalledWith('agency_clients');
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  it('creates clients with organization and creator scope', async () => {
    const single = jest.fn().mockResolvedValue({ data: row, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ insert }));

    const client = await createAgencyClient({ from } as any, 'org-1', 'user-1', {
      name: 'Acme',
    });

    expect(client.id).toBe('client-1');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 'org-1',
      created_by: 'user-1',
      name: 'Acme',
    }));
  });
});
