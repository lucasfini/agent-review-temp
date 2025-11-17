/**
 * Cost Analysis Page
 * Client component that displays cost breakdown and trends
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import type { Timeframe } from '@/lib/cost-data';
import { CostSkeleton } from '@/components/dashboard/cost-skeleton';
import CostPageClient from './cost-page-client';

export default function CostsPage() {
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const timeframe = (searchParams.get('timeframe') || '30d') as Timeframe;

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
          Please log in to view cost analysis.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <CostPageClient initialTimeframe={timeframe} />
    </div>
  );
}
