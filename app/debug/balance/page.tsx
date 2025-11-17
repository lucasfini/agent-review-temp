/**
 * Debug Page - Shows Balance from Database
 */

'use client';

import { useAuth } from '@/lib/auth/context';
import { useEffect, useState } from 'react';

export default function DebugBalancePage() {
  const { user, session } = useAuth();
  const [balanceData, setBalanceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!session?.access_token) {
        setError('No session token');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/billing/balance', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        const text = await response.text();
        console.log('Raw response:', text);

        if (!response.ok) {
          setError(`API Error: ${response.status} - ${text}`);
          setLoading(false);
          return;
        }

        const data = JSON.parse(text);
        setBalanceData(data);
      } catch (err: any) {
        setError(`Fetch error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchBalance();
    }
  }, [user, session]);

  if (!user) {
    return <div className="p-8">Not logged in</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Balance Debug Info</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User ID
            </label>
            <div className="bg-gray-100 p-3 rounded text-sm font-mono">
              {user.id}
            </div>
          </div>

          {loading && (
            <div className="bg-blue-50 p-4 rounded">
              Loading balance from API...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 p-4 rounded">
              <p className="text-red-800 font-semibold">Error:</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          )}

          {balanceData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Response
              </label>
              <div className="bg-gray-100 p-3 rounded">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(balanceData, null, 2)}
                </pre>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                  <p className="text-xs text-blue-600 mb-1">Balance</p>
                  <p className="text-2xl font-bold text-blue-900">
                    ${balanceData.balance?.toFixed(2) || '0.00'}
                  </p>
                </div>

                <div className="bg-green-50 border border-green-200 p-4 rounded">
                  <p className="text-xs text-green-600 mb-1">Formatted</p>
                  <p className="text-2xl font-bold text-green-900">
                    {balanceData.formatted || 'N/A'}
                  </p>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-4 rounded">
                  <p className="text-xs text-purple-600 mb-1">Lifetime Added</p>
                  <p className="text-lg font-bold text-purple-900">
                    ${balanceData.lifetimeCreditsAdded?.toFixed(2) || '0.00'}
                  </p>
                </div>

                <div className="bg-orange-50 border border-orange-200 p-4 rounded">
                  <p className="text-xs text-orange-600 mb-1">Lifetime Spent</p>
                  <p className="text-lg font-bold text-orange-900">
                    ${balanceData.lifetimeCreditsSpent?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t">
            <h2 className="font-semibold mb-2">Troubleshooting:</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              <li>Check if the SQL ran successfully in Supabase</li>
              <li>Verify the account_credits table has a row for this user</li>
              <li>Check browser console for errors</li>
              <li>Try refreshing this page</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
