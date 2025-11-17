/**
 * Cost Data Helper
 * Provides mock cost analysis data with simulated API latency
 */

export interface CostBreakdown {
  service: string;
  amount: number;
  percentage: number;
  previousPeriodAmount: number;
  change: number;
}

export interface MonthlyCost {
  month: string;
  total: number;
  breakdown: {
    transcription: number;
    diarization: number;
    hosting: number;
    storage: number;
  };
}

export interface CostSummary {
  totalCost: number;
  previousPeriodCost: number;
  changePercent: number;
  breakdown: CostBreakdown[];
  monthlyData: MonthlyCost[];
  topDrivers: Array<{
    name: string;
    cost: number;
    changePercent: number;
  }>;
}

export type Timeframe = '30d' | 'quarter' | 'ytd';

const mockMonthlyData: Record<string, MonthlyCost[]> = {
  '30d': [
    {
      month: 'Current',
      total: 487.32,
      breakdown: { transcription: 245.50, diarization: 89.20, hosting: 102.62, storage: 50.00 }
    }
  ],
  quarter: [
    {
      month: 'Oct 2024',
      total: 412.45,
      breakdown: { transcription: 198.30, diarization: 76.15, hosting: 95.00, storage: 43.00 }
    },
    {
      month: 'Nov 2024',
      total: 456.78,
      breakdown: { transcription: 223.40, diarization: 81.38, hosting: 98.00, storage: 54.00 }
    },
    {
      month: 'Dec 2024',
      total: 487.32,
      breakdown: { transcription: 245.50, diarization: 89.20, hosting: 102.62, storage: 50.00 }
    }
  ],
  ytd: [
    {
      month: 'Jan 2024',
      total: 320.15,
      breakdown: { transcription: 156.20, diarization: 58.95, hosting: 75.00, storage: 30.00 }
    },
    {
      month: 'Feb 2024',
      total: 356.42,
      breakdown: { transcription: 175.30, diarization: 64.12, hosting: 82.00, storage: 35.00 }
    },
    {
      month: 'Mar 2024',
      total: 389.67,
      breakdown: { transcription: 192.45, diarization: 71.22, hosting: 88.00, storage: 38.00 }
    },
    {
      month: 'Apr 2024',
      total: 401.23,
      breakdown: { transcription: 201.60, diarization: 73.63, hosting: 90.00, storage: 36.00 }
    },
    {
      month: 'May 2024',
      total: 425.88,
      breakdown: { transcription: 215.70, diarization: 78.18, hosting: 92.00, storage: 40.00 }
    },
    {
      month: 'Jun 2024',
      total: 398.54,
      breakdown: { transcription: 195.25, diarization: 72.29, hosting: 91.00, storage: 40.00 }
    },
    {
      month: 'Jul 2024',
      total: 443.21,
      breakdown: { transcription: 221.80, diarization: 80.41, hosting: 96.00, storage: 45.00 }
    },
    {
      month: 'Aug 2024',
      total: 467.89,
      breakdown: { transcription: 234.50, diarization: 85.39, hosting: 99.00, storage: 49.00 }
    },
    {
      month: 'Sep 2024',
      total: 398.76,
      breakdown: { transcription: 196.40, diarization: 72.36, hosting: 93.00, storage: 37.00 }
    },
    {
      month: 'Oct 2024',
      total: 412.45,
      breakdown: { transcription: 198.30, diarization: 76.15, hosting: 95.00, storage: 43.00 }
    },
    {
      month: 'Nov 2024',
      total: 456.78,
      breakdown: { transcription: 223.40, diarization: 81.38, hosting: 98.00, storage: 54.00 }
    },
    {
      month: 'Dec 2024',
      total: 487.32,
      breakdown: { transcription: 245.50, diarization: 89.20, hosting: 102.62, storage: 50.00 }
    }
  ]
};

/**
 * Simulates API latency (100-300ms)
 */
function simulateLatency(): Promise<void> {
  const delay = Math.random() * 200 + 100;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Fetches cost summary for a given timeframe
 */
export async function getCostSummary(timeframe: Timeframe = '30d'): Promise<CostSummary> {
  await simulateLatency();

  const monthlyData = mockMonthlyData[timeframe];
  const currentPeriod = monthlyData[monthlyData.length - 1];
  const previousPeriod = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : currentPeriod;

  const totalCost = currentPeriod.total;
  const previousPeriodCost = previousPeriod.total;
  const changePercent = previousPeriodCost > 0
    ? ((totalCost - previousPeriodCost) / previousPeriodCost) * 100
    : 0;

  // Calculate breakdown with percentages
  const breakdown: CostBreakdown[] = Object.entries(currentPeriod.breakdown).map(([service, amount]) => {
    const prevAmount = previousPeriod.breakdown[service as keyof typeof previousPeriod.breakdown] || 0;
    const change = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

    return {
      service: service.charAt(0).toUpperCase() + service.slice(1),
      amount,
      percentage: (amount / totalCost) * 100,
      previousPeriodAmount: prevAmount,
      change
    };
  });

  // Sort by amount to get top drivers
  const topDrivers = breakdown
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map(item => ({
      name: item.service,
      cost: item.amount,
      changePercent: item.change
    }));

  return {
    totalCost,
    previousPeriodCost,
    changePercent,
    breakdown,
    monthlyData,
    topDrivers
  };
}

/**
 * Gets trend data for charting
 */
export async function getCostTrend(timeframe: Timeframe = '30d'): Promise<MonthlyCost[]> {
  await simulateLatency();
  return mockMonthlyData[timeframe];
}
