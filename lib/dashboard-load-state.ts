export function getDashboardErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function logDashboardLoad(scope: string, phase: string, detail?: Record<string, unknown>) {
  console.log(`[DASHBOARD_LOAD] ${scope}:${phase}`, {
    at: new Date().toISOString(),
    ...(detail || {}),
  });
}
