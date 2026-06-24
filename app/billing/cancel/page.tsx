/**
 * Payment Cancel Page
 * Displays message when user cancels payment
 */

'use client';

import { XCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-6 sm:p-8">
        {/* Cancel Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-full p-3">
            <XCircle className="h-16 w-16 text-slate-400" />
          </div>
        </div>

        {/* Cancel Message */}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 text-center mb-2">
          Payment Cancelled
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-6">
          Checkout was cancelled. Stripe did not complete the payment, so no credits were added and no completed charge should appear for this session.
        </p>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            If checkout failed unexpectedly, return to Billing and try again. Your billing page has the current credit options and transaction history.
          </p>
        </div>

        {/* Pricing Reminder */}
        <div className="bg-slate-100/80 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-2">Billing Notes</h3>
          <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
            <li>• Credits are added only after Stripe confirms payment</li>
            <li>• Available packages and plan rules are shown in Billing</li>
            <li>• Receipts and invoice references appear in your transaction history when available</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/dashboard/billing"
            className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Return to Billing
          </Link>
          <Link
            href="/dashboard"
            className="block w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-center py-3 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>

        {/* Support Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            Questions?{' '}
            <a
              href="mailto:support@audiorepurpose.com"
              className="text-blue-500 hover:text-blue-400 font-medium"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
