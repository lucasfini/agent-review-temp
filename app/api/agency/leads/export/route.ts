import { NextRequest, NextResponse } from 'next/server';

import {
  AGENCY_LEAD_STATUSES,
  AgencyLeadValidationError,
  listAgencyLeads,
  type AgencyLeadStatus,
} from '@/lib/agency-leads';
import {
  AGENCY_LEAD_QUALIFICATION_TIERS,
  type AgencyLeadQualificationTier,
} from '@/lib/agency-lead-qualification';
import {
  agencyLeadExportFilename,
  buildAgencyLeadsCsv,
} from '@/lib/agency-lead-export';
import { RouteAccessError } from '@/lib/api/route-auth';
import { requireAgencyAccess } from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_EXPORT_LIMIT = 1000;
const MAX_PACKAGE_INTEREST_LENGTH = 240;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

function normalizeStatusParam(value: string | null): AgencyLeadStatus | null {
  if (!value) return null;
  if (!AGENCY_LEAD_STATUSES.includes(value as AgencyLeadStatus)) {
    throw new AgencyLeadValidationError(`status must be one of: ${AGENCY_LEAD_STATUSES.join(', ')}`);
  }
  return value as AgencyLeadStatus;
}

function normalizeTierParam(value: string | null): AgencyLeadQualificationTier | null {
  if (!value) return null;
  if (!AGENCY_LEAD_QUALIFICATION_TIERS.includes(value as AgencyLeadQualificationTier)) {
    throw new AgencyLeadValidationError(`qualification_tier must be one of: ${AGENCY_LEAD_QUALIFICATION_TIERS.join(', ')}`);
  }
  return value as AgencyLeadQualificationTier;
}

function normalizePackageInterestParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_PACKAGE_INTEREST_LENGTH) {
    throw new AgencyLeadValidationError(`package_interest must be ${MAX_PACKAGE_INTEREST_LENGTH} characters or fewer`);
  }
  return trimmed;
}

function normalizeDateParam(value: string | null, field: string, endOfDay = false): string | null {
  if (!value) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new AgencyLeadValidationError(`${field} must be a valid date`);
  }
  return date.toISOString();
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyLeadValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_LEADS_EXPORT] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const { organization } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
      requireClientManagement: true,
    });

    const status = normalizeStatusParam(searchParams.get('status'));
    const qualificationTier = normalizeTierParam(searchParams.get('qualification_tier'));
    const packageInterest = normalizePackageInterestParam(searchParams.get('package_interest'));
    const dateFrom = normalizeDateParam(searchParams.get('date_from'), 'date_from');
    const dateTo = normalizeDateParam(searchParams.get('date_to'), 'date_to', true);
    const format = searchParams.get('format') === 'json' ? 'json' : 'csv';

    const leads = await listAgencyLeads(supabaseAdmin, {
      status,
      qualificationTier,
      packageInterest,
      dateFrom,
      dateTo,
      limit: MAX_EXPORT_LIMIT,
      maxLimit: MAX_EXPORT_LIMIT,
    });

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type,
        },
        leads,
      });
    }

    return new NextResponse(buildAgencyLeadsCsv(leads), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${agencyLeadExportFilename()}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to export agency leads');
  }
}
