import { summarizePlanCreditUsage } from '@/lib/billing/usage-summary';

describe('plan credit usage summary', () => {
  it('uses settled reservation credits as the customer-facing charge', () => {
    const summary = summarizePlanCreditUsage({
      reservations: [
        {
          id: 'reservation-1',
          project_id: 'project-1',
          credit_unit: 'plan_credit',
          status: 'settled',
          reserved_amount: 300,
          settled_amount: 239,
          released_amount: 61,
          completed_at: '2026-07-06T12:00:00.000Z',
          created_at: '2026-07-06T11:00:00.000Z',
        },
      ],
      usageEvents: Array.from({ length: 8 }, (_, index) => ({
        id: `usage-${index + 1}`,
        reservation_id: 'reservation-1',
        project_id: 'project-1',
        service_name: index % 2 === 0 ? 'AssemblyAI Transcription' : 'OpenAI GPT',
        status: 'completed',
        created_at: '2026-07-06T12:00:00.000Z',
      })),
      projects: [
        { id: 'project-1', title: 'Customer interview' },
      ],
    });

    expect(summary.totalCredits).toBe(239);
    expect(summary.pendingCredits).toBe(0);
    expect(summary.apiCallCount).toBe(8);
    expect(summary.projectCount).toBe(1);
    expect(summary.averageCreditsPerProject).toBe(239);
    expect(summary.projects[0]).toEqual(expect.objectContaining({
      id: 'project:project-1',
      title: 'Customer interview',
      credits: 239,
      events: 8,
      workflowCount: 1,
      serviceCount: 2,
    }));
    expect(summary.trend).toEqual([
      { date: 'Jul 6', cost: 239, events: 8 },
    ]);
  });

  it('reports active reservation holds separately from spent credits', () => {
    const summary = summarizePlanCreditUsage({
      reservations: [
        {
          id: 'reservation-1',
          project_id: 'project-1',
          credit_unit: 'plan_credit',
          status: 'active',
          reserved_amount: 25,
          settled_amount: 0,
          released_amount: 0,
          created_at: '2026-07-06T12:00:00.000Z',
        },
      ],
      usageEvents: [
        {
          id: 'usage-1',
          reservation_id: 'reservation-1',
          project_id: 'project-1',
          service_name: 'OpenAI GPT',
          status: 'pending',
          created_at: '2026-07-06T12:00:00.000Z',
        },
      ],
      projects: [
        { id: 'project-1', title: 'Queued draft' },
      ],
    });

    expect(summary.totalCredits).toBe(0);
    expect(summary.pendingCredits).toBe(25);
    expect(summary.apiCallCount).toBe(1);
    expect(summary.projectCount).toBe(0);
    expect(summary.projects).toEqual([]);
  });

  it('ignores legacy and failed reservations for product credit totals', () => {
    const summary = summarizePlanCreditUsage({
      reservations: [
        {
          id: 'legacy-reservation',
          credit_unit: 'legacy_usd',
          status: 'settled',
          reserved_amount: 10,
          settled_amount: 10,
          released_amount: 0,
          created_at: '2026-07-06T12:00:00.000Z',
        },
        {
          id: 'failed-reservation',
          credit_unit: 'plan_credit',
          status: 'failed',
          reserved_amount: 100,
          settled_amount: 100,
          released_amount: 0,
          created_at: '2026-07-06T12:00:00.000Z',
        },
      ],
      usageEvents: [
        {
          id: 'usage-1',
          reservation_id: 'legacy-reservation',
          service_name: 'OpenAI GPT',
          status: 'completed',
          created_at: '2026-07-06T12:00:00.000Z',
        },
        {
          id: 'usage-2',
          reservation_id: 'failed-reservation',
          service_name: 'OpenAI GPT',
          status: 'completed',
          created_at: '2026-07-06T12:00:00.000Z',
        },
      ],
    });

    expect(summary.totalCredits).toBe(0);
    expect(summary.pendingCredits).toBe(0);
    expect(summary.apiCallCount).toBe(0);
    expect(summary.projects).toEqual([]);
    expect(summary.trend).toEqual([]);
  });
});
