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
  reservationId?: string;
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

export interface BillingReservation {
  id: string;
  userId: string;
  projectId?: string;
  workflowType: string;
  status: 'pending' | 'active' | 'settling' | 'settled' | 'released' | 'expired' | 'failed';
  reservedAmount: number;
  settledAmount: number;
  releasedAmount: number;
  currency: string;
  metadata: Record<string, unknown>;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionType: 'purchase' | 'bonus' | 'refund' | 'debit' | 'admin_adjustment' | 'reserve' | 'release' | 'settle';
  usageEventId?: string;
  reservationId?: string;
  paymentId?: string;
  invoiceNumber?: string; // Stripe invoice ID — only present on purchases/refunds, never on debits
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class ReservationNotFoundError extends Error {
  constructor(public readonly reservationId: string) {
    super(`Billing reservation not found: ${reservationId}`);
    this.name = 'ReservationNotFoundError';
  }
}

export class ReservationStateError extends Error {
  constructor(
    public readonly reservationId: string,
    public readonly status: string,
    message?: string
  ) {
    super(message || `Billing reservation ${reservationId} is in invalid state: ${status}`);
    this.name = 'ReservationStateError';
  }
}

export class ReservationOverrunError extends Error {
  constructor(
    public readonly reservationId: string,
    public readonly reserved: number,
    public readonly actual: number
  ) {
    super(`Reservation ${reservationId} actual cost $${actual.toFixed(4)} exceeds reserved $${reserved.toFixed(4)}`);
    this.name = 'ReservationOverrunError';
  }
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
    transactionType?: 'debit' | 'refund';
    invoiceNumber?: string;
  }
): Promise<{
  success: true;
  newBalance: number;
  newVersion: number;
  transactionId: string;
}> {
  let balance = 0;
  let version = 0;
  let result: any = null;
  let lastVersionError: ConcurrentUpdateError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    ({ balance, version } = await getBalance(userId));

    const { data, error } = await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_current_version: version,
    } as any) as { data: any; error: any };

    if (error) {
      throw new Error(`Failed to debit credits: ${error.message}`);
    }

    result = data[0];

    if (result.success) {
      break;
    }

    if (result.error_message?.includes('not found')) {
      throw new CreditAccountNotFoundError(userId);
    }
    if (result.error_message?.includes('Insufficient credits')) {
      throw new InsufficientCreditError(userId, amount, result.new_balance);
    }
    if (result.error_message?.includes('Version mismatch')) {
      lastVersionError = new ConcurrentUpdateError(userId, version, result.new_version);
      continue;
    }
    throw new Error(result.error_message || 'Unknown debit error');
  }

  if (!result?.success) {
    throw lastVersionError || new Error('Unknown debit error');
  }

  // Log transaction for audit trail
  const { data: transaction, error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: -amount, // Negative for debit
      balance_before: balance,
      balance_after: result.new_balance,
      transaction_type: options?.transactionType || 'debit',
      usage_event_id: usageEventId,
      reservation_id: options?.metadata?.reservationId,
      invoice_number: options?.invoiceNumber,
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
    invoiceNumber?: string;
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
      invoice_number: options?.invoiceNumber,
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
  projectTitle?: string;
  reservationId?: string;
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
  workflowStep?: string;
}): Promise<UsageEvent> {

  // Snapshot the project title so it survives project deletion (FK ON DELETE SET NULL)
  let resolvedProjectTitle = params.projectTitle;
  if (params.projectId && !resolvedProjectTitle) {
    const { data: proj } = await supabase
      .from('projects')
      .select('title')
      .eq('id', params.projectId)
      .maybeSingle() as { data: any };
    resolvedProjectTitle = proj?.title ?? undefined;
  }

  const { data, error } = await supabase
    .from('usage_events')
    .insert({
      user_id: params.userId,
      project_id: params.projectId,
      reservation_id: params.reservationId,
      project_title: resolvedProjectTitle ?? null,
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
      workflow_step: params.workflowStep || null,
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
    reservationId: data.reservation_id,
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
    projectTitle: row.projects?.title || row.project_title || undefined,
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
    transactionType?: 'purchase' | 'bonus' | 'refund' | 'debit' | 'admin_adjustment' | 'reserve' | 'release' | 'settle';
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
    reservationId: row.reservation_id,
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number || undefined,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));

  return {
    transactions,
    total: count || 0,
  };
}

function mapReservationRow(row: any): BillingReservation {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    workflowType: row.workflow_type,
    status: row.status,
    reservedAmount: Number(row.reserved_amount || 0),
    settledAmount: Number(row.settled_amount || 0),
    releasedAmount: Number(row.released_amount || 0),
    currency: row.currency || 'USD',
    metadata: row.metadata || {},
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function runBalanceRpc(
  rpcName: 'reserve_user_credits' | 'release_reserved_credits' | 'settle_reserved_credits',
  userId: string,
  amount: number
) {
  let balance = 0;
  let version = 0;
  let result: any = null;
  let lastVersionError: ConcurrentUpdateError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    ({ balance, version } = await getBalance(userId));

    const { data, error } = await supabase.rpc(rpcName, {
      p_user_id: userId,
      p_amount: amount,
      p_current_version: version,
    } as any) as { data: any; error: any };

    if (error) {
      throw new Error(`Failed to ${rpcName}: ${error.message}`);
    }

    result = data[0];
    if (result.success) {
      return { balanceBefore: balance, result };
    }

    if (result.error_message?.includes('not found')) {
      throw new CreditAccountNotFoundError(userId);
    }
    if (result.error_message?.includes('Insufficient credits')) {
      throw new InsufficientCreditError(userId, amount, result.new_balance);
    }
    if (result.error_message?.includes('Version mismatch')) {
      lastVersionError = new ConcurrentUpdateError(userId, version, result.new_version);
      continue;
    }
    throw new Error(result.error_message || `Unknown ${rpcName} error`);
  }

  throw lastVersionError || new Error(`Unknown ${rpcName} error`);
}

export async function getReservation(reservationId: string): Promise<BillingReservation> {
  const { data, error } = await supabase
    .from('billing_reservations')
    .select('*')
    .eq('id', reservationId)
    .single() as { data: any; error: any };

  if (error || !data) {
    throw new ReservationNotFoundError(reservationId);
  }

  return mapReservationRow(data);
}

export async function createReservation(params: {
  userId: string;
  projectId?: string;
  workflowType: string;
  amount: number;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}): Promise<BillingReservation> {
  const amount = Number(params.amount.toFixed(4));
  const { balanceBefore, result } = await runBalanceRpc('reserve_user_credits', params.userId, amount);

  try {
    const { data, error } = await supabase
      .from('billing_reservations')
      .insert({
        user_id: params.userId,
        project_id: params.projectId || null,
        workflow_type: params.workflowType,
        status: 'active',
        reserved_amount: amount,
        settled_amount: 0,
        released_amount: 0,
        metadata: params.metadata || {},
        expires_at: params.expiresAt || null,
      } as any)
      .select('*')
      .single() as { data: any; error: any };

    if (error || !data) {
      throw new Error(error?.message || 'Failed to create billing reservation');
    }

    await supabase.from('credit_transactions').insert({
      user_id: params.userId,
      amount: -amount,
      balance_before: balanceBefore,
      balance_after: result.new_balance,
      transaction_type: 'reserve',
      reservation_id: data.id,
      reason: `Reserved funds for ${params.workflowType}`,
      metadata: params.metadata || {},
    } as any);

    return mapReservationRow(data);
  } catch (error) {
    try {
      await runBalanceRpc('release_reserved_credits', params.userId, amount);
    } catch (rollbackError) {
      console.error('[BILLING] Failed to rollback reservation hold after insert error:', rollbackError);
    }
    throw error;
  }
}

async function releaseHeldAmount(
  reservation: BillingReservation,
  amount: number,
  reason: string,
  nextStatus: BillingReservation['status']
): Promise<BillingReservation> {
  const releaseAmount = Number(Math.max(0, amount).toFixed(4));
  if (releaseAmount <= 0) {
    const { data } = await supabase
      .from('billing_reservations')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      } as any)
      .eq('id', reservation.id)
      .select('*')
      .single() as { data: any };
    return mapReservationRow(data);
  }

  const { balanceBefore, result } = await runBalanceRpc('release_reserved_credits', reservation.userId, releaseAmount);
  const updatedReleased = Number((reservation.releasedAmount + releaseAmount).toFixed(4));

  const { data, error } = await supabase
    .from('billing_reservations')
    .update({
      status: nextStatus,
      released_amount: updatedReleased,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    } as any)
    .eq('id', reservation.id)
    .select('*')
    .single() as { data: any; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update released reservation');
  }

  await supabase.from('credit_transactions').insert({
    user_id: reservation.userId,
    amount: releaseAmount,
    balance_before: balanceBefore,
    balance_after: result.new_balance,
    transaction_type: 'release',
    reservation_id: reservation.id,
    reason,
    metadata: reservation.metadata || {},
  } as any);

  return mapReservationRow(data);
}

async function extendReservationHold(
  reservation: BillingReservation,
  amount: number,
  reason: string
): Promise<BillingReservation> {
  const extraAmount = Number(Math.max(0, amount).toFixed(4));
  if (extraAmount <= 0) {
    return reservation;
  }

  const { balanceBefore, result } = await runBalanceRpc('reserve_user_credits', reservation.userId, extraAmount);

  try {
    const { data, error } = await supabase
      .from('billing_reservations')
      .update({
        reserved_amount: Number((reservation.reservedAmount + extraAmount).toFixed(4)),
        updated_at: new Date().toISOString(),
        metadata: {
          ...(reservation.metadata || {}),
          supplementalReserveAmount: Number((
            Number((reservation.metadata as any)?.supplementalReserveAmount || 0) + extraAmount
          ).toFixed(4)),
        },
      } as any)
      .eq('id', reservation.id)
      .select('*')
      .single() as { data: any; error: any };

    if (error || !data) {
      throw new Error(error?.message || 'Failed to extend reservation hold');
    }

    await supabase.from('credit_transactions').insert({
      user_id: reservation.userId,
      amount: -extraAmount,
      balance_before: balanceBefore,
      balance_after: result.new_balance,
      transaction_type: 'reserve',
      reservation_id: reservation.id,
      reason,
      metadata: {
        ...(reservation.metadata || {}),
        supplementalReserveAmount: extraAmount,
      },
    } as any);

    return mapReservationRow(data);
  } catch (error) {
    try {
      await runBalanceRpc('release_reserved_credits', reservation.userId, extraAmount);
    } catch (rollbackError) {
      console.error('[BILLING] Failed to rollback supplemental reservation hold:', rollbackError);
    }
    throw error;
  }
}

async function ensureReservationCoverage(
  reservation: BillingReservation,
  actualCost: number
): Promise<BillingReservation> {
  if (actualCost <= reservation.reservedAmount + 0.0001) {
    return reservation;
  }

  const extraAmount = Number((actualCost - reservation.reservedAmount).toFixed(4));

  try {
    return await extendReservationHold(
      reservation,
      extraAmount,
      `Supplemental reserve for ${reservation.workflowType}`
    );
  } catch (error) {
    await supabase
      .from('billing_reservations')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(reservation.metadata || {}),
          actualCost,
          overrun: extraAmount,
        },
      } as any)
      .eq('id', reservation.id);

    throw error;
  }
}

export async function releaseReservation(
  reservationId: string,
  reason: string = 'Released unused reserved funds'
): Promise<BillingReservation> {
  const reservation = await getReservation(reservationId);
  if (!['active', 'pending', 'failed', 'expired'].includes(reservation.status)) {
    if (['released', 'settled'].includes(reservation.status)) {
      return reservation;
    }
    throw new ReservationStateError(reservationId, reservation.status);
  }

  const releasable = reservation.reservedAmount - reservation.settledAmount - reservation.releasedAmount;
  return releaseHeldAmount(reservation, releasable, reason, reservation.status === 'expired' ? 'expired' : 'released');
}

export async function attachUsageEventsToReservation(
  reservationId: string,
  usageEventIds: string[]
): Promise<void> {
  const ids = usageEventIds.filter(Boolean);
  if (!ids.length) return;

  const { error } = await supabase
    .from('usage_events')
    .update({
      reservation_id: reservationId,
    } as any)
    .in('id', ids);

  if (error) {
    throw new Error(`Failed to attach usage events to reservation: ${error.message}`);
  }
}

export async function failReservation(
  reservationId: string,
  reason: string,
  options?: { releaseUnused?: boolean }
): Promise<BillingReservation> {
  const reservation = await getReservation(reservationId);
  const releaseUnused = options?.releaseUnused ?? true;

  await supabase
    .from('usage_events')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
    } as any)
    .eq('reservation_id', reservationId)
    .eq('status', 'pending');

  if (releaseUnused) {
    const updated = await releaseHeldAmount(reservation, reservation.reservedAmount - reservation.settledAmount - reservation.releasedAmount, reason, 'failed');
    return updated;
  }

  const { data, error } = await supabase
    .from('billing_reservations')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        ...(reservation.metadata || {}),
        failureReason: reason,
      },
    } as any)
    .eq('id', reservationId)
    .select('*')
    .single() as { data: any; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to fail reservation');
  }

  return mapReservationRow(data);
}

export async function settleReservation(reservationId: string): Promise<BillingReservation> {
  let reservation = await getReservation(reservationId);
  if (reservation.status === 'settled' || reservation.status === 'released') {
    return reservation;
  }
  if (!['active', 'settling'].includes(reservation.status)) {
    throw new ReservationStateError(reservationId, reservation.status);
  }

  await supabase
    .from('billing_reservations')
    .update({
      status: 'settling',
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', reservationId);

  const { data: usageRows, error: usageError } = await supabase
    .from('usage_events')
    .select('id, billed_cost, status')
    .eq('reservation_id', reservationId) as { data: any[] | null; error: any };

  if (usageError) {
    throw new Error(`Failed to load usage for settlement: ${usageError.message}`);
  }

  const actualCost = Number(
    ((usageRows || [])
      .filter((row) => row.status !== 'failed')
      .reduce((sum, row) => sum + Number(row.billed_cost || 0), 0))
      .toFixed(4)
  );

  reservation = await ensureReservationCoverage(reservation, actualCost);

  const releaseAmount = Number((reservation.reservedAmount - actualCost).toFixed(4));
  const updatedReservation = await releaseHeldAmount(reservation, releaseAmount, `Release unused funds for ${reservation.workflowType}`, 'settling');

  if (actualCost > 0) {
    const { balanceBefore, result } = await runBalanceRpc('settle_reserved_credits', reservation.userId, actualCost);
    await supabase.from('credit_transactions').insert({
      user_id: reservation.userId,
      amount: 0,
      balance_before: balanceBefore,
      balance_after: result.new_balance,
      transaction_type: 'settle',
      reservation_id: reservationId,
      reason: `Settled funds for ${reservation.workflowType}`,
      metadata: {
        ...(updatedReservation.metadata || {}),
        settledAmount: actualCost,
      },
    } as any);
  }

  await supabase
    .from('usage_events')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
    } as any)
    .eq('reservation_id', reservationId)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from('billing_reservations')
    .update({
      status: actualCost > 0 ? 'settled' : 'released',
      settled_amount: actualCost,
      released_amount: updatedReservation.releasedAmount,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    } as any)
    .eq('id', reservationId)
    .select('*')
    .single() as { data: any; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to finalize reservation settlement');
  }

  return mapReservationRow(data);
}

export async function settleReservationAmount(
  reservationId: string,
  actualCost: number,
  usageEventIds: string[] = []
): Promise<BillingReservation> {
  let reservation = await getReservation(reservationId);
  if (reservation.status === 'settled' || reservation.status === 'released') {
    return reservation;
  }
  if (!['active', 'settling'].includes(reservation.status)) {
    throw new ReservationStateError(reservationId, reservation.status);
  }

  const normalizedCost = Number(Math.max(0, actualCost).toFixed(4));
  reservation = await ensureReservationCoverage(reservation, normalizedCost);

  if (usageEventIds.length > 0) {
    await attachUsageEventsToReservation(reservationId, usageEventIds);
  }

  const releaseAmount = Number((reservation.reservedAmount - normalizedCost).toFixed(4));
  const updatedReservation = await releaseHeldAmount(reservation, releaseAmount, `Release unused funds for ${reservation.workflowType}`, 'settling');

  if (normalizedCost > 0) {
    const { balanceBefore, result } = await runBalanceRpc('settle_reserved_credits', reservation.userId, normalizedCost);
    await supabase.from('credit_transactions').insert({
      user_id: reservation.userId,
      amount: 0,
      balance_before: balanceBefore,
      balance_after: result.new_balance,
      transaction_type: 'settle',
      reservation_id: reservationId,
      reason: `Settled funds for ${reservation.workflowType}`,
      metadata: {
        ...(updatedReservation.metadata || {}),
        settledAmount: normalizedCost,
        usageEventIds,
      },
    } as any);
  }

  await supabase
    .from('usage_events')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
    } as any)
    .eq('reservation_id', reservationId)
    .neq('status', 'failed');

  const { data, error } = await supabase
    .from('billing_reservations')
    .update({
      status: normalizedCost > 0 ? 'settled' : 'released',
      settled_amount: normalizedCost,
      released_amount: updatedReservation.releasedAmount,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    } as any)
    .eq('id', reservationId)
    .select('*')
    .single() as { data: any; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to finalize explicit reservation settlement');
  }

  return mapReservationRow(data);
}

export async function reconcileBillingReservations(options?: {
  limit?: number;
  staleActiveMinutes?: number;
  staleSettlingMinutes?: number;
}): Promise<{
  scanned: number;
  expired: number;
  settled: number;
  failed: number;
  errors: Array<{ reservationId: string; error: string }>;
}> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const staleActiveMinutes = Math.max(options?.staleActiveMinutes ?? 120, 5);
  const staleSettlingMinutes = Math.max(options?.staleSettlingMinutes ?? 15, 1);
  const now = Date.now();
  const activeCutoff = new Date(now - staleActiveMinutes * 60 * 1000).toISOString();
  const settlingCutoff = new Date(now - staleSettlingMinutes * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('billing_reservations')
    .select('*')
    .in('status', ['active', 'settling'])
    .order('updated_at', { ascending: true })
    .limit(limit) as { data: any[] | null; error: any };

  if (error) {
    throw new Error(`Failed to load billing reservations for reconciliation: ${error.message}`);
  }

  const result = {
    scanned: rows?.length || 0,
    expired: 0,
    settled: 0,
    failed: 0,
    errors: [] as Array<{ reservationId: string; error: string }>,
  };

  for (const row of rows || []) {
    const reservation = mapReservationRow(row);
    try {
      const expiresAt = reservation.expiresAt ? new Date(reservation.expiresAt).getTime() : null;
      const isExpired = expiresAt !== null && expiresAt <= now;
      const hasStaleActive = reservation.status === 'active' && reservation.updatedAt <= activeCutoff;
      const hasStaleSettling = reservation.status === 'settling' && reservation.updatedAt <= settlingCutoff;

      if (reservation.status === 'active' && (isExpired || hasStaleActive)) {
        const { data: pendingUsage } = await supabase
          .from('usage_events')
          .select('id')
          .eq('reservation_id', reservation.id)
          .eq('status', 'pending')
          .limit(1) as { data: any[] | null };

        if ((pendingUsage || []).length > 0) {
          await settleReservation(reservation.id);
          result.settled += 1;
        } else {
          await failReservation(reservation.id, isExpired ? 'Reservation expired before settlement' : 'Reconciler released stale reservation');
          result.expired += 1;
        }
        continue;
      }

      if (reservation.status === 'settling' && hasStaleSettling) {
        await settleReservation(reservation.id);
        result.settled += 1;
      }
    } catch (reconcileError: any) {
      result.failed += 1;
      result.errors.push({
        reservationId: reservation.id,
        error: reconcileError?.message || String(reconcileError),
      });
    }
  }

  return result;
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
