/**
 * Admin Billing Utilities
 *
 * Administrative functions for managing user credits, viewing usage analytics,
 * and performing billing operations. These functions should only be called by
 * authenticated admin users.
 */

import {
  getBalance,
  addCredit,
  getUsageHistory,
  getTransactionHistory,
  getAllUserBalances,
  getRevenueAnalytics,
} from './credit';
import { calculateServiceCost } from './cost-map';

// ============================================================================
// Admin Credit Management
// ============================================================================

/**
 * Add credits to a user's account (admin only)
 *
 * @param userId - User to credit
 * @param amount - Amount in USD
 * @param reason - Reason for credit addition
 * @param adminUserId - Admin performing the action
 */
export async function adminAddCredits(params: {
  userId: string;
  amount: number;
  reason: string;
  adminUserId: string;
  transactionType?: 'bonus' | 'refund' | 'admin_adjustment';
}): Promise<{
  success: boolean;
  newBalance: number;
  transactionId: string;
}> {
  const { userId, amount, reason, adminUserId, transactionType = 'admin_adjustment' } = params;

  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  if (amount > 1000) {
    throw new Error('Cannot add more than $1000 at once without additional approval');
  }

  const result = await addCredit(userId, amount, transactionType, {
    adminUserId,
    reason,
    metadata: {
      adminAction: true,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[ADMIN] Added $${amount} to user ${userId}. New balance: $${result.newBalance}. Reason: ${reason}`);

  return {
    success: true,
    newBalance: result.newBalance,
    transactionId: result.transactionId,
  };
}

/**
 * Get detailed user billing summary (admin only)
 */
export async function getUserBillingSummary(userId: string): Promise<{
  balance: number;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
  recentUsage: Array<{
    date: string;
    serviceKey: string;
    serviceName: string;
    units: number;
    billedCost: number;
  }>;
  recentTransactions: Array<{
    date: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reason?: string;
  }>;
}> {
  // Get balance
  const balance = await getBalance(userId);

  // Get recent usage (last 30 days)
  const usageHistory = await getUsageHistory(userId, {
    limit: 50,
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  });

  // Get recent transactions
  const transactionHistory = await getTransactionHistory(userId, {
    limit: 50,
  });

  return {
    balance: balance.balance,
    lifetimeCreditsAdded: balance.lifetimeCreditsAdded,
    lifetimeCreditsSpent: balance.lifetimeCreditsSpent,
    recentUsage: usageHistory.events.map((event) => ({
      date: event.createdAt,
      serviceKey: event.serviceKey,
      serviceName: event.serviceName,
      units: event.units,
      billedCost: event.billedCost,
    })),
    recentTransactions: transactionHistory.transactions.map((tx) => ({
      date: tx.createdAt,
      type: tx.transactionType,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      reason: tx.reason,
    })),
  };
}

// ============================================================================
// Analytics and Reporting
// ============================================================================

/**
 * Get revenue analytics for date range (admin only)
 */
export async function getRevenueReport(params?: {
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  totalRevenue: number;
  totalCosts: number;
  totalMargin: number;
  marginPercent: number;
  eventCount: number;
  byProvider: Record<
    string,
    {
      revenue: number;
      costs: number;
      margin: number;
      eventCount: number;
      marginPercent: number;
    }
  >;
  topServices: Array<{
    serviceKey: string;
    revenue: number;
    eventCount: number;
  }>;
}> {
  const analytics = await getRevenueAnalytics(params);

  // Calculate margin percent for each provider
  const byProvider = Object.entries(analytics.byProvider).reduce(
    (acc, [provider, data]) => {
      acc[provider] = {
        ...data,
        marginPercent: data.revenue > 0 ? (data.margin / data.revenue) * 100 : 0,
      };
      return acc;
    },
    {} as Record<string, any>
  );

  // Get top services by revenue
  const serviceRevenue = new Map<string, { revenue: number; count: number }>();

  // This would require querying usage_events again grouped by service_key
  // For now, return empty array
  const topServices: Array<{ serviceKey: string; revenue: number; eventCount: number }> = [];

  return {
    totalRevenue: analytics.totalRevenue,
    totalCosts: analytics.totalCosts,
    totalMargin: analytics.totalMargin,
    marginPercent: analytics.marginPercent,
    eventCount: analytics.eventCount,
    byProvider,
    topServices,
  };
}

/**
 * Get users with low balance (admin alert system)
 */
export async function getLowBalanceUsers(threshold: number = 1.0): Promise<
  Array<{
    userId: string;
    balance: number;
    lastActivity: string;
  }>
> {
  const users = await getAllUserBalances({
    maxBalance: threshold,
    limit: 100,
  });

  return users.users.map((user) => ({
    userId: user.userId,
    balance: user.balance,
    lastActivity: user.lastActivity,
  }));
}

/**
 * Get users with high spending (admin monitoring)
 */
export async function getHighSpendingUsers(params: {
  minSpent?: number;
  limit?: number;
}): Promise<
  Array<{
    userId: string;
    balance: number;
    lifetimeSpent: number;
    lifetimeAdded: number;
  }>
> {
  const { minSpent = 100, limit = 50 } = params;

  const users = await getAllUserBalances({
    limit: 1000, // Get all users first
  });

  // Filter and sort by lifetime spent
  const highSpenders = users.users
    .filter((user) => user.lifetimeCreditsSpent >= minSpent)
    .sort((a, b) => b.lifetimeCreditsSpent - a.lifetimeCreditsSpent)
    .slice(0, limit);

  return highSpenders.map((user) => ({
    userId: user.userId,
    balance: user.balance,
    lifetimeSpent: user.lifetimeCreditsSpent,
    lifetimeAdded: user.lifetimeCreditsAdded,
  }));
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Add credits to multiple users (admin only)
 * Use for promotions, compensation, etc.
 */
export async function bulkAddCredits(params: {
  users: Array<{ userId: string; amount: number }>;
  reason: string;
  adminUserId: string;
}): Promise<{
  successful: number;
  failed: number;
  results: Array<{ userId: string; success: boolean; error?: string }>;
}> {
  const { users, reason, adminUserId } = params;
  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  let successful = 0;
  let failed = 0;

  for (const { userId, amount } of users) {
    try {
      await adminAddCredits({
        userId,
        amount,
        reason,
        adminUserId,
        transactionType: 'bonus',
      });

      results.push({ userId, success: true });
      successful++;
    } catch (error) {
      results.push({
        userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  console.log(`[ADMIN] Bulk credit addition: ${successful} successful, ${failed} failed`);

  return {
    successful,
    failed,
    results,
  };
}

// ============================================================================
// Reconciliation and Auditing
// ============================================================================

/**
 * Verify user balance matches transaction history
 * Use for auditing and detecting discrepancies
 */
export async function auditUserBalance(userId: string): Promise<{
  currentBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  isCorrect: boolean;
  details: {
    lifetimeAdded: number;
    lifetimeSpent: number;
    transactionCount: number;
  };
}> {
  const balance = await getBalance(userId);
  const transactions = await getTransactionHistory(userId, {
    limit: 10000, // Get all transactions
  });

  // Calculate balance from transaction history
  let calculatedBalance = 0;
  for (const tx of transactions.transactions) {
    calculatedBalance += tx.amount; // Positive for credits, negative for debits
  }

  const discrepancy = Math.abs(balance.balance - calculatedBalance);
  const isCorrect = discrepancy < 0.01; // Allow 1 cent rounding difference

  return {
    currentBalance: balance.balance,
    calculatedBalance,
    discrepancy,
    isCorrect,
    details: {
      lifetimeAdded: balance.lifetimeCreditsAdded,
      lifetimeSpent: balance.lifetimeCreditsSpent,
      transactionCount: transactions.total,
    },
  };
}

/**
 * Get billing system health metrics (admin dashboard)
 */
export async function getBillingHealthMetrics(): Promise<{
  totalUsers: number;
  activeUsers: number; // Users with balance > 0
  totalCreditsInSystem: number;
  totalRevenueAllTime: number;
  averageBalance: number;
  usageEventsLast24h: number;
}> {
  const allUsers = await getAllUserBalances({
    limit: 10000,
  });

  const totalUsers = allUsers.total;
  const activeUsers = allUsers.users.filter((u) => u.balance > 0).length;
  const totalCreditsInSystem = allUsers.users.reduce((sum, u) => sum + u.balance, 0);
  const totalRevenueAllTime = allUsers.users.reduce((sum, u) => sum + u.lifetimeCreditsAdded, 0);
  const averageBalance = totalUsers > 0 ? totalCreditsInSystem / totalUsers : 0;

  // Get usage events from last 24 hours
  // This would require a date-filtered query on usage_events
  // For now, return placeholder
  const usageEventsLast24h = 0;

  return {
    totalUsers,
    activeUsers,
    totalCreditsInSystem,
    totalRevenueAllTime,
    averageBalance,
    usageEventsLast24h,
  };
}
