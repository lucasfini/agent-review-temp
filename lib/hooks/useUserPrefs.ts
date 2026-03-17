'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import { formatDate, formatDateTime, formatRelativeDate } from '@/lib/user-prefs';

export interface UserPrefs {
  locale: string | undefined;
  timezone: string | undefined;
  outputPreference: 'concise' | 'balanced' | 'detailed';
  formatDate: (date: string | Date) => string;
  formatDateTime: (date: string | Date) => string;
  formatRelativeDate: (date: string | Date) => string;
}

export function useUserPrefs(): UserPrefs {
  const { user } = useAuth();

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const timezone = typeof meta?.timezone === 'string' ? meta.timezone : undefined;
  const locale = typeof meta?.locale === 'string' ? meta.locale : undefined;
  const rawPref = typeof meta?.output_preference === 'string' ? meta.output_preference : 'balanced';
  const outputPreference = (['concise', 'balanced', 'detailed'].includes(rawPref)
    ? rawPref
    : 'balanced') as 'concise' | 'balanced' | 'detailed';

  const boundFormatDate = useMemo(
    () => (date: string | Date) => formatDate(date, locale, timezone),
    [locale, timezone]
  );

  const boundFormatDateTime = useMemo(
    () => (date: string | Date) => formatDateTime(date, locale, timezone),
    [locale, timezone]
  );

  const boundFormatRelativeDate = useMemo(
    () => (date: string | Date) => formatRelativeDate(date, locale, timezone),
    [locale, timezone]
  );

  return {
    locale,
    timezone,
    outputPreference,
    formatDate: boundFormatDate,
    formatDateTime: boundFormatDateTime,
    formatRelativeDate: boundFormatRelativeDate,
  };
}
