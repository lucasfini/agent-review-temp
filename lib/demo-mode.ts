export function isDemoUser(user: { email?: string | null } | null): boolean {
  const readOnlyEmail = process.env.LEGACY_READ_ONLY_ACCOUNT_EMAIL;
  return Boolean(readOnlyEmail && user?.email === readOnlyEmail);
}
