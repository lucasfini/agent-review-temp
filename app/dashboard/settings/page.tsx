/**
 * Settings Page
 * Unified settings page for preferences, billing, and usage
 * Premium design with Shadcn UI patterns and Recharts
 */

'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from './unified-settings';

export default function SettingsPage() {
  const { user, loading, isDemoMode } = useAuth();

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
            <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-80" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              ))}
            </div>
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-yellow-900/20 border border-yellow-800/30 text-yellow-400 px-4 py-3 rounded-lg">
            Please log in to access settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-950">
      <div className="p-3 sm:p-6">
        <div className="max-w-5xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Preferences</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Update your account details, password, integrations, and workspace defaults
            </p>
          </div>
          <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-48" /><div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" /></div>}>
            <UnifiedSettings userEmail={user.email || ''} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
