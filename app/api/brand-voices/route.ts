import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { can } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  BrandVoiceValidationError,
  canManageBrandVoice,
  createBrandVoice,
  decorateBrandVoiceScope,
  listBrandVoicesForOrganizations,
} from '@/lib/brand-voices';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { resolveStudioAssetWriteOrganizationId } from '@/lib/studio-sharing';
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
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId,
    });
    const brandVoices = (await listBrandVoicesForOrganizations(supabaseAdmin, context.organizationIds))
      .map((voice) => decorateBrandVoiceScope(voice, {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }));

    return NextResponse.json({
      success: true,
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        type: context.organization.type,
      },
      privateOrganization: {
        id: context.privateOrganization.id,
      },
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageBrandVoice: canManageBrandVoice(context.membership.role, context.organization.type),
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
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId,
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    if (!can({
      userId: context.user.id,
      organizationId: context.activeOrganizationId,
      organizationType: context.organization.type,
      role: context.membership.role,
    }, 'voice.create', { organizationId: context.activeOrganizationId })) {
      return NextResponse.json({ error: 'You do not have permission to create voices' }, { status: 403 });
    }

    const targetOrganizationId = resolveStudioAssetWriteOrganizationId({
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      organizationType: context.organization.type,
    }, body?.visibility);

    const brandVoice = decorateBrandVoiceScope(
      await createBrandVoice(supabaseAdmin, targetOrganizationId, context.user.id, body),
      {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }
    );

    return NextResponse.json({
      success: true,
      brandVoice,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create brand voice');
  }
}
