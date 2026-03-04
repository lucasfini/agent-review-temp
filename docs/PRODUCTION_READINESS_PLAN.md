# Production Readiness Review & Implementation Plan

## 1. Findings Summary
- **Security & API Keys**: Good. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `STRIPE_SECRET_KEY` are strictly server-side. Supabase RLS and admin usage looks correct.
- **Production Checks**: Lacking global rate limiting. Error handling in stripe webhooks is solid but needs centralized monitoring.
- **Payment & Pricing**: The `COST_MAP` in `lib/billing/cost-map.ts` currently applies a 35% margin (`1.35` multiplier) to all raw API costs. This needs to be updated to the requested default of 45%. Credit deduction logic (`lib/billing/credit.ts`) uses PostgreSQL RPCs with optimistic locking, which is highly robust.

## 2. API Cost Markup Update (Primary Focus)
**Goal:** Adjust the application's base profit margin to a steady 45% markup over raw API cost.
**File:** `lib/billing/cost-map.ts`

**Code-Level Changes Required:**
Update every `marginPercent` and `billedRate` calculation in the `COST_MAP` object to use `45` and `1.45` respectively. 

*Example Change for `openai_gpt4o_input`:*
```typescript
// BEFORE
marginPercent: 35,
billedRate: (2.50 / 1_000_000) * 1.35,
billedRateDisplay: '$3.375/1M tokens',

// AFTER
marginPercent: 45,
billedRate: (2.50 / 1_000_000) * 1.45,
billedRateDisplay: '$3.625/1M tokens',
```
You must apply this *exact* mathematical update (Raw Rate x 1.45) across **all 16 services** mapped in `COST_MAP` including:
- `assemblyai_transcription`
- `openai_gpt4o_*` (input, output, cached)
- `openai_gpt4o_mini_*`
- `openai_gpt5_*` variants
- `claude_sonnet_*`
- `claude_haiku_*`
- `perplexity_sonar_*`

**Validation Formula:** 
Ensure the UI accurately queries `calculateServiceCost()` which will now inherently return the 45% marked-up `billedCost`.

## 3. Production Checks: Rate Limiting & Monitoring
**Goal:** Prevent abuse of costly AI API routes and add robust production safeguards.

**A. Rate Limiting Middleware**
We must add a global rate limiter to prevent API abuse, especially on `/api/generate-content` and `/api/transcribe`.
**File to create:** `middleware.ts` (in project root)
**Code-Level implementation:**
Install `@upstash/ratelimit` and `@upstash/redis`, then implement an IP-based sliding window rate limiter:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"), // 20 requests per minute
});

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Exclude Stripe webhook from strict IP rate limiting
    if (request.nextUrl.pathname.startsWith('/api/stripe/webhook')) return NextResponse.next();
    
    const ip = request.ip ?? '127.0.0.1';
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);
    
    if (!success) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

## 4. Security & Exposure Audit
**Goal:** Guarantee no secrets are leaked.
- **Client-Side Environment Variables**: Verified that only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are exposed. This is structurally secure.
- **Stripe Webhook**: Verified `stripe.webhooks.constructEvent` is correctly utilizing `STRIPE_WEBHOOK_SECRET` in `app/api/stripe/webhook/route.ts`. No changes needed.
- **Credit Deductions**: Verified `lib/billing/credit.ts` strictly uses `supabaseAdmin` (bypassing RLS safely server-side) combined with atomic row-level locks via PostgreSQL RPCs (`debit_user_credits`).

## 5. Launch Readiness Checklist
- [ ] Update `COST_MAP` margins to exactly `45` and multipliers to `1.45`.
- [ ] Spin up Upstash Redis and add `UPSTASH_REDIS_REST_URL` / `TOKEN` to `.env.local`.
- [ ] Implement `middleware.ts` for rate limiting.
- [ ] Run a live test transaction via Stripe Test Mode to verify custom credit purchases deduct exactly 1:1.
- [ ] Perform a test transcription and verify that the projected UI costs factor in the new 45% padding precisely.
