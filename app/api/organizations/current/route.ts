import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { organization, membership } = await getActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      null
    );

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: {
        role: membership.role,
        status: membership.status,
      },
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATIONS_CURRENT] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load current organization' }, { status: 500 });
  }
}
