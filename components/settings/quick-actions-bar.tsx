'use client';

/**
 * Quick Actions Bar Component
 * Clean, functional action buttons with prominent balance display
 */

import { useState, useEffect } from 'react';
import { Plus, ArrowRight, DollarSign } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';

interface QuickActionsBarProps {
  onAddCredits?: () => void;
}

interface BalanceData {
  balance: number;
}

export default function QuickActionsBar({ onAddCredits }: QuickActionsBarProps) {
  const { session } = useAuth();
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!session?.access_token) return;

      try {
        const response = await fetch('/api/billing/balance', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setBalance(data);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
  }, [session]);

  const isLowBalance = balance && balance.balance < 5;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        {/* Balance Display */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Current Balance</div>
              {isLoading ? (
                <div className="h-8 w-24 bg-gray-200 animate-pulse rounded" />
              ) : (
                <div className={`text-2xl font-semibold ${isLowBalance ? 'text-amber-600' : 'text-gray-900'}`}>
                  ${balance?.balance.toFixed(2) || '0.00'}
                </div>
              )}
            </div>
          </div>

          {isLowBalance && (
            <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md">
              <span className="text-sm font-medium text-amber-700">Low balance</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/transactions"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Transactions
            <ArrowRight className="h-4 w-4" />
          </Link>

          <button
            onClick={onAddCredits}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Credits
          </button>
        </div>
      </div>
    </div>
  );
}
