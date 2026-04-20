'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from '../settings/unified-settings';

export default function BillingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
            <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-80" />
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Please log in to access billing.
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Billing</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage credits, purchases, and transaction history
            </p>
          </div>
          <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-48" /><div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" /></div>}>
            <UnifiedSettings userEmail={user.email || ''} forcedSection="billing" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
