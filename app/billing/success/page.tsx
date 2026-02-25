/**
 * Payment Success Page
 * Displays confirmation after successful credit purchase
 */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
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
            if (!verifyData.alreadyProcessed) {
              setCreditsAdded(verifyData.creditsAdded);
            }
          }
        } else {
          console.error('Failed to verify session:', await verifyResponse.text());
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
        } else {
          setError('Failed to fetch balance');
        }
      } catch (err) {
        console.error('Error processing payment:', err);
        setError('Failed to process payment');
      } finally {
        setLoading(false);
      }
    };

    // Small delay to let any webhooks process first
    // No cleanup needed — hasVerified ref prevents duplicate calls
    setTimeout(verifyAndFetchBalance, 1000);
  }, [sessionId, session]);

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-600 mb-4">
            <p className="text-lg font-semibold">Invalid Session</p>
          </div>
          <p className="text-gray-600 mb-6">
            No payment session found. Please try purchasing credits again.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Processing your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-green-100 rounded-full p-3">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Payment Successful!
        </h1>
        <p className="text-gray-600 text-center mb-6">
          Your credits have been added to your account.
        </p>

        {/* Credits Added */}
        {creditsAdded !== null && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
            <div className="text-center">
              <p className="text-sm text-green-600 font-medium mb-1">
                Credits Added
              </p>
              <p className="text-3xl font-bold text-green-900">
                +${creditsAdded.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Balance Display */}
        {balance !== null && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-blue-600 font-medium mb-1">
                Current Balance
              </p>
              <p className="text-4xl font-bold text-blue-900">
                ${balance.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              Payment processed successfully, but we couldn't fetch your updated balance.
              Please check your account in a moment.
            </p>
          </div>
        )}

        {/* Additional Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">What's Next?</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• Your credits are ready to use immediately</li>
            <li>• Credits never expire</li>
            <li>• Start transcribing and generating content</li>
            <li>• View usage history in your dashboard</li>
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
            href="/dashboard/settings"
            className="block w-full bg-gray-100 text-gray-700 text-center py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            View Settings
          </Link>
        </div>

        {/* Receipt Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            A receipt has been sent to your email.
          </p>
          {sessionId && (
            <p className="text-xs text-gray-400 mt-1">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
