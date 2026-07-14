import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isOnboardingStatus, isRequiredOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';
import {
  getOnboardingState,
  markWorkspaceOnboardingComplete,
  setUserOnboardingStatus,
} from '@/lib/onboarding-server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function routeError(error: unknown, fallback: string) {
  if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[ONBOARDING_STATUS] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedStatusFrom(body: unknown): OnboardingStatus | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const status = (body as Record<string, unknown>).status;
  return isOnboardingStatus(status) ? status : null;
}

function metadataFrom(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const metadata = (body as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

async function refreshedUserAfterStatusUpdate(user: Awaited<ReturnType<typeof requireAuthenticatedUser>>) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (error || !data?.user) return user;
  return data.user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const state = await getOnboardingState(supabaseAdmin, user);
    return NextResponse.json(state, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    return routeError(error, 'Failed to load onboarding state');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const nextStatus = requestedStatusFrom(body);
    if (!nextStatus) {
      return NextResponse.json({ error: 'Valid onboarding status is required' }, { status: 400 });
    }

    const currentState = await getOnboardingState(supabaseAdmin, user);
    if (isRequiredOnboardingStatus(currentState.status) && nextStatus !== currentState.status) {
      return NextResponse.json({
        error: 'Complete your account profile before continuing onboarding',
      }, { status: 409 });
    }

    const skipped = Boolean((body as Record<string, unknown>)?.skipped);
    await setUserOnboardingStatus({
      supabase: supabaseAdmin,
      user,
      status: nextStatus,
      metadata: {
        lastClientStatus: currentState.status,
        skippedTutorial: skipped || undefined,
        ...metadataFrom(body),
      },
    });

    if (nextStatus === 'complete' && currentState.workspace?.id) {
      await markWorkspaceOnboardingComplete({
        supabase: supabaseAdmin,
        workspaceId: currentState.workspace.id,
        skipped,
      });
    }

    const stateUser = await refreshedUserAfterStatusUpdate(user);
    const state = await getOnboardingState(supabaseAdmin, stateUser);
    return NextResponse.json(state);
  } catch (error) {
    return routeError(error, 'Failed to update onboarding state');
  }
}
