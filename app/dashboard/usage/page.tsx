/**
 * Usage Metrics Page
 * Client component that displays usage statistics and trends
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import type { UsageTimeframe } from '@/lib/usage-data';
import { UsageSkeleton } from '@/components/dashboard/usage-skeleton';
import UsagePageClient from './usage-page-client';

export default function UsagePage() {
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const timeframe = (searchParams.get('timeframe') || '30d') as UsageTimeframe;
  const projectId = searchParams.get('project') || 'all';
  const metric = (searchParams.get('metric') || 'minutesProcessed') as
    | 'minutesProcessed'
    | 'filesUploaded'
    | 'avgProcessingTime';

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
          Please log in to view your usage metrics.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <UsagePageClient
        initialTimeframe={timeframe}
        initialProject={projectId}
        initialMetric={metric}
        projectFilters={[{ id: 'all', name: 'All Projects' }]}
      />
    </div>
  );
}
