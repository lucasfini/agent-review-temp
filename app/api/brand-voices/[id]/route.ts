import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  BrandVoiceValidationError,
  canManageBrandVoice,
  deleteBrandVoice,
  decorateBrandVoiceScope,
  getBrandVoiceInOrganizations,
  updateBrandVoice,
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
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const voice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const brandVoice = voice ? decorateBrandVoiceScope(voice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!brandVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageBrandVoice: canManageBrandVoice(context.membership.role, context.organization.type),
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
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const existingVoice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = existingVoice ? decorateBrandVoiceScope(existingVoice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    if (!scopedVoice.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this brand voice' },
        { status: 403 }
      );
    }

    const updatedVoice = await updateBrandVoice(supabaseAdmin, scopedVoice.organizationId, id, body);
    const brandVoice = updatedVoice ? decorateBrandVoiceScope(updatedVoice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!brandVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: brandVoice.organizationId,
      actorUserId: context.user.id,
      action: 'voice.updated',
      resourceType: 'voice',
      resourceId: brandVoice.id,
      metadata: {
        name: brandVoice.name,
        scope: brandVoice.scope,
      },
    });

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
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const existingVoice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = existingVoice ? decorateBrandVoiceScope(existingVoice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    if (!scopedVoice.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this brand voice' },
        { status: 403 }
      );
    }

    const deleted = await deleteBrandVoice(supabaseAdmin, scopedVoice.organizationId, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: scopedVoice.organizationId,
      actorUserId: context.user.id,
      action: 'voice.deleted',
      resourceType: 'voice',
      resourceId: scopedVoice.id,
      metadata: {
        name: scopedVoice.name,
        scope: scopedVoice.scope,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete brand voice');
  }
}
