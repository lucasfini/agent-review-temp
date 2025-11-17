/**
 * Transaction Export Helper
 * Provides CSV export functionality for transactions
 */

import type { Transaction } from './transaction-data';

/**
 * Exports transactions to CSV format
 * @param transactions Array of transactions to export
 * @param filename Optional filename (defaults to timestamped name)
 */
export function exportTransactionsToCSV(
  transactions: Transaction[],
  filename?: string
): void {
  if (transactions.length === 0) {
    console.warn('No transactions to export');
    return;
  }

  // Define CSV headers
  const headers = [
    'Transaction ID',
    'Date',
    'Description',
    'Amount',
    'Status',
    'Project ID',
    'Project Name',
    'Service'
  ];

  // Convert transactions to CSV rows
  const rows = transactions.map(txn => [
    txn.id,
    new Date(txn.date).toISOString(),
    `"${txn.description.replace(/"/g, '""')}"`, // Escape quotes
    txn.amount.toFixed(2),
    txn.status,
    txn.projectId || '',
    txn.projectName ? `"${txn.projectName.replace(/"/g, '""')}"` : '',
    txn.service
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `transactions-${Date.now()}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Generates a filename based on current date and filters
 */
export function generateExportFilename(
  status?: string,
  search?: string
): string {
  const date = new Date().toISOString().split('T')[0];
  const parts = ['transactions', date];

  if (status && status !== 'all') {
    parts.push(status);
  }

  if (search && search.trim()) {
    parts.push('filtered');
  }

  return `${parts.join('-')}.csv`;
}
