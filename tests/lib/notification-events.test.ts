const mockCreateOrganizationNotification = jest.fn();

jest.mock('@/lib/notifications/organization-notifications', () => ({
  createOrganizationNotification: (...args: any[]) => mockCreateOrganizationNotification(...args),
}));

describe('notification events', () => {
  beforeEach(() => {
    mockCreateOrganizationNotification.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds simple content generation copy and an idempotent project link', async () => {
    const { notifyContentGenerationStarted } = await import('@/lib/notifications/notification-events');
    mockCreateOrganizationNotification.mockResolvedValue({ id: 'notification-1' });

    await notifyContentGenerationStarted({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      projectId: 'project-1',
      projectTitle: 'Sales Call',
      count: 2,
    });

    expect(mockCreateOrganizationNotification).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      type: 'content_generation_started',
      title: 'Content generating',
      body: "We're creating 2 items for Sales Call.",
      href: '/dashboard/projects?id=project-1',
      idempotencyKey: 'content_generation_started:project-1',
      metadata: { projectId: 'project-1' },
    });
  });

  it('uses singular grammar for one generated item', async () => {
    const { notifyContentGenerated } = await import('@/lib/notifications/notification-events');
    mockCreateOrganizationNotification.mockResolvedValue({ id: 'notification-2' });

    await notifyContentGenerated({
      organizationId: 'org-1',
      projectId: 'project-1',
      projectTitle: 'Sales Call',
      count: 1,
    });

    expect(mockCreateOrganizationNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Content generated',
      body: '1 item is ready in Sales Call.',
    }));
  });

  it('returns null and logs when notification writes fail', async () => {
    const { notifyOrganization } = await import('@/lib/notifications/notification-events');
    mockCreateOrganizationNotification.mockRejectedValue(new Error('database unavailable'));

    const result = await notifyOrganization({
      organizationId: 'org-1',
      type: 'workspace_updated',
      title: 'Workspace updated',
      body: 'Workspace settings were updated.',
    });

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[NOTIFICATIONS] Failed to create notification:',
      expect.any(Error)
    );
  });
});
