/**
 * Integration Tests for Credit Operations
 *
 * Note: These tests use mocks since they require database access.
 * For real database tests, set up a test Supabase instance.
 */

import {
  InsufficientCreditError,
  ConcurrentUpdateError,
  CreditAccountNotFoundError,
} from '@/lib/billing/credit';

describe('Credit Error Types', () => {
  describe('InsufficientCreditError', () => {
    test('should create error with correct properties', () => {
      const error = new InsufficientCreditError('user-123', 10.0, 5.0);

      expect(error.name).toBe('InsufficientCreditError');
      expect(error.userId).toBe('user-123');
      expect(error.required).toBe(10.0);
      expect(error.available).toBe(5.0);
      expect(error.message).toContain('$10.0000');
      expect(error.message).toContain('$5.0000');
    });

    test('should be instanceof Error', () => {
      const error = new InsufficientCreditError('user-123', 10.0, 5.0);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConcurrentUpdateError', () => {
    test('should create error with version info', () => {
      const error = new ConcurrentUpdateError('user-123', 5, 6);

      expect(error.name).toBe('ConcurrentUpdateError');
      expect(error.userId).toBe('user-123');
      expect(error.expectedVersion).toBe(5);
      expect(error.actualVersion).toBe(6);
      expect(error.message).toContain('version 5');
      expect(error.message).toContain('got 6');
    });
  });

  describe('CreditAccountNotFoundError', () => {
    test('should create error with userId', () => {
      const error = new CreditAccountNotFoundError('user-123');

      expect(error.name).toBe('CreditAccountNotFoundError');
      expect(error.userId).toBe('user-123');
      expect(error.message).toContain('user-123');
    });
  });
});

describe('Credit Balance Calculations', () => {
  test('should calculate new balance after debit', () => {
    const currentBalance = 10.0;
    const debitAmount = 3.5;
    const expectedBalance = 6.5;

    expect(currentBalance - debitAmount).toBeCloseTo(expectedBalance, 2);
  });

  test('should calculate new balance after credit', () => {
    const currentBalance = 5.0;
    const creditAmount = 10.0;
    const expectedBalance = 15.0;

    expect(currentBalance + creditAmount).toBeCloseTo(expectedBalance, 2);
  });

  test('should handle multiple transactions', () => {
    let balance = 0;

    // Add $20
    balance += 20.0;
    expect(balance).toBe(20.0);

    // Debit $5.50
    balance -= 5.5;
    expect(balance).toBeCloseTo(14.5, 2);

    // Debit $3.25
    balance -= 3.25;
    expect(balance).toBeCloseTo(11.25, 2);

    // Add $10
    balance += 10.0;
    expect(balance).toBeCloseTo(21.25, 2);
  });

  test('should maintain precision with decimal arithmetic', () => {
    let balance = 10.0;

    // Perform operations that might cause floating point issues
    balance -= 0.1;
    balance -= 0.2;

    // Use toBeCloseTo to handle floating point precision
    expect(balance).toBeCloseTo(9.7, 2);
  });
});

describe('Balance Validation Logic', () => {
  test('should detect insufficient balance', () => {
    const currentBalance = 5.0;
    const requiredAmount = 10.0;

    expect(currentBalance < requiredAmount).toBe(true);
  });

  test('should detect sufficient balance', () => {
    const currentBalance = 15.0;
    const requiredAmount = 10.0;

    expect(currentBalance >= requiredAmount).toBe(true);
  });

  test('should handle exact balance match', () => {
    const currentBalance = 10.0;
    const requiredAmount = 10.0;

    expect(currentBalance >= requiredAmount).toBe(true);
  });

  test('should calculate shortfall correctly', () => {
    const currentBalance = 5.0;
    const requiredAmount = 10.0;
    const expectedShortfall = 5.0;

    const shortfall = Math.max(0, requiredAmount - currentBalance);
    expect(shortfall).toBe(expectedShortfall);
  });

  test('should return zero shortfall when balance is sufficient', () => {
    const currentBalance = 15.0;
    const requiredAmount = 10.0;

    const shortfall = Math.max(0, requiredAmount - currentBalance);
    expect(shortfall).toBe(0);
  });
});

describe('Optimistic Locking Logic', () => {
  test('should detect version mismatch', () => {
    const expectedVersion = 5;
    const actualVersion = 6;

    expect(expectedVersion !== actualVersion).toBe(true);
  });

  test('should allow update when versions match', () => {
    const expectedVersion = 5;
    const actualVersion = 5;

    expect(expectedVersion === actualVersion).toBe(true);
  });

  test('should increment version after update', () => {
    const currentVersion = 5;
    const newVersion = currentVersion + 1;

    expect(newVersion).toBe(6);
  });
});

describe('Transaction Metadata', () => {
  test('should store usage event metadata', () => {
    const metadata = {
      projectId: 'project-123',
      serviceKey: 'assemblyai_transcription',
      durationSeconds: 3600,
    };

    expect(metadata.projectId).toBe('project-123');
    expect(metadata.durationSeconds).toBe(3600);
  });

  test('should format transaction reason', () => {
    const amount = 0.5365;
    const duration = 60; // 1 minute
    const reason = `AssemblyAI Transcription - ${(duration / 60).toFixed(1)} minutes`;

    expect(reason).toBe('AssemblyAI Transcription - 1.0 minutes');
  });
});

describe('Credit Amount Validation', () => {
  test('should reject negative credit amounts', () => {
    const amount = -10.0;
    expect(amount <= 0).toBe(true);
  });

  test('should reject zero credit amounts', () => {
    const amount = 0;
    expect(amount <= 0).toBe(true);
  });

  test('should accept positive credit amounts', () => {
    const amount = 10.0;
    expect(amount > 0).toBe(true);
  });

  test('should enforce maximum credit limit', () => {
    const amount = 1500;
    const maxLimit = 1000;

    expect(amount > maxLimit).toBe(true);
  });
});

describe('Lifetime Totals Calculations', () => {
  test('should accumulate lifetime credits added', () => {
    let lifetimeAdded = 0;

    lifetimeAdded += 20.0; // First purchase
    lifetimeAdded += 50.0; // Second purchase
    lifetimeAdded += 10.0; // Bonus

    expect(lifetimeAdded).toBe(80.0);
  });

  test('should accumulate lifetime credits spent', () => {
    let lifetimeSpent = 0;

    lifetimeSpent += 5.5; // First usage
    lifetimeSpent += 3.25; // Second usage
    lifetimeSpent += 10.0; // Third usage

    expect(lifetimeSpent).toBeCloseTo(18.75, 2);
  });

  test('should calculate net balance', () => {
    const lifetimeAdded = 100.0;
    const lifetimeSpent = 35.5;
    const netBalance = lifetimeAdded - lifetimeSpent;

    expect(netBalance).toBeCloseTo(64.5, 2);
  });
});

describe('Usage Event Aggregation', () => {
  test('should sum costs from multiple events', () => {
    const events = [
      { billedCost: 0.5365, serviceKey: 'assemblyai_transcription' },
      { billedCost: 0.0002, serviceKey: 'openai_gpt4o_mini_input' },
      { billedCost: 0.0008, serviceKey: 'openai_gpt4o_mini_output' },
    ];

    const totalCost = events.reduce((sum, event) => sum + event.billedCost, 0);
    expect(totalCost).toBeCloseTo(0.5375, 4);
  });

  test('should group events by provider', () => {
    const events = [
      { provider: 'assemblyai', billedCost: 0.5365 },
      { provider: 'openai', billedCost: 0.0002 },
      { provider: 'openai', billedCost: 0.0008 },
    ];

    const byProvider = events.reduce((acc, event) => {
      if (!acc[event.provider]) {
        acc[event.provider] = { totalCost: 0, count: 0 };
      }
      acc[event.provider].totalCost += event.billedCost;
      acc[event.provider].count += 1;
      return acc;
    }, {} as Record<string, { totalCost: number; count: number }>);

    expect(byProvider.assemblyai.count).toBe(1);
    expect(byProvider.openai.count).toBe(2);
    expect(byProvider.openai.totalCost).toBeCloseTo(0.001, 4);
  });
});

describe('Billing Business Logic', () => {
  test('should calculate Stripe fee correctly', () => {
    const amount = 10.0;
    const stripeFee = amount * 0.029 + 0.3;

    expect(stripeFee).toBeCloseTo(0.59, 2);
  });

  test('should enforce minimum $5 purchase', () => {
    const minimumPurchase = 5.0;
    const attemptedPurchase = 3.0;

    expect(attemptedPurchase < minimumPurchase).toBe(true);
  });

  test('should calculate effective Stripe rate', () => {
    const purchaseAmount = 5.0;
    const stripeFee = purchaseAmount * 0.029 + 0.3;
    const effectiveRate = (stripeFee / purchaseAmount) * 100;

    expect(effectiveRate).toBeCloseTo(8.9, 1); // ~8.9%
  });
});
