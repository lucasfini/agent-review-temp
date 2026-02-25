'use client';

import { useState, useCallback } from 'react';
import {  ChevronUp, ChevronDown, Search, Filter } from 'lucide-react';
import type { Transaction, TransactionStatus } from '@/lib/transaction-data';

interface TransactionTableProps {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSort: (sortBy: 'date' | 'amount' | 'status', order: 'asc' | 'desc') => void;
  onStatusFilter: (status: TransactionStatus | 'all') => void;
  onSearch: (query: string) => void;
  currentSort: { by: 'date' | 'amount' | 'status'; order: 'asc' | 'desc' };
  currentStatus: TransactionStatus | 'all';
}

export function TransactionTable({
  transactions,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onSort,
  onStatusFilter,
  onSearch,
  currentSort,
  currentStatus
}: TransactionTableProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
  }, []);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  }, [searchQuery, onSearch]);

  const handleSortClick = useCallback((column: 'date' | 'amount' | 'status') => {
    const newOrder = currentSort.by === column && currentSort.order === 'desc' ? 'asc' : 'desc';
    onSort(column, newOrder);
  }, [currentSort, onSort]);

  const getStatusBadgeClass = (status: TransactionStatus): string => {
    switch (status) {
      case 'settled':
        return 'bg-green-100 text-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-300';
      case 'failed':
        return 'bg-red-100 text-red-300';
      default:
        return 'bg-slate-800 text-slate-100';
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const renderSortIcon = (column: 'date' | 'amount' | 'status') => {
    if (currentSort.by !== column) {
      return <ChevronDown className="h-4 w-4 text-slate-500" />;
    }
    return currentSort.order === 'desc' ?
      <ChevronDown className="h-4 w-4 text-blue-600" /> :
      <ChevronUp className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </form>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={currentStatus}
            onChange={(e) => onStatusFilter(e.target.value as TransactionStatus | 'all')}
            className="pl-10 pr-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-slate-900 min-w-[150px]"
          >
            <option value="all">All Status</option>
            <option value="settled">Settled</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800/50">
              <tr>
                <th
                  onClick={() => handleSortClick('date')}
                  className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2">
                    Date
                    {renderSortIcon('date')}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Description
                </th>
                <th
                  onClick={() => handleSortClick('amount')}
                  className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2">
                    Amount
                    {renderSortIcon('amount')}
                  </div>
                </th>
                <th
                  onClick={() => handleSortClick('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2">
                    Status
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Project
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {formatDate(txn.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-50">
                      <div className="max-w-xs truncate">{txn.description}</div>
                      <div className="text-xs text-slate-400">{txn.service}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-50">
                      {formatCurrency(txn.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      <div className="max-w-xs truncate">
                        {txn.projectName || '-'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-t border-slate-700 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-slate-600 text-sm font-medium rounded-md text-slate-300 bg-slate-900 hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-600 text-sm font-medium rounded-md text-slate-300 bg-slate-900 hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">
                  Showing{' '}
                  <span className="font-medium">{(page - 1) * pageSize + 1}</span>
                  {' '}-{' '}
                  <span className="font-medium">{Math.min(page * pageSize, total)}</span>
                  {' '}of{' '}
                  <span className="font-medium">{total}</span>
                  {' '}results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-600 bg-slate-900 text-sm font-medium text-slate-400 hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => onPageChange(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          page === pageNum
                            ? 'z-10 bg-blue-900/20 border-blue-500 text-blue-600'
                            : 'bg-slate-900 border-slate-600 text-slate-400 hover:bg-slate-800/50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-600 bg-slate-900 text-sm font-medium text-slate-400 hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
