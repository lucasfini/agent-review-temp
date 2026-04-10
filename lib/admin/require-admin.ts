import { NextRequest } from 'next/server';

import { isAdminEmail } from '@/lib/admin-access';
import { supabaseAdmin } from '@/lib/supabase/server';

export class AdminAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export type AuthenticatedAdmin = {
  id: string;
  email: string;
};

export async function requireAdmin(request: NextRequest): Promise<AuthenticatedAdmin> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AdminAuthError(401, 'Unauthorized');
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new AdminAuthError(401, 'Unauthorized');
  }

  if (!isAdminEmail(user.email)) {
    throw new AdminAuthError(403, 'Forbidden');
  }

  return {
    id: user.id,
    email: user.email || '',
  };
}
