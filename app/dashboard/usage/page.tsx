'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from '../settings/unified-settings';
import { DashboardHeaderAction, DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';
import { BarChart3, CalendarDays, Download } from 'lucide-react';

export default function UsagePage() {
  const { user, loading } = useAuth();
  const setUsageRangeToThisMonth = () => {
    window.dispatchEvent(new CustomEvent('audiorepurpose:usage-this-month'));
  };
  const openUsageExport = () => {
    window.dispatchEvent(new CustomEvent('audiorepurpose:usage-export-open'));
  };

  if (loading) {
    return (
      <DashboardPageShell maxWidth="5xl">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
            <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-80" />
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
      </DashboardPageShell>
    );
  }

  if (!user) {
    return (
      <DashboardPageShell maxWidth="5xl">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Please log in to access usage.
          </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="5xl">
          <DashboardPageHeader
            icon={BarChart3}
            title="Usage"
            description="Monitor credits, consumption, and workspace activity."
            actions={(
              <>
                <DashboardHeaderAction type="button" onClick={setUsageRangeToThisMonth} icon={CalendarDays}>This Month</DashboardHeaderAction>
                <DashboardHeaderAction type="button" onClick={openUsageExport} icon={Download} variant="primary">Export Usage</DashboardHeaderAction>
              </>
            )}
          />
          <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-48" /><div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" /></div>}>
            <UnifiedSettings userEmail={user.email || ''} forcedSection="usage" />
          </Suspense>
    </DashboardPageShell>
  );
}
