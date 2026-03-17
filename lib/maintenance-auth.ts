import type { NextRequest } from 'next/server';
import { isValidInternalJobToken } from '@/lib/internal-job-auth';

export function isAuthorizedMaintenanceRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  const internalToken = request.headers.get('x-internal-job-token');
  return isValidInternalJobToken(internalToken);
}
