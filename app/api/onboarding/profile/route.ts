import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  getOnboardingState,
  isMissingProfileOnboardingColumn,
  listSaasWorkspacesForUser,
  loadOnboardingProfile,
  parseObject,
} from '@/lib/onboarding-server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_NAME_LENGTH = 80;

function cleanRequiredName(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new RouteAccessError(400, `${field} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new RouteAccessError(400, `${field} is required`);
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new RouteAccessError(400, `${field} must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  return trimmed;
}

function routeError(error: unknown, fallback: string) {
  if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[ONBOARDING_PROFILE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const firstName = cleanRequiredName((body as Record<string, unknown>).firstName, 'First name');
    const lastName = cleanRequiredName((body as Record<string, unknown>).lastName, 'Last name');
    const fullName = `${firstName} ${lastName}`.trim();
    const now = new Date().toISOString();
    const existingProfile = await loadOnboardingProfile(supabaseAdmin, user.id);
    const hasWorkspace = (await listSaasWorkspacesForUser(supabaseAdmin, user.id)).length > 0;
    const nextStatus = hasWorkspace ? 'profile_intro_pending' : 'workspace_pending';
    const existingMetadata = parseObject(existingProfile?.onboarding_metadata_json);

    const profilePayload = {
      id: user.id,
      email: user.email || existingProfile?.email || '',
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      onboarding_status: nextStatus,
      onboarding_metadata_json: {
        ...existingMetadata,
        profileSavedAt: now,
      },
      updated_at: now,
    };
    const legacyProfilePayload = {
      id: user.id,
      email: user.email || existingProfile?.email || '',
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      updated_at: now,
    };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload as any, { onConflict: 'id' });

    if (profileError) {
      if (!isMissingProfileOnboardingColumn(profileError)) {
        throw new Error(profileError.message || 'Failed to save profile');
      }

      const { error: fallbackProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(legacyProfilePayload as any, { onConflict: 'id' });

      if (fallbackProfileError) {
        throw new Error(fallbackProfileError.message || 'Failed to save profile');
      }
    }

    const meta = parseObject(user.user_metadata);
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...meta,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        display_name: fullName,
        onboarding_status: nextStatus,
      },
    });

    if (authError) {
      throw new Error(authError.message || 'Failed to save profile metadata');
    }

    const state = await getOnboardingState(supabaseAdmin, {
      ...user,
      user_metadata: {
        ...meta,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        onboarding_status: nextStatus,
      },
    });
    return NextResponse.json(state);
  } catch (error) {
    return routeError(error, 'Failed to save onboarding profile');
  }
}
