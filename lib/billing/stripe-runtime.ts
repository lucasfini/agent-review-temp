import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';

import { getAppBaseUrl } from '@/lib/app-url';

const TEST_MODE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled', 'enable']);
const STRIPE_API_VERSION = '2025-10-29.clover';

export type BillingStripeClient = {
  checkout: {
    sessions: {
      create: (payload: any) => Promise<any>;
      retrieve: (sessionId: string) => Promise<any>;
    };
  };
  customers: {
    create: (payload: Record<string, unknown>) => Promise<any>;
    retrieve: (customerId: string, payload?: Record<string, unknown>) => Promise<any>;
  };
  paymentMethods: {
    list: (payload: Record<string, unknown>) => Promise<any>;
  };
  billingPortal: {
    sessions: {
      create: (payload: Record<string, unknown>) => Promise<any>;
    };
  };
  subscriptions: {
    retrieve: (subscriptionId: string, payload?: Record<string, unknown>) => Promise<any>;
    update: (subscriptionId: string, payload: Record<string, unknown>) => Promise<any>;
  };
  subscriptionSchedules: {
    create: (payload: Record<string, unknown>) => Promise<any>;
    retrieve: (scheduleId: string) => Promise<any>;
    update: (scheduleId: string, payload: Record<string, unknown>) => Promise<any>;
  };
  invoices: {
    retrieve: (invoiceId: string) => Promise<any>;
    list: (payload: Record<string, unknown>) => Promise<any>;
  };
};

type MockSession = {
  id: string;
  object: 'checkout.session';
  mode: string;
  amount_total: number;
  currency: string;
  payment_status: string;
  metadata: Record<string, string>;
  customer?: string | null;
  customer_email?: string | null;
  subscription?: string | null;
  payment_intent?: string | null;
  invoice?: string | null;
  url: string;
};

const mockCheckoutSessions = new Map<string, MockSession>();
const mockCustomers = new Map<string, string>();
const mockSubscriptions = new Map<string, any>();
const mockSubscriptionSchedules = new Map<string, any>();

function isEnabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return TEST_MODE_VALUES.has(value.trim().toLowerCase());
}

export function isBillingTestMode(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  return isEnabled(process.env.BILLING_TEST_MODE);
}

function makeMockId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function parseSessionMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalized: Record<string, string> = {};
  const entries = Object.entries(value);
  for (const [key, raw] of entries) {
    if (typeof raw === 'string') {
      normalized[key] = raw;
    }
  }

  return normalized;
}

function amountFromLineItems(lineItems: Array<Record<string, unknown>> | undefined): number {
  if (!Array.isArray(lineItems)) {
    return 0;
  }

  return lineItems.reduce((sum, item) => {
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      ? item.quantity
      : 1;
    const priceData = item.price_data as Record<string, unknown> | undefined;
    const unitAmount = priceData && typeof priceData.unit_amount === 'number'
      ? priceData.unit_amount
      : 0;

    return sum + (unitAmount * quantity);
  }, 0);
}

function createMockCheckoutSession(payload: Record<string, unknown>): MockSession {
  const mode = typeof payload.mode === 'string' ? payload.mode : 'payment';
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items as Array<Record<string, unknown>> : undefined;
  const firstLineItem = lineItems?.[0];
  const currency = typeof firstLineItem?.price_data === 'object'
    ? typeof (firstLineItem.price_data as Record<string, unknown>).currency === 'string'
      ? (firstLineItem.price_data as Record<string, unknown>).currency
      : 'usd'
    : 'usd';
  const id = makeMockId('cs');
  const hasSubscription = mode === 'subscription';
  const paymentIntent = hasSubscription ? undefined : makeMockId('pi');
  const subscriptionId = hasSubscription ? makeMockId('sub') : undefined;
  const customer = typeof payload.customer === 'string'
    ? payload.customer
    : makeMockId('cus');

  const session: MockSession = {
    id,
    object: 'checkout.session',
    mode,
    amount_total: amountFromLineItems(lineItems),
    currency: typeof currency === 'string' ? currency : 'usd',
    payment_status: 'paid',
    metadata: parseSessionMetadata(payload.metadata),
    customer,
    customer_email: typeof payload.customer_email === 'string'
      ? payload.customer_email
      : null,
    subscription: subscriptionId,
    payment_intent: paymentIntent,
    url: `${getAppBaseUrl()}/billing/success?session_id=${id}`,
  };

  mockCheckoutSessions.set(id, session);
  if (subscriptionId) {
    mockSubscriptions.set(subscriptionId, {
      id: subscriptionId,
      object: 'subscription',
      customer,
      status: 'active',
      cancel_at_period_end: false,
      metadata: parseSessionMetadata((payload.subscription_data as Record<string, unknown> | undefined)?.metadata || payload.metadata),
      items: {
        data: (lineItems || []).map((item, index) => ({
          id: makeMockId(`si${index + 1}`),
          quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 1,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
          price: {
            id: typeof item.price === 'string' ? item.price : null,
          },
        })),
      },
    });
  }
  return session;
}

function createMockPortalSession(returnUrl?: string) {
  return {
    id: makeMockId('bps'),
    object: 'billing_portal.session',
    url: returnUrl || `${getAppBaseUrl()}/dashboard/billing`,
  };
}

function createMockCustomer(
  payload: {
    email?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  } = {}
): { id: string } {
  const id = payload.email
    ? `cus_${payload.email.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${makeMockId('cust')}`
    : makeMockId('cus');
  mockCustomers.set(id, payload.email || '');
  return {
    id,
    email: payload.email || null,
    name: typeof payload.name === 'string' ? payload.name : null,
    metadata: payload.metadata || {},
  } as { id: string };
}

function createMockInvoice(invoiceId: string) {
  return {
    id: invoiceId,
    object: 'invoice',
    number: `INV-${invoiceId.slice(-12).toUpperCase()}`,
    currency: 'usd',
    status: 'paid',
    amount_paid: 0,
  };
}

function createMockSubscriptionSchedule(payload: Record<string, unknown>) {
  const id = makeMockId('sub_sched');
  const subscriptionId = typeof payload.from_subscription === 'string'
    ? payload.from_subscription
    : null;
  const subscription = subscriptionId ? mockSubscriptions.get(subscriptionId) : null;
  const firstItem = Array.isArray(subscription?.items?.data) ? subscription.items.data[0] : null;
  const currentPeriodStart = Number(firstItem?.current_period_start || Math.floor(Date.now() / 1000));
  const currentPeriodEnd = Number(firstItem?.current_period_end || currentPeriodStart + (30 * 24 * 60 * 60));
  const schedule = {
    id,
    object: 'subscription_schedule',
    subscription: subscriptionId,
    current_phase: {
      start_date: currentPeriodStart,
      end_date: currentPeriodEnd,
    },
    phases: [],
    metadata: {},
  };

  mockSubscriptionSchedules.set(id, schedule);
  if (subscription) {
    subscription.schedule = id;
    mockSubscriptions.set(subscription.id, subscription);
  }

  return schedule;
}

function createMockStripeClient(): BillingStripeClient {
  return {
    checkout: {
      sessions: {
        create: async (payload: Record<string, unknown>) => createMockCheckoutSession(payload),
        retrieve: async (sessionId: string) => {
          const session = mockCheckoutSessions.get(sessionId);
          if (session) {
            return session;
          }

          throw new Error(`Unknown mock checkout session: ${sessionId}`);
        },
      },
    },
    customers: {
      create: async (payload: Record<string, unknown>) => createMockCustomer(payload as {
        email?: string;
        name?: string;
        metadata?: Record<string, unknown>;
      }),
      retrieve: async (customerId: string) => ({
        id: customerId,
        object: 'customer',
        email: mockCustomers.get(customerId) || null,
        invoice_settings: {
          default_payment_method: null,
        },
      }),
    },
    paymentMethods: {
      list: async () => ({
        data: [],
      }),
    },
    billingPortal: {
      sessions: {
        create: async (payload: Record<string, unknown>) => {
          const returnUrl = payload?.return_url;
          return createMockPortalSession(typeof returnUrl === 'string' ? returnUrl : undefined);
        },
      },
    },
    subscriptions: {
      retrieve: async (subscriptionId: string) => {
        const subscription = mockSubscriptions.get(subscriptionId);
        if (!subscription) {
          throw new Error(`Unknown mock subscription: ${subscriptionId}`);
        }
        return subscription;
      },
      update: async (subscriptionId: string, payload: Record<string, unknown>) => {
        const subscription = mockSubscriptions.get(subscriptionId);
        if (!subscription) {
          throw new Error(`Unknown mock subscription: ${subscriptionId}`);
        }

        const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
        for (const item of items) {
          const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity)
            ? item.quantity
            : 1;
          const existing = typeof item.id === 'string'
            ? subscription.items.data.find((subscriptionItem: any) => subscriptionItem.id === item.id)
            : null;

          if (existing) {
            existing.quantity = quantity;
          } else if (typeof item.price === 'string') {
            subscription.items.data.push({
              id: makeMockId('si'),
              quantity,
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
              price: { id: item.price },
            });
          }
        }

        if (payload.metadata && typeof payload.metadata === 'object') {
          subscription.metadata = {
            ...(subscription.metadata || {}),
            ...(payload.metadata as Record<string, unknown>),
          };
        }

        mockSubscriptions.set(subscriptionId, subscription);
        return subscription;
      },
    },
    subscriptionSchedules: {
      create: async (payload: Record<string, unknown>) => createMockSubscriptionSchedule(payload),
      retrieve: async (scheduleId: string) => {
        const schedule = mockSubscriptionSchedules.get(scheduleId);
        if (!schedule) {
          throw new Error(`Unknown mock subscription schedule: ${scheduleId}`);
        }
        return schedule;
      },
      update: async (scheduleId: string, payload: Record<string, unknown>) => {
        const schedule = mockSubscriptionSchedules.get(scheduleId);
        if (!schedule) {
          throw new Error(`Unknown mock subscription schedule: ${scheduleId}`);
        }

        const updated = {
          ...schedule,
          ...payload,
          id: schedule.id,
          object: 'subscription_schedule',
          metadata: {
            ...(schedule.metadata || {}),
            ...((payload.metadata as Record<string, unknown> | undefined) || {}),
          },
        };
        mockSubscriptionSchedules.set(scheduleId, updated);
        return updated;
      },
    },
    invoices: {
      retrieve: async (invoiceId: string) => createMockInvoice(invoiceId),
      list: async () => ({
        data: [],
      }),
    },
  };
}

export function getStripeClient(context: string): BillingStripeClient {
  if (isBillingTestMode()) {
    return createMockStripeClient();
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    if (process.env.NODE_ENV === 'test') {
      return new Stripe('test', {
        apiVersion: STRIPE_API_VERSION,
      }) as unknown as BillingStripeClient;
    }

    throw new Error(`[${context}] STRIPE_SECRET_KEY is required.`);
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  }) as unknown as BillingStripeClient;
}
