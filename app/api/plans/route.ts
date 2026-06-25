import { NextResponse } from 'next/server';

import { getActivePlans } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const plans = await getActivePlans();

    return NextResponse.json(
      {
        success: true,
        plans,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[PLANS API] Failed to load plans:', error);
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}
