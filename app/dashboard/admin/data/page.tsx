'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';

type BillingTotals = {
  purchases: number;
  refunds: number;
  debits: number;
};

type BillingTx = {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  transactionType: string;
  reason?: string;
  invoiceNumber?: string;
  createdAt: string;
};

export default function AdminDataPage() {
  const { session } = useAuth();
  const [totals, setTotals] = useState<BillingTotals | null>(null);
  const [transactions, setTransactions] = useState<BillingTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '6m' | 'all'>('30d');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      const params = new URLSearchParams({
        range,
        search,
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      const res = await fetch(`/api/admin/billing?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setTotals(json.totals || null);
        setTransactions(json.transactions || []);
        setTotal(json.total || 0);
      }
      setLoading(false);
    };
    load();
  }, [session?.access_token, range, search, page, pageSize]);

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-2xl font-semibold text-white">Admin • Data</h1>
        <p className="mt-2 text-sm text-slate-400">Billing totals and recent transactions.</p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search reason/type/invoice"
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          />
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as any);
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="6m">6m</option>
            <option value="all">All time</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          >
            {[10, 30, 100, 200].map((size) => (
              <option key={size} value={size}>{size} items</option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Purchases ({range})</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `$${(totals?.purchases ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Refunds ({range})</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `$${(totals?.refunds ?? 0).toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Debits ({range})</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {loading ? '—' : `$${(totals?.debits ?? 0).toFixed(2)}`}
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">User</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Invoice</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-slate-400">Loading…</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-slate-400">No transactions.</td></tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-slate-200">{tx.userEmail}</td>
                    <td className="px-4 py-3 text-slate-400">{tx.transactionType}</td>
                    <td className="px-4 py-3 text-slate-400">{tx.reason || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{tx.invoiceNumber || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * pageSize >= total}
            className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
