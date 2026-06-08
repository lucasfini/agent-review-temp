import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyLeadValidationError,
  checkAgencyLeadRateLimit,
  createAgencyLead,
  normalizeAgencyLeadSubmission,
} from '@/lib/agency-leads';
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
  if (error instanceof AgencyLeadValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error('[AGENCY_LEADS_PUBLIC] Unexpected error:', error);
  return NextResponse.json(
    { error: 'Failed to submit agency inquiry. Please try again.' },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const normalized = normalizeAgencyLeadSubmission(body);
    const ip = clientIpFrom(request);

    const ipLimit = checkAgencyLeadRateLimit(`ip:${ip}`);
    const emailLimit = checkAgencyLeadRateLimit(`email:${normalized.email}`);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many agency inquiries. Please try again later.',
          retryAfterSeconds: Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds),
        },
        { status: 429 }
      );
    }

    const lead = await createAgencyLead(supabaseAdmin, body);

    return NextResponse.json(
      {
        success: true,
        lead: {
          id: lead.id,
          status: lead.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
