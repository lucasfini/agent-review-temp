/**
 * Tests for lib/usage-data.ts
 * Covers usage metrics data helpers
 */

import {
  getUsageMetrics,
  getUsageTrend,
  getProjectFilters,
  type UsageTimeframe,
  type UsageMetrics,
  type UsageTrend
} from '@/lib/usage-data';

describe('usage-data', () => {
  describe('getUsageMetrics', () => {
    it('should return usage metrics for 7d timeframe', async () => {
      const result = await getUsageMetrics('7d', 'all');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('minutesProcessed');
      expect(result).toHaveProperty('filesUploaded');
      expect(result).toHaveProperty('avgProcessingTime');
      expect(result).toHaveProperty('totalStorage');
      expect(result).toHaveProperty('activeProjects');
    });

    it('should return usage metrics for 30d timeframe', async () => {
      const result = await getUsageMetrics('30d', 'all');

      expect(result).toBeDefined();
      expect(typeof result.minutesProcessed).toBe('number');
      expect(typeof result.filesUploaded).toBe('number');
      expect(typeof result.avgProcessingTime).toBe('number');
    });

    it('should return usage metrics for 90d timeframe', async () => {
      const result = await getUsageMetrics('90d', 'all');

      expect(result).toBeDefined();
      expect(result.minutesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should filter by specific project', async () => {
      const result = await getUsageMetrics('30d', 'proj-001');

      expect(result).toBeDefined();
      expect(result.minutesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should have all required numeric fields', async () => {
      const result = await getUsageMetrics('30d', 'all');

      expect(result.minutesProcessed).toBeGreaterThanOrEqual(0);
      expect(result.filesUploaded).toBeGreaterThanOrEqual(0);
      expect(result.avgProcessingTime).toBeGreaterThan(0);
      expect(result.totalStorage).toBeGreaterThanOrEqual(0);
      expect(result.activeProjects).toBeGreaterThan(0);
    });

    it('should have reasonable metric values', async () => {
      const result = await getUsageMetrics('30d', 'all');

      expect(result.avgProcessingTime).toBeGreaterThan(0);
      expect(result.avgProcessingTime).toBeLessThan(1000);
      expect(result.activeProjects).toBeGreaterThan(0);
      expect(result.activeProjects).toBeLessThan(1000);
    });
  });

  describe('getUsageTrend', () => {
    it('should return trend data for 7d', async () => {
      const result = await getUsageTrend('7d', 'all');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return trend data for 30d', async () => {
      const result = await getUsageTrend('30d', 'all');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return trend data for 90d', async () => {
      const result = await getUsageTrend('90d', 'all');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have valid trend structure', async () => {
      const result = await getUsageTrend('30d', 'all');

      result.forEach(day => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('minutesProcessed');
        expect(day).toHaveProperty('filesUploaded');
        expect(day).toHaveProperty('avgProcessingTime');
        expect(typeof day.date).toBe('string');
        expect(typeof day.minutesProcessed).toBe('number');
        expect(typeof day.filesUploaded).toBe('number');
        expect(typeof day.avgProcessingTime).toBe('number');
      });
    });

    it('should have correct number of data points', async () => {
      const result7d = await getUsageTrend('7d', 'all');
      const result30d = await getUsageTrend('30d', 'all');
      const result90d = await getUsageTrend('90d', 'all');

      expect(result7d.length).toBeLessThanOrEqual(7);
      expect(result30d.length).toBeLessThanOrEqual(30);
      expect(result90d.length).toBeLessThanOrEqual(90);
    });

    it('should filter by project', async () => {
      const result = await getUsageTrend('30d', 'proj-001');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getProjectFilters', () => {
    it('should return list of project filters', async () => {
      const result = await getProjectFilters();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have valid filter structure', async () => {
      const result = await getProjectFilters();

      result.forEach(filter => {
        expect(filter).toHaveProperty('id');
        expect(filter).toHaveProperty('name');
        expect(typeof filter.id).toBe('string');
        expect(typeof filter.name).toBe('string');
      });
    });

    it('should include "all" option', async () => {
      const result = await getProjectFilters();

      const allFilter = result.find(f => f.id === 'all');
      expect(allFilter).toBeDefined();
      expect(allFilter?.name).toBe('All Projects');
    });

    it('should have multiple project options', async () => {
      const result = await getProjectFilters();

      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('performance', () => {
    it('should complete within reasonable time', async () => {
      const start = Date.now();
      await getUsageMetrics('30d', 'all');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent requests', async () => {
      const promises = [
        getUsageMetrics('7d', 'all'),
        getUsageMetrics('30d', 'all'),
        getUsageTrend('30d', 'all'),
        getProjectFilters()
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(Array.isArray(results[2])).toBe(true);
      expect(Array.isArray(results[3])).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty project filter', async () => {
      const result = await getUsageMetrics('30d', '');

      expect(result).toBeDefined();
      expect(result.minutesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should handle unknown project ID gracefully', async () => {
      const result = await getUsageMetrics('30d', 'unknown-project');

      expect(result).toBeDefined();
      expect(result.minutesProcessed).toBeGreaterThanOrEqual(0);
    });
  });
});
