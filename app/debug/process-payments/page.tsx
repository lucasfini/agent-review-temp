/**
 * Debug Page: Process Stripe Payments
 * Manually process Stripe payments that didn't get webhooks
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function ProcessPaymentsPage() {
  const { session } = useAuth();
  const [sessionIds, setSessionIds] = useState('');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleProcess = async () => {
    if (!session?.access_token) {
      alert('Not authenticated');
      return;
    }

    const ids = sessionIds.split('\n').map(id => id.trim()).filter(id => id);

    if (ids.length === 0) {
      alert('Please enter at least one session ID');
      return;
    }

    setProcessing(true);
    setResults([]);

    for (const sessionId of ids) {
      try {
        const response = await fetch('/api/admin/process-stripe-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        const data = await response.json();
        setResults(prev => [...prev, {
          sessionId,
          success: response.ok,
          data,
        }]);
      } catch (error) {
        setResults(prev => [...prev, {
          sessionId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }]);
      }
    }

    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Process Stripe Payments
          </h1>
          <p className="text-gray-600 mb-4">
            Enter Stripe checkout session IDs (one per line) to manually process payments that didn't trigger webhooks.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stripe Session IDs
            </label>
            <textarea
              value={sessionIds}
              onChange={(e) => setSessionIds(e.target.value)}
              placeholder="cs_test_..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={processing}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-900 mb-2">How to find Session IDs:</h3>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>1. Go to <a href="https://dashboard.stripe.com/test/payments" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard → Payments</a></li>
              <li>2. Click on each successful payment</li>
              <li>3. Look for "Checkout Session" in the details</li>
              <li>4. Copy the session ID (starts with cs_test_...)</li>
              <li>5. Paste all session IDs here (one per line)</li>
            </ol>
          </div>

          <button
            onClick={handleProcess}
            disabled={processing || !sessionIds.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </span>
            ) : (
              'Process Payments'
            )}
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Results</h2>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-2 ${
                    result.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-gray-600 truncate">
                        {result.sessionId}
                      </div>
                      {result.success && result.data?.success && (
                        <div className="mt-2 text-sm">
                          {result.data.alreadyProcessed ? (
                            <p className="text-yellow-700">Already processed</p>
                          ) : (
                            <>
                              <p className="text-green-700 font-medium">
                                ✓ Added ${result.data.creditsAdded?.toFixed(2)} credits
                              </p>
                              <p className="text-gray-600">
                                New balance: ${result.data.newBalance?.toFixed(2)}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      {!result.success && (
                        <p className="mt-1 text-sm text-red-700">
                          {result.data?.error || result.error || 'Failed to process'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
