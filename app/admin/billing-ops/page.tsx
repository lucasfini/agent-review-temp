'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { formatSiteCreditDeltaFromUsd, formatSiteCreditsFromUsd } from '@/lib/billing/display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type UserSearchRow = {
  id: string;
  email: string;
  credits: {
    balance: number;
  } | null;
};

type BillingSummaryResponse = {
  success: boolean;
  summary: {
    balance: number;
    lifetimeCreditsAdded: number;
    lifetimeCreditsSpent: number;
    recentUsage: Array<{
      date: string;
      serviceName: string;
      billedCost: number;
      units: number;
    }>;
    recentTransactions: Array<{
      date: string;
      type: string;
      amount: number;
      balanceAfter: number;
      reason?: string;
    }>;
  };
  audit: {
    isCorrect: boolean;
    discrepancy: number;
    details: {
      transactionCount: number;
    };
  };
};

const LARGE_AMOUNT_THRESHOLD = 100;

export default function AdminBillingOpsPage() {
  const { session } = useAuth();

  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState<string>('10');
  const [reason, setReason] = useState('');
  const [transactionType, setTransactionType] = useState<'bonus' | 'refund' | 'admin_adjustment'>('admin_adjustment');

  const [summaryUserId, setSummaryUserId] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null);

  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<{
    totalRevenue: number;
    totalMargin: number;
    marginPercent: number;
    eventCount: number;
  } | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const requiresTypedConfirm = Number.isFinite(parsedAmount) && parsedAmount >= LARGE_AMOUNT_THRESHOLD;

  useEffect(() => {
    const loadAnalytics = async () => {
      if (!session?.access_token) return;
      setAnalyticsLoading(true);
      try {
        const res = await fetch('/api/admin/billing/analytics', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch analytics');
        setAnalytics(data.revenue || null);
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message || 'Failed to fetch billing analytics' });
      } finally {
        setAnalyticsLoading(false);
      }
    };
    void loadAnalytics();
  }, [session?.access_token]);

  const runEmailSearch = async () => {
    if (!session?.access_token || !searchEmail.trim()) return;
    setSearchLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        search: searchEmail.trim(),
        page: '1',
        perPage: '20',
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to search users');
      setSearchResults((data.users || []) as UserSearchRow[]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to search users' });
    } finally {
      setSearchLoading(false);
    }
  };

  const openConfirm = () => {
    setMessage(null);
    if (!userId.trim()) {
      setMessage({ type: 'error', text: 'User ID is required' });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage({ type: 'error', text: 'Amount must be a positive number' });
      return;
    }
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Reason is required' });
      return;
    }
    setTypedConfirm('');
    setConfirmOpen(true);
  };

  const submitAddCredits = async () => {
    if (!session?.access_token) return;
    if (requiresTypedConfirm && typedConfirm !== 'CONFIRM') return;

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/billing/add-credits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId.trim(),
          amount: parsedAmount,
          reason: reason.trim(),
          transactionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to add credits');

      setMessage({
        type: 'success',
        text: `Added ${formatSiteCreditsFromUsd(parsedAmount)}. New balance: ${formatSiteCreditsFromUsd(Number(data.newBalance || 0))} · Tx: ${data.transactionId}`,
      });
      setConfirmOpen(false);
      setReason('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to add credits' });
    } finally {
      setSubmitting(false);
    }
  };

  const loadSummary = async () => {
    if (!session?.access_token || !summaryUserId.trim()) return;
    setSummaryLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/billing/user-summary?userId=${encodeURIComponent(summaryUserId.trim())}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to fetch user summary');
      setSummary(data as BillingSummaryResponse);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to fetch user summary' });
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="py-8">
      <div className="max-w-6xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin • Billing Ops</h1>
          <p className="mt-2 text-sm text-slate-400">Credits management, billing audit, and operator tools.</p>
        </div>

        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
              : 'border-red-700/40 bg-red-900/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-white">{analyticsLoading ? '—' : `$${(analytics?.totalRevenue || 0).toFixed(2)}`}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Margin</p>
            <p className="mt-2 text-2xl font-semibold text-white">{analyticsLoading ? '—' : `$${(analytics?.totalMargin || 0).toFixed(2)}`}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Margin %</p>
            <p className="mt-2 text-2xl font-semibold text-white">{analyticsLoading ? '—' : `${(analytics?.marginPercent || 0).toFixed(1)}%`}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Usage Events</p>
            <p className="mt-2 text-2xl font-semibold text-white">{analyticsLoading ? '—' : (analytics?.eventCount || 0)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Add Credits</h2>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Find user by email</label>
              <div className="flex gap-2">
                <input
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="user@email.com"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                />
                <button
                  onClick={runEmailSearch}
                  disabled={searchLoading || !searchEmail.trim()}
                  className="px-3 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                >
                  {searchLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setUserId(u.id);
                      setSummaryUserId(u.id);
                    }}
                    className="w-full text-left px-3 py-2 border-b last:border-b-0 border-slate-800 hover:bg-slate-800/60"
                  >
                    <div className="text-sm text-slate-200">{u.email}</div>
                    <div className="text-xs text-slate-500">ID: {u.id} · Balance: {formatSiteCreditsFromUsd(Number(u.credits?.balance || 0))}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs text-slate-400">User ID</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="uuid"
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Amount (USD purchase value)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Type</label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value as 'bonus' | 'refund' | 'admin_adjustment')}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="admin_adjustment">admin_adjustment</option>
                  <option value="bonus">bonus</option>
                  <option value="refund">refund</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Reason</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this credit change is needed"
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
              />
            </div>

            <button
              onClick={openConfirm}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium"
            >
              Review and confirm
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">User Billing Summary + Audit</h2>
            <div className="flex gap-2">
              <input
                value={summaryUserId}
                onChange={(e) => setSummaryUserId(e.target.value)}
                placeholder="User ID for summary"
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
              />
              <button
                onClick={loadSummary}
                disabled={summaryLoading || !summaryUserId.trim()}
                className="px-3 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
              >
                {summaryLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
            {summary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-800 p-3">
                    <p className="text-xs text-slate-500">Balance</p>
                    <p className="text-lg font-semibold text-slate-100">{formatSiteCreditsFromUsd(summary.summary.balance)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3">
                    <p className="text-xs text-slate-500">Audit</p>
                    <p className={`text-sm font-semibold ${summary.audit.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                      {summary.audit.isCorrect ? 'Pass' : `Mismatch ${formatSiteCreditsFromUsd(summary.audit.discrepancy)}`}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">{summary.audit.details.transactionCount} transactions</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-medium text-slate-400 bg-slate-900/60">Recent Transactions</div>
                  <div className="max-h-48 overflow-y-auto">
                    {summary.summary.recentTransactions.slice(0, 12).map((tx, idx) => (
                      <div key={`${tx.date}-${idx}`} className="px-3 py-2 border-t border-slate-800 text-xs">
                        <div className="text-slate-200">{tx.type} · {formatSiteCreditDeltaFromUsd(tx.amount)}</div>
                        <div className="text-slate-500">{new Date(tx.date).toLocaleString()} {tx.reason ? `· ${tx.reason}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-medium text-slate-400 bg-slate-900/60">Recent Usage Events</div>
                  <div className="max-h-48 overflow-y-auto">
                    {summary.summary.recentUsage.slice(0, 12).map((event, idx) => (
                      <div key={`${event.date}-${idx}`} className="px-3 py-2 border-t border-slate-800 text-xs">
                        <div className="text-slate-200">{event.serviceName} · {formatSiteCreditsFromUsd(event.billedCost)}</div>
                        <div className="text-slate-500">{new Date(event.date).toLocaleString()} · units: {event.units}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!submitting) setConfirmOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm credit adjustment</DialogTitle>
            <DialogDescription>
              Add <span className="font-semibold text-slate-200">${Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : '0.00'}</span> to user <span className="font-mono text-slate-200">{userId}</span> as <span className="font-mono text-slate-200">{transactionType}</span>.
            </DialogDescription>
          </DialogHeader>

          {requiresTypedConfirm && (
            <div className="space-y-2">
              <p className="text-xs text-amber-400">Large adjustment detected (≥ ${LARGE_AMOUNT_THRESHOLD}). Type <span className="font-mono text-amber-300">CONFIRM</span> to proceed.</p>
              <input
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                placeholder="CONFIRM"
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
              />
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAddCredits}
              disabled={submitting || (requiresTypedConfirm && typedConfirm !== 'CONFIRM')}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Applying…' : 'Confirm and apply'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
