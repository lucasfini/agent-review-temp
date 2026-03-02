const DEFAULT_ALLOWED_EMAILS = ['lucasfiniello@gmail.com'];

function parseEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getPipelineDocAllowedEmails(): string[] {
  const serverList = parseEmails(process.env.PIPELINE_DOC_ALLOWED_EMAILS);
  const clientList = parseEmails(process.env.NEXT_PUBLIC_PIPELINE_DOC_ALLOWED_EMAILS);
  const combined = [...serverList, ...clientList];
  return combined.length > 0 ? combined : DEFAULT_ALLOWED_EMAILS;
}

export function isPipelineDocAllowed(email?: string | null): boolean {
  if (!email) return false;
  const allowed = getPipelineDocAllowedEmails();
  return allowed.includes(email.toLowerCase());
}
