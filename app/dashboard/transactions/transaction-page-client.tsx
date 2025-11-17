'use client';

/**
 * Client wrapper for Transactions Ledger Page
 * Handles filtering, search, sorting, and CSV export with data fetching
 * Now with two tabs: Balance Changes and Service Usage
 */

import { useRouter, usePathname } from 'next/navigation';
import { useState, useCallback, useEffect, ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

type TabType = 'balance' | 'usage';

interface CreditTransaction {
  id: string;
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  balanceAfter: number;
}

interface UsageEvent {
  id: string;
  createdAt: string;
  serviceName: string;
  provider: string;
  units: number;
  unitType: string;
  billedCost: number;
  projectId: string | null;
  metadata: Record<string, unknown>;
}

interface TransactionPageClientProps {
  initialPage: number;
  initialTab: TabType;
  children: ReactNode;
}

export default function TransactionPageClient({
  initialPage,
  initialTab,
  children
}: TransactionPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [tab, setTab] = useState<TabType>(initialTab);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState('');

  // Credit transactions state
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [creditTotal, setCreditTotal] = useState(0);

  // Usage events state
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);

  // Fetch credit transactions
  const fetchCreditTransactions = useCallback(async () => {
    if (!session?.access_token) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/billing/transactions?limit=10&offset=${(page - 1) * 10}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCreditTransactions(data.transactions || []);
        setCreditTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching credit transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, session]);

  // Fetch usage events
  const fetchUsageEvents = useCallback(async () => {
    if (!session?.access_token) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/billing/usage?limit=10&offset=${(page - 1) * 10}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsageEvents(data.events || []);
        setUsageTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching usage events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, session]);

  // Fetch data when tab or page changes
  useEffect(() => {
    if (tab === 'balance') {
      fetchCreditTransactions();
    } else {
      fetchUsageEvents();
    }
  }, [tab, page, fetchCreditTransactions, fetchUsageEvents]);

  const updateURL = useCallback((updates: {
    tab?: TabType;
    page?: number;
  }) => {
    const params = new URLSearchParams();

    const newTab = updates.tab !== undefined ? updates.tab : tab;
    const newPage = updates.page !== undefined ? updates.page : page;

    if (newTab !== 'balance') params.set('tab', newTab);
    if (newPage !== 1) params.set('page', newPage.toString());

    const url = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(url);
  }, [pathname, router, tab, page]);

  const handleTabChange = useCallback((newTab: TabType) => {
    setTab(newTab);
    setPage(1);
    updateURL({ tab: newTab, page: 1 });
  }, [updateURL]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    updateURL({ page: newPage });
  }, [updateURL]);

  const handleExportBalance = useCallback(async () => {
    if (!session?.access_token) return;

    setIsExporting(true);
    try {
      const response = await fetch('/api/billing/transactions?limit=1000', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const transactions = data.transactions || [];

        // Create CSV
        const headers = ['Date', 'Type', 'Amount', 'Reason', 'Balance After'];
        const rows = transactions.map((t: CreditTransaction) => [
          new Date(t.createdAt).toLocaleString(),
          t.transactionType,
          `$${t.amount.toFixed(4)}`,
          t.reason || '',
          `$${t.balanceAfter.toFixed(4)}`
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance-transactions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      }
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [session]);

  const handleExportUsage = useCallback(async () => {
    if (!session?.access_token) return;

    setIsExporting(true);
    try {
      const response = await fetch('/api/billing/usage?limit=1000', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const events = data.events || [];

        // Create CSV
        const headers = ['Date', 'Service', 'Provider', 'Units', 'Unit Type', 'Cost', 'Project'];
        const rows = events.map((e: UsageEvent) => [
          new Date(e.createdAt).toLocaleString(),
          e.serviceName,
          e.provider,
          e.units.toString(),
          e.unitType,
          `$${e.billedCost.toFixed(6)}`,
          e.projectId || 'N/A'
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-events-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      }
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [session]);

  const totalPages = tab === 'balance'
    ? Math.ceil(creditTotal / 10)
    : Math.ceil(usageTotal / 10);

  return (
    <>
      {/* Header with Export */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <button
          onClick={tab === 'balance' ? handleExportBalance : handleExportUsage}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Download CSV'}
        </button>
      </div>

      {/* Stats Cards */}
      {children}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => handleTabChange('balance')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            tab === 'balance'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Balance Changes
        </button>
        <button
          onClick={() => handleTabChange('usage')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            tab === 'usage'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Service Usage
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          {tab === 'balance' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance After
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {creditTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No transactions found
                      </td>
                    </tr>
                  ) : (
                    creditTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            transaction.transactionType === 'purchase'
                              ? 'bg-green-100 text-green-800'
                              : transaction.transactionType === 'debit'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {transaction.transactionType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                          transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount > 0 ? '+' : ''}${transaction.amount.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {transaction.reason || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${transaction.balanceAfter.toFixed(4)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Units
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {usageEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No usage events found
                      </td>
                    </tr>
                  ) : (
                    usageEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(event.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {event.serviceName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {event.provider}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.units.toFixed(2)} {event.unitType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ${event.billedCost.toFixed(6)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
