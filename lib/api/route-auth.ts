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

export async function requireProjectOwner<TProject = any>(
  request: NextRequest,
  projectId: string,
  select: string = 'id, user_id'
): Promise<{ user: { id: string; email?: string | null }; project: TProject & { user_id: string } }> {
  const user = await requireAuthenticatedUser(request);
  const normalizedSelect = select.includes('user_id') || select.trim() === '*'
    ? select
    : `${select}, user_id`;

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select(normalizedSelect)
    .eq('id', projectId)
    .single() as { data: (TProject & { user_id: string }) | null; error: any };

  if (error || !project) {
    throw new RouteAccessError(404, 'Project not found');
  }

  if (project.user_id !== user.id) {
    throw new RouteAccessError(403, 'Forbidden');
  }

  return { user, project };
}
