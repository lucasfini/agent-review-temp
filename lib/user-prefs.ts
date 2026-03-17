/**
 * Pure date/number formatting utilities that respect user locale and timezone preferences.
 * All functions fall back to browser defaults when preferences are not provided.
 */

export function formatDate(
  date: string | Date,
  locale?: string,
  timezone?: string
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    ...(timezone ? { timeZone: timezone } : {}),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(
  date: string | Date,
  locale?: string,
  timezone?: string
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale, {
    ...(timezone ? { timeZone: timezone } : {}),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeDate(
  date: string | Date,
  locale?: string,
  timezone?: string
): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return then.toLocaleDateString(locale, {
    ...(timezone ? { timeZone: timezone } : {}),
    month: 'short',
    day: 'numeric',
  });
}
