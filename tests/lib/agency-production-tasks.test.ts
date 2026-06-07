import {
  AgencyProductionTaskValidationError,
  mapAgencyProductionTaskRow,
  normalizeAgencyProductionTaskInput,
  productionTaskClientIdFrom,
  validateAgencyProductionTaskReferences,
} from '@/lib/agency-production-tasks';

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

describe('agency production task helpers', () => {
  it('normalizes production task input to database columns', () => {
    expect(normalizeAgencyProductionTaskInput({
      clientId: 'client-1',
      title: ' Draft founder LinkedIn post ',
      description: ' Turn source notes into a draft ',
      status: 'in_progress',
      priority: 'high',
      assignedTo: 'user-2',
      dueDate: '2026-06-10',
      metadata: { source: 'test' },
    })).toEqual({
      client_id: 'client-1',
      title: 'Draft founder LinkedIn post',
      description: 'Turn source notes into a draft',
      status: 'in_progress',
      priority: 'high',
      assigned_to: 'user-2',
      due_date: '2026-06-10T00:00:00.000Z',
      metadata_json: { source: 'test' },
    });
  });

  it('requires a title on create', () => {
    expect(() => normalizeAgencyProductionTaskInput({
      status: 'todo',
    })).toThrow(AgencyProductionTaskValidationError);
  });

  it('rejects invalid status and priority values', () => {
    expect(() => normalizeAgencyProductionTaskInput({
      title: 'Task',
      status: 'waiting',
    })).toThrow('status must be one of: todo, in_progress, needs_review, ready_to_deliver, delivered, blocked, archived');

    expect(() => normalizeAgencyProductionTaskInput({
      title: 'Task',
      priority: 'critical',
    })).toThrow('priority must be one of: low, normal, high, urgent');
  });

  it('extracts optional client ids from camel or snake case input', () => {
    expect(productionTaskClientIdFrom({ clientId: 'client-1' })).toBe('client-1');
    expect(productionTaskClientIdFrom({ client_id: 'client-2' })).toBe('client-2');
    expect(productionTaskClientIdFrom({ client_id: '' })).toBeNull();
  });

  it('maps production task rows to API payloads', () => {
    expect(mapAgencyProductionTaskRow({
      id: 'task-1',
      organization_id: 'agency-org',
      client_id: 'client-1',
      campaign_id: null,
      content_item_id: null,
      title: 'Draft post',
      description: 'Draft from source notes',
      status: 'needs_review',
      priority: 'urgent',
      assigned_to: 'user-2',
      created_by: 'user-1',
      due_date: '2026-06-10T00:00:00.000Z',
      metadata_json: { channel: 'linkedin' },
      created_at: '2026-06-06T00:00:00.000Z',
      updated_at: '2026-06-07T00:00:00.000Z',
    })).toEqual({
      id: 'task-1',
      organizationId: 'agency-org',
      clientId: 'client-1',
      campaignId: null,
      contentItemId: null,
      title: 'Draft post',
      description: 'Draft from source notes',
      status: 'needs_review',
      priority: 'urgent',
      assignedTo: 'user-2',
      createdBy: 'user-1',
      dueDate: '2026-06-10T00:00:00.000Z',
      metadata: { channel: 'linkedin' },
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z',
    });
  });

  it('validates optional campaign and content item references inside the agency organization', async () => {
    const supabase = referenceSupabase({
      campaigns: [{ id: 'campaign-1', organization_id: 'agency-org', client_id: 'client-1' }],
      content_library_items: [{ id: 'item-1', organization_id: 'agency-org', client_id: 'client-1' }],
    });

    await expect(validateAgencyProductionTaskReferences(supabase as any, 'agency-org', {
      campaignId: 'campaign-1',
      contentItemId: 'item-1',
    }, { clientId: 'client-1' })).resolves.toBeUndefined();
  });

  it('rejects production task references outside the agency organization', async () => {
    const supabase = referenceSupabase({
      content_library_items: [{ id: 'item-1', organization_id: 'other-org', client_id: 'client-1' }],
    });

    await expect(validateAgencyProductionTaskReferences(supabase as any, 'agency-org', {
      contentItemId: 'item-1',
    })).rejects.toThrow('contentItemId must reference a content item in this agency organization');
  });

  it('rejects production task references for a different agency client', async () => {
    const supabase = referenceSupabase({
      campaigns: [{ id: 'campaign-1', organization_id: 'agency-org', client_id: 'other-client' }],
    });

    await expect(validateAgencyProductionTaskReferences(supabase as any, 'agency-org', {
      campaignId: 'campaign-1',
    }, { clientId: 'client-1' })).rejects.toThrow('campaignId must belong to the selected agency client');
  });
});
