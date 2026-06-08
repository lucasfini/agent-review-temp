import {
  exportAgencyDeliveryPackage,
  mapAgencyDeliveryPackageRow,
  normalizeAgencyDeliveryPackageInput,
  validateDeliveryPackageItems,
} from '@/lib/agency-delivery-packages';

function contentItemSupabase(rows: Array<{ id: string; organization_id: string; client_id: string | null }>) {
  return {
    from: jest.fn(() => {
      const builder = {
        select: jest.fn(() => builder),
        in: jest.fn(async () => ({ data: rows, error: null })),
      };
      return builder;
    }),
  };
}

describe('agency delivery package helpers', () => {
  it('normalizes delivery package input', () => {
    expect(normalizeAgencyDeliveryPackageInput({
      clientId: 'client-1',
      title: ' June delivery ',
      status: 'ready',
      deliveryNotes: ' Send manually ',
      metadata: { channel: 'email' },
      deliveredAt: '2026-06-08T12:00:00.000Z',
    })).toEqual({
      client_id: 'client-1',
      title: 'June delivery',
      status: 'ready',
      delivery_notes: 'Send manually',
      metadata_json: { channel: 'email' },
      delivered_at: '2026-06-08T12:00:00.000Z',
    });
  });

  it('rejects invalid status and item ids', () => {
    expect(() => normalizeAgencyDeliveryPackageInput({
      clientId: 'client-1',
      title: 'Package',
      status: 'sent',
    })).toThrow('status must be one of: draft, ready, delivered, archived');
  });

  it('maps delivery package rows', () => {
    expect(mapAgencyDeliveryPackageRow({
      id: 'package-1',
      organization_id: 'agency-org',
      client_id: 'client-1',
      title: 'June package',
      status: 'delivered',
      delivery_notes: 'Sent via email',
      metadata_json: { export: 'markdown' },
      created_by: 'user-1',
      delivered_at: '2026-06-08T12:00:00.000Z',
      created_at: '2026-06-08T00:00:00.000Z',
      updated_at: '2026-06-08T12:00:00.000Z',
    })).toMatchObject({
      id: 'package-1',
      organizationId: 'agency-org',
      clientId: 'client-1',
      status: 'delivered',
      deliveryNotes: 'Sent via email',
      metadata: { export: 'markdown' },
    });
  });

  it('validates package item organization and client scope', async () => {
    const supabase = contentItemSupabase([
      { id: 'item-1', organization_id: 'agency-org', client_id: 'client-1' },
    ]);

    await expect(validateDeliveryPackageItems(
      supabase as any,
      'agency-org',
      'client-1',
      ['item-1']
    )).resolves.toBeUndefined();

    await expect(validateDeliveryPackageItems(
      contentItemSupabase([{ id: 'item-1', organization_id: 'agency-org', client_id: 'other-client' }]) as any,
      'agency-org',
      'client-1',
      ['item-1']
    )).rejects.toThrow('itemIds must belong to the selected agency client');
  });

  it('exports markdown and CSV packages', () => {
    const pkg = {
      id: 'package-1',
      organizationId: 'agency-org',
      clientId: 'client-1',
      title: 'June Package',
      status: 'ready' as const,
      deliveryNotes: 'Send manually',
      metadata: {},
      createdBy: 'user-1',
      deliveredAt: null,
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
      items: [{
        id: 'item-1',
        organizationId: 'agency-org',
        clientId: 'client-1',
        campaignId: null,
        brandVoiceId: null,
        projectId: null,
        outputId: null,
        title: 'LinkedIn post',
        contentType: 'linkedin_posts',
        platform: 'linkedin',
        status: 'approved' as const,
        body: 'Post body',
        excerpt: null,
        sourceLabel: null,
        tags: [],
        metadata: {},
        publishedAt: null,
        createdBy: 'user-1',
        createdAt: '2026-06-08T00:00:00.000Z',
        updatedAt: '2026-06-08T00:00:00.000Z',
      }],
    };

    expect(exportAgencyDeliveryPackage(pkg, 'markdown').body).toContain('# June Package');
    expect(exportAgencyDeliveryPackage(pkg, 'csv').body).toContain('package_title,item_title,status');
  });
});
