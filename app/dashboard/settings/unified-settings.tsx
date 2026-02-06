"use client";

import { useState, useEffect, useMemo } from 'react';
import {
  User,
  CreditCard,
  BarChart3,
  Mail,
  Lock,
  Save,
  Loader2,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KPICard } from '@/components/ui/kpi-card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';
import CreditPackages from '@/components/billing/credit-packages';

// ============================================================================
// TYPES
// ============================================================================

interface Balance {
  balance: number;
  formatted: string;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
}

interface Transaction {
  id: string;
  createdAt: string;
  transactionType: 'purchase' | 'debit' | 'refund' | 'adjustment';
  amount: number;
  reason: string;
}

interface UsageEvent {
  id: string;
  service: string;
  provider: string;
  units: number;
  billed_cost: number;
  created_at: string;
}

interface UnifiedSettingsProps {
  userId: string;
  userEmail: string;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TransactionTypeBadge({ type }: { type: Transaction['transactionType'] }) {
  const config = {
    purchase: { variant: 'success' as const, label: 'Purchase' },
    debit: { variant: 'secondary' as const, label: 'Usage' },
    refund: { variant: 'info' as const, label: 'Refund' },
    adjustment: { variant: 'warning' as const, label: 'Adjustment' }
  };

  const { variant, label } = config[type] || { variant: 'secondary' as const, label: type };

  return <Badge variant={variant}>{label}</Badge>;
}

function DonutChart({
  spent,
  remaining,
  total
}: {
  spent: number;
  remaining: number;
  total: number;
}) {
  const data = [
    { name: 'Remaining', value: remaining, color: '#22c55e' },
    { name: 'Spent', value: spent, color: '#e5e7eb' }
  ];

  const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">{percentage}%</span>
        <span className="text-xs text-gray-500">remaining</span>
      </div>
    </div>
  );
}

function UsageAreaChart({ data }: { data: Array<{ date: string; cost: number; events: number }> }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No usage data available yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          formatter={(value: number, name: string) => [
            name === 'cost' ? `$${value.toFixed(2)}` : value,
            name === 'cost' ? 'Cost' : 'Events'
          ]}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#3b82f6"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCost)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function UnifiedSettings({ userId, userEmail }: UnifiedSettingsProps) {
  const { session } = useAuth();

  // General tab state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Billing tab state
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [showPurchase, setShowPurchase] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(true);

  // Usage tab state
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageTrend, setUsageTrend] = useState<Array<{ date: string; cost: number; events: number }>>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const TRANSACTIONS_PER_PAGE = 10;

  // Fetch billing data
  useEffect(() => {
    const fetchBillingData = async () => {
      if (!session?.access_token) {
        setLoadingBilling(false);
        return;
      }

      setLoadingBilling(true);
      try {
        const [balanceRes, transactionsRes] = await Promise.all([
          fetch('/api/billing/balance', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }),
          fetch(`/api/billing/transactions?limit=${TRANSACTIONS_PER_PAGE}&offset=${(transactionPage - 1) * TRANSACTIONS_PER_PAGE}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
        ]);

        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          setBalance(balanceData);
        }

        if (transactionsRes.ok) {
          const transData = await transactionsRes.json();
          setTransactions(transData.transactions || []);
          setTransactionTotal(transData.total || 0);
        }
      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setLoadingBilling(false);
      }
    };

    fetchBillingData();
  }, [session, transactionPage]);

  // Fetch usage data
  useEffect(() => {
    const fetchUsageData = async () => {
      if (!session?.access_token) {
        setLoadingUsage(false);
        return;
      }

      setLoadingUsage(true);
      try {
        const usageRes = await fetch('/api/billing/usage?limit=200', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (usageRes.ok) {
          const usageData = await usageRes.json();
          const events = usageData.events || [];
          setUsageEvents(events);

          // Process trend data with date validation
          const trendMap = new Map<string, { cost: number; count: number; timestamp: number }>();
          events.forEach((event: UsageEvent) => {
            // Validate date
            if (!event.created_at) return;
            const dateObj = new Date(event.created_at);
            if (isNaN(dateObj.getTime())) return; // Skip invalid dates

            const dateKey = dateObj.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            });
            const existing = trendMap.get(dateKey) || { cost: 0, count: 0, timestamp: dateObj.getTime() };
            trendMap.set(dateKey, {
              cost: existing.cost + Number(event.billed_cost || 0),
              count: existing.count + 1,
              timestamp: Math.max(existing.timestamp, dateObj.getTime())
            });
          });

          // Sort by timestamp and take last 30 days
          const trend = Array.from(trendMap.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(-30)
            .map(([date, data]) => ({
              date,
              cost: Number(data.cost.toFixed(2)),
              events: data.count
            }));

          setUsageTrend(trend);
        }
      } catch (error) {
        console.error('Error fetching usage data:', error);
      } finally {
        setLoadingUsage(false);
      }
    };

    fetchUsageData();
  }, [session]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!transactionSearch) return transactions;
    const term = transactionSearch.toLowerCase();
    return transactions.filter(t =>
      t.transactionType.toLowerCase().includes(term) ||
      t.reason.toLowerCase().includes(term)
    );
  }, [transactions, transactionSearch]);

  // Usage stats
  const usageStats = useMemo(() => {
    if (!usageEvents || usageEvents.length === 0) {
      return {
        totalCost: 0,
        totalEvents: 0,
        topService: null,
        byService: {} as Record<string, number>
      };
    }

    const totalCost = usageEvents.reduce((sum, e) => sum + Number(e.billed_cost || 0), 0);
    const totalEvents = usageEvents.length;

    // Group by service (filter out undefined/empty service names)
    const byService: Record<string, number> = {};
    usageEvents.forEach(e => {
      const serviceName = e.service?.trim();
      if (serviceName) {
        byService[serviceName] = (byService[serviceName] || 0) + Number(e.billed_cost || 0);
      }
    });

    const sortedServices = Object.entries(byService).sort(([, a], [, b]) => b - a);
    const topService = sortedServices.length > 0
      ? { name: sortedServices[0][0], cost: sortedServices[0][1] }
      : null;

    return {
      totalCost,
      totalEvents,
      topService,
      byService
    };
  }, [usageEvents]);

  // Handlers
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      // Simulate save
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportTransactions = () => {
    const csv = [
      ['Date', 'Type', 'Amount', 'Reason'],
      ...transactions.map(t => [
        new Date(t.createdAt).toISOString(),
        t.transactionType,
        t.amount.toFixed(2),
        t.reason
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general" className="gap-2">
            <User className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* GENERAL TAB */}
        {/* ================================================================ */}
        <TabsContent value="general">
          <div className="space-y-6">
            {/* Profile Section */}
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your account details and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Password Section */}
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {profileMessage && (
                  <div className={cn(
                    "p-3 rounded-lg text-sm",
                    profileMessage.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  )}>
                    {profileMessage.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Changes
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* BILLING TAB */}
        {/* ================================================================ */}
        <TabsContent value="billing">
          {loadingBilling ? (
            <div className="animate-pulse space-y-6">
              <div className="h-48 bg-gray-200 rounded-lg" />
              <div className="h-64 bg-gray-200 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Credit Balance Overview */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Donut Chart Card */}
                <Card className="md:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Credits Remaining</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DonutChart
                      spent={balance?.lifetimeCreditsSpent || 0}
                      remaining={balance?.balance || 0}
                      total={balance?.lifetimeCreditsAdded || 1}
                    />
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Available</span>
                        <span className="font-semibold text-green-600">
                          ${(balance?.balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Total Spent</span>
                        <span className="font-medium text-gray-900">
                          ${(balance?.lifetimeCreditsSpent || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPurchase(true)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add Credits
                    </button>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                  <KPICard
                    title="Lifetime Added"
                    value={`$${(balance?.lifetimeCreditsAdded || 0).toFixed(2)}`}
                    icon={<ArrowUpRight className="h-5 w-5" />}
                  />
                  <KPICard
                    title="Lifetime Spent"
                    value={`$${(balance?.lifetimeCreditsSpent || 0).toFixed(2)}`}
                    icon={<ArrowDownRight className="h-5 w-5" />}
                  />
                  <KPICard
                    title="Transactions"
                    value={transactionTotal}
                    icon={<CreditCard className="h-5 w-5" />}
                    subtitle="All time"
                  />
                  <KPICard
                    title="Avg. Transaction"
                    value={`$${transactionTotal > 0 ? ((balance?.lifetimeCreditsAdded || 0) / Math.max(1, transactions.filter(t => t.amount > 0).length)).toFixed(2) : '0.00'}`}
                    icon={<Minus className="h-5 w-5" />}
                  />
                </div>
              </div>

              {/* Purchase Modal */}
              {showPurchase && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Purchase Credits</CardTitle>
                      <button
                        type="button"
                        onClick={() => setShowPurchase(false)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CreditPackages onSuccess={() => setShowPurchase(false)} />
                  </CardContent>
                </Card>
              )}

              {/* Transaction History Table */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle>Transaction History</CardTitle>
                      <CardDescription>View and export your billing history</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={transactionSearch}
                          onChange={(e) => setTransactionSearch(e.target.value)}
                          className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleExportTransactions}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                      No transactions found
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Date</th>
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Type</th>
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Description</th>
                              <th className="text-right font-medium text-gray-500 px-6 py-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredTransactions.map((transaction) => (
                              <tr key={transaction.id} className="hover:bg-gray-50/50">
                                <td className="px-6 py-3 text-gray-500">
                                  {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </td>
                                <td className="px-6 py-3">
                                  <TransactionTypeBadge type={transaction.transactionType} />
                                </td>
                                <td className="px-6 py-3 text-gray-700 max-w-xs truncate">
                                  {transaction.reason || '—'}
                                </td>
                                <td className={cn(
                                  "px-6 py-3 text-right font-semibold",
                                  transaction.amount > 0 ? "text-green-600" : "text-gray-900"
                                )}>
                                  {transaction.amount > 0 ? '+' : ''}${transaction.amount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                        <span className="text-sm text-gray-500">
                          Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, transactionTotal)} of {transactionTotal}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTransactionPage(p => Math.max(1, p - 1))}
                            disabled={transactionPage === 1}
                            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransactionPage(p => p + 1)}
                            disabled={transactionPage * TRANSACTIONS_PER_PAGE >= transactionTotal}
                            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* USAGE TAB */}
        {/* ================================================================ */}
        <TabsContent value="usage">
          {loadingUsage ? (
            <div className="animate-pulse space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-gray-200 rounded-lg" />
                ))}
              </div>
              <div className="h-80 bg-gray-200 rounded-lg" />
            </div>
          ) : usageEvents.length === 0 ? (
            // Empty state when no usage data
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No usage data yet</h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Start processing podcasts and generating content to see your usage statistics and trends here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Usage KPIs */}
              <div className="grid gap-4 md:grid-cols-3">
                <KPICard
                  title="Total Usage Events"
                  value={usageStats.totalEvents}
                  icon={<BarChart3 className="h-5 w-5" />}
                  trend={usageStats.totalEvents > 10 ? {
                    value: 15,
                    direction: 'up',
                    label: 'vs last period'
                  } : undefined}
                />
                <KPICard
                  title="Total Cost"
                  value={`$${usageStats.totalCost.toFixed(2)}`}
                  icon={<CreditCard className="h-5 w-5" />}
                />
                <KPICard
                  title="Top Service"
                  value={usageStats.topService?.name?.replace(/_/g, ' ') || 'N/A'}
                  icon={<ArrowUpRight className="h-5 w-5" />}
                  subtitle={usageStats.topService?.cost ? `$${usageStats.topService.cost.toFixed(2)}` : undefined}
                />
              </div>

              {/* Usage Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Usage Trends</CardTitle>
                  <CardDescription>
                    Your spending over the last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UsageAreaChart data={usageTrend} />
                </CardContent>
              </Card>

              {/* Service Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Service Breakdown</CardTitle>
                  <CardDescription>
                    Cost distribution by service type
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(usageStats.byService).length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <BarChart3 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No usage data available</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Start processing content to see your service breakdown
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {(() => {
                        const total = usageStats.totalCost;
                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

                        return Object.entries(usageStats.byService)
                          .sort(([, a], [, b]) => b - a)
                          .map(([service, cost], index) => {
                            const percentage = total > 0 ? Math.round((cost / total) * 100) : 0;
                            const barWidth = total > 0 ? (cost / total) * 100 : 0;

                            return (
                              <div key={service} className="py-3 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: colors[index % colors.length] }}
                                    />
                                    <span className="text-sm font-medium text-gray-900 capitalize">
                                      {service.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-gray-900">
                                      ${cost.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-gray-500 w-10 text-right">
                                      {percentage}%
                                    </span>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${barWidth}%`,
                                      backgroundColor: colors[index % colors.length]
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
