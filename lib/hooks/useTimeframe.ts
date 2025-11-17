/**
 * useTimeframe Hook
 * Manages timeframe selection state for cost and usage pages
 */

'use client';

import { useState, useCallback } from 'react';

export type CostTimeframe = '30d' | 'quarter' | 'ytd';
export type UsageTimeframe = '7d' | '30d' | '90d';

export function useCostTimeframe(initialTimeframe: CostTimeframe = '30d') {
  const [timeframe, setTimeframe] = useState<CostTimeframe>(initialTimeframe);

  const handleTimeframeChange = useCallback((newTimeframe: CostTimeframe) => {
    setTimeframe(newTimeframe);
  }, []);

  return {
    timeframe,
    setTimeframe: handleTimeframeChange
  };
}

export function useUsageTimeframe(initialTimeframe: UsageTimeframe = '30d') {
  const [timeframe, setTimeframe] = useState<UsageTimeframe>(initialTimeframe);

  const handleTimeframeChange = useCallback((newTimeframe: UsageTimeframe) => {
    setTimeframe(newTimeframe);
  }, []);

  return {
    timeframe,
    setTimeframe: handleTimeframeChange
  };
}
