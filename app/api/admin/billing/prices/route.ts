import { NextRequest, NextResponse } from 'next/server';

import { logAdminAuditEvent } from '@/lib/admin/audit';
import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';
import { getEditablePriceConfig, saveEditablePriceConfig } from '@/lib/billing/pricing-overrides';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const config = await getEditablePriceConfig({ forceRefresh: true });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[ADMIN PRICES] Failed to load prices:', error);
    return NextResponse.json({ error: 'Failed to load prices' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let admin: { id: string; email: string } | null = null;
  try {
    admin = await requireAdmin(request);
    const body = await request.json().catch(() => null);
    const config = body?.config;

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Missing price config' }, { status: 400 });
    }

    const saved = await saveEditablePriceConfig(config, admin.id);
    await logAdminAuditEvent({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'billing.prices.update',
      targetType: 'billing_price_overrides',
      targetId: 'billing_prices_v1',
      status: 'success',
      metadata: {
        serviceCount: Object.keys(saved.services).length,
        analysisCount: Object.keys(saved.analysis).length,
        contentOutputCount: Object.keys(saved.contentOutputs).length,
      },
    });

    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[ADMIN PRICES] Failed to save prices:', error);
    if (admin) {
      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'billing.prices.update',
        targetType: 'billing_price_overrides',
        targetId: 'billing_prices_v1',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save prices' }, { status: 500 });
  }
}
