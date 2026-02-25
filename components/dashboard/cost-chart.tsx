'use client';

import { useMemo } from 'react';
import type { MonthlyCost } from '@/lib/cost-data';

interface CostChartProps {
  data: MonthlyCost[];
  type?: 'bar' | 'stacked';
}

export function CostChart({ data, type = 'stacked' }: CostChartProps) {
  const maxValue = useMemo(() => {
    if (type === 'stacked') {
      return Math.max(...data.map(d => d.total));
    }
    return Math.max(
      ...data.flatMap(d => [
        d.breakdown.transcription,
        d.breakdown.diarization,
        d.breakdown.hosting,
        d.breakdown.storage
      ])
    );
  }, [data, type]);

  const services = ['transcription', 'diarization', 'hosting', 'storage'] as const;
  const colors = {
    transcription: 'bg-blue-500',
    diarization: 'bg-purple-500',
    hosting: 'bg-green-500',
    storage: 'bg-orange-500'
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        No cost data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="flex items-end gap-4 h-64">
        {data.map((month, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div className="w-full flex flex-col items-center justify-end h-full">
              {type === 'stacked' ? (
                <div className="w-full flex flex-col-reverse gap-0.5">
                  {services.map(service => {
                    const value = month.breakdown[service];
                    const height = (value / maxValue) * 100;
                    return height > 0 ? (
                      <div
                        key={service}
                        className={`w-full ${colors[service]} rounded-sm transition-all hover:opacity-80`}
                        style={{ height: `${height}%` }}
                        title={`${service}: $${value.toFixed(2)}`}
                      />
                    ) : null;
                  })}
                </div>
              ) : (
                <div className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                  style={{ height: `${(month.total / maxValue) * 100}%` }}
                  title={`Total: $${month.total.toFixed(2)}`}
                />
              )}
            </div>
            <div className="text-xs text-slate-400 mt-2 text-center truncate w-full">
              {month.month}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      {type === 'stacked' && (
        <div className="flex flex-wrap gap-4 justify-center">
          {services.map(service => (
            <div key={service} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${colors[service]}`} />
              <span className="text-xs text-slate-400 capitalize">{service}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
