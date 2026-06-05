import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  BrandVoiceValidationError,
  canManageBrandVoice,
  createBrandVoice,
  listBrandVoices,
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

  console.error('[BRAND_VOICES] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const { organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId,
    });
    const brandVoices = await listBrandVoices(supabaseAdmin, organization.id);

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: {
        role: membership.role,
        status: membership.status,
        canManageBrandVoice: canManageBrandVoice(membership.role, organization.type),
      },
      brandVoices,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load brand voices');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = typeof body?.organizationId === 'string'
      ? body.organizationId
      : typeof body?.organization_id === 'string'
        ? body.organization_id
        : new URL(request.url).searchParams.get('organization_id');
    const { user, organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId,
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

    const brandVoice = await createBrandVoice(supabaseAdmin, organization.id, user.id, body);

    return NextResponse.json({
      success: true,
      brandVoice,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create brand voice');
  }
}
