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
  let requireCredits;
  let scheduleBackgroundTask;

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
      getAppBaseUrl: jest.fn(() => 'http://localhost:3000'),
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

    jest.doMock('../../lib/billing/middleware', () => ({
      requireCredits: jest.fn().mockResolvedValue(undefined),
      billingErrorResponse: jest.fn((error) => {
        if (error?.status === 402) return error;
        return { status: 500 };
      }),
    }));

    jest.doMock('../../lib/billing/cost-map', () => ({
      estimateAnalysisJobCost: jest.fn(({ targetKey }) => (targetKey === 'summary' ? 2 : 1)),
      estimateContentGenerationCost: jest.fn(([targetKey]) => (targetKey === 'twitter_threads' ? 3 : 1)),
    }));

    ({ supabaseAdmin } = require('../../lib/supabase/server'));
    ({ requireCredits } = require('../../lib/billing/middleware'));
    ({ scheduleBackgroundTask } = require('../../lib/background-task'));
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

  it('queues jobs and uses the 115 percent reserve hold for billing preflight', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world' },
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
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(requireCredits).toHaveBeenCalledWith('user-1', 5.75);
    expect(insertSingle).toHaveBeenCalledWith([
      {
        project_id: 'project-1',
        user_id: 'user-1',
        kind: 'content',
        target_key: 'twitter_threads',
        theme_id: 'professional',
        status: 'queued',
      },
      {
        project_id: 'project-1',
        user_id: 'user-1',
        kind: 'analysis',
        target_key: 'summary',
        theme_id: null,
        status: 'queued',
      },
    ]);
    expect(data).toMatchObject({
      success: true,
      queued: 2,
      skipped: 0,
      estimatedCost: 5,
      estimatedReserveAmount: 5.75,
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
  });

  it('skips already active jobs and does not insert duplicates', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const projectSelect = createSelectBuilder({
      data: { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world' },
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
  });
});
