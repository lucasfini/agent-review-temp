import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  BrandVoiceValidationError,
  decorateBrandVoiceScope,
  deleteBrandVoice,
  getBrandVoiceInOrganizations,
  shareBrandVoiceToOrganization,
} from '@/lib/brand-voices';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
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

  console.error('[BRAND_VOICE_SHARE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const voice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = voice ? decorateBrandVoiceScope(voice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }
    if (scopedVoice.scope !== 'private' || !scopedVoice.canShare) {
      return NextResponse.json({ error: 'You do not have permission to share this brand voice' }, { status: 403 });
    }

    const sharedVoice = decorateBrandVoiceScope(
      await shareBrandVoiceToOrganization(
        supabaseAdmin,
        scopedVoice,
        context.activeOrganizationId,
        context.user.id
      ),
      {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }
    );

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'voice.shared',
      resourceType: 'voice',
      resourceId: sharedVoice.id,
      metadata: {
        sourceVoiceId: scopedVoice.id,
        name: sharedVoice.name,
      },
    });

    return NextResponse.json({ success: true, brandVoice: sharedVoice });
  } catch (error) {
    return errorResponse(error, 'Failed to share brand voice');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const voice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = voice ? decorateBrandVoiceScope(voice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }
    if (!scopedVoice.canUnshare) {
      return NextResponse.json({ error: 'You do not have permission to unshare this brand voice' }, { status: 403 });
    }

    const deleted = await deleteBrandVoice(supabaseAdmin, scopedVoice.organizationId, scopedVoice.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'voice.unshared',
      resourceType: 'voice',
      resourceId: scopedVoice.id,
      metadata: {
        name: scopedVoice.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to unshare brand voice');
  }
}
