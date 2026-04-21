/**
 * Payment Cancel Page
 * Displays message when user cancels payment
 */

'use client';

import { XCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-lg shadow-lg p-6 sm:p-8">
        {/* Cancel Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-800 rounded-full p-3">
            <XCircle className="h-16 w-16 text-slate-400" />
          </div>
        </div>

        {/* Cancel Message */}
        <h1 className="text-2xl font-bold text-slate-50 text-center mb-2">
          Payment Cancelled
        </h1>
        <p className="text-slate-400 text-center mb-6">
          Your payment was cancelled. No charges have been made to your account.
        </p>

        {/* Info Box */}
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-300 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-400">
            If you experienced any issues during checkout or have questions about
            our credit packages, please contact support.
          </p>
        </div>

        {/* Pricing Reminder */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-slate-50 mb-2">Why Buy Credits?</h3>
          <ul className="text-sm text-slate-400 space-y-2">
            <li>• Pay only for what you use</li>
            <li>• No monthly subscriptions</li>
            <li>• Credits never expire</li>
            <li>• Bonus credits on larger packages</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/dashboard/settings"
            className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Try Again
          </Link>
          <Link
            href="/dashboard"
            className="block w-full bg-slate-800 text-slate-200 text-center py-3 rounded-lg font-semibold hover:bg-slate-700 transition-colors"
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
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
