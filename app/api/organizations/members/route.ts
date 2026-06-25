import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { canManageWorkspaceTeam, getWorkspaceTeamSnapshot, WorkspaceTeamError } from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function organizationProfile(metadata: unknown) {
  const profile = parseObject(parseObject(metadata).profile);
  return {
    website: typeof profile.website === 'string' ? profile.website : null,
    description: typeof profile.description === 'string' ? profile.description : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const { organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId,
    });

    const snapshot = await getWorkspaceTeamSnapshot(supabaseAdmin, organization.id);

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        profile: organizationProfile(organization.onboarding_metadata_json),
      },
      membership: {
        role: membership.role,
        status: membership.status,
        canManageWorkspace: canManageWorkspaceTeam(membership.role),
      },
      ...snapshot,
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError || error instanceof WorkspaceTeamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_MEMBERS] Failed to load workspace members:', error);
    return NextResponse.json({ error: 'Failed to load workspace members' }, { status: 500 });
  }
}
