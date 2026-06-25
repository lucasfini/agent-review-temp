import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { assertCan } from '@/lib/authz/permissions';
import {
  getActiveOrganizationForUser,
  getFirstActiveOrganizationForUserByType,
} from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import type { OrganizationType } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_ORGANIZATION_NAME_LENGTH = 160;
const MAX_PROFILE_TEXT_LENGTH = 1200;
const MAX_PROFILE_SHORT_TEXT_LENGTH = 240;
const ORGANIZATION_TYPES: OrganizationType[] = ['personal_legacy', 'saas_customer', 'internal_agency'];

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function organizationPayload(organization: any, membership: any) {
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      type: organization.type,
      onboarding: {
        completedAt: organization.onboarding_completed_at || null,
        skippedAt: organization.onboarding_skipped_at || null,
        metadata: parseObject(organization.onboarding_metadata_json),
      },
    },
    membership: {
      role: membership.role,
      status: membership.status,
    },
  };
}

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new RouteAccessError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new RouteAccessError(400, `${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredOrganizationName(value: unknown): string {
  const normalized = optionalString(value, MAX_ORGANIZATION_NAME_LENGTH, 'Organization name');
  if (!normalized) {
    throw new RouteAccessError(400, 'Organization name is required');
  }
  return normalized;
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function requestedOrganizationTypeFrom(request: NextRequest): OrganizationType | null {
  const value = new URL(request.url).searchParams.get('organization_type');
  if (!value) return null;
  if (!ORGANIZATION_TYPES.includes(value as OrganizationType)) {
    throw new RouteAccessError(400, 'Invalid organization_type');
  }
  return value as OrganizationType;
}

function normalizeProfile(input: unknown): Record<string, string | null> | null {
  if (input === undefined) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RouteAccessError(400, 'profile must be an object');
  }

  const profile = input as Record<string, unknown>;
  const normalized: Record<string, string | null> = {};

  if ('website' in profile) {
    normalized.website = optionalString(profile.website, MAX_PROFILE_SHORT_TEXT_LENGTH, 'profile.website') ?? null;
  }
  if ('description' in profile) {
    normalized.description = optionalString(profile.description, MAX_PROFILE_TEXT_LENGTH, 'profile.description') ?? null;
  }
  if ('audience' in profile) {
    normalized.audience = optionalString(profile.audience, MAX_PROFILE_TEXT_LENGTH, 'profile.audience') ?? null;
  }
  if ('contentGoal' in profile) {
    normalized.contentGoal = optionalString(profile.contentGoal, MAX_PROFILE_TEXT_LENGTH, 'profile.contentGoal') ?? null;
  }

  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const requestedOrganizationType = requestedOrganizationTypeFrom(request);
    const { organization, membership } = requestedOrganizationId
      ? await getActiveOrganizationForUser(
        supabaseAdmin,
        user.id,
        requestedOrganizationId
      )
      : requestedOrganizationType
        ? await getFirstActiveOrganizationForUserByType(
          supabaseAdmin,
          user.id,
          requestedOrganizationType
        )
        : await getActiveOrganizationForUser(
          supabaseAdmin,
          user.id,
          null
        );

    if (requestedOrganizationType && organization.type !== requestedOrganizationType) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(organizationPayload(organization, membership));
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATIONS_CURRENT] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load current organization' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireAuthenticatedUser(request);
    const { organization, membership } = await getActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      requestedOrganizationIdFrom(request, body)
    );

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    assertCan(
      {
        userId: user.id,
        organizationId: organization.id,
        organizationType: organization.type,
        role: membership.role,
        isDemo: isDemoUser(user),
      },
      'workspace.update',
      { organizationId: organization.id },
      'Organization setup requires owner or admin access'
    );

    const updatePayload: Record<string, unknown> = {};
    if (body.name !== undefined) {
      updatePayload.name = requiredOrganizationName(body.name);
    }

    const profile = normalizeProfile(body.profile ?? body.onboardingProfile ?? body.onboarding_profile);
    const nextMetadata = parseObject(organization.onboarding_metadata_json);
    if (profile) {
      updatePayload.onboarding_metadata_json = {
        ...nextMetadata,
        profile: {
          ...parseObject(nextMetadata.profile),
          ...profile,
        },
        updatedAt: new Date().toISOString(),
      };
    }

    const completed = body.onboardingCompleted === true || body.onboarding_completed === true;
    const skipped = body.onboardingSkipped === true || body.onboarding_skipped === true;
    if (completed) {
      updatePayload.onboarding_completed_at = new Date().toISOString();
      updatePayload.onboarding_skipped_at = null;
    } else if (skipped) {
      updatePayload.onboarding_skipped_at = new Date().toISOString();
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(organizationPayload(organization, membership));
    }

    const { data: updatedOrganization, error } = await (supabaseAdmin as any)
      .from('organizations')
      .update(updatePayload)
      .eq('id', organization.id)
      .select('*')
      .single();

    if (error || !updatedOrganization) {
      throw new Error(error?.message || 'Failed to update organization');
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: organization.id,
      metadata: {
        changedFields: Object.keys(updatePayload),
      },
    });

    return NextResponse.json(organizationPayload(updatedOrganization, membership));
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATIONS_CURRENT] Failed to update current organization:', error);
    return NextResponse.json({ error: 'Failed to update current organization' }, { status: 500 });
  }
}
