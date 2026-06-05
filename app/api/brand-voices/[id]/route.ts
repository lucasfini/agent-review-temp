import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  BrandVoiceValidationError,
  canManageBrandVoice,
  deleteBrandVoice,
  getBrandVoice,
  updateBrandVoice,
} from '@/lib/brand-voices';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BrandVoiceValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[BRAND_VOICE_DETAIL] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const brandVoice = await getBrandVoice(supabaseAdmin, organization.id, id);

    if (!brandVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: membership.role,
        status: membership.status,
        canManageBrandVoice: canManageBrandVoice(membership.role, organization.type),
      },
      brandVoice,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load brand voice');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageBrandVoice(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Brand voice management requires organization owner or admin access' },
        { status: 403 }
      );
    }

    const brandVoice = await updateBrandVoice(supabaseAdmin, organization.id, id, body);

    if (!brandVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      brandVoice,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update brand voice');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageBrandVoice(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Brand voice management requires organization owner or admin access' },
        { status: 403 }
      );
    }

    const deleted = await deleteBrandVoice(supabaseAdmin, organization.id, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete brand voice');
  }
}
