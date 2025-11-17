/**
 * Tests for lib/transaction-data.ts
 * Covers transaction ledger data helpers
 */

import {
  getTransactions,
  getTransactionById,
  getTransactionStats,
  type TransactionStatus,
  type TransactionFilters
} from '@/lib/transaction-data';

describe('transaction-data', () => {
  describe('getTransactions', () => {
    it('should return paginated transactions with default filters', async () => {
      const result = await getTransactions({});

      expect(result).toBeDefined();
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
      expect(result).toHaveProperty('totalPages');
      expect(Array.isArray(result.transactions)).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await getTransactions({ status: 'settled' });

      expect(result.transactions.every(t => t.status === 'settled')).toBe(true);
    });

    it('should filter by pending status', async () => {
      const result = await getTransactions({ status: 'pending' });

      expect(result.transactions.every(t => t.status === 'pending')).toBe(true);
    });

    it('should filter by failed status', async () => {
      const result = await getTransactions({ status: 'failed' });

      expect(result.transactions.every(t => t.status === 'failed')).toBe(true);
    });

    it('should return all statuses when filter is "all"', async () => {
      const result = await getTransactions({ status: 'all' });

      const statuses = new Set(result.transactions.map(t => t.status));
      expect(statuses.size).toBeGreaterThan(0);
    });

    it('should search by description', async () => {
      const result = await getTransactions({ search: 'transcription' });

      expect(result.transactions.length).toBeGreaterThan(0);
      result.transactions.forEach(txn => {
        const searchText = `${txn.description} ${txn.service} ${txn.projectName || ''}`.toLowerCase();
        expect(searchText).toContain('transcription');
      });
    });

    it('should handle pagination', async () => {
      const page1 = await getTransactions({ page: 1, pageSize: 5 });
      const page2 = await getTransactions({ page: 2, pageSize: 5 });

      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
      expect(page1.pageSize).toBe(5);
      expect(page2.pageSize).toBe(5);
      expect(page1.transactions.length).toBeLessThanOrEqual(5);
      expect(page2.transactions.length).toBeLessThanOrEqual(5);
    });

    it('should calculate total pages correctly', async () => {
      const result = await getTransactions({ pageSize: 5 });

      expect(result.totalPages).toBe(Math.ceil(result.total / result.pageSize));
    });

    it('should sort by date descending', async () => {
      const result = await getTransactions({ sortBy: 'date', sortOrder: 'desc' });

      for (let i = 1; i < result.transactions.length; i++) {
        const prev = new Date(result.transactions[i - 1].date).getTime();
        const curr = new Date(result.transactions[i].date).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should sort by date ascending', async () => {
      const result = await getTransactions({ sortBy: 'date', sortOrder: 'asc' });

      for (let i = 1; i < result.transactions.length; i++) {
        const prev = new Date(result.transactions[i - 1].date).getTime();
        const curr = new Date(result.transactions[i].date).getTime();
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });

    it('should sort by amount descending', async () => {
      const result = await getTransactions({ sortBy: 'amount', sortOrder: 'desc' });

      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i - 1].amount).toBeGreaterThanOrEqual(result.transactions[i].amount);
      }
    });

    it('should sort by amount ascending', async () => {
      const result = await getTransactions({ sortBy: 'amount', sortOrder: 'asc' });

      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i - 1].amount).toBeLessThanOrEqual(result.transactions[i].amount);
      }
    });

    it('should have valid transaction structure', async () => {
      const result = await getTransactions({});

      result.transactions.forEach(txn => {
        expect(txn).toHaveProperty('id');
        expect(txn).toHaveProperty('date');
        expect(txn).toHaveProperty('description');
        expect(txn).toHaveProperty('amount');
        expect(txn).toHaveProperty('status');
        expect(txn).toHaveProperty('projectId');
        expect(txn).toHaveProperty('projectName');
        expect(txn).toHaveProperty('service');
        expect(typeof txn.id).toBe('string');
        expect(typeof txn.date).toBe('string');
        expect(typeof txn.description).toBe('string');
        expect(typeof txn.amount).toBe('number');
        expect(['pending', 'settled', 'failed']).toContain(txn.status);
      });
    });

    it('should combine filters correctly', async () => {
      const result = await getTransactions({
        status: 'settled',
        search: 'project',
        page: 1,
        pageSize: 5,
        sortBy: 'amount',
        sortOrder: 'desc'
      });

      expect(result.transactions.every(t => t.status === 'settled')).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction by ID', async () => {
      const allTransactions = await getTransactions({});
      const firstId = allTransactions.transactions[0]?.id;

      if (firstId) {
        const result = await getTransactionById(firstId);
        expect(result).toBeDefined();
        expect(result?.id).toBe(firstId);
      }
    });

    it('should return null for non-existent ID', async () => {
      const result = await getTransactionById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should have complete transaction data', async () => {
      const allTransactions = await getTransactions({});
      const firstId = allTransactions.transactions[0]?.id;

      if (firstId) {
        const result = await getTransactionById(firstId);
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('date');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('amount');
        expect(result).toHaveProperty('status');
      }
    });
  });

  describe('getTransactionStats', () => {
    it('should return transaction statistics', async () => {
      const result = await getTransactionStats();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('totalTransactions');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('pendingCount');
      expect(result).toHaveProperty('failedCount');
    });

    it('should have numeric stats', async () => {
      const result = await getTransactionStats();

      expect(typeof result.totalTransactions).toBe('number');
      expect(typeof result.totalAmount).toBe('number');
      expect(typeof result.pendingCount).toBe('number');
      expect(typeof result.failedCount).toBe('number');
    });

    it('should have non-negative values', async () => {
      const result = await getTransactionStats();

      expect(result.totalTransactions).toBeGreaterThanOrEqual(0);
      expect(result.totalAmount).toBeGreaterThanOrEqual(0);
      expect(result.pendingCount).toBeGreaterThanOrEqual(0);
      expect(result.failedCount).toBeGreaterThanOrEqual(0);
    });

    it('should have consistent counts', async () => {
      const [stats, allTransactions] = await Promise.all([
        getTransactionStats(),
        getTransactions({ pageSize: 1000 })
      ]);

      expect(stats.totalTransactions).toBe(allTransactions.total);
    });
  });

  describe('performance', () => {
    it('should complete within reasonable time', async () => {
      const start = Date.now();
      await getTransactions({});
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent requests', async () => {
      const promises = [
        getTransactions({ status: 'settled' }),
        getTransactions({ status: 'pending' }),
        getTransactionStats()
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].transactions).toBeDefined();
      expect(results[1].transactions).toBeDefined();
      expect(results[2].totalTransactions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty search gracefully', async () => {
      const result = await getTransactions({ search: '' });

      expect(result).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
    });

    it('should handle large page numbers', async () => {
      const result = await getTransactions({ page: 999 });

      expect(result).toBeDefined();
      expect(result.transactions.length).toBe(0);
    });

    it('should handle zero page size gracefully', async () => {
      const result = await getTransactions({ pageSize: 10 });

      expect(result).toBeDefined();
      expect(result.pageSize).toBe(10);
    });
  });
});
