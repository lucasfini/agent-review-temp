import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getDisplayBalance, getUsageHistory } from '@/lib/billing/credit';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';
import { getGroupedTransactions } from '@/lib/billing/grouped-transactions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const transactionLimit = Math.max(1, Math.min(100, Number(searchParams.get('transactionLimit') || '10')));
    const transactionOffset = Math.max(0, Number(searchParams.get('transactionOffset') || '0'));
    const usageLimit = Math.max(1, Math.min(500, Number(searchParams.get('usageLimit') || '200')));

    const [profileResult, integrationsResult, balanceResult, transactionsResult, usageResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('username, first_name, last_name, full_name, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('integration_connections')
        .select('provider,status,metadata,created_at,updated_at,external_account_id')
        .eq('user_id', user.id),
      getDisplayBalance(user.id),
      getGroupedTransactions(user.id, transactionLimit, transactionOffset),
      getUsageHistory(user.id, { limit: usageLimit, offset: 0 }),
    ]);

    if (profileResult.error) {
      throw new Error(profileResult.error.message || 'Failed to load profile');
    }

    if (integrationsResult.error) {
      throw new Error(integrationsResult.error.message || 'Failed to load integrations');
    }

    const profile = profileResult.data;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = typeof profile?.full_name === 'string' && profile.full_name
      ? profile.full_name
      : typeof meta.full_name === 'string'
        ? meta.full_name
        : '';
    const firstName = typeof profile?.first_name === 'string' && profile.first_name
      ? profile.first_name
      : typeof meta.first_name === 'string'
        ? meta.first_name
        : fullName.split(' ')[0] || '';
    const lastName = typeof profile?.last_name === 'string' && profile.last_name
      ? profile.last_name
      : typeof meta.last_name === 'string'
        ? meta.last_name
        : fullName.split(' ').slice(1).join(' ');

    const integrations = ['zoom', 'microsoft'].map((provider) => {
      const row = integrationsResult.data?.find((connection: any) => connection.provider === provider && connection.status === 'connected');
      return {
        provider,
        connected: Boolean(row),
        metadata: row?.metadata || null,
        externalAccountId: row?.external_account_id || null,
        updatedAt: row?.updated_at || null,
      };
    });

    const usageTrendMap = new Map<string, { cost: number; count: number; timestamp: number }>();
    for (const event of usageResult.events || []) {
      if (!event.createdAt) continue;
      const dateObj = new Date(event.createdAt);
      if (Number.isNaN(dateObj.getTime())) continue;

      const dateKey = dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const existing = usageTrendMap.get(dateKey) || { cost: 0, count: 0, timestamp: dateObj.getTime() };
      usageTrendMap.set(dateKey, {
        cost: existing.cost + Number(event.billedCost || 0),
        count: existing.count + 1,
        timestamp: Math.max(existing.timestamp, dateObj.getTime()),
      });
    }

    const usageTrend = Array.from(usageTrendMap.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(-30)
      .map(([date, data]) => ({
        date,
        cost: Number(data.cost.toFixed(4)),
        events: data.count,
      }));

    return NextResponse.json({
      preferences: {
        username: (profile as any)?.username || (typeof meta.username === 'string' ? meta.username : ''),
        firstName,
        lastName,
        avatarUrl:
          typeof profile?.avatar_url === 'string' && profile.avatar_url
            ? profile.avatar_url
            : typeof meta.avatar_url === 'string'
              ? meta.avatar_url
              : typeof meta.picture === 'string'
                ? meta.picture
                : '',
        email: user.email || profile?.email || '',
      },
      integrations,
      balance: {
        balance: balanceResult.visibleBalance,
        formatted: formatSiteCreditsFromUsd(balanceResult.visibleBalance),
        availableBalance: balanceResult.availableBalance,
        reservedPending: balanceResult.reservedPending,
        lifetimeCreditsAdded: balanceResult.lifetimeCreditsAdded,
        lifetimeCreditsSpent: balanceResult.lifetimeCreditsSpent,
        lastUpdated: balanceResult.updatedAt,
      },
      transactions: transactionsResult.transactions,
      transactionTotal: transactionsResult.total,
      usageEvents: usageResult.events,
      usageTrend,
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API] Dashboard settings exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
