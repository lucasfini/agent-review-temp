import { NextRequest } from 'next/server';

function createSelectBuilder(result) {
  return {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function createExistingJobsBuilder(result) {
  let inCallCount = 0;
  const builder = {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn(() => {
      inCallCount += 1;
      if (inCallCount >= 2) {
        return Promise.resolve(result);
      }
      return builder;
    }),
  };
  return builder;
}

describe('/api/projects/[id]/generate', () => {
  let POST;
  let supabaseAdmin;
  let getOrganizationPlanCreditBalance;
  let scheduleBackgroundTask;
  let resolveGenerationContext;
  let notifyContentGenerationStarted;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    jest.doMock('../../lib/supabase/server', () => {
      const mock = {
        auth: {
          getUser: jest.fn(),
        },
        from: jest.fn(),
      };
      return { supabaseAdmin: mock };
    });

    jest.doMock('../../lib/internal-job-auth', () => ({
      getInternalJobToken: jest.fn(() => 'internal-token'),
    }));

    jest.doMock('../../lib/app-url', () => ({
      getInternalAppBaseUrl: jest.fn(() => 'http://localhost:3000'),
    }));

    jest.doMock('../../lib/background-task', () => ({
      scheduleBackgroundTask: jest.fn(),
    }));

    jest.doMock('../../lib/content-themes', () => ({
      DEFAULT_THEME_ID: 'professional',
    }));

    jest.doMock('../../lib/project-generation-jobs', () => ({
      isAnalysisJobKey: jest.fn((value) => ['summary', 'insights', 'chapters', 'takeaways', 'quotes', 'namedSpeakers'].includes(value)),
    }));

    jest.doMock('../../lib/authz/organization-context', () => ({
      getActiveOrganizationForUser: jest.fn().mockResolvedValue({
        membership: { role: 'owner' },
        organization: { id: 'org-1', type: 'workspace' },
      }),
      resolveOrganizationIdForWrite: jest.fn().mockResolvedValue('org-1'),
    }));

    jest.doMock('../../lib/authz/permissions', () => ({
      can: jest.fn(() => true),
    }));

    jest.doMock('../../lib/billing/middleware', () => ({
      billingErrorResponse: jest.fn((error) => {
        if (error?.status === 402) return error;
        return { status: 500 };
      }),
    }));

    jest.doMock('../../lib/billing/plan-credits', () => ({
      getOrganizationPlanCreditBalance: jest.fn().mockResolvedValue({
        available: 1000,
        subscription: {
          plan: {
            slug: 'standard',
            topUpEnabled: true,
          },
        },
      }),
      InsufficientPlanCreditsError: class InsufficientPlanCreditsError extends Error {
        constructor(organizationId, required, available, planSlug, topUpsEnabled) {
          super('Insufficient plan credits');
          this.status = 402;
          this.code = 'INSUFFICIENT_PLAN_CREDITS';
          this.organizationId = organizationId;
          this.required = required;
          this.available = available;
          this.planSlug = planSlug;
          this.topUpsEnabled = topUpsEnabled;
        }
      },
    }));

    jest.doMock('../../lib/billing/cost-map', () => ({
      estimateAnalysisJobCostAsync: jest.fn(({ targetKey }) => Promise.resolve(targetKey === 'summary' ? 2 : 1)),
      estimateContentGenerationCostAsync: jest.fn(([targetKey]) => Promise.resolve(targetKey === 'twitter_threads' ? 3 : 1)),
    }));

    jest.doMock('../../lib/rate-limit', () => ({
      aiRatelimit: {
        limit: jest.fn().mockResolvedValue({ success: true }),
      },
    }));

    jest.doMock('../../lib/billing/entitlement-guards', () => ({
      runEntitlementGuard: jest.fn().mockResolvedValue({ response: null }),
    }));

    jest.doMock('../../lib/generation-context', () => {
      const actual = jest.requireActual('../../lib/generation-context');
      return {
        ...actual,
        resolveGenerationContext: jest.fn().mockResolvedValue({
          creatorProfile: null,
          brandVoice: null,
          campaign: null,
          library: null,
        }),
      };
    });

    jest.doMock('../../lib/notifications/notification-events', () => ({
      notifyContentGenerationStarted: jest.fn().mockResolvedValue(null),
      notifyCreditsDepleted: jest.fn().mockResolvedValue(null),
    }));

    ({ supabaseAdmin } = require('../../lib/supabase/server'));
    ({ getOrganizationPlanCreditBalance } = require('../../lib/billing/plan-credits'));
    ({ scheduleBackgroundTask } = require('../../lib/background-task'));
    ({ resolveGenerationContext } = require('../../lib/generation-context'));
    ({ notifyContentGenerationStarted } = require('../../lib/notifications/notification-events'));
    ({ POST } = await import('../../app/api/projects/[id]/generate/route'));
  });

  it('returns 401 without authorization', async () => {
    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      body: JSON.stringify({ items: [{ kind: 'content', targetKey: 'twitter_threads' }] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    expect(response.status).toBe(401);
  });

  it('queues jobs and uses product credits for billing preflight', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world', organization_id: 'org-1', title: 'Sales Call' },
      error: null,
    });
    const jobsSelect = createSelectBuilder({ data: [], error: null });
    const insertSingle = jest.fn().mockResolvedValue({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'projects') {
        return { select: jest.fn(() => projectSelect) };
      }
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(() => jobsSelect),
          insert: insertSingle,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        items: [
          { kind: 'content', targetKey: 'twitter_threads' },
          { kind: 'analysis', targetKey: 'summary' },
        ],
        creator_profile_id: 'profile-1',
        brand_voice_id: 'voice-1',
        campaign_id: 'campaign-1',
        library_id: 'library-1',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getOrganizationPlanCreditBalance).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      ensureGrant: true,
    });
    expect(resolveGenerationContext).toHaveBeenCalledWith(
      supabaseAdmin,
      'org-1',
      {
        creatorProfileId: 'profile-1',
        brandVoiceId: 'voice-1',
        campaignId: 'campaign-1',
        libraryId: 'library-1',
      },
      { userId: 'user-1' }
    );
    expect(insertSingle).toHaveBeenCalledWith([
      {
        project_id: 'project-1',
        user_id: 'user-1',
        organization_id: 'org-1',
        kind: 'content',
        target_key: 'twitter_threads',
        theme_id: 'professional',
        custom_guidance: null,
        creator_profile_id: 'profile-1',
        brand_voice_id: 'voice-1',
        campaign_id: 'campaign-1',
        library_id: 'library-1',
        status: 'queued',
      },
      {
        project_id: 'project-1',
        user_id: 'user-1',
        organization_id: 'org-1',
        kind: 'analysis',
        target_key: 'summary',
        theme_id: null,
        custom_guidance: null,
        creator_profile_id: null,
        brand_voice_id: null,
        campaign_id: null,
        library_id: null,
        status: 'queued',
      },
    ]);
    expect(data).toMatchObject({
      success: true,
      queued: 2,
      skipped: 0,
      estimatedCost: 5,
      estimatedReserveAmount: 5.04,
      estimatedProductCredits: 50,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/projects/project-1/generate/process',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'x-internal-job-token': 'internal-token',
        }),
      })
    );
    expect(scheduleBackgroundTask).toHaveBeenCalledTimes(1);
    expect(notifyContentGenerationStarted).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      projectId: 'project-1',
      projectTitle: 'Sales Call',
      count: 2,
      idempotencyKey: expect.stringMatching(/^content_generation_started:project-1:\d+$/),
      metadata: {
        source: 'project_generate',
        queued: 2,
        targetKeys: ['twitter_threads', 'summary'],
      },
    });
  });

  it('retries queued job inserts with base columns when optional job columns are missing from the schema cache', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world', organization_id: 'org-1', title: 'Sales Call' },
      error: null,
    });
    const jobsSelect = createSelectBuilder({ data: [], error: null });
    const insertSingle = jest.fn()
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'organization_id' column of 'project_generation_jobs' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'projects') {
        return { select: jest.fn(() => projectSelect) };
      }
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(() => jobsSelect),
          insert: insertSingle,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        items: [
          {
            kind: 'content',
            targetKey: 'twitter_threads',
            creatorProfileId: 'profile-1',
            brandVoiceId: 'voice-1',
            campaignId: 'campaign-1',
            libraryId: 'library-1',
          },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      queued: 1,
      skipped: 0,
    });
    expect(insertSingle).toHaveBeenCalledTimes(2);
    expect(insertSingle.mock.calls[0][0][0]).toMatchObject({
      organization_id: 'org-1',
      creator_profile_id: 'profile-1',
      brand_voice_id: 'voice-1',
      campaign_id: 'campaign-1',
      library_id: 'library-1',
    });
    expect(insertSingle.mock.calls[1][0]).toEqual([
      {
        project_id: 'project-1',
        user_id: 'user-1',
        kind: 'content',
        target_key: 'twitter_threads',
        theme_id: 'professional',
        status: 'queued',
      },
    ]);
    expect(notifyContentGenerationStarted).toHaveBeenCalledWith(expect.objectContaining({
      count: 1,
      metadata: expect.objectContaining({
        queued: 1,
        targetKeys: ['twitter_threads'],
      }),
    }));
  });

  it('skips already active jobs and does not insert duplicates', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world', organization_id: 'org-1' },
      error: null,
    });
    const jobsSelect = createExistingJobsBuilder({
      data: [{ id: 'job-1', kind: 'content', target_key: 'twitter_threads', status: 'queued' }],
      error: null,
    });
    const insertSingle = jest.fn().mockResolvedValue({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'projects') {
        return { select: jest.fn(() => projectSelect) };
      }
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(() => jobsSelect),
          insert: insertSingle,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        items: [{ kind: 'content', targetKey: 'twitter_threads' }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(insertSingle).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      success: true,
      queued: 0,
      skipped: 1,
    });
    expect(notifyContentGenerationStarted).not.toHaveBeenCalled();
  });

  it('rejects named speakers for text-only imports before credit preflight or queueing', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: {
        id: 'project-1',
        user_id: 'user-1',
        transcription_text: 'Reply to Alex. Book dentist. Send Jamie the deck.',
        transcription_segments: [],
        speaker_data: null,
        metadata: { source: 'notion' },
        organization_id: 'org-1',
        title: 'Notion checklist',
      },
      error: null,
    });
    const insertSingle = jest.fn().mockResolvedValue({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'projects') {
        return { select: jest.fn(() => projectSelect) };
      }
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(),
          insert: insertSingle,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        items: [{ kind: 'analysis', targetKey: 'namedSpeakers' }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data).toMatchObject({
      error: expect.stringContaining('diarized speaker segments'),
      invalidItems: [
        {
          kind: 'analysis',
          targetKey: 'namedSpeakers',
          reason: expect.stringContaining('diarized speaker segments'),
        },
      ],
    });
    expect(getOrganizationPlanCreditBalance).not.toHaveBeenCalled();
    expect(insertSingle).not.toHaveBeenCalled();
    expect(scheduleBackgroundTask).not.toHaveBeenCalled();
    expect(notifyContentGenerationStarted).not.toHaveBeenCalled();
  });

  it('rejects mixed valid and incompatible analysis items without partial queueing', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: {
        id: 'project-1',
        user_id: 'user-1',
        transcription_text: 'Text import with enough content for a summary but no timestamps.',
        transcription_segments: [],
        speaker_data: null,
        metadata: { source: 'notion' },
        organization_id: 'org-1',
        title: 'Notion notes',
      },
      error: null,
    });
    const insertSingle = jest.fn().mockResolvedValue({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'projects') {
        return { select: jest.fn(() => projectSelect) };
      }
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(),
          insert: insertSingle,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: JSON.stringify({
        items: [
          { kind: 'analysis', targetKey: 'summary' },
          { kind: 'analysis', targetKey: 'chapters' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.invalidItems).toEqual([
      {
        kind: 'analysis',
        targetKey: 'chapters',
        reason: expect.stringContaining('Timestamped chapters'),
      },
    ]);
    expect(insertSingle).not.toHaveBeenCalled();
    expect(scheduleBackgroundTask).not.toHaveBeenCalled();
  });
});
