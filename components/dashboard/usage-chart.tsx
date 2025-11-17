'use client';

import { useMemo } from 'react';
import type { UsageTrend } from '@/lib/usage-data';

interface UsageChartProps {
  data: UsageTrend[];
  metric: 'minutesProcessed' | 'filesUploaded' | 'avgProcessingTime';
  label?: string;
}

export function UsageChart({ data, metric, label }: UsageChartProps) {
  const { maxValue, minValue, points } = useMemo(() => {
    const values = data.map(d => d[metric]);
    const max = Math.max(...values);
    const min = Math.min(...values);

    // Calculate SVG path points
    const chartWidth = 100;
    const chartHeight = 100;
    const xStep = chartWidth / (data.length - 1 || 1);

    const pts = data.map((d, i) => {
      const x = i * xStep;
      const y = chartHeight - ((d[metric] - min) / (max - min || 1)) * chartHeight;
      return { x, y, value: d[metric], date: d.date };
    });

    return { maxValue: max, minValue: min, points: pts };
  }, [data, metric]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No usage data available
      </div>
    );
  }

  const pathD = points.length > 0
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
    : '';

  return (
    <div className="space-y-4">
      {/* Chart Header */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-600">{label || metric}</span>
        <div className="text-gray-500">
          <span className="text-gray-400">Min: </span>
          {minValue.toFixed(1)}
          <span className="mx-2 text-gray-400">Max: </span>
          {maxValue.toFixed(1)}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative h-64 bg-gray-50 rounded-lg p-4">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          <g className="text-gray-300" strokeDasharray="1,2">
            <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.2" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.2" />
          </g>

          {/* Area fill */}
          <path
            d={`${pathD} L 100,100 L 0,100 Z`}
            fill="rgb(59, 130, 246)"
            fillOpacity="0.1"
          />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r="1"
                fill="rgb(59, 130, 246)"
                className="hover:r-2 transition-all"
              >
                <title>{`${point.date}: ${point.value.toFixed(1)}`}</title>
              </circle>
            </g>
          ))}
        </svg>

        {/* Hover points (invisible overlay) */}
        <div className="absolute inset-0 flex">
          {points.map((point, i) => (
            <div
              key={i}
              className="flex-1 group relative"
              title={`${point.date}: ${point.value.toFixed(1)}`}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {new Date(point.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
                : {point.value.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
