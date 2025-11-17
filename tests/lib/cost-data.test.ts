/**
 * Tests for lib/cost-data.ts
 * Covers cost analysis data helpers
 */

import {
  getCostSummary,
  getCostTrend,
  type Timeframe,
  type CostSummary,
  type MonthlyCost
} from '@/lib/cost-data';

describe('cost-data', () => {
  describe('getCostSummary', () => {
    it('should return cost summary for 30d timeframe', async () => {
      const result = await getCostSummary('30d');

      expect(result).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.previousPeriodCost).toBeGreaterThanOrEqual(0);
      expect(typeof result.changePercent).toBe('number');
      expect(Array.isArray(result.breakdown)).toBe(true);
      expect(Array.isArray(result.monthlyData)).toBe(true);
      expect(Array.isArray(result.topDrivers)).toBe(true);
    });

    it('should return cost summary for quarter timeframe', async () => {
      const result = await getCostSummary('quarter');

      expect(result).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.length).toBeGreaterThan(0);
    });

    it('should return cost summary for ytd timeframe', async () => {
      const result = await getCostSummary('ytd');

      expect(result).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.monthlyData.length).toBeGreaterThan(0);
    });

    it('should have valid breakdown structure', async () => {
      const result = await getCostSummary('30d');

      result.breakdown.forEach(item => {
        expect(item).toHaveProperty('service');
        expect(item).toHaveProperty('amount');
        expect(item).toHaveProperty('percentage');
        expect(item).toHaveProperty('previousPeriodAmount');
        expect(item).toHaveProperty('change');
        expect(typeof item.service).toBe('string');
        expect(typeof item.amount).toBe('number');
        expect(typeof item.percentage).toBe('number');
      });
    });

    it('should have valid monthly data structure', async () => {
      const result = await getCostSummary('30d');

      result.monthlyData.forEach(month => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('total');
        expect(month).toHaveProperty('breakdown');
        expect(typeof month.month).toBe('string');
        expect(typeof month.total).toBe('number');
        expect(month.breakdown).toHaveProperty('transcription');
        expect(month.breakdown).toHaveProperty('diarization');
        expect(month.breakdown).toHaveProperty('hosting');
        expect(month.breakdown).toHaveProperty('storage');
      });
    });

    it('should have valid top drivers structure', async () => {
      const result = await getCostSummary('30d');

      expect(result.topDrivers.length).toBeGreaterThan(0);
      result.topDrivers.forEach(driver => {
        expect(driver).toHaveProperty('name');
        expect(driver).toHaveProperty('cost');
        expect(driver).toHaveProperty('changePercent');
        expect(typeof driver.name).toBe('string');
        expect(typeof driver.cost).toBe('number');
        expect(typeof driver.changePercent).toBe('number');
      });
    });

    it('should calculate percentages correctly', async () => {
      const result = await getCostSummary('30d');

      const totalPercentage = result.breakdown.reduce(
        (sum, item) => sum + item.percentage,
        0
      );

      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('should have consistent total cost', async () => {
      const result = await getCostSummary('30d');

      const calculatedTotal = result.breakdown.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      expect(calculatedTotal).toBeCloseTo(result.totalCost, 2);
    });
  });

  describe('getCostTrend', () => {
    it('should return monthly cost trend for 30d', async () => {
      const result = await getCostTrend('30d');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return monthly cost trend for quarter', async () => {
      const result = await getCostTrend('quarter');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return monthly cost trend for ytd', async () => {
      const result = await getCostTrend('ytd');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have valid trend data structure', async () => {
      const result = await getCostTrend('30d');

      result.forEach(month => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('total');
        expect(month).toHaveProperty('breakdown');
        expect(typeof month.month).toBe('string');
        expect(typeof month.total).toBe('number');
      });
    });

    it('should match data from getCostSummary', async () => {
      const [summary, trend] = await Promise.all([
        getCostSummary('30d'),
        getCostTrend('30d')
      ]);

      expect(trend).toEqual(summary.monthlyData);
    });
  });

  describe('performance', () => {
    it('should complete within reasonable time', async () => {
      const start = Date.now();
      await getCostSummary('30d');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent requests', async () => {
      const promises = [
        getCostSummary('30d'),
        getCostSummary('quarter'),
        getCostSummary('ytd')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.totalCost).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
