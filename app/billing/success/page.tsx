/**
 * Payment Success Page
 * Displays confirmation after successful credit purchase
 */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { formatSiteCreditDeltaFromUsd, formatSiteCreditsFromUsd } from '@/lib/billing/display';

function formatPurchasedCredits(amount: number, creditUnit?: string | null) {
  if (creditUnit === 'plan_credit') {
    return `${new Intl.NumberFormat('en-US').format(amount)} credits`;
  }

  return formatSiteCreditDeltaFromUsd(amount);
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLabel, setBalanceLabel] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
  const [creditUnit, setCreditUnit] = useState<string | null>(null);
  const [alreadyProcessed, setAlreadyProcessed] = useState(false);
  const hasVerified = useRef(false);

  useEffect(() => {
    if (!sessionId || !session?.access_token) {
      if (!sessionId) setLoading(false);
      return;
    }

    // Prevent multiple verification calls when session ref changes
    if (hasVerified.current) return;
    hasVerified.current = true;

    const verifyAndFetchBalance = async () => {
      try {
        // First, verify the session and ensure credits are added
        const verifyResponse = await fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          if (verifyData.success) {
            setAlreadyProcessed(Boolean(verifyData.alreadyProcessed));
            setCreditUnit(typeof verifyData.creditUnit === 'string' ? verifyData.creditUnit : null);
            if (!verifyData.alreadyProcessed && typeof verifyData.creditsAdded === 'number') {
              setCreditsAdded(verifyData.creditsAdded);
            }
          } else {
            setVerificationError(
              typeof verifyData.error === 'string'
                ? verifyData.error
                : 'We could not confirm this payment session.'
            );
          }
        } else {
          const message = await verifyResponse.text();
          console.error('Failed to verify session:', message);
          setVerificationError('We could not confirm this payment session. Please check Billing or contact support.');
        }

        // Then fetch the updated balance
        const balanceResponse = await fetch('/api/billing/balance', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setBalance(balanceData.balance);
          setBalanceLabel(
            typeof balanceData.formatted === 'string'
              ? balanceData.formatted
              : formatSiteCreditsFromUsd(balanceData.balance)
          );
        } else {
          setBalanceError('Failed to fetch balance');
        }
      } catch (err) {
        console.error('Error processing payment:', err);
        setVerificationError('We could not confirm this payment session. Please check Billing or contact support.');
      } finally {
        setLoading(false);
      }
    };

    // Small delay to let any webhooks process first
    const timeout = window.setTimeout(verifyAndFetchBalance, 1000);
    return () => window.clearTimeout(timeout);
  }, [sessionId, session]);

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="max-w-md w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 dark:text-red-400 mb-4">
            <p className="text-lg font-semibold">Invalid Session</p>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            No payment session found. Please try your purchase again from Billing.
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Billing
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Confirming your payment...</p>
        </div>
      </div>
    );
  }

  const hasVerificationError = Boolean(verificationError);
  const warningMessage = verificationError || balanceError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-6 sm:p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className={hasVerificationError ? 'bg-yellow-900/30 rounded-full p-3' : 'bg-green-900/30 rounded-full p-3'}>
            {hasVerificationError ? (
              <AlertTriangle className="h-16 w-16 text-yellow-400" />
            ) : (
              <CheckCircle className="h-16 w-16 text-green-400" />
            )}
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 text-center mb-2">
          {hasVerificationError ? 'Payment Needs Review' : 'Payment Successful'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-6">
          {hasVerificationError
            ? 'Stripe redirected you back, but we could not verify that credits were applied.'
            : 'Your payment was received. Your credits are being applied to your billing balance.'}
        </p>

        {/* Credits Added */}
        {creditsAdded !== null && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg p-6 mb-4">
            <div className="text-center">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">
                Credits Added
              </p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-300">
                {formatPurchasedCredits(creditsAdded, creditUnit)}
              </p>
            </div>
          </div>
        )}

        {alreadyProcessed && creditsAdded === null && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-green-700 dark:text-green-300">
              This payment was already processed, so no duplicate credits were added.
            </p>
          </div>
        )}

        {/* Balance Display */}
        {balance !== null && !balanceError && (
          <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">
                Current Balance
              </p>
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-300">
                {balanceLabel || formatSiteCreditsFromUsd(balance)}
              </p>
            </div>
          </div>
        )}

        {warningMessage && (
          <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-400">
              {hasVerificationError
                ? warningMessage
                : "Payment was verified, but we couldn't fetch your updated balance. Please check Billing in a moment."}
            </p>
          </div>
        )}

        {/* Additional Info */}
        <div className="bg-slate-100/80 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2">What's Next?</h3>
          <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
            <li>• Your credits are ready to use once Stripe confirmation is recorded</li>
            <li>• Some credit grants may follow plan or promotional expiry rules</li>
            <li>• View balance, transactions, and receipts in Billing</li>
            <li>• Start transcribing and generating content</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/dashboard/billing"
            className="block w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-center py-3 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            View Billing
          </Link>
        </div>

        {/* Receipt Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-500">
            A receipt has been sent to your email when Stripe has one on file.
          </p>
          {sessionId && (
            <p className="text-xs text-slate-500 dark:text-slate-600 mt-1">
              Session ID: {sessionId.substring(0, 20)}...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
