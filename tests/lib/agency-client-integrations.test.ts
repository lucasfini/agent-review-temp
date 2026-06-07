import {
  AgencyClientIntegrationValidationError,
  mapAgencyClientIntegrationRow,
  normalizeAgencyClientIntegrationInput,
} from '@/lib/agency-client-integrations';

describe('agency client integration helpers', () => {
  it('normalizes client integration input to database columns', () => {
    expect(normalizeAgencyClientIntegrationInput({
      provider: 'granola',
      status: 'connected',
      metadata: { mode: 'manual_import' },
      connectedAt: '2026-06-07T00:00:00.000Z',
      lastSyncAt: '2026-06-07T01:00:00.000Z',
    })).toEqual({
      provider: 'granola',
      status: 'connected',
      metadata_json: { mode: 'manual_import' },
      connected_at: '2026-06-07T00:00:00.000Z',
      last_sync_at: '2026-06-07T01:00:00.000Z',
    });
  });

  it('rejects invalid provider and status values', () => {
    expect(() => normalizeAgencyClientIntegrationInput({
      provider: 'notion',
    })).toThrow('provider must be one of: slack, granola, manual, other');

    expect(() => normalizeAgencyClientIntegrationInput({
      provider: 'granola',
      status: 'active',
    })).toThrow('status must be one of: not_connected, connected, needs_attention, disabled');
  });

  it('maps client integration rows to API payloads', () => {
    expect(mapAgencyClientIntegrationRow({
      id: 'integration-1',
      client_id: 'client-1',
      provider: 'granola',
      status: 'connected',
      metadata_json: { mode: 'manual_import' },
      connected_at: '2026-06-07T00:00:00.000Z',
      last_sync_at: '2026-06-07T01:00:00.000Z',
      created_at: '2026-06-07T00:00:00.000Z',
      updated_at: '2026-06-07T01:00:00.000Z',
    })).toEqual({
      id: 'integration-1',
      clientId: 'client-1',
      provider: 'granola',
      status: 'connected',
      metadata: { mode: 'manual_import' },
      connectedAt: '2026-06-07T00:00:00.000Z',
      lastSyncAt: '2026-06-07T01:00:00.000Z',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T01:00:00.000Z',
    });
  });

  it('rejects non-object metadata', () => {
    expect(() => normalizeAgencyClientIntegrationInput({
      provider: 'granola',
      metadata: ['bad'],
    })).toThrow(AgencyClientIntegrationValidationError);
  });
});
