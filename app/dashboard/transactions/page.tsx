/**
 * Transactions Ledger Page
 * Client component that displays transaction history with filtering and search
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import TransactionPageClient from './transaction-page-client';

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const page = parseInt(searchParams.get('page') || '1');
  const tab = (searchParams.get('tab') || 'balance') as 'balance' | 'usage';

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
          Please log in to view your transactions.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <TransactionPageClient
        initialPage={page}
        initialTab={tab}
      >
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-2">Loading stats...</div>
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-2">Loading stats...</div>
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-2">Loading stats...</div>
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-2">Loading stats...</div>
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </TransactionPageClient>
    </div>
  );
}
