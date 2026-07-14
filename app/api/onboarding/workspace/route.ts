import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { setActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  createOwnedSaasWorkspace,
  getOnboardingState,
  listSaasWorkspacesForUser,
  setUserOnboardingStatus,
} from '@/lib/onboarding-server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_WORKSPACE_NAME_LENGTH = 160;
const MAX_SHORT_FIELD_LENGTH = 120;

function optionalString(value: unknown, maxLength: number, field: string): string | null {
  if (value === undefined || value === null) return null;
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

function requiredWorkspaceName(value: unknown): string {
  const name = optionalString(value, MAX_WORKSPACE_NAME_LENGTH, 'Workspace name');
  if (!name) {
    throw new RouteAccessError(400, 'Workspace name is required');
  }
  return name;
}

function routeError(error: unknown, fallback: string) {
  if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[ONBOARDING_WORKSPACE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const name = requiredWorkspaceName((body as Record<string, unknown>).name);
    const requestedSlug = optionalString((body as Record<string, unknown>).slug, MAX_SHORT_FIELD_LENGTH, 'Workspace slug');
    const roleTitle = optionalString((body as Record<string, unknown>).roleTitle, MAX_SHORT_FIELD_LENGTH, 'Role/title');
    const teamSize = optionalString((body as Record<string, unknown>).teamSize, MAX_SHORT_FIELD_LENGTH, 'Team size');

    const existingWorkspace = (await listSaasWorkspacesForUser(supabaseAdmin, user.id))[0] || null;
    let workspaceId: string;
    if (existingWorkspace) {
      await setActiveOrganizationForUser(supabaseAdmin, user.id, existingWorkspace.id);
      workspaceId = existingWorkspace.id;
    } else {
      const workspace = await createOwnedSaasWorkspace({
        supabase: supabaseAdmin,
        user,
        name,
        requestedSlug,
        roleTitle,
        teamSize,
      });
      workspaceId = workspace.id;
    }

    await setUserOnboardingStatus({
      supabase: supabaseAdmin,
      user,
      status: 'profile_intro_pending',
      metadata: {
        workspaceSavedAt: new Date().toISOString(),
        workspaceId,
      },
    });

    const state = await getOnboardingState(supabaseAdmin, user);
    return NextResponse.json(state);
  } catch (error) {
    return routeError(error, 'Failed to create onboarding workspace');
  }
}
