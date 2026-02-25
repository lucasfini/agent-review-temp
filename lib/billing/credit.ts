/**
 * Credit Management System
 *
 * Provides atomic credit operations with optimistic locking and comprehensive error handling.
 * All monetary values use DECIMAL(10,4) precision (up to $999,999.9999).
 *
 * Key Features:
 * - Atomic debit operations with version-based optimistic locking
 * - Pre-flight balance checks
 * - Usage event logging with cost breakdown
 * - Complete audit trail via credit_transactions table
 * - Concurrent-safe operations using PostgreSQL row locking
 */

import { supabaseAdmin as supabase } from '@/lib/supabase/server';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CreditBalance {
  balance: number;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
  version: number;
  updatedAt: string;
}

export interface UsageEvent {
  id: string;
  userId: string;
  projectId?: string;
  serviceKey: string;
  serviceName: string;
  provider: string;
  units: number;
  unitType: string;
  rawCost: number;
  marginPercent: number;
  billedCost: number;
  metadata: Record<string, unknown>;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  createdAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionType: 'purchase' | 'bonus' | 'refund' | 'debit' | 'admin_adjustment';
  usageEventId?: string;
  paymentId?: string;
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class InsufficientCreditError extends Error {
  constructor(
    public readonly userId: string,
    public readonly required: number,
    public readonly available: number
  ) {
    super(`Insufficient credits: need $${required.toFixed(4)}, have $${available.toFixed(4)}`);
    this.name = 'InsufficientCreditError';
  }
}

export class ConcurrentUpdateError extends Error {
  constructor(
    public readonly userId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(`Concurrent update detected: expected version ${expectedVersion}, got ${actualVersion}`);
    this.name = 'ConcurrentUpdateError';
  }
}

export class CreditAccountNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`Credit account not found for user: ${userId}`);
    this.name = 'CreditAccountNotFoundError';
  }
}

// ============================================================================
// Core Credit Operations
// ============================================================================

/**
 * Get current credit balance for a user
 * Creates account with $0 balance if it doesn't exist
 */
export async function getBalance(userId: string): Promise<CreditBalance> {

  // Try to get existing balance
  const { data, error } = await supabase
    .from('account_credits')
    .select('balance, lifetime_credits_added, lifetime_credits_spent, version, updated_at')
    .eq('user_id', userId)
    .single() as { data: any; error: any };

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    throw new Error(`Failed to get balance: ${error.message}`);
  }

  // If account doesn't exist, create it
  if (!data) {
    const { data: newAccount, error: insertError } = await supabase
      .from('account_credits')
      .insert({
        user_id: userId,
        balance: 0,
        lifetime_credits_added: 0,
        lifetime_credits_spent: 0,
        version: 0,
      } as any)
      .select('balance, lifetime_credits_added, lifetime_credits_spent, version, updated_at')
      .single() as { data: any; error: any };

    if (insertError) {
      throw new Error(`Failed to create credit account: ${insertError.message}`);
    }

    return {
      balance: newAccount.balance,
      lifetimeCreditsAdded: newAccount.lifetime_credits_added,
      lifetimeCreditsSpent: newAccount.lifetime_credits_spent,
      version: newAccount.version,
      updatedAt: newAccount.updated_at,
    };
  }

  return {
    balance: data.balance,
    lifetimeCreditsAdded: data.lifetime_credits_added,
    lifetimeCreditsSpent: data.lifetime_credits_spent,
    version: data.version,
    updatedAt: data.updated_at,
  };
}

/**
 * Check if user has sufficient credit for an estimated cost
 * Returns true if sufficient, false otherwise
 */
export async function checkSufficientCredit(
  userId: string,
  estimatedCost: number
): Promise<{ sufficient: boolean; balance: number; shortfall: number }> {
  const { balance } = await getBalance(userId);

  return {
    sufficient: balance >= estimatedCost,
    balance,
    shortfall: Math.max(0, estimatedCost - balance),
  };
}

/**
 * Debit credits from user account with optimistic locking
 *
 * @param userId - User to debit
 * @param amount - Amount to debit in USD
 * @param usageEventId - Optional reference to usage event
 * @param options - Additional options (reason, metadata)
 * @returns Updated balance info
 * @throws InsufficientCreditError if balance too low
 * @throws ConcurrentUpdateError if version mismatch
 * @throws CreditAccountNotFoundError if account missing
 */
export async function debitCredit(
  userId: string,
  amount: number,
  usageEventId?: string,
  options?: {
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  success: true;
  newBalance: number;
  newVersion: number;
  transactionId: string;
}> {

  // Get current balance and version
  const { balance, version } = await getBalance(userId);

  // Use PostgreSQL function for atomic debit
  const { data, error } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_current_version: version,
  } as any) as { data: any; error: any };

  if (error) {
    throw new Error(`Failed to debit credits: ${error.message}`);
  }

  const result = data[0];

  // Handle errors returned by function
  if (!result.success) {
    if (result.error_message?.includes('not found')) {
      throw new CreditAccountNotFoundError(userId);
    }
    if (result.error_message?.includes('Version mismatch')) {
      throw new ConcurrentUpdateError(userId, version, result.new_version);
    }
    if (result.error_message?.includes('Insufficient credits')) {
      throw new InsufficientCreditError(userId, amount, result.new_balance);
    }
    throw new Error(result.error_message || 'Unknown debit error');
  }

  // Log transaction for audit trail
  const { data: transaction, error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: -amount, // Negative for debit
      balance_before: balance,
      balance_after: result.new_balance,
      transaction_type: 'debit',
      usage_event_id: usageEventId,
      reason: options?.reason,
      metadata: options?.metadata || {},
    } as any)
    .select('id')
    .single() as { data: any; error: any };

  if (txError) {
    console.error('Failed to log credit transaction:', txError);
    // Don't fail the debit if transaction logging fails
  }

  return {
    success: true,
    newBalance: result.new_balance,
    newVersion: result.new_version,
    transactionId: transaction?.id || '',
  };
}

/**
 * Add credits to user account
 *
 * @param userId - User to credit
 * @param amount - Amount to add in USD
 * @param transactionType - Type of credit addition
 * @param options - Additional options (paymentId, reason, metadata)
 */
export async function addCredit(
  userId: string,
  amount: number,
  transactionType: 'purchase' | 'bonus' | 'refund' | 'admin_adjustment' = 'purchase',
  options?: {
    paymentId?: string;
    adminUserId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{
  success: true;
  newBalance: number;
  newVersion: number;
  transactionId: string;
}> {

  // Get current balance for audit trail
  const { balance: balanceBefore } = await getBalance(userId);

  // Use PostgreSQL function for atomic addition
  const { data, error } = await supabase.rpc('add_user_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_transaction_type: transactionType,
  } as any) as { data: any; error: any };

  if (error) {
    throw new Error(`Failed to add credits: ${error.message}`);
  }

  const result = data[0];

  // Log transaction for audit trail
  const { data: transaction, error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: amount, // Positive for credit
      balance_before: balanceBefore,
      balance_after: result.new_balance,
      transaction_type: transactionType,
      payment_id: options?.paymentId,
      admin_user_id: options?.adminUserId,
      reason: options?.reason,
      metadata: options?.metadata || {},
    } as any)
    .select('id')
    .single() as { data: any; error: any };

  if (txError) {
    console.error('Failed to log credit transaction:', txError);
    // Don't fail the credit addition if transaction logging fails
  }

  return {
    success: true,
    newBalance: result.new_balance,
    newVersion: result.new_version,
    transactionId: transaction?.id || '',
  };
}

// ============================================================================
// Usage Event Logging
// ============================================================================

/**
 * Log a usage event (AI service consumption)
 *
 * @param params - Usage event parameters
 * @returns Created usage event
 */
export async function logUsageEvent(params: {
  userId: string;
  projectId?: string;
  serviceKey: string;
  serviceName: string;
  provider: string;
  units: number;
  unitType: string;
  rawCost: number;
  marginPercent: number;
  billedCost: number;
  metadata?: Record<string, unknown>;
  status?: 'completed' | 'pending' | 'failed';
}): Promise<UsageEvent> {

  const { data, error } = await supabase
    .from('usage_events')
    .insert({
      user_id: params.userId,
      project_id: params.projectId,
      service_key: params.serviceKey,
      service_name: params.serviceName,
      provider: params.provider,
      units: params.units,
      unit_type: params.unitType,
      raw_cost: params.rawCost,
      margin_percent: params.marginPercent,
      billed_cost: params.billedCost,
      metadata: params.metadata || {},
      status: params.status || 'completed',
      processed_at: new Date().toISOString(),
    } as any)
    .select()
    .single() as { data: any; error: any };

  if (error) {
    throw new Error(`Failed to log usage event: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    projectId: data.project_id,
    serviceKey: data.service_key,
    serviceName: data.service_name,
    provider: data.provider,
    units: data.units,
    unitType: data.unit_type,
    rawCost: data.raw_cost,
    marginPercent: data.margin_percent,
    billedCost: data.billed_cost,
    metadata: data.metadata,
    status: data.status,
    createdAt: data.created_at,
  };
}

/**
 * Get usage history for a user with optional filtering
 */
export async function getUsageHistory(
  userId: string,
  filters?: {
    projectId?: string;
    serviceKey?: string;
    provider?: string;
    status?: 'completed' | 'pending' | 'failed' | 'refunded';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ events: UsageEvent[]; total: number }> {

  let query = supabase
    .from('usage_events')
    .select('*, projects:project_id(title)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId);
  }
  if (filters?.serviceKey) {
    query = query.eq('service_key', filters.serviceKey);
  }
  if (filters?.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  // Pagination
  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) {
    throw new Error(`Failed to get usage history: ${error.message}`);
  }

  const events: (UsageEvent & { projectTitle?: string })[] = (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    serviceKey: row.service_key,
    serviceName: row.service_name,
    provider: row.provider,
    units: row.units,
    unitType: row.unit_type,
    rawCost: row.raw_cost,
    marginPercent: row.margin_percent,
    billedCost: row.billed_cost,
    metadata: row.metadata,
    status: row.status,
    createdAt: row.created_at,
    projectTitle: row.projects?.title || undefined,
  }));

  return {
    events,
    total: count || 0,
  };
}

/**
 * Get credit transaction history
 */
export async function getTransactionHistory(
  userId: string,
  filters?: {
    transactionType?: 'purchase' | 'bonus' | 'refund' | 'debit' | 'admin_adjustment';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ transactions: CreditTransaction[]; total: number }> {

  let query = supabase
    .from('credit_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters?.transactionType) {
    query = query.eq('transaction_type', filters.transactionType);
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  // Pagination
  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) {
    throw new Error(`Failed to get transaction history: ${error.message}`);
  }

  const transactions: CreditTransaction[] = (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    transactionType: row.transaction_type,
    usageEventId: row.usage_event_id,
    paymentId: row.payment_id,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));

  return {
    transactions,
    total: count || 0,
  };
}

// ============================================================================
// Admin Utilities
// ============================================================================

/**
 * Get credit summary for all users (admin only)
 */
export async function getAllUserBalances(filters?: {
  minBalance?: number;
  maxBalance?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  users: Array<{
    userId: string;
    balance: number;
    lifetimeCreditsAdded: number;
    lifetimeCreditsSpent: number;
    lastActivity: string;
  }>;
  total: number;
}> {

  let query = supabase
    .from('account_credits')
    .select('user_id, balance, lifetime_credits_added, lifetime_credits_spent, updated_at', {
      count: 'exact',
    })
    .order('balance', { ascending: false });

  // Apply filters
  if (filters?.minBalance !== undefined) {
    query = query.gte('balance', filters.minBalance);
  }
  if (filters?.maxBalance !== undefined) {
    query = query.lte('balance', filters.maxBalance);
  }

  // Pagination
  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query as { data: any[] | null; error: any; count: number | null };

  if (error) {
    throw new Error(`Failed to get all user balances: ${error.message}`);
  }

  const users = (data || []).map((row) => ({
    userId: row.user_id,
    balance: row.balance,
    lifetimeCreditsAdded: row.lifetime_credits_added,
    lifetimeCreditsSpent: row.lifetime_credits_spent,
    lastActivity: row.updated_at,
  }));

  return {
    users,
    total: count || 0,
  };
}

/**
 * Calculate total revenue and costs (admin analytics)
 */
export async function getRevenueAnalytics(filters?: {
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
    }
  >;
}> {

  let query = supabase.from('usage_events').select('*').eq('status', 'completed');

  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  const { data, error } = await query as { data: any[] | null; error: any };

  if (error) {
    throw new Error(`Failed to get revenue analytics: ${error.message}`);
  }

  const events = data || [];

  const totalRevenue = events.reduce((sum, e) => sum + e.billed_cost, 0);
  const totalCosts = events.reduce((sum, e) => sum + e.raw_cost, 0);
  const totalMargin = totalRevenue - totalCosts;
  const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  // Group by provider
  const byProvider: Record<string, any> = {};
  for (const event of events) {
    if (!byProvider[event.provider]) {
      byProvider[event.provider] = {
        revenue: 0,
        costs: 0,
        margin: 0,
        eventCount: 0,
      };
    }
    byProvider[event.provider].revenue += event.billed_cost;
    byProvider[event.provider].costs += event.raw_cost;
    byProvider[event.provider].margin += event.billed_cost - event.raw_cost;
    byProvider[event.provider].eventCount += 1;
  }

  return {
    totalRevenue,
    totalCosts,
    totalMargin,
    marginPercent,
    eventCount: events.length,
    byProvider,
  };
}
