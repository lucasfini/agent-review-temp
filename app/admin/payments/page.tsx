'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ProcessOutcome = {
  at: string;
  sessionId: string;
  success: boolean;
  message: string;
  details?: string;
  payload?: any;
};

export default function AdminPaymentsPage() {
  const { session } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [outcomes, setOutcomes] = useState<ProcessOutcome[]>([]);

  const processPayment = async () => {
    if (!session?.access_token) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/process-stripe-payment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: sessionId.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        const text = data?.details || data?.error || 'Failed to process payment';
        setMessage({ type: 'error', text });
        setOutcomes((prev) => [
          {
            at: new Date().toISOString(),
            sessionId: sessionId.trim(),
            success: false,
            message: 'Failed',
            details: text,
            payload: data,
          },
          ...prev,
        ]);
        return;
      }

      if (data.alreadyProcessed) {
        const text = 'Session already processed. No changes made.';
        setMessage({ type: 'success', text });
        setOutcomes((prev) => [
          {
            at: new Date().toISOString(),
            sessionId: sessionId.trim(),
            success: true,
            message: 'Already processed',
            payload: data,
          },
          ...prev,
        ]);
      } else {
        const text = `Processed successfully · Added ${formatSiteCreditsFromUsd(Number(data.creditsAdded || 0))} · New balance ${formatSiteCreditsFromUsd(Number(data.newBalance || 0))}`;
        setMessage({ type: 'success', text });
        setOutcomes((prev) => [
          {
            at: new Date().toISOString(),
            sessionId: sessionId.trim(),
            success: true,
            message: 'Processed',
            payload: data,
          },
          ...prev,
        ]);
      }
      setConfirmOpen(false);
    } catch (err: any) {
      const text = err?.message || 'Failed to process payment';
      setMessage({ type: 'error', text });
      setOutcomes((prev) => [
        {
          at: new Date().toISOString(),
          sessionId: sessionId.trim(),
          success: false,
          message: 'Exception',
          details: text,
        },
        ...prev,
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin • Payments</h1>
          <p className="mt-2 text-sm text-slate-400">Retroactively process Stripe checkout sessions when webhook delivery is missed.</p>
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

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Process Stripe Session</h2>
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Stripe Checkout Session ID</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="cs_test_... or cs_live_..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
            />
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!sessionId.trim()}
            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
          >
            Review and process
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-base font-semibold text-white mb-3">Recent Payment Actions</h2>
          {outcomes.length === 0 ? (
            <p className="text-sm text-slate-500">No actions yet.</p>
          ) : (
            <div className="space-y-2">
              {outcomes.slice(0, 20).map((item, idx) => (
                <div key={`${item.at}-${idx}`} className="rounded-lg border border-slate-800 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className={item.success ? 'text-emerald-400' : 'text-red-400'}>
                      {item.message}
                    </span>
                    <span className="text-slate-500">{new Date(item.at).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-400 mt-1">Session: <span className="font-mono">{item.sessionId}</span></div>
                  {item.details && <div className="text-slate-500 mt-1">{item.details}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!submitting) setConfirmOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm payment processing</DialogTitle>
            <DialogDescription>
              Process Stripe session <span className="font-mono text-slate-200">{sessionId}</span>. This applies credits if the payment is valid and not already processed.
            </DialogDescription>
          </DialogHeader>
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
              onClick={processPayment}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Processing…' : 'Confirm and process'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
