const DEFAULT_ADMIN_EMAILS: string[] = [];

function parseEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminAllowedEmails(): string[] {
  const serverList = parseEmails(process.env.ADMIN_ALLOWED_EMAILS);
  const clientList = parseEmails(process.env.NEXT_PUBLIC_ADMIN_ALLOWED_EMAILS);
  const combined = [...serverList, ...clientList];
  return combined.length > 0 ? combined : DEFAULT_ADMIN_EMAILS;
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const allowed = getAdminAllowedEmails();
  return allowed.includes(email.toLowerCase());
}
