"use client";

import { createContext, useContext, useState } from 'react';

interface CoverageProgressContextType {
  runningCoverageIds: Map<string, string>;
  startCoverage: (projectId: string, title: string) => void;
  stopCoverage: (projectId: string) => void;
}

const CoverageProgressContext = createContext<CoverageProgressContextType | undefined>(undefined);

export function CoverageProgressProvider({ children }: { children: React.ReactNode }) {
  const [runningCoverageIds, setRunningCoverageIds] = useState<Map<string, string>>(new Map());

  const startCoverage = (projectId: string, title: string) => {
    setRunningCoverageIds(prev => new Map(prev).set(projectId, title));
  };

  const stopCoverage = (projectId: string) => {
    setRunningCoverageIds(prev => {
      const next = new Map(prev);
      next.delete(projectId);
      return next;
    });
  };

  return (
    <CoverageProgressContext.Provider value={{ runningCoverageIds, startCoverage, stopCoverage }}>
      {children}
    </CoverageProgressContext.Provider>
  );
}

export function useCoverageProgress(): CoverageProgressContextType {
  const ctx = useContext(CoverageProgressContext);
  if (!ctx) throw new Error('useCoverageProgress must be used within CoverageProgressProvider');
  return ctx;
}
