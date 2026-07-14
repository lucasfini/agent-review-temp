/**
 * Settings Page
 * Account preferences page
 * Premium design with Shadcn UI patterns and Recharts
 */

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from './unified-settings';
import { DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get('section');

  useEffect(() => {
    if (requestedSection === 'workspace') {
      router.replace('/dashboard/team');
      return;
    }
    if (requestedSection === 'integrations') {
      router.replace('/dashboard/integrations');
      return;
    }
    if (requestedSection === 'billing') {
      router.replace('/dashboard/billing');
      return;
    }
    if (requestedSection === 'usage') {
      router.replace('/dashboard/usage');
    }
  }, [requestedSection, router]);

  if (loading) {
    return (
      <DashboardPageShell maxWidth="5xl">
        <div className="animate-pulse space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="h-3 w-28 rounded bg-blue-100 dark:bg-blue-950" />
            <div className="mt-4 h-8 w-48 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-4 w-full max-w-xl rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </DashboardPageShell>
    );
  }

  if (!user) {
    return (
      <DashboardPageShell maxWidth="5xl">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Please log in to access settings.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="5xl">
      <DashboardPageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Update your profile, email, password, and account controls."
      />
      <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-48" /><div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" /></div>}>
        <UnifiedSettings userEmail={user.email || ''} forcedSection="preferences" />
      </Suspense>
    </DashboardPageShell>
  );
}
