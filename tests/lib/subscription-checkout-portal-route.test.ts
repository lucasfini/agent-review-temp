import { OrganizationAccessError } from '@/lib/authz/types';

const mockCheckoutSessionCreate = jest.fn();
const mockCustomerCreate = jest.fn();
const mockPortalSessionCreate = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockSubscriptionUpdate = jest.fn();
const mockSubscriptionScheduleCreate = jest.fn();
const mockSubscriptionScheduleRetrieve = jest.fn();
const mockSubscriptionScheduleUpdate = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockRequireOrganizationBillingManager = jest.fn();
const mockGetPlanBySlugOrId = jest.fn();
const mockGetOrganizationStripeCustomerId = jest.fn();
const mockStoreOrganizationStripeCustomerId = jest.fn();
const mockUpdateOrganizationSubscriptionMetadata = jest.fn();
const mockUpsertOrganizationSubscriptionFromStripe = jest.fn();
const mockGetOrganizationSubscription = jest.fn();
const mockGetOrCreateCreditSubscription = jest.fn();
const mockEnsureCurrentPlanCreditGrant = jest.fn();
const mockIsDemoUser = jest.fn();
const mockGetWorkspaceSeatSummary = jest.fn();
const mockResolveInviteOrganization = jest.fn();
const mockSetActiveOrganizationForUser = jest.fn();
const mockIsBillingTestMode = jest.fn();

jest.mock('@/lib/api/route-auth', () => {
  class RouteAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'RouteAccessError';
      this.status = status;
    }
  }

  return {
    RouteAccessError,
    requireAuthenticatedUser: (...args: any[]) => mockRequireAuthenticatedUser(...args),
  };
});

jest.mock('@/lib/authz/billing-permissions', () => ({
  requireOrganizationBillingManager: (...args: any[]) => mockRequireOrganizationBillingManager(...args),
}));

jest.mock('@/lib/authz/organization-context', () => ({
  displayOrganizationName: (organization: any) => (
    organization?.type === 'personal_legacy' ? 'Personal Workspace' : organization?.name || 'Workspace'
  ),
  setActiveOrganizationForUser: (...args: any[]) => mockSetActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/billing/plans', () => ({
  getPlanBySlugOrId: (...args: any[]) => mockGetPlanBySlugOrId(...args),
  getPlanStripePriceId: (plan: any, interval: 'month' | 'year' = 'month') => (
    interval === 'year'
      ? plan.stripeAnnualPriceId || null
      : plan.stripeMonthlyPriceId || plan.stripePriceId || null
  ),
}));

jest.mock('@/lib/billing/subscriptions', () => ({
  getOrganizationStripeCustomerId: (...args: any[]) => mockGetOrganizationStripeCustomerId(...args),
  storeOrganizationStripeCustomerId: (...args: any[]) => mockStoreOrganizationStripeCustomerId(...args),
  updateOrganizationSubscriptionMetadata: (...args: any[]) => mockUpdateOrganizationSubscriptionMetadata(...args),
  upsertOrganizationSubscriptionFromStripe: (...args: any[]) => mockUpsertOrganizationSubscriptionFromStripe(...args),
  getOrganizationSubscription: (...args: any[]) => mockGetOrganizationSubscription(...args),
  getSubscriptionBaseSeatLimit: (subscription: any) => subscription?.plan?.limits?.seatLimit || null,
  getSubscriptionSeatLimit: (subscription: any) => {
    const base = subscription?.plan?.limits?.seatLimit || 0;
    const extra = subscription?.extraSeatCount || 0;
    return base > 0 ? base + extra : null;
  },
  isSubscriptionUsable: (status?: string | null) => status === 'active' || status === 'trialing',
}));

jest.mock('@/lib/billing/plan-credits', () => ({
  getOrCreateCreditSubscription: (...args: any[]) => mockGetOrCreateCreditSubscription(...args),
  ensureCurrentPlanCreditGrant: (...args: any[]) => mockEnsureCurrentPlanCreditGrant(...args),
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/billing/stripe-runtime', () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: (...args: any[]) => mockCheckoutSessionCreate(...args),
      },
    },
    customers: {
      create: (...args: any[]) => mockCustomerCreate(...args),
    },
    billingPortal: {
      sessions: {
        create: (...args: any[]) => mockPortalSessionCreate(...args),
      },
    },
    subscriptions: {
      retrieve: (...args: any[]) => mockSubscriptionRetrieve(...args),
      update: (...args: any[]) => mockSubscriptionUpdate(...args),
    },
    subscriptionSchedules: {
      create: (...args: any[]) => mockSubscriptionScheduleCreate(...args),
      retrieve: (...args: any[]) => mockSubscriptionScheduleRetrieve(...args),
      update: (...args: any[]) => mockSubscriptionScheduleUpdate(...args),
    },
  }),
  isBillingTestMode: (...args: any[]) => mockIsBillingTestMode(...args),
}));

jest.mock('@/lib/organizations/team', () => ({
  getWorkspaceSeatSummary: (...args: any[]) => mockGetWorkspaceSeatSummary(...args),
  resolveInviteOrganization: (...args: any[]) => mockResolveInviteOrganization(...args),
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'org-1',
  name: 'Acme Workspace',
  type: 'personal_legacy',
  owner_user_id: 'user-1',
};
const teamOrganization = {
  id: 'team-org-1',
  name: 'Acme Team',
  type: 'saas_customer',
  owner_user_id: 'user-1',
};
const plan = {
  id: 'plan-standard',
  slug: 'standard',
  name: 'Standard',
  stripePriceId: 'price_standard',
  stripeMonthlyPriceId: 'price_standard_monthly',
  stripeAnnualPriceId: 'price_standard_annual',
  monthlyPriceCents: 4900,
  annualPriceCents: 49000,
  currency: 'usd',
};
const proPlan = {
  id: 'plan-pro',
  slug: 'pro',
  name: 'Pro',
  stripePriceId: 'price_pro_monthly',
  stripeMonthlyPriceId: 'price_pro_monthly',
  stripeAnnualPriceId: 'price_pro_annual',
  monthlyPriceCents: 9900,
  annualPriceCents: 99000,
  currency: 'usd',
};
const teamsPlan = {
  id: 'plan-teams',
  slug: 'teams',
  name: 'Teams',
  stripePriceId: 'price_teams_monthly',
  stripeMonthlyPriceId: 'price_teams_monthly',
  stripeAnnualPriceId: 'price_teams_annual',
  monthlyPriceCents: 29900,
  annualPriceCents: 299000,
  currency: 'usd',
  stripeExtraSeatMonthlyPriceId: 'price_live_teams_extra_seat_monthly',
  stripeExtraSeatAnnualPriceId: 'price_live_teams_extra_seat_annual',
  limits: {
    seatLimit: 5,
  },
  extraSeatPriceCents: 2900,
};
const teamsSubscription = {
  id: 'subscription-teams',
  organizationId: 'org-1',
  planId: 'plan-teams',
  plan: teamsPlan,
  stripeCustomerId: 'cus_existing',
  stripeSubscriptionId: 'sub_teams',
  extraSeatCount: 0,
  stripeExtraSeatSubscriptionItemId: null,
  stripeExtraSeatPriceId: null,
  status: 'active',
  metadata: {
    billing_interval: 'year',
    stripePriceId: 'price_teams_annual',
  },
};

describe('subscription checkout and portal routes', () => {
  beforeEach(() => {
    mockCheckoutSessionCreate.mockReset();
    mockCustomerCreate.mockReset();
    mockPortalSessionCreate.mockReset();
    mockSubscriptionRetrieve.mockReset();
    mockSubscriptionUpdate.mockReset();
    mockSubscriptionScheduleCreate.mockReset();
    mockSubscriptionScheduleRetrieve.mockReset();
    mockSubscriptionScheduleUpdate.mockReset();
    mockRequireAuthenticatedUser.mockReset();
    mockRequireOrganizationBillingManager.mockReset();
    mockGetPlanBySlugOrId.mockReset();
    mockGetOrganizationStripeCustomerId.mockReset();
    mockStoreOrganizationStripeCustomerId.mockReset();
    mockUpdateOrganizationSubscriptionMetadata.mockReset();
    mockUpsertOrganizationSubscriptionFromStripe.mockReset();
    mockGetOrganizationSubscription.mockReset();
    mockGetOrCreateCreditSubscription.mockReset();
    mockEnsureCurrentPlanCreditGrant.mockReset();
    mockIsDemoUser.mockReset();
    mockGetWorkspaceSeatSummary.mockReset();
    mockResolveInviteOrganization.mockReset();
    mockSetActiveOrganizationForUser.mockReset();
    mockIsBillingTestMode.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockRequireOrganizationBillingManager.mockResolvedValue({
      organization,
      membership: { role: 'owner', status: 'active' },
    });
    mockIsDemoUser.mockReturnValue(false);
    mockGetOrCreateCreditSubscription.mockResolvedValue({
      plan: {
        id: 'plan-standard',
        slug: 'standard',
        topUpEnabled: true,
      },
    });
    mockEnsureCurrentPlanCreditGrant.mockResolvedValue(undefined);
    mockUpdateOrganizationSubscriptionMetadata.mockResolvedValue(null);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue(null);
    mockGetOrganizationSubscription.mockResolvedValue(null);
    mockGetWorkspaceSeatSummary.mockResolvedValue({
      active: 5,
      pending: 0,
      limit: 5,
      available: 0,
      isFull: true,
    });
    mockResolveInviteOrganization.mockResolvedValue({
      organization: teamOrganization,
      isNewTeam: false,
    });
    mockSetActiveOrganizationForUser.mockResolvedValue(undefined);
    mockIsBillingTestMode.mockReturnValue(false);
  });

  it('requires a configured Stripe price for subscription checkout', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue({
      ...plan,
      stripePriceId: null,
      stripeMonthlyPriceId: null,
      stripeAnnualPriceId: null,
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ planSlug: 'standard' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Plan is not configured for Stripe subscription checkout');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it('rejects obvious placeholder Stripe price ids in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });

    try {
      const { POST } = await import('@/app/api/subscriptions/checkout/route');
      mockGetPlanBySlugOrId.mockResolvedValue({ ...plan, stripeMonthlyPriceId: 'price_starter' });

      const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug: 'standard' }),
      }) as any);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('Plan has an unsafe Stripe price configuration');
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
    }
  });

  it('creates an organization subscription checkout session with Stripe metadata', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: 'cus_new' });
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_sub', url: 'https://checkout.stripe.test/cs_sub' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'standard',
        organization_id: 'org-1',
        successUrl: '/dashboard/billing?done=1',
        cancelUrl: 'https://evil.example/cancel',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe('https://checkout.stripe.test/cs_sub');
    expect(mockRequireOrganizationBillingManager).toHaveBeenCalledWith({
      userId: 'user-1',
      requestedOrganizationId: 'org-1',
    });
    expect(mockCustomerCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      name: 'Acme Workspace',
      metadata: {
        organization_id: 'org-1',
        created_by_user_id: 'user-1',
      },
    }));
    expect(mockStoreOrganizationStripeCustomerId).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'cus_new',
      expect.objectContaining({ planId: 'plan-standard' })
    );
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_new',
      line_items: [{ price: 'price_standard_monthly', quantity: 1 }],
      metadata: {
        organization_id: 'org-1',
        user_id: 'user-1',
        plan_id: 'plan-standard',
        plan_slug: 'standard',
        billing_interval: 'month',
      },
      subscription_data: {
        metadata: {
          organization_id: 'org-1',
          user_id: 'user-1',
          plan_id: 'plan-standard',
          plan_slug: 'standard',
          billing_interval: 'month',
        },
      },
    }));
    const checkoutPayload = mockCheckoutSessionCreate.mock.calls[0][0];
    expect(checkoutPayload.success_url).toBe('http://localhost:3000/dashboard/billing?done=1');
    expect(checkoutPayload.cancel_url).toBe('http://localhost:3000/dashboard/billing?subscription=cancel');
  });

  it('allows an organization admin to create a checkout session', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockRequireOrganizationBillingManager.mockResolvedValue({
      organization,
      membership: { role: 'admin', status: 'active' },
    });
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_admin', url: 'https://checkout.stripe.test/cs_admin' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ planSlug: 'standard', organization_id: 'org-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe('https://checkout.stripe.test/cs_admin');
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_existing',
      client_reference_id: 'org-1',
    }));
  });

  it('uses the annual Stripe price when annual billing is requested', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_annual', url: 'https://checkout.stripe.test/cs_annual' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'standard',
        organization_id: 'org-1',
        billingInterval: 'year',
      }),
    }) as any);

    expect(response.status).toBe(200);
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_standard_annual', quantity: 1 }],
      metadata: expect.objectContaining({
        billing_interval: 'year',
      }),
      subscription_data: {
        metadata: expect.objectContaining({
          billing_interval: 'year',
        }),
      },
    }));
  });

  it('rejects free plan checkout requests', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue({
      id: 'plan-free',
      slug: 'free',
      name: 'Free',
      stripePriceId: null,
      stripeMonthlyPriceId: null,
      stripeAnnualPriceId: null,
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'free',
        organization_id: 'org-1',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('The Free plan does not require Stripe checkout');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it('routes Pro checkout from a personal workspace to the owner team workspace', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockRequireOrganizationBillingManager
      .mockResolvedValueOnce({
        organization,
        membership: { role: 'owner', status: 'active' },
      })
      .mockResolvedValueOnce({
        organization: teamOrganization,
        membership: { role: 'owner', status: 'active' },
      });
    mockGetPlanBySlugOrId.mockResolvedValue(proPlan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: 'cus_team_new' });
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_team_pro', url: 'https://checkout.stripe.test/cs_team_pro' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'pro',
        organization_id: 'org-1',
        billingInterval: 'month',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe('https://checkout.stripe.test/cs_team_pro');
    expect(mockResolveInviteOrganization).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 'user-1',
      fallbackWorkspaceName: 'Personal Workspace',
    }));
    expect(mockSetActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), 'user-1', 'team-org-1');
    expect(mockCustomerCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Acme Team',
      metadata: {
        organization_id: 'team-org-1',
        created_by_user_id: 'user-1',
      },
    }));
    expect(mockStoreOrganizationStripeCustomerId).toHaveBeenCalledWith(
      expect.anything(),
      'team-org-1',
      'cus_team_new',
      expect.objectContaining({ planId: 'plan-pro' })
    );
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      client_reference_id: 'team-org-1',
      customer: 'cus_team_new',
      metadata: expect.objectContaining({
        organization_id: 'team-org-1',
        plan_slug: 'pro',
      }),
      subscription_data: {
        metadata: expect.objectContaining({
          organization_id: 'team-org-1',
          plan_slug: 'pro',
        }),
      },
    }));
  });

  it('rejects Standard checkout for team workspaces', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockRequireOrganizationBillingManager.mockResolvedValue({
      organization: teamOrganization,
      membership: { role: 'owner', status: 'active' },
    });
    mockGetPlanBySlugOrId.mockResolvedValue(plan);

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'standard',
        organization_id: 'team-org-1',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Team workspaces require Pro or Teams. Choose a team plan to continue.');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['standard', plan, 'price_standard_monthly', 'price_standard_annual'],
    ['pro', proPlan, 'price_pro_monthly', 'price_pro_annual'],
    ['teams', teamsPlan, 'price_teams_monthly', 'price_teams_annual'],
  ] as const)('creates the correct Stripe price for %s checkout', async (_slug, planFixture, monthlyPriceId, annualPriceId) => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue(planFixture);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_matrix', url: 'https://checkout.stripe.test/cs_matrix' });

    const monthlyResponse = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: planFixture.slug,
        organization_id: 'org-1',
        billingInterval: 'month',
      }),
    }) as any);
    expect(monthlyResponse.status).toBe(200);
    expect(mockCheckoutSessionCreate).toHaveBeenLastCalledWith(expect.objectContaining({
      line_items: [{ price: monthlyPriceId, quantity: 1 }],
      metadata: expect.objectContaining({
        plan_slug: planFixture.slug,
        billing_interval: 'month',
      }),
    }));

    const annualResponse = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: planFixture.slug,
        organization_id: 'org-1',
        billingInterval: 'year',
      }),
    }) as any);
    expect(annualResponse.status).toBe(200);
    expect(mockCheckoutSessionCreate).toHaveBeenLastCalledWith(expect.objectContaining({
      line_items: [{ price: annualPriceId, quantity: 1 }],
      metadata: expect.objectContaining({
        plan_slug: planFixture.slug,
        billing_interval: 'year',
      }),
    }));
  });

  it('syncs the mock Stripe subscription id in billing test mode checkout', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockIsBillingTestMode.mockReturnValue(true);
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockCheckoutSessionCreate.mockResolvedValue({
      id: 'cs_testmode',
      url: 'https://checkout.stripe.test/cs_testmode',
      subscription: 'sub_checkout_test',
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'standard',
        organization_id: 'org-1',
        billingInterval: 'month',
      }),
    }) as any);

    expect(response.status).toBe(200);
    expect(mockUpsertOrganizationSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'sub_checkout_test',
        customer: 'cus_existing',
        items: {
          data: [
            expect.objectContaining({
              price: { id: 'price_standard_monthly' },
            }),
          ],
        },
      }),
      expect.objectContaining({
        checkoutSessionId: 'cs_testmode',
        source: 'billing_test_mode',
      })
    );
  });

  it('updates an existing paid subscription immediately for upgrades', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    const standardSubscription = {
      ...teamsSubscription,
      id: 'subscription-standard',
      planId: 'plan-standard',
      plan,
      stripeSubscriptionId: 'sub_standard',
      metadata: {
        billing_interval: 'month',
        stripePriceId: 'price_standard_monthly',
      },
    };
    const stripeSubscription = {
      id: 'sub_standard',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          {
            id: 'si_base',
            quantity: 1,
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_standard_monthly' },
          },
        ],
      },
    };
    const updatedSubscription = {
      ...stripeSubscription,
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-pro',
        plan_slug: 'pro',
        billing_interval: 'month',
      },
      items: {
        data: [
          {
            ...stripeSubscription.items.data[0],
            price: { id: 'price_pro_monthly' },
          },
        ],
      },
    };
    mockGetPlanBySlugOrId.mockResolvedValue(proPlan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockGetOrganizationSubscription.mockResolvedValue(standardSubscription);
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockSubscriptionUpdate.mockResolvedValue(updatedSubscription);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({
      ...standardSubscription,
      planId: 'plan-pro',
      plan: proPlan,
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'pro',
        organization_id: 'org-1',
        billingInterval: 'month',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subscriptionChange.status).toBe('updated');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith('sub_standard', expect.objectContaining({
      items: [
        {
          id: 'si_base',
          price: 'price_pro_monthly',
          quantity: 1,
        },
      ],
      proration_behavior: 'always_invoice',
      payment_behavior: 'allow_incomplete',
    }));
    expect(mockEnsureCurrentPlanCreditGrant).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      userId: 'user-1',
    }));
  });

  it('schedules existing paid subscription downgrades for the next billing period', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    const stripeSubscription = {
      id: 'sub_teams',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          {
            id: 'si_base',
            quantity: 1,
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_teams_annual' },
          },
        ],
      },
    };
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_existing');
    mockGetOrganizationSubscription.mockResolvedValue(teamsSubscription);
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockSubscriptionScheduleCreate.mockResolvedValue({
      id: 'sub_sched_123',
      current_phase: {
        start_date: 1798761600,
        end_date: 1801440000,
      },
    });
    mockSubscriptionScheduleUpdate.mockResolvedValue({ id: 'sub_sched_123' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'standard',
        organization_id: 'org-1',
        billingInterval: 'month',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subscriptionChange.status).toBe('scheduled');
    expect(payload.subscriptionChange.effectiveAt).toBe('2027-02-01T00:00:00.000Z');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockSubscriptionScheduleCreate).toHaveBeenCalledWith({
      from_subscription: 'sub_teams',
    });
    expect(mockSubscriptionScheduleUpdate).toHaveBeenCalledWith('sub_sched_123', expect.objectContaining({
      end_behavior: 'release',
      phases: [
        expect.objectContaining({
          items: [{ price: 'price_teams_annual', quantity: 1 }],
          end_date: 1801440000,
        }),
        expect.objectContaining({
          items: [{ price: 'price_standard_monthly', quantity: 1 }],
          metadata: expect.objectContaining({
            plan_slug: 'standard',
            billing_interval: 'month',
          }),
        }),
      ],
    }));
  });

  it('blocks non-admin members from subscription checkout', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockRequireOrganizationBillingManager.mockRejectedValue(
      new OrganizationAccessError(403, 'Billing management requires organization owner or admin access')
    );

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ planSlug: 'standard', organization_id: 'org-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Billing management requires organization owner or admin access');
    expect(mockGetPlanBySlugOrId).not.toHaveBeenCalled();
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it('returns a safe error when opening the portal without an organization customer', async () => {
    const { POST } = await import('@/app/api/subscriptions/portal/route');
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/subscriptions/portal', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('No Stripe customer found for this organization');
    expect(mockPortalSessionCreate).not.toHaveBeenCalled();
  });

  it('blocks non-admin members from opening the billing portal', async () => {
    const { POST } = await import('@/app/api/subscriptions/portal/route');
    mockRequireOrganizationBillingManager.mockRejectedValue(
      new OrganizationAccessError(403, 'Billing management requires organization owner or admin access')
    );

    const response = await POST(new Request('http://localhost/api/subscriptions/portal', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Billing management requires organization owner or admin access');
    expect(mockGetOrganizationStripeCustomerId).not.toHaveBeenCalled();
    expect(mockPortalSessionCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe extra-seat subscription item for annual Teams subscriptions', async () => {
    const { POST } = await import('@/app/api/subscriptions/seats/route');
    mockGetOrganizationSubscription.mockResolvedValue(teamsSubscription);
    const stripeSubscription = {
      id: 'sub_teams',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          {
            id: 'si_base',
            quantity: 1,
            price: { id: 'price_teams_annual' },
          },
        ],
      },
    };
    const updatedSubscription = {
      ...stripeSubscription,
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-teams',
        plan_slug: 'teams',
        billing_interval: 'year',
      },
      items: {
        data: [
          stripeSubscription.items.data[0],
          {
            id: 'si_extra',
            quantity: 1,
            price: { id: 'price_live_teams_extra_seat_annual' },
          },
        ],
      },
    };
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockSubscriptionUpdate.mockResolvedValue(updatedSubscription);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({
      ...teamsSubscription,
      extraSeatCount: 1,
      stripeExtraSeatSubscriptionItemId: 'si_extra',
      stripeExtraSeatPriceId: 'price_live_teams_extra_seat_annual',
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/seats', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        targetSeatLimit: 6,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seats).toEqual({ base: 5, extra: 1, limit: 6 });
    expect(mockRequireOrganizationBillingManager).toHaveBeenCalledWith({
      userId: 'user-1',
      requestedOrganizationId: 'org-1',
    });
    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith('sub_teams', {
      expand: ['items.data.price'],
    });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith('sub_teams', expect.objectContaining({
      items: [
        expect.objectContaining({
          price: 'price_live_teams_extra_seat_annual',
          quantity: 1,
        }),
      ],
      proration_behavior: 'always_invoice',
      payment_behavior: 'allow_incomplete',
      metadata: expect.objectContaining({
        organization_id: 'org-1',
        plan_id: 'plan-teams',
        plan_slug: 'teams',
        billing_interval: 'year',
      }),
      expand: ['items.data.price'],
    }));
    expect(mockUpsertOrganizationSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      updatedSubscription,
      expect.objectContaining({
        organizationId: 'org-1',
        planId: 'plan-teams',
        planSlug: 'teams',
        source: 'seat_update_api',
      })
    );
  });

  it('updates an existing Stripe extra-seat item to the requested target limit', async () => {
    const { POST } = await import('@/app/api/subscriptions/seats/route');
    mockGetOrganizationSubscription.mockResolvedValue({
      ...teamsSubscription,
      extraSeatCount: 1,
      stripeExtraSeatSubscriptionItemId: 'si_extra',
      stripeExtraSeatPriceId: 'price_live_teams_extra_seat_annual',
    });
    const stripeSubscription = {
      id: 'sub_teams',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          { id: 'si_base', quantity: 1, price: { id: 'price_teams_annual' } },
          { id: 'si_extra', quantity: 1, price: { id: 'price_live_teams_extra_seat_annual' } },
        ],
      },
    };
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockSubscriptionUpdate.mockResolvedValue({
      ...stripeSubscription,
      items: {
        data: [
          stripeSubscription.items.data[0],
          { id: 'si_extra', quantity: 3, price: { id: 'price_live_teams_extra_seat_annual' } },
        ],
      },
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/seats', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        targetSeatLimit: 8,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seats).toEqual({ base: 5, extra: 3, limit: 8 });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith('sub_teams', expect.objectContaining({
      items: [{ id: 'si_extra', quantity: 3 }],
    }));
  });

  it('treats repeated target seat requests as a no-op sync', async () => {
    const { POST } = await import('@/app/api/subscriptions/seats/route');
    mockGetOrganizationSubscription.mockResolvedValue({
      ...teamsSubscription,
      extraSeatCount: 1,
      stripeExtraSeatSubscriptionItemId: 'si_extra',
      stripeExtraSeatPriceId: 'price_live_teams_extra_seat_annual',
    });
    const stripeSubscription = {
      id: 'sub_teams',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          { id: 'si_base', quantity: 1, price: { id: 'price_teams_annual' } },
          { id: 'si_extra', quantity: 1, price: { id: 'price_live_teams_extra_seat_annual' } },
        ],
      },
    };
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({
      ...teamsSubscription,
      extraSeatCount: 1,
      stripeExtraSeatSubscriptionItemId: 'si_extra',
      stripeExtraSeatPriceId: 'price_live_teams_extra_seat_annual',
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/seats', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        targetSeatLimit: 6,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seats).toEqual({ base: 5, extra: 1, limit: 6 });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockUpsertOrganizationSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      stripeSubscription,
      expect.objectContaining({
        eventType: 'subscription.seats.refresh',
      })
    );
  });

  it('creates a monthly Stripe extra-seat subscription item for monthly Teams subscriptions', async () => {
    const { POST } = await import('@/app/api/subscriptions/seats/route');
    mockGetOrganizationSubscription.mockResolvedValue({
      ...teamsSubscription,
      metadata: {
        billing_interval: 'month',
        stripePriceId: 'price_teams_monthly',
      },
    });
    const stripeSubscription = {
      id: 'sub_teams',
      customer: 'cus_existing',
      status: 'active',
      items: {
        data: [
          { id: 'si_base', quantity: 1, price: { id: 'price_teams_monthly' } },
        ],
      },
    };
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);
    mockSubscriptionUpdate.mockResolvedValue({
      ...stripeSubscription,
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-teams',
        plan_slug: 'teams',
        billing_interval: 'month',
      },
      items: {
        data: [
          stripeSubscription.items.data[0],
          { id: 'si_extra', quantity: 1, price: { id: 'price_live_teams_extra_seat_monthly' } },
        ],
      },
    });

    const response = await POST(new Request('http://localhost/api/subscriptions/seats', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'org-1',
        targetSeatLimit: 6,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seats).toEqual({ base: 5, extra: 1, limit: 6 });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith('sub_teams', expect.objectContaining({
      items: [
        expect.objectContaining({
          price: 'price_live_teams_extra_seat_monthly',
          quantity: 1,
        }),
      ],
      metadata: expect.objectContaining({
        billing_interval: 'month',
      }),
    }));
  });

  it('creates a top-up checkout session for organization billing managers', async () => {
    const { POST } = await import('@/app/api/stripe/create-checkout/route');
    mockCheckoutSessionCreate.mockResolvedValue({
      id: 'cs_top_up',
      url: 'https://checkout.stripe.test/cs_top_up',
    });

    const response = await POST(new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({
        packageId: 'top_up_5000',
        organization_id: 'org-1',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe('https://checkout.stripe.test/cs_top_up');
    expect(mockRequireOrganizationBillingManager).toHaveBeenCalledWith({
      userId: 'user-1',
      requestedOrganizationId: 'org-1',
    });
    expect(mockGetOrCreateCreditSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      customer_email: 'user@example.com',
      metadata: {
        userId: 'user-1',
        organizationId: 'org-1',
        packageId: 'top_up_5000',
        credits: '5000',
        expiresAfterMonths: '12',
        creditUnit: 'plan_credit',
      },
    }));
    expect(mockCheckoutSessionCreate.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(7900);
  });

  it('blocks non-admin members from top-up checkout before calling Stripe', async () => {
    const { POST } = await import('@/app/api/stripe/create-checkout/route');
    mockRequireOrganizationBillingManager.mockRejectedValue(
      new OrganizationAccessError(403, 'Billing management requires organization owner or admin access')
    );

    const response = await POST(new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({
        packageId: 'top_up_5000',
        organization_id: 'org-1',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Billing management requires organization owner or admin access');
    expect(mockGetOrCreateCreditSubscription).not.toHaveBeenCalled();
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });
});
