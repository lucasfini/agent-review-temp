const DEFAULT_ADMIN_EMAILS = [
  'lucasfiniello@gmail.com',
  'lucas@lucasfini.com',
  'admin@audiorepurpose.com',
];

function parseAdminEmails(value?: string): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminAllowedEmails(): string[] {
  const configuredEmails = [
    ...parseAdminEmails(process.env.ADMIN_EMAILS),
  ];

  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...configuredEmails]));
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminAllowedEmails().includes(email.trim().toLowerCase());
}
