import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockListAgencyProductionTasks = jest.fn();
const mockCreateAgencyProductionTask = jest.fn();
const mockGetAgencyProductionTask = jest.fn();
const mockUpdateAgencyProductionTask = jest.fn();
const mockValidateAgencyProductionTaskReferences = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-production-tasks', () => {
  const actual = jest.requireActual('@/lib/agency-production-tasks');
  return {
    ...actual,
    listAgencyProductionTasks: (...args: any[]) => mockListAgencyProductionTasks(...args),
    createAgencyProductionTask: (...args: any[]) => mockCreateAgencyProductionTask(...args),
    getAgencyProductionTask: (...args: any[]) => mockGetAgencyProductionTask(...args),
    updateAgencyProductionTask: (...args: any[]) => mockUpdateAgencyProductionTask(...args),
    validateAgencyProductionTaskReferences: (...args: any[]) => mockValidateAgencyProductionTaskReferences(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'agency-org',
  name: 'Internal Agency',
  type: 'internal_agency',
};
const agencyMember = {
  role: 'agency_member',
  status: 'active',
};
const regularMember = {
  role: 'editor',
  status: 'active',
};
const task = {
  id: 'task-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  campaignId: null,
  contentItemId: null,
  title: 'Draft founder LinkedIn post',
  description: 'Use source notes for a first draft',
  status: 'todo',
  priority: 'high',
  assignedTo: null,
  createdBy: 'user-1',
  dueDate: null,
  metadata: {},
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('agency production task routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockListAgencyProductionTasks.mockReset();
    mockCreateAgencyProductionTask.mockReset();
    mockGetAgencyProductionTask.mockReset();
    mockUpdateAgencyProductionTask.mockReset();
    mockValidateAgencyProductionTaskReferences.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
    });
    mockRequireAgencyClientAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
      agencyClient: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
    });
    mockIsDemoUser.mockReturnValue(false);
    mockGetAgencyProductionTask.mockResolvedValue(task);
    mockValidateAgencyProductionTaskReferences.mockResolvedValue(undefined);
  });

  it('lists production tasks for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/production-tasks/route');
    mockListAgencyProductionTasks.mockResolvedValue([task]);

    const response = await GET(
      new Request('http://localhost/api/agency/production-tasks?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toEqual([task]);
    expect(payload.membership.canManageAgencyProductionTask).toBe(true);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencyProductionTasks).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: null, status: null, priority: null, limit: 100 }
    );
  });

  it('validates client-scoped production task listing against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/production-tasks/route');
    mockListAgencyProductionTasks.mockResolvedValue([task]);

    const response = await GET(
      new Request('http://localhost/api/agency/production-tasks?organization_id=agency-org&client_id=client-1&status=todo') as any
    );

    expect(response.status).toBe(200);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockListAgencyProductionTasks).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      { clientId: 'client-1', status: 'todo', priority: null, limit: 100 }
    );
  });

  it('denies SaaS organization members before listing production tasks', async () => {
    const { GET } = await import('@/app/api/agency/production-tasks/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/production-tasks?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListAgencyProductionTasks).not.toHaveBeenCalled();
  });

  it('creates production tasks for internal agency operators', async () => {
    const { POST } = await import('@/app/api/agency/production-tasks/route');
    mockCreateAgencyProductionTask.mockResolvedValue(task);

    const response = await POST(new Request('http://localhost/api/agency/production-tasks', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        title: 'Draft founder LinkedIn post',
        priority: 'high',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.task).toEqual(task);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockCreateAgencyProductionTask).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({ title: 'Draft founder LinkedIn post' })
    );
    expect(mockValidateAgencyProductionTaskReferences).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      expect.objectContaining({ title: 'Draft founder LinkedIn post' }),
      { clientId: 'client-1' }
    );
  });

  it('rejects production task writes with cross-org references', async () => {
    const { POST } = await import('@/app/api/agency/production-tasks/route');
    mockValidateAgencyProductionTaskReferences.mockRejectedValue(
      new (jest.requireActual('@/lib/agency-production-tasks').AgencyProductionTaskValidationError)(
        'contentItemId must reference a content item in this agency organization'
      )
    );

    const response = await POST(new Request('http://localhost/api/agency/production-tasks', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Cross-org linked task',
        content_item_id: 'outside-content-item',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('contentItemId must reference a content item in this agency organization');
    expect(mockCreateAgencyProductionTask).not.toHaveBeenCalled();
  });

  it('blocks regular internal agency members from production task writes', async () => {
    const { POST } = await import('@/app/api/agency/production-tasks/route');
    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: regularMember,
    });

    const response = await POST(new Request('http://localhost/api/agency/production-tasks', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Read-only task',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency production task management requires internal agency operator access');
    expect(mockCreateAgencyProductionTask).not.toHaveBeenCalled();
  });

  it('blocks demo users from production task writes', async () => {
    const { POST } = await import('@/app/api/agency/production-tasks/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/production-tasks', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        title: 'Demo task',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencyProductionTask).not.toHaveBeenCalled();
  });

  it('updates production tasks after validating next client scope', async () => {
    const { PATCH } = await import('@/app/api/agency/production-tasks/[id]/route');
    mockUpdateAgencyProductionTask.mockResolvedValue({ ...task, status: 'in_progress' });

    const response = await PATCH(new Request('http://localhost/api/agency/production-tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'in_progress',
      }),
    }) as any, { params: Promise.resolve({ id: 'task-1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.task.status).toBe('in_progress');
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockUpdateAgencyProductionTask).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'task-1',
      expect.objectContaining({ status: 'in_progress' })
    );
    expect(mockValidateAgencyProductionTaskReferences).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      expect.objectContaining({ status: 'in_progress' }),
      { clientId: 'client-1' }
    );
  });
});
