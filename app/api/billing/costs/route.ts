/**
 * Billing Costs API
 * GET /api/billing/costs - Get aggregated cost data from usage events
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

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
  breakdown: Record<string, number>;
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

interface UsageEvent {
  service_name: string;
  provider: string;
  billed_cost: number;
  created_at: string;
}

type Timeframe = '30d' | 'quarter' | 'ytd';

function getDateRange(timeframe: Timeframe): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const now = new Date();
  const end = now;
  let start: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (timeframe) {
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getFullYear(), Math.floor(previousEnd.getMonth() / 3) * 3, 1);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getFullYear(), 0, 1);
      break;
  }

  return { start, end, previousStart, previousEnd };
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') || '30d') as Timeframe;
    const groupBy = searchParams.get('groupBy') || 'service'; // service, provider, or day

    // Get date ranges for current and previous periods
    const { start, end, previousStart, previousEnd } = getDateRange(timeframe);

    // Fetch usage events for current period
    const { data: currentEvents, error: currentError } = await supabaseAdmin
      .from('usage_events')
      .select('service_name, provider, billed_cost, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()) as { data: UsageEvent[] | null; error: any };

    if (currentError || !currentEvents) {
      throw new Error(`Failed to fetch current period usage: ${currentError?.message || 'No data'}`);
    }

    // Fetch usage events for previous period
    const { data: previousEvents, error: previousError } = await supabaseAdmin
      .from('usage_events')
      .select('service_name, provider, billed_cost, created_at')
      .eq('user_id', user.id)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString()) as { data: UsageEvent[] | null; error: any };

    if (previousError || !previousEvents) {
      throw new Error(`Failed to fetch previous period usage: ${previousError?.message || 'No data'}`);
    }

    // Calculate totals
    const totalCost = currentEvents.reduce((sum, e) => sum + Number(e.billed_cost), 0);
    const previousPeriodCost = previousEvents.reduce((sum, e) => sum + Number(e.billed_cost), 0);
    const changePercent = previousPeriodCost > 0
      ? ((totalCost - previousPeriodCost) / previousPeriodCost) * 100
      : 0;

    // Group by service/provider
    const currentByService: Record<string, number> = {};
    const previousByService: Record<string, number> = {};

    currentEvents.forEach(event => {
      const key = groupBy === 'provider' ? event.provider : event.service_name;
      currentByService[key] = (currentByService[key] || 0) + Number(event.billed_cost);
    });

    previousEvents.forEach(event => {
      const key = groupBy === 'provider' ? event.provider : event.service_name;
      previousByService[key] = (previousByService[key] || 0) + Number(event.billed_cost);
    });

    // Create breakdown array
    const breakdown: CostBreakdown[] = Object.entries(currentByService).map(([service, amount]) => {
      const prevAmount = previousByService[service] || 0;
      const change = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

      return {
        service,
        amount,
        percentage: totalCost > 0 ? (amount / totalCost) * 100 : 0,
        previousPeriodAmount: prevAmount,
        change,
      };
    });

    // Sort by amount descending
    breakdown.sort((a, b) => b.amount - a.amount);

    // Get top 3 drivers
    const topDrivers = breakdown.slice(0, 3).map(item => ({
      name: item.service,
      cost: item.amount,
      changePercent: item.change,
    }));

    // Create monthly data
    const monthlyData: MonthlyCost[] = [];

    if (timeframe === '30d') {
      // Single period for 30d
      const monthlyBreakdown: Record<string, number> = {};
      currentEvents?.forEach(event => {
        const key = groupBy === 'provider' ? event.provider : event.service_name;
        monthlyBreakdown[key] = (monthlyBreakdown[key] || 0) + Number(event.billed_cost);
      });

      monthlyData.push({
        month: 'Last 30 Days',
        total: totalCost,
        breakdown: monthlyBreakdown,
      });
    } else if (timeframe === 'quarter') {
      // Group by month for last 3 months
      const monthGroups: Record<string, { total: number; breakdown: Record<string, number> }> = {};

      currentEvents?.forEach(event => {
        const date = new Date(event.created_at);
        const monthKey = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;

        if (!monthGroups[monthKey]) {
          monthGroups[monthKey] = { total: 0, breakdown: {} };
        }

        const serviceKey = groupBy === 'provider' ? event.provider : event.service_name;
        monthGroups[monthKey].total += Number(event.billed_cost);
        monthGroups[monthKey].breakdown[serviceKey] =
          (monthGroups[monthKey].breakdown[serviceKey] || 0) + Number(event.billed_cost);
      });

      // Convert to array and sort by date
      Object.entries(monthGroups)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .forEach(([month, data]) => {
          monthlyData.push({
            month,
            total: data.total,
            breakdown: data.breakdown,
          });
        });
    } else if (timeframe === 'ytd') {
      // Group by month for year to date
      const monthGroups: Record<string, { total: number; breakdown: Record<string, number> }> = {};

      currentEvents?.forEach(event => {
        const date = new Date(event.created_at);
        const monthKey = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;

        if (!monthGroups[monthKey]) {
          monthGroups[monthKey] = { total: 0, breakdown: {} };
        }

        const serviceKey = groupBy === 'provider' ? event.provider : event.service_name;
        monthGroups[monthKey].total += Number(event.billed_cost);
        monthGroups[monthKey].breakdown[serviceKey] =
          (monthGroups[monthKey].breakdown[serviceKey] || 0) + Number(event.billed_cost);
      });

      // Convert to array and sort by date
      Object.entries(monthGroups)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .forEach(([month, data]) => {
          monthlyData.push({
            month,
            total: data.total,
            breakdown: data.breakdown,
          });
        });
    }

    const summary: CostSummary = {
      totalCost,
      previousPeriodCost,
      changePercent,
      breakdown,
      monthlyData,
      topDrivers,
    };

    return NextResponse.json({
      success: true,
      summary,
      timeframe,
      groupBy,
    });
  } catch (error) {
    console.error('[BILLING COSTS API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch cost data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
