const mockRpc = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

describe('addStripePurchaseCredit', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
  });

  it('grants Stripe purchase credits through the transactional idempotency RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        success: true,
        already_processed: false,
        new_balance: '42.5000',
        new_version: 7,
        transaction_id: 'tx-1',
      }],
      error: null,
    });

    const { addStripePurchaseCredit } = await import('@/lib/billing/credit');
    const result = await addStripePurchaseCredit({
      userId: 'user-1',
      amount: 25,
      paymentId: 'pi_123',
      sessionId: 'cs_123',
      invoiceNumber: 'INV-123',
      reason: 'Stripe purchase',
      metadata: { packageId: 'starter' },
    });

    expect(mockRpc).toHaveBeenCalledWith('grant_stripe_purchase_credits', {
      p_user_id: 'user-1',
      p_amount: 25,
      p_payment_id: 'pi_123',
      p_session_id: 'cs_123',
      p_invoice_number: 'INV-123',
      p_reason: 'Stripe purchase',
      p_metadata: { packageId: 'starter' },
    });
    expect(result).toEqual({
      success: true,
      alreadyProcessed: false,
      newBalance: 42.5,
      newVersion: 7,
      transactionId: 'tx-1',
    });
  });

  it('returns alreadyProcessed without pretending a new credit grant occurred', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        success: true,
        already_processed: true,
        new_balance: '42.5000',
        new_version: null,
        transaction_id: 'tx-existing',
      }],
      error: null,
    });

    const { addStripePurchaseCredit } = await import('@/lib/billing/credit');
    const result = await addStripePurchaseCredit({
      userId: 'user-1',
      amount: 25,
      paymentId: 'pi_123',
      sessionId: 'cs_123',
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.transactionId).toBe('tx-existing');
    expect(result.newBalance).toBe(42.5);
  });
});
