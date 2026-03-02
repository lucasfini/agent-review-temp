 'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';

type Overview = {
  activeProcessingCount: number;
  failedLast7dCount: number;
  totalCreditsBalance: number;
  totalDebits7d: number;
  processedMinutes7d: number;
};

export default function AdminOverviewPage() {
  const { session } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      setLoading(false);
    };
    load();
  }, [session?.access_token]);

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-2xl font-semibold text-white">Admin Overview</h1>
        <p className="mt-2 text-sm text-slate-400">
          High-level monitoring for site health, billing, and usage.
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active Processing</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : data?.activeProcessingCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Failed (7 days)</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : data?.failedLast7dCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Credits Balance</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `$${(data?.totalCreditsBalance ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Debits (7 days)</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `$${(data?.totalDebits7d ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Processed Minutes (7 days)</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `${(data?.processedMinutes7d ?? 0).toFixed(1)} min`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
