import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyFunnelEventValidationError,
  checkAgencyFunnelEventRateLimit,
  createAgencyFunnelEvent,
} from '@/lib/agency-funnel-events';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clientIpFrom(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}

function safeErrorResponse(error: unknown) {
  if (error instanceof AgencyFunnelEventValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error('[AGENCY_FUNNEL_EVENTS] Unexpected error:', error);
  return NextResponse.json({ error: 'Failed to record agency funnel event' }, { status: 500 });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(request: NextRequest) {
  try {
    const ipLimit = checkAgencyFunnelEventRateLimit(clientIpFrom(request));
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many agency funnel events. Please try again later.',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    await createAgencyFunnelEvent(supabaseAdmin, body);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
