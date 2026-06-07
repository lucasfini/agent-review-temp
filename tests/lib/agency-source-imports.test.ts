import {
  AgencySourceImportValidationError,
  mapAgencySourceImportRow,
  normalizeAgencySourceImportInput,
  sourceImportClientIdFrom,
} from '@/lib/agency-source-imports';

describe('agency source import helpers', () => {
  it('normalizes source import input to database columns', () => {
    expect(normalizeAgencySourceImportInput({
      clientId: 'client-1',
      provider: 'manual_note',
      sourceTitle: ' Discovery notes ',
      sourceUrl: ' https://example.com ',
      rawText: ' Raw customer language ',
      summary: ' Useful context ',
      metadata: { capturedVia: 'test' },
    })).toEqual({
      client_id: 'client-1',
      provider: 'manual_note',
      source_title: 'Discovery notes',
      source_url: 'https://example.com',
      raw_text: 'Raw customer language',
      summary: 'Useful context',
      metadata_json: { capturedVia: 'test' },
    });
  });

  it('requires meaningful source content on create', () => {
    expect(() => normalizeAgencySourceImportInput({
      provider: 'manual_note',
    })).toThrow(AgencySourceImportValidationError);
  });

  it('rejects unknown providers', () => {
    expect(() => normalizeAgencySourceImportInput({
      provider: 'rss_feed',
      sourceTitle: 'Feed',
    })).toThrow('provider must be one of: audio_upload, transcript, slack, granola, manual_note, url, document');
  });

  it('extracts optional client ids from camel or snake case input', () => {
    expect(sourceImportClientIdFrom({ clientId: 'client-1' })).toBe('client-1');
    expect(sourceImportClientIdFrom({ client_id: 'client-2' })).toBe('client-2');
    expect(sourceImportClientIdFrom({ client_id: '' })).toBeNull();
  });

  it('maps source import rows to API payloads', () => {
    expect(mapAgencySourceImportRow({
      id: 'source-1',
      organization_id: 'agency-org',
      client_id: 'client-1',
      campaign_id: null,
      provider: 'transcript',
      source_title: 'Transcript excerpt',
      source_url: null,
      raw_text: 'Transcript text',
      summary: null,
      metadata_json: { speaker: 'Founder' },
      imported_by: 'user-1',
      created_at: '2026-06-06T00:00:00.000Z',
    })).toEqual({
      id: 'source-1',
      organizationId: 'agency-org',
      clientId: 'client-1',
      campaignId: null,
      provider: 'transcript',
      sourceTitle: 'Transcript excerpt',
      sourceUrl: null,
      rawText: 'Transcript text',
      summary: null,
      metadata: { speaker: 'Founder' },
      importedBy: 'user-1',
      createdAt: '2026-06-06T00:00:00.000Z',
    });
  });
});
