/**
 * Settings Page
 * Unified settings page with tabs for General, Billing, and Usage
 * Premium design with Shadcn UI patterns and Recharts
 */

'use client';

import { Suspense } from 'react';
import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from './unified-settings';

export default function SettingsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-800 rounded w-48" />
            <div className="h-10 bg-slate-800 rounded w-80" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-slate-800 rounded-lg" />
              ))}
            </div>
            <div className="h-64 bg-slate-800 rounded-lg" />
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
    <div className="min-h-screen bg-slate-950">
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-50">Settings</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your account, billing, and usage preferences
            </p>
          </div>
          <Suspense fallback={<div className="animate-pulse space-y-6"><div className="h-8 bg-slate-800 rounded w-48" /><div className="h-64 bg-slate-800 rounded-lg" /></div>}>
            <UnifiedSettings userId={user.id} userEmail={user.email || ''} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
