"use client";

import { AlertCircle, RefreshCw } from 'lucide-react';

interface DashboardLoadErrorStateProps {
  title: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}

export function DashboardLoadErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
}: DashboardLoadErrorStateProps) {
  return (
    <div className="flex min-h-[320px] items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900/40 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
