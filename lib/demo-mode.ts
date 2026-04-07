export const DEMO_EMAIL = 'demo@audiorepurpose.com';

export function isDemoUser(user: { email?: string | null } | null): boolean {
  return user?.email === DEMO_EMAIL;
}
