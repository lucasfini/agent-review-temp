/**
 * Transaction Data Helper
 * Provides mock transaction ledger data with simulated API latency
 */

export type TransactionStatus = 'pending' | 'settled' | 'failed';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: TransactionStatus;
  projectId: string | null;
  projectName: string | null;
  service: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionFilters {
  status?: TransactionStatus | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'date' | 'amount' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const mockTransactions: Transaction[] = [
  {
    id: 'txn-001',
    date: '2024-12-15T14:23:00Z',
    description: 'Transcription - Episode 127',
    amount: 12.45,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'AssemblyAI',
    metadata: { duration: 3240, model: 'best' }
  },
  {
    id: 'txn-002',
    date: '2024-12-15T11:15:00Z',
    description: 'Speaker Diarization - Marketing Q4',
    amount: 4.32,
    status: 'settled',
    projectId: 'proj-2',
    projectName: 'Marketing Webinars',
    service: 'OpenAI',
    metadata: { speakers: 3 }
  },
  {
    id: 'txn-003',
    date: '2024-12-14T16:42:00Z',
    description: 'Content Generation - Blog Post',
    amount: 0.87,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'Claude',
    metadata: { words: 2847, model: 'claude-3-5-sonnet' }
  },
  {
    id: 'txn-004',
    date: '2024-12-14T14:20:00Z',
    description: 'Transcription - Interview 45',
    amount: 8.76,
    status: 'pending',
    projectId: 'proj-3',
    projectName: 'Interview Archives',
    service: 'AssemblyAI',
    metadata: { duration: 2280 }
  },
  {
    id: 'txn-005',
    date: '2024-12-13T09:33:00Z',
    description: 'Storage Fee - December',
    amount: 15.00,
    status: 'settled',
    projectId: null,
    projectName: null,
    service: 'Supabase',
    metadata: { storageGB: 45.2 }
  },
  {
    id: 'txn-006',
    date: '2024-12-13T08:12:00Z',
    description: 'Insights Extraction - Episode 126',
    amount: 0.24,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'Claude',
    metadata: { insights: 12, model: 'claude-3-5-haiku' }
  },
  {
    id: 'txn-007',
    date: '2024-12-12T15:45:00Z',
    description: 'Transcription Failed - Retry Pending',
    amount: 11.23,
    status: 'failed',
    projectId: 'proj-4',
    projectName: 'Educational Content',
    service: 'AssemblyAI',
    metadata: { error: 'audio_quality_low', duration: 2920 }
  },
  {
    id: 'txn-008',
    date: '2024-12-12T13:20:00Z',
    description: 'Content Generation - Social Media Pack',
    amount: 1.45,
    status: 'settled',
    projectId: 'proj-2',
    projectName: 'Marketing Webinars',
    service: 'Claude',
    metadata: { outputs: 7, model: 'claude-3-5-sonnet' }
  },
  {
    id: 'txn-009',
    date: '2024-12-11T17:05:00Z',
    description: 'Transcription - Webinar Recording',
    amount: 14.67,
    status: 'settled',
    projectId: 'proj-2',
    projectName: 'Marketing Webinars',
    service: 'AssemblyAI',
    metadata: { duration: 3816 }
  },
  {
    id: 'txn-010',
    date: '2024-12-11T10:22:00Z',
    description: 'Speaker Diarization - Episode 125',
    amount: 3.98,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'OpenAI',
    metadata: { speakers: 2 }
  },
  {
    id: 'txn-011',
    date: '2024-12-10T14:55:00Z',
    description: 'Narrative Coverage Analysis',
    amount: 0.34,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'Claude',
    metadata: { topics: 8, model: 'claude-sonnet-4-5' }
  },
  {
    id: 'txn-012',
    date: '2024-12-10T11:40:00Z',
    description: 'Transcription - Tutorial Video',
    amount: 9.23,
    status: 'settled',
    projectId: 'proj-4',
    projectName: 'Educational Content',
    service: 'AssemblyAI',
    metadata: { duration: 2400 }
  },
  {
    id: 'txn-013',
    date: '2024-12-09T16:18:00Z',
    description: 'Content Generation - Newsletter',
    amount: 0.56,
    status: 'pending',
    projectId: 'proj-2',
    projectName: 'Marketing Webinars',
    service: 'Claude',
    metadata: { words: 1243, model: 'claude-3-5-sonnet' }
  },
  {
    id: 'txn-014',
    date: '2024-12-09T09:30:00Z',
    description: 'Transcription - Interview 44',
    amount: 7.89,
    status: 'settled',
    projectId: 'proj-3',
    projectName: 'Interview Archives',
    service: 'AssemblyAI',
    metadata: { duration: 2052 }
  },
  {
    id: 'txn-015',
    date: '2024-12-08T15:12:00Z',
    description: 'Hosting Fee - December',
    amount: 25.00,
    status: 'settled',
    projectId: null,
    projectName: null,
    service: 'Vercel',
    metadata: { bandwidth: 125.4 }
  },
  {
    id: 'txn-016',
    date: '2024-12-08T11:05:00Z',
    description: 'Speaker Diarization - Tutorial',
    amount: 2.87,
    status: 'settled',
    projectId: 'proj-4',
    projectName: 'Educational Content',
    service: 'OpenAI',
    metadata: { speakers: 1 }
  },
  {
    id: 'txn-017',
    date: '2024-12-07T14:33:00Z',
    description: 'Insights Extraction - Webinar',
    amount: 0.31,
    status: 'settled',
    projectId: 'proj-2',
    projectName: 'Marketing Webinars',
    service: 'Claude',
    metadata: { insights: 15, model: 'claude-3-5-haiku' }
  },
  {
    id: 'txn-018',
    date: '2024-12-07T10:20:00Z',
    description: 'Transcription - Episode 124',
    amount: 13.21,
    status: 'settled',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'AssemblyAI',
    metadata: { duration: 3432 }
  },
  {
    id: 'txn-019',
    date: '2024-12-06T16:48:00Z',
    description: 'Content Generation - Quote Graphics',
    amount: 0.45,
    status: 'failed',
    projectId: 'proj-1',
    projectName: 'Tech Podcast Series',
    service: 'Claude',
    metadata: { error: 'rate_limit', model: 'claude-3-5-sonnet' }
  },
  {
    id: 'txn-020',
    date: '2024-12-06T09:15:00Z',
    description: 'Transcription - Interview 43',
    amount: 10.54,
    status: 'settled',
    projectId: 'proj-3',
    projectName: 'Interview Archives',
    service: 'AssemblyAI',
    metadata: { duration: 2742 }
  }
];

/**
 * Simulates API latency (100-300ms)
 */
function simulateLatency(): Promise<void> {
  const delay = Math.random() * 200 + 100;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Fetches paginated transactions with filtering and sorting
 */
export async function getTransactions(
  filters: TransactionFilters = {}
): Promise<PaginatedTransactions> {
  await simulateLatency();

  const {
    status = 'all',
    search = '',
    page = 1,
    pageSize = 10,
    sortBy = 'date',
    sortOrder = 'desc'
  } = filters;

  let filtered = [...mockTransactions];

  // Apply status filter
  if (status !== 'all') {
    filtered = filtered.filter(txn => txn.status === status);
  }

  // Apply search filter
  if (search.trim()) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(txn =>
      txn.description.toLowerCase().includes(searchLower) ||
      txn.projectName?.toLowerCase().includes(searchLower) ||
      txn.service.toLowerCase().includes(searchLower)
    );
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'amount':
        comparison = a.amount - b.amount;
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTransactions = filtered.slice(startIndex, endIndex);

  return {
    transactions: paginatedTransactions,
    total,
    page,
    pageSize,
    totalPages
  };
}

/**
 * Gets a single transaction by ID
 */
export async function getTransactionById(id: string): Promise<Transaction | null> {
  await simulateLatency();
  return mockTransactions.find(txn => txn.id === id) || null;
}

/**
 * Gets transaction statistics
 */
export async function getTransactionStats(): Promise<{
  totalTransactions: number;
  totalAmount: number;
  pendingCount: number;
  failedCount: number;
}> {
  await simulateLatency();

  return {
    totalTransactions: mockTransactions.length,
    totalAmount: mockTransactions
      .filter(txn => txn.status === 'settled')
      .reduce((sum, txn) => sum + txn.amount, 0),
    pendingCount: mockTransactions.filter(txn => txn.status === 'pending').length,
    failedCount: mockTransactions.filter(txn => txn.status === 'failed').length
  };
}
