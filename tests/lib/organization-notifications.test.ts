import { listOrganizationNotifications } from '@/lib/notifications/organization-notifications';

function createQuery(result: unknown) {
  const query: Record<string, unknown> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    lt: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    in: jest.fn(() => query),
    gte: jest.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => (
      Promise.resolve(result).then(resolve, reject)
    ),
  };
  return query;
}

function createSupabaseMock(resultsByTable: Record<string, unknown[]>) {
  return {
    from: jest.fn((table: string) => {
      const result = resultsByTable[table]?.shift();
      if (!result) throw new Error(`No mock result queued for ${table}`);
      return createQuery(result);
    }),
  } as any;
}

describe('organization notifications', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to recent generation jobs when the notification table is missing', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        { data: null, error: { code: '42P01', message: 'relation does not exist' } },
        { count: 0, error: null },
      ],
      projects: [
        {
          data: [{ id: 'project-1', title: 'Market Brief' }],
          error: null,
        },
      ],
      project_generation_jobs: [
        {
          data: [
            {
              id: 'job-1',
              kind: 'content',
              project_id: 'project-1',
              user_id: 'user-1',
              target_key: 'twitter_threads',
              status: 'running',
              error_message: null,
              created_at: '2026-07-10T17:39:53.000Z',
              updated_at: '2026-07-10T17:39:56.000Z',
              completed_at: null,
            },
          ],
          error: null,
        },
      ],
    });

    const result = await listOrganizationNotifications('org-1', { includeRead: true, limit: 12 }, supabase);

    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toEqual([
      expect.objectContaining({
        id: 'synthetic:content_generation:job-1:running',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        type: 'content_generation_started',
        title: 'Content generating',
        body: "We're creating 1 item for Market Brief.",
        href: '/dashboard/projects?id=project-1',
        readAt: null,
      }),
    ]);
  });

  it('uses generated copy for completed fallback jobs', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        { data: null, error: { code: 'PGRST205', message: 'table missing' } },
        { count: 0, error: null },
      ],
      projects: [
        {
          data: [{ id: 'project-1', title: 'Market Brief' }],
          error: null,
        },
      ],
      project_generation_jobs: [
        {
          data: [
            {
              id: 'job-1',
              kind: 'content',
              project_id: 'project-1',
              user_id: 'user-1',
              target_key: 'twitter_threads',
              status: 'completed',
              error_message: null,
              created_at: '2026-07-10T17:39:53.000Z',
              updated_at: '2026-07-10T17:41:20.000Z',
              completed_at: '2026-07-10T17:41:20.000Z',
            },
          ],
          error: null,
        },
      ],
    });

    const result = await listOrganizationNotifications('org-1', { includeRead: true, limit: 12 }, supabase);

    expect(result.notifications[0]).toEqual(expect.objectContaining({
      id: 'synthetic:content_generation:job-1:completed',
      type: 'content_generated',
      title: 'Content generated',
      body: '1 item is ready in Market Brief.',
      createdAt: '2026-07-10T17:41:20.000Z',
    }));
  });

  it('falls back to user generation jobs when organization projects are not stamped', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        { data: null, error: { code: '42P01', message: 'relation does not exist' } },
        { count: 0, error: null },
      ],
      projects: [
        { data: [], error: null },
        { data: [{ id: 'project-1', title: 'Legacy Project' }], error: null },
      ],
      project_generation_jobs: [
        {
          data: [
            {
              id: 'job-1',
              kind: 'content',
              project_id: 'project-1',
              user_id: 'user-1',
              target_key: 'twitter_threads',
              status: 'running',
              error_message: null,
              created_at: '2026-07-10T17:39:53.000Z',
              updated_at: '2026-07-10T17:39:56.000Z',
              completed_at: null,
            },
          ],
          error: null,
        },
      ],
    });

    const result = await listOrganizationNotifications(
      'org-1',
      { includeRead: true, limit: 12, userId: 'user-1' },
      supabase
    );

    expect(result.notifications[0]).toEqual(expect.objectContaining({
      title: 'Content generating',
      body: "We're creating 1 item for Legacy Project.",
    }));
  });

  it('falls back to upload notifications when the notification table is missing', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        { data: null, error: { code: '42P01', message: 'relation does not exist' } },
        { count: 0, error: null },
      ],
      projects: [
        {
          data: [
            {
              id: 'project-1',
              title: 'New Audio',
              user_id: 'user-1',
              audio_file_name: 'new-audio.mp3',
              status: 'uploading',
              processing_stage: 'uploading',
              created_at: '2026-07-10T17:39:53.000Z',
              updated_at: '2026-07-10T17:39:56.000Z',
              processing_started_at: null,
              processing_completed_at: null,
            },
          ],
          error: null,
        },
      ],
      project_generation_jobs: [
        {
          data: [],
          error: null,
        },
      ],
    });

    const result = await listOrganizationNotifications('org-1', { includeRead: true, limit: 12 }, supabase);

    expect(result.unreadCount).toBe(1);
    expect(result.notifications[0]).toEqual(expect.objectContaining({
      id: 'synthetic:upload:project-1:started',
      type: 'upload_started',
      title: 'Upload started',
      body: 'New Audio is uploading.',
      href: '/dashboard/projects?id=project-1',
    }));
  });

  it('falls back to transcript-ready notifications for completed uploads', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        { data: null, error: { code: 'PGRST205', message: 'table missing' } },
        { count: 0, error: null },
      ],
      projects: [
        {
          data: [
            {
              id: 'project-1',
              title: 'Finished Audio',
              user_id: 'user-1',
              audio_file_name: 'finished-audio.mp3',
              status: 'completed',
              processing_stage: 'completed',
              created_at: '2026-07-10T17:39:53.000Z',
              updated_at: '2026-07-10T17:44:00.000Z',
              processing_started_at: '2026-07-10T17:40:00.000Z',
              processing_completed_at: '2026-07-10T17:44:00.000Z',
            },
          ],
          error: null,
        },
      ],
      project_generation_jobs: [
        {
          data: [],
          error: null,
        },
      ],
    });

    const result = await listOrganizationNotifications('org-1', { includeRead: true, limit: 12 }, supabase);

    expect(result.notifications[0]).toEqual(expect.objectContaining({
      id: 'synthetic:upload:project-1:completed',
      type: 'transcription_completed',
      title: 'Transcript ready',
      body: 'Finished Audio is ready to review.',
      createdAt: '2026-07-10T17:44:00.000Z',
    }));
  });

  it('returns a next cursor when more persisted notifications are available', async () => {
    const supabase = createSupabaseMock({
      organization_notifications: [
        {
          data: [
            {
              id: 'notification-3',
              organization_id: 'org-1',
              actor_user_id: null,
              type: 'content_generated',
              title: 'Newest',
              body: null,
              href: null,
              metadata_json: {},
              read_at: null,
              created_at: '2026-07-10T17:43:00.000Z',
            },
            {
              id: 'notification-2',
              organization_id: 'org-1',
              actor_user_id: null,
              type: 'upload_completed',
              title: 'Middle',
              body: null,
              href: null,
              metadata_json: {},
              read_at: null,
              created_at: '2026-07-10T17:42:00.000Z',
            },
            {
              id: 'notification-1',
              organization_id: 'org-1',
              actor_user_id: null,
              type: 'upload_started',
              title: 'Oldest',
              body: null,
              href: null,
              metadata_json: {},
              read_at: null,
              created_at: '2026-07-10T17:41:00.000Z',
            },
          ],
          error: null,
        },
        { count: 3, error: null },
      ],
    });

    const result = await listOrganizationNotifications('org-1', { includeRead: true, limit: 2 }, supabase);

    expect(result.notifications.map((notification) => notification.id)).toEqual(['notification-3', 'notification-2']);
    expect(result.unreadCount).toBe(3);
    expect(result.nextCursor).toBe('2026-07-10T17:42:00.000Z');
  });

  it('applies a before cursor when loading older persisted notifications', async () => {
    const listQuery = createQuery({
      data: [
        {
          id: 'notification-1',
          organization_id: 'org-1',
          actor_user_id: null,
          type: 'upload_started',
          title: 'Older',
          body: null,
          href: null,
          metadata_json: {},
          read_at: null,
          created_at: '2026-07-10T17:41:00.000Z',
        },
      ],
      error: null,
    });
    const countQuery = createQuery({ count: 1, error: null });
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(listQuery)
        .mockReturnValueOnce(countQuery),
    } as any;

    const result = await listOrganizationNotifications(
      'org-1',
      { before: '2026-07-10T17:42:00.000Z', includeRead: true, limit: 2 },
      supabase
    );

    expect(listQuery.lt).toHaveBeenCalledWith('created_at', '2026-07-10T17:42:00.000Z');
    expect(listQuery.limit).toHaveBeenCalledWith(3);
    expect(result.notifications[0]).toEqual(expect.objectContaining({
      id: 'notification-1',
      title: 'Older',
    }));
    expect(result.nextCursor).toBeNull();
  });
});
