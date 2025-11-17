'use client';

/**
 * Billing Section Component
 * Clean, professional billing and credit management
 */

import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import CreditPackages from '@/components/billing/credit-packages';
import QuickActionsBar from '@/components/settings/quick-actions-bar';
import { useAuth } from '@/lib/auth/context';

interface BillingSectionProps {
  userId: string;
}

interface Balance {
  balance: number;
  formatted: string;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
}

interface Transaction {
  id: string;
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
}

export default function BillingSection({ userId }: BillingSectionProps) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPurchase, setShowPurchase] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch balance
        const balanceResponse = await fetch('/api/billing/balance', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setBalance(balanceData);
        }

        // Fetch recent transactions
        const transactionsResponse = await fetch('/api/billing/transactions?limit=5', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          setRecentTransactions(transactionsData.transactions || []);
        }
      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId, session]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <QuickActionsBar onAddCredits={() => setShowPurchase(true)} />

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-1">Total Added</div>
          <div className="text-2xl font-semibold text-gray-900">
            ${(balance?.lifetimeCreditsAdded || 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-1">Total Spent</div>
          <div className="text-2xl font-semibold text-gray-900">
            ${(balance?.lifetimeCreditsSpent || 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-sm text-gray-600 mb-1">Remaining</div>
          <div className="text-2xl font-semibold text-green-600">
            ${balance?.formatted || '$0.00'}
          </div>
        </div>
      </div>

      {/* Credit Purchase Section */}
      {showPurchase ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Purchase Credits</h2>
            <button
              onClick={() => setShowPurchase(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <CreditPackages onSuccess={() => setShowPurchase(false)} />
        </div>
      ) : (
        <>
          {/* Recent Transactions - Clean Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
              <Link
                href="/dashboard/transactions"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500">No transactions yet</div>
                <div className="text-sm text-gray-400 mt-1">Purchase credits to get started</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentTransactions.map((transaction) => {
                      const isCredit = transaction.amount > 0;

                      return (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 capitalize">
                              {transaction.transactionType.replace('_', ' ')}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className={`text-sm font-semibold ${
                              isCredit ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {isCredit ? '+' : ''}${transaction.amount.toFixed(2)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
