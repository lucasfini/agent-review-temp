'use client';

/**
 * Client wrapper for Usage Metrics Page
 * Handles timeframe, project, and metric selection with URL updates
 */

import { useRouter, usePathname } from 'next/navigation';
import { useUsageTimeframe, type UsageTimeframe } from '@/lib/hooks/useTimeframe';
import { useState, useEffect } from 'react';
import type { ProjectFilter, UsageMetrics as UsageMetricsType } from '@/lib/usage-data';
import { getUsageMetrics, getUsageTrend, getProjectFilters } from '@/lib/usage-data';
import { Clock, FileAudio, Gauge, HardDrive, FolderOpen } from 'lucide-react';
import { UsageChart } from '@/components/dashboard/usage-chart';
import { UsageSkeleton } from '@/components/dashboard/usage-skeleton';

interface UsageTrend {
  date: string;
  minutesProcessed: number;
  filesUploaded: number;
  avgProcessingTime: number;
}

interface UsagePageClientProps {
  initialTimeframe: UsageTimeframe;
  initialProject: string;
  initialMetric: 'minutesProcessed' | 'filesUploaded' | 'avgProcessingTime';
  projectFilters: ProjectFilter[];
}

export default function UsagePageClient({
  initialTimeframe,
  initialProject,
  initialMetric,
  projectFilters,
}: UsagePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { timeframe, setTimeframe } = useUsageTimeframe(initialTimeframe);
  const [project, setProject] = useState(initialProject);
  const [metric, setMetric] = useState(initialMetric);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetricsType | null>(null);
  const [trendData, setTrendData] = useState<UsageTrend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const [metrics, trends] = await Promise.all([
        getUsageMetrics(timeframe, project),
        getUsageTrend(timeframe, project)
      ]);
      setUsageMetrics(metrics);
      setTrendData(trends);
      setIsLoading(false);
    };
    fetchData();
  }, [timeframe, project]);

  const updateURL = (updates: { timeframe?: string; project?: string; metric?: string }) => {
    const params = new URLSearchParams();
    params.set('timeframe', updates.timeframe || timeframe);
    params.set('project', updates.project || project);
    params.set('metric', updates.metric || metric);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleTimeframeChange = (newTimeframe: UsageTimeframe) => {
    setTimeframe(newTimeframe);
    updateURL({ timeframe: newTimeframe });
  };

  const handleProjectChange = (newProject: string) => {
    setProject(newProject);
    updateURL({ project: newProject });
  };

  const handleMetricChange = (newMetric: 'minutesProcessed' | 'filesUploaded' | 'avgProcessingTime') => {
    setMetric(newMetric);
    updateURL({ metric: newMetric });
  };

  return (
    <>
      {/* Header with Filters */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Usage Metrics</h1>
        <div className="flex gap-2">
          {/* Project Filter */}
          <select
            value={project}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {projectFilters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Timeframe Buttons */}
          {(['7d', '30d', '90d'] as UsageTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trend Chart Metric
        </label>
        <div className="flex gap-2">
          {[
            { value: 'minutesProcessed', label: 'Minutes Processed' },
            { value: 'filesUploaded', label: 'Files Uploaded' },
            { value: 'avgProcessingTime', label: 'Avg Processing Time' }
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => handleMetricChange(m.value as typeof metric)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                metric === m.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <UsageSkeleton />
      ) : usageMetrics ? (
        <>
          {/* Metrics Cards */}
          <div className="grid gap-6 md:grid-cols-5 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <div className="text-sm text-gray-600">Minutes Processed</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {usageMetrics.minutesProcessed.toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-2">
                <FileAudio className="h-5 w-5 text-purple-600" />
                <div className="text-sm text-gray-600">Files Uploaded</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {usageMetrics.filesUploaded}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-2">
                <Gauge className="h-5 w-5 text-green-600" />
                <div className="text-sm text-gray-600">Avg Processing Time</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {usageMetrics.avgProcessingTime.toFixed(1)}m
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-2">
                <HardDrive className="h-5 w-5 text-orange-600" />
                <div className="text-sm text-gray-600">Total Storage</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {usageMetrics.totalStorage.toFixed(1)}GB
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-2">
                <FolderOpen className="h-5 w-5 text-indigo-600" />
                <div className="text-sm text-gray-600">Active Projects</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {usageMetrics.activeProjects}
              </div>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Trend</h2>
            <UsageChart
              data={trendData}
              metric={metric}
              label={
                metric === 'minutesProcessed' ? 'Minutes Processed' :
                metric === 'filesUploaded' ? 'Files Uploaded' :
                'Average Processing Time (min)'
              }
            />
          </div>
        </>
      ) : null}
    </>
  );
}
