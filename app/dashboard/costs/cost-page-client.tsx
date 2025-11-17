'use client';

/**
 * Client wrapper for Cost Analysis Page
 * Handles timeframe selection and URL updates
 */

import { useRouter, usePathname } from 'next/navigation';
import { useCostTimeframe, type CostTimeframe } from '@/lib/hooks/useTimeframe';
import { useState, useEffect } from 'react';
import { getCostSummary, type CostSummary } from '@/lib/cost-data';
import { CostChart } from '@/components/dashboard/cost-chart';
import { CostSkeleton } from '@/components/dashboard/cost-skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface CostPageClientProps {
  initialTimeframe: CostTimeframe;
}

export default function CostPageClient({ initialTimeframe }: CostPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { timeframe, setTimeframe } = useCostTimeframe(initialTimeframe);
  const [costData, setCostData] = useState<CostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const data = await getCostSummary(timeframe);
      setCostData(data);
      setIsLoading(false);
    };
    fetchData();
  }, [timeframe]);

  const handleTimeframeChange = (newTimeframe: CostTimeframe) => {
    setTimeframe(newTimeframe);
    router.push(`${pathname}?timeframe=${newTimeframe}`);
  };

  return (
    <>
      {/* Header with Timeframe Selector */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Cost Analysis</h1>
        <div className="flex gap-2">
          {(['30d', 'quarter', 'ytd'] as CostTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {tf === '30d' ? 'Last 30 Days' : tf === 'quarter' ? 'Quarter' : 'YTD'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <CostSkeleton />
      ) : costData ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Cost</div>
              <div className="text-3xl font-bold text-gray-900">
                ${costData.totalCost.toFixed(2)}
              </div>
              <div className={`flex items-center gap-1 text-sm mt-2 ${
                costData.changePercent >= 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {costData.changePercent >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(costData.changePercent).toFixed(1)}% vs previous period
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Average Daily Cost</div>
              <div className="text-3xl font-bold text-gray-900">
                ${(costData.totalCost / 30).toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Based on {timeframe === '30d' ? '30' : timeframe === 'quarter' ? '90' : '365'} days
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Top Cost Driver</div>
              <div className="text-2xl font-bold text-gray-900">
                {costData.topDrivers[0]?.name || 'N/A'}
              </div>
              <div className="text-sm text-gray-500 mt-2">
                ${costData.topDrivers[0]?.cost.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost Breakdown</h2>
            <div className="space-y-4">
              {costData.breakdown.map((item) => (
                <div key={item.service} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {item.service}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className={`ml-4 text-sm ${
                    item.change >= 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Trend Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost Trend</h2>
            <CostChart data={costData.monthlyData} type="stacked" />
          </div>
        </>
      ) : null}
    </>
  );
}
