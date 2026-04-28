import { NextRequest } from 'next/server';

describe('/api/insights/[projectId]/refresh', () => {
  let POST;
  let processInsightsForProject;
  let createReservation;
  let failReservation;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../../lib/insight-extraction', () => ({
      processInsightsForProject: jest.fn(),
    }));

    jest.doMock('../../lib/api/route-auth', () => ({
      RouteAccessError: class RouteAccessError extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
      requireProjectOwner: jest.fn().mockResolvedValue({
        user: { id: 'user-1' },
        project: {
          performance_level: 'premium',
          transcription_text: 'Transcript text long enough for an insights request.',
        },
      }),
    }));

    jest.doMock('../../lib/billing/cost-map', () => ({
      estimateAnalysisJobCost: jest.fn(() => 0.1),
    }));

    jest.doMock('../../lib/billing/reserve-amount', () => ({
      estimateReservationAmount: jest.fn(() => 0.102),
    }));

    jest.doMock('../../lib/billing/middleware', () => ({
      requireCredits: jest.fn().mockResolvedValue(undefined),
      billingErrorResponse: jest.fn(() => ({ status: 500 })),
    }));

    jest.doMock('../../lib/billing/credit', () => ({
      createReservation: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
      failReservation: jest.fn().mockResolvedValue(undefined),
      settleReservation: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../../lib/rate-limit', () => ({
      aiRatelimit: { limit: jest.fn().mockResolvedValue({ success: true }) },
    }));

    ({ processInsightsForProject } = require('../../lib/insight-extraction'));
    ({ createReservation, failReservation } = require('../../lib/billing/credit'));
    ({ POST } = await import('../../app/api/insights/[projectId]/refresh/route'));
  });

  function request() {
    return new NextRequest('http://localhost/api/insights/project-1/refresh', {
      method: 'POST',
    });
  }

  it('fails and releases the reservation when extraction returns no usable insights', async () => {
    processInsightsForProject.mockResolvedValue({
      success: false,
      insightCount: 0,
      totalCost: 0,
      error: 'No insights were extracted',
    });

    const response = await POST(request(), { params: Promise.resolve({ projectId: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, error: 'No insights were extracted' });
    expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      workflowType: 'analysis_job',
      amount: 0.102,
    }));
    expect(failReservation).toHaveBeenCalledWith('reservation-1', 'No insights were extracted');
  });

  it('releases the reservation when an unexpected error happens after the hold is created', async () => {
    processInsightsForProject.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request(), { params: Promise.resolve({ projectId: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, error: 'Internal server error' });
    expect(failReservation).toHaveBeenCalledWith('reservation-1', 'database unavailable');
  });
});
