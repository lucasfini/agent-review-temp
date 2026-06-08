import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyLeadValidationError,
  createAgencyLead,
  normalizeAgencyLeadSubmission,
} from '@/lib/agency-leads';
import {
  checkAgencyLeadRateLimit,
  isLikelySpamLead,
} from '@/lib/agency-lead-rate-limit';
import {
  sendAgencyLeadConfirmationEmail,
  sendAgencyLeadNotification,
} from '@/lib/agency-lead-notifications';
import { createAgencyFunnelEvent } from '@/lib/agency-funnel-events';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeLogMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

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
    const spamCheck = isLikelySpamLead(body);

    if (spamCheck.isSpam) {
      console.warn('[AGENCY_LEADS_PUBLIC] Rejected likely spam lead:', spamCheck.reason);
      throw new AgencyLeadValidationError('Lead submission rejected');
    }

    const normalizedEmail = typeof normalized.email === 'string' ? normalized.email : '';
    const ipLimit = await checkAgencyLeadRateLimit({ kind: 'ip', value: ip });
    const emailLimit = await checkAgencyLeadRateLimit({ kind: 'email', value: normalizedEmail });
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

    try {
      await createAgencyFunnelEvent(supabaseAdmin, {
        eventName: 'agency_intake_submitted',
        leadId: lead.id,
        path: typeof body?.metadata?.page === 'string' ? body.metadata.page : '/agency/contact',
        metadata: {
          formId: 'agency_lead_form',
          source: 'public_agency_site',
          selectedOfferTitle: typeof body?.metadata?.selectedOfferTitle === 'string'
            ? body.metadata.selectedOfferTitle
            : null,
        },
      });
    } catch (eventError) {
      console.warn('[AGENCY_LEADS_PUBLIC] Lead submitted event skipped:', safeLogMessage(eventError));
    }

    try {
      const notification = await sendAgencyLeadNotification(lead);
      if (!notification.delivered) {
        console.warn('[AGENCY_LEADS_PUBLIC] Lead notification skipped:', notification.reason);
      }
    } catch (notificationError) {
      console.error('[AGENCY_LEADS_PUBLIC] Lead notification failed:', safeLogMessage(notificationError));
    }

    try {
      const confirmation = await sendAgencyLeadConfirmationEmail(lead);
      if (!confirmation.delivered) {
        console.warn('[AGENCY_LEADS_PUBLIC] Lead confirmation skipped:', confirmation.reason);
      }
    } catch (confirmationError) {
      console.error('[AGENCY_LEADS_PUBLIC] Lead confirmation failed:', safeLogMessage(confirmationError));
    }

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
