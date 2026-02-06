/**
 * Settings Page
 * Unified settings page with tabs for General, Billing, and Usage
 * Premium design with Shadcn UI patterns and Recharts
 */

'use client';

import { useAuth } from '@/lib/auth/context';
import UnifiedSettings from './unified-settings';

export default function SettingsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-48" />
            <div className="h-10 bg-gray-200 rounded w-80" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg" />
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
            Please log in to access settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account, billing, and usage preferences
            </p>
          </div>
          <UnifiedSettings userId={user.id} userEmail={user.email || ''} />
        </div>
      </div>
    </div>
  );
}
