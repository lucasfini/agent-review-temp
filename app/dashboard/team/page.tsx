'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth/context';
import { DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';
import UnifiedSettings from '../settings/unified-settings';
import { Users } from 'lucide-react';

export default function TeamPage() {
  const { user, loading } = useAuth();

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
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
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
          Please log in to access team settings.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="5xl">
      <DashboardPageHeader
        icon={Users}
        title="Team"
        description="Invite members, manage roles, and control access."
      />
      <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 w-48 rounded bg-slate-100 dark:bg-slate-800" /><div className="h-64 rounded-lg bg-slate-100 dark:bg-slate-800" /></div>}>
        <UnifiedSettings userEmail={user.email || ''} forcedSection="workspace" organizationType="saas_customer" />
      </Suspense>
    </DashboardPageShell>
  );
}
