import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export class RouteAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'RouteAccessError';
  }
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new RouteAccessError(401, 'Unauthorized');
  }
  return token;
}

async function getUserFromCookies(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new RouteAccessError(401, 'Unauthorized');
  }

  return user;
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const bearerToken = extractBearerToken(authHeader);

  if (bearerToken) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(bearerToken);
    if (error || !user) {
      throw new RouteAccessError(401, 'Unauthorized');
    }
    return user;
  }

  return getUserFromCookies(request);
}

function ensureProjectSelect(select: string): string {
  if (select.trim() === '*') return select;

  const lowerSelect = select.toLowerCase();
  const requiredColumns = ['id', 'user_id', 'organization_id'];
  const missingColumns = requiredColumns.filter((column) => !lowerSelect.includes(column));

  if (missingColumns.length === 0) return select;
  return `${select}, ${missingColumns.join(', ')}`;
}

async function userHasActiveOrganizationMembership(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new RouteAccessError(500, 'Failed to validate organization membership');
  }

  return Boolean(data?.id);
}

export async function requireProjectOwner<TProject = any>(
  request: NextRequest,
  projectId: string,
  select: string = 'id, user_id'
): Promise<{
  user: { id: string; email?: string | null };
  project: TProject & { id: string; user_id: string; organization_id: string | null };
  accessMode: 'legacy_owner' | 'organization_member';
}> {
  const user = await requireAuthenticatedUser(request);
  const normalizedSelect = ensureProjectSelect(select);

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select(normalizedSelect)
    .eq('id', projectId)
    .single() as {
      data: (TProject & { id: string; user_id: string; organization_id: string | null }) | null;
      error: any;
    };

  if (error || !project) {
    throw new RouteAccessError(404, 'Project not found');
  }

  if (project.user_id === user.id) {
    return {
      user,
      project,
      accessMode: 'legacy_owner',
    };
  }

  if (project.organization_id) {
    const hasActiveMembership = await userHasActiveOrganizationMembership(user.id, project.organization_id);
    if (hasActiveMembership) {
      return {
        user,
        project,
        accessMode: 'organization_member',
      };
    }
  }

  throw new RouteAccessError(403, 'Forbidden');
}
