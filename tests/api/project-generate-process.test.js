import { NextRequest } from 'next/server';

describe('/api/projects/[id]/generate/process', () => {
  let POST;
  let supabaseAdmin;
  let createPlanCreditReservation;
  let failReservation;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    global.fetch = jest.fn();

    jest.doMock('../../lib/supabase/server', () => {
      const mock = {
        auth: {
          getUser: jest.fn(),
          admin: {
            getUserById: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
          },
        },
        from: jest.fn(),
      };
      return { supabaseAdmin: mock };
    });

    jest.doMock('../../lib/maintenance-auth', () => ({
      isAuthorizedMaintenanceRequest: jest.fn(() => true),
    }));

    jest.doMock('../../lib/app-url', () => ({
      getInternalAppBaseUrl: jest.fn(() => 'http://localhost:3000'),
    }));

    jest.doMock('../../lib/billing/credit', () => ({
      failReservation: jest.fn().mockResolvedValue(undefined),
      InsufficientCreditError: class InsufficientCreditError extends Error {
        constructor(required, available) {
          super('Insufficient credits');
          this.required = required;
          this.available = available;
        }
      },
    }));

    jest.doMock('../../lib/billing/plan-credits', () => ({
      createPlanCreditReservation: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
      InsufficientPlanCreditsError: class InsufficientPlanCreditsError extends Error {
        constructor(organizationId, required, available) {
          super('Insufficient plan credits');
          this.organizationId = organizationId;
          this.required = required;
          this.available = available;
        }
      },
    }));

    jest.doMock('../../lib/billing/cost-map', () => ({
      estimateAnalysisJobCostAsync: jest.fn(() => Promise.resolve(2)),
      estimateContentGenerationCostAsync: jest.fn(() => Promise.resolve(3)),
    }));

    jest.doMock('../../lib/billing/middleware', () => ({
      requireCredits: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../../lib/demo-mode', () => ({
      isDemoUser: jest.fn(() => false),
    }));

    jest.doMock('../../lib/concurrency', () => ({
      acquireGlobalJobLock: jest.fn().mockResolvedValue(true),
      releaseGlobalJobLock: jest.fn().mockResolvedValue(undefined),
      heartbeatGlobalJobLock: jest.fn().mockResolvedValue(undefined),
    }));

    ({ supabaseAdmin } = require('../../lib/supabase/server'));
    ({ failReservation } = require('../../lib/billing/credit'));
    ({ createPlanCreditReservation } = require('../../lib/billing/plan-credits'));
    ({ POST } = await import('../../app/api/projects/[id]/generate/process/route'));
  });

  function buildJobState({ running = [], queued = [], project }) {
    const queuedJobs = [...queued];
    const updates = [];

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === 'project_generation_jobs') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(function (field, value) {
              if (field === 'project_id' && value === project.id) return this;
              if (field === 'status' && value === 'running') {
                return {
                  limit: jest.fn().mockResolvedValue({ data: running, error: null }),
                };
              }
              if (field === 'status' && value === 'queued') {
                return {
                  order: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      maybeSingle: jest.fn().mockResolvedValue({ data: queuedJobs.shift() || null, error: null }),
                    })),
                  })),
                };
              }
              throw new Error(`Unexpected eq ${field}:${value}`);
            }),
          })),
          update: jest.fn((payload) => ({
            eq: jest.fn(function (field, value) {
              if (field === 'id') {
                const updateState = {
                  eq: jest.fn((nextField, nextValue) => {
                    if (nextField === 'status' && nextValue === 'queued') {
                      const job = queued.find((item) => item.id === value) || null;
                      return {
                        select: jest.fn(() => ({
                          maybeSingle: jest.fn().mockResolvedValue({ data: job ? { ...job, ...payload } : null, error: null }),
                        })),
                      };
                    }
                    throw new Error(`Unexpected nested eq ${nextField}:${nextValue}`);
                  }),
                };
                updates.push({ id: value, payload });
                return updateState;
              }
              throw new Error(`Unexpected update eq ${field}:${value}`);
            }),
          })),
          __updates: updates,
        };
      }

      if (table === 'projects') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: project, error: null }),
            })),
          })),
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    return updates;
  }

  it('returns already-running when a worker is active', async () => {
    const project = { id: 'project-1', user_id: 'user-1', transcription_text: 'hello world' };
    buildJobState({
      running: [{ id: 'job-running' }],
      queued: [],
      project,
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate/process', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, skipped: 'already-running' });
  });

  it('processes a content job and sends the expected block payload to generate-content', async () => {
    const project = {
      id: 'project-1',
      user_id: 'user-1',
      transcription_text: 'hello world',
      transcription_segments: [{ text: 'hello' }],
      speaker_data: { speakers: {} },
      metadata: {},
    };
    const updates = buildJobState({
      running: [],
      queued: [
        {
          id: 'job-1',
          kind: 'content',
          target_key: 'twitter_threads',
          theme_id: 'professional',
          creator_profile_id: 'profile-1',
          brand_voice_id: 'voice-1',
          campaign_id: 'campaign-1',
          library_id: 'library-1',
          status: 'queued',
        },
      ],
      project,
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate/process', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-1' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/generate-content',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"contentTypeId":"twitter_threads"'),
      })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      creator_profile_id: 'profile-1',
      brand_voice_id: 'voice-1',
      campaign_id: 'campaign-1',
      library_id: 'library-1',
    });
    expect(updates.some((entry) => entry.id === 'job-1' && entry.payload.status === 'running')).toBe(true);
    expect(updates.some((entry) => entry.id === 'job-1' && entry.payload.status === 'completed')).toBe(true);
  });

  it('persists downstream content job message failures to error_message', async () => {
    const project = {
      id: 'project-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      transcription_text: 'hello world',
      transcription_segments: [],
      speaker_data: {},
      metadata: {},
    };
    const updates = buildJobState({
      running: [],
      queued: [
        {
          id: 'job-2',
          kind: 'content',
          target_key: 'twitter_threads',
          theme_id: 'professional',
          status: 'queued',
        },
      ],
      project,
    });

    global.fetch.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: 'Provider timeout' }),
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate/process', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    await response.json();

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'job-2',
          payload: expect.objectContaining({
            status: 'failed',
            error_message: 'Provider timeout',
          }),
        }),
      ])
    );
  });

  it('fails analysis reservations with downstream reconcile messages', async () => {
    const project = {
      id: 'project-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      transcription_text: 'hello world',
      transcription_segments: [],
      speaker_data: {},
      metadata: {},
    };
    const updates = buildJobState({
      running: [],
      queued: [
        {
          id: 'job-3',
          kind: 'analysis',
          target_key: 'summary',
          theme_id: null,
          status: 'queued',
        },
      ],
      project,
    });

    global.fetch.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: 'Reconcile failed hard' }),
    });

    const request = new NextRequest('http://localhost/api/projects/project-1/generate/process', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-1', 'x-internal-job-token': 'internal-token' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'project-1' }) });
    await response.json();

    expect(createPlanCreditReservation).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      workflowType: 'analysis_job',
      amount: 25,
    }));
    expect(failReservation).toHaveBeenCalledWith('reservation-1', 'Reconcile failed hard');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/projects/project-1/reconcile',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'x-internal-job-token': 'internal-token',
        }),
      })
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'job-3',
          payload: expect.objectContaining({
            status: 'failed',
            error_message: 'Reconcile failed hard',
          }),
        }),
      ])
    );
  });
});
