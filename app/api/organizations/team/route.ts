import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import {
  createOwnedSaasWorkspace,
  listSaasWorkspacesForUser,
} from '@/lib/onboarding-server';
import { setActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_WORKSPACE_NAME_LENGTH = 160;

function requiredWorkspaceName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RouteAccessError(400, 'Team workspace name is required');
  }

  const name = value.trim();
  if (!name) {
    throw new RouteAccessError(400, 'Team workspace name is required');
  }
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw new RouteAccessError(400, `Team workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer`);
  }

  return name;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const existingWorkspace = (await listSaasWorkspacesForUser(supabaseAdmin, user.id))[0] || null;
    const workspace = existingWorkspace
      ? existingWorkspace
      : await createOwnedSaasWorkspace({
          supabase: supabaseAdmin,
          user,
          name: requiredWorkspaceName(body.name),
        });

    if (existingWorkspace) {
      await setActiveOrganizationForUser(supabaseAdmin, user.id, existingWorkspace.id);
    }

    return NextResponse.json({
      organization: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        role: workspace.role,
        status: workspace.status,
      },
    }, { status: existingWorkspace ? 200 : 201 });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATIONS_TEAM] Failed to create team workspace:', error);
    return NextResponse.json({ error: 'Failed to create team workspace' }, { status: 500 });
  }
}
