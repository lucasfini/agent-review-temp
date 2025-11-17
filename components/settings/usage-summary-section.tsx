'use client';

/**
 * Usage Summary Section Component
 * Quick overview of usage stats with links to detailed pages
 */

import { useState, useEffect } from 'react';
import { FileAudio, DollarSign, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface UsageSummarySectionProps {
  userId: string;
}

interface UsageStats {
  totalProjects: number;
  totalSpent: number;
  totalUsageEvents: number;
  recentProjects: Array<{
    id: string;
    title: string;
    createdAt: string;
  }>;
}

interface UsageTrendData {
  date: string;
  cost: number;
  events: number;
}

export default function UsageSummarySection({ userId }: UsageSummarySectionProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [trendData, setTrendData] = useState<UsageTrendData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { session } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // In a real implementation, you might create a dedicated API endpoint for this
        // For now, we'll fetch from existing endpoints
        const [usageResponse, transactionsResponse] = await Promise.all([
          fetch('/api/billing/usage?limit=100', {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
          fetch('/api/billing/transactions?limit=100', {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }),
        ]);

        const usageData = await usageResponse.json();
        const transactionsData = await transactionsResponse.json();

        // Calculate total spent from usage events
        const totalSpent = usageData.events?.reduce(
          (sum: number, e: any) => sum + Number(e.billed_cost),
          0
        ) || 0;

        setStats({
          totalProjects: 0, // Would need to fetch from projects table
          totalSpent,
          totalUsageEvents: usageData.total || 0,
          recentProjects: [],
        });

        // Process trend data - group by date
        const events = usageData.events || [];
        const trendMap = new Map<string, { cost: number; count: number }>();

        events.forEach((event: any) => {
          const date = new Date(event.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const existing = trendMap.get(date) || { cost: 0, count: 0 };
          trendMap.set(date, {
            cost: existing.cost + Number(event.billed_cost),
            count: existing.count + 1,
          });
        });

        const trend = Array.from(trendMap.entries())
          .map(([date, data]) => ({
            date,
            cost: Number(data.cost.toFixed(2)),
            events: data.count,
          }))
          .slice(-30); // Last 30 data points

        setTrendData(trend);
      } catch (error) {
        console.error('Error fetching usage stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [userId, session]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
            <Zap className="h-4 w-4" />
            Total Usage Events
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats?.totalUsageEvents || 0}
          </div>
          <Link
            href="/dashboard/transactions?tab=usage"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 inline-flex items-center gap-1"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
            <DollarSign className="h-4 w-4" />
            Total Spent
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            ${(stats?.totalSpent || 0).toFixed(2)}
          </div>
          <Link
            href="/dashboard/costs"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 inline-flex items-center gap-1"
          >
            View Costs
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
            <FileAudio className="h-4 w-4" />
            Total Projects
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats?.totalProjects || 0}
          </div>
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 inline-flex items-center gap-1"
          >
            View Projects
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Usage Trend Chart */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Trend</h2>
        {trendData.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No usage data available yet
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickLine={{ stroke: '#e5e7eb' }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.5rem',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'cost' ? `$${value.toFixed(2)}` : value,
                    name === 'cost' ? 'Cost' : 'Events',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ fill: '#2563eb', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
