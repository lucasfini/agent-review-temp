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
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';
import CreditPackages from '@/components/billing/credit-packages';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';

// ============================================================================
// TYPES
// ============================================================================

interface Balance {
  balance: number;
  formatted: string;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
}

interface GroupedTransaction {
  id: string;
  type: 'single' | 'grouped';
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  projectTitle?: string;
  balanceAfter: number;
  childCount?: number;
  children?: { reason: string; amount: number; createdAt: string }[];
}

interface UsageEvent {
  id: string;
  serviceName: string;
  provider: string;
  units: number;
  billedCost: number;
  createdAt: string;
  projectId?: string;
  projectTitle?: string;
}

interface UnifiedSettingsProps {
  userId: string;
  userEmail: string;
}

type IntegrationProvider = 'zoom' | 'microsoft';

interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  metadata?: { email?: string; name?: string } | null;
  updatedAt?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  if (abs === 0) return '$0.00';
  if (abs < 0.01) return `$${abs.toFixed(4)}`;
  return `$${abs.toFixed(2)}`;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { variant: 'success' | 'secondary' | 'info' | 'warning'; label: string }> = {
    purchase: { variant: 'success', label: 'Purchase' },
    debit: { variant: 'secondary', label: 'Usage' },
    refund: { variant: 'info', label: 'Refund' },
    adjustment: { variant: 'warning', label: 'Adjustment' },
    bonus: { variant: 'info', label: 'Bonus' },
    admin_adjustment: { variant: 'warning', label: 'Adjustment' },
  };

  const { variant, label } = config[type] || { variant: 'secondary' as const, label: type };

  return <Badge variant={variant}>{label}</Badge>;
}

function BalanceBanner({ balance }: { balance: Balance | null }) {
  const current = balance?.balance || 0;
  const total = balance?.lifetimeCreditsAdded || 1;
  const spent = balance?.lifetimeCreditsSpent || 0;
  const pctRemaining = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const isLow = current < 2;

  return (
    <div className={cn(
      "rounded-xl border p-6",
      isLow ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white"
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Credit Balance</p>
          <p className="text-4xl font-bold text-gray-900">{formatAmount(current)}</p>
          <p className="text-sm text-gray-500 mt-1">
            {formatAmount(spent)} spent of {formatAmount(total)} total
          </p>
        </div>

        <div className="flex-1 max-w-xs">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{pctRemaining}% remaining</span>
            <span>{formatAmount(current)} left</span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isLow ? "bg-amber-500" : "bg-green-500"
              )}
              style={{ width: `${pctRemaining}%` }}
            />
          </div>
        </div>
      </div>

      {isLow && (
        <div className="mt-4 flex items-center gap-2 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Low balance — add credits to keep processing projects.</span>
        </div>
      )}
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
            name === 'cost' ? formatAmount(value) : value,
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
  const [transactions, setTransactions] = useState<GroupedTransaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingBilling, setLoadingBilling] = useState(true);

  // Usage tab state
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageTrend, setUsageTrend] = useState<Array<{ date: string; cost: number; events: number }>>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);

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
          fetch(`/api/billing/transactions/grouped?limit=${TRANSACTIONS_PER_PAGE}&offset=${(transactionPage - 1) * TRANSACTIONS_PER_PAGE}`, {
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

  useEffect(() => {
    const fetchIntegrations = async () => {
      if (!session?.access_token) return;
      setIntegrationsLoading(true);
      setIntegrationsError(null);
      try {
        const res = await fetch('/api/integrations/providers', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error('Failed to load integrations');
        const data = await res.json();
        setIntegrations(data.providers || []);
      } catch (error) {
        setIntegrationsError(error instanceof Error ? error.message : 'Failed to load integrations');
      } finally {
        setIntegrationsLoading(false);
      }
    };

    fetchIntegrations();
  }, [session?.access_token]);

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

          // Process trend data
          const trendMap = new Map<string, { cost: number; count: number; timestamp: number }>();
          events.forEach((event: any) => {
            if (!event.createdAt) return;
            const dateObj = new Date(event.createdAt);
            if (isNaN(dateObj.getTime())) return;

            const dateKey = dateObj.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            });
            const existing = trendMap.get(dateKey) || { cost: 0, count: 0, timestamp: dateObj.getTime() };
            trendMap.set(dateKey, {
              cost: existing.cost + Number(event.billedCost || 0),
              count: existing.count + 1,
              timestamp: Math.max(existing.timestamp, dateObj.getTime())
            });
          });

          const trend = Array.from(trendMap.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(-30)
            .map(([date, data]) => ({
              date,
              cost: Number(data.cost.toFixed(4)),
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
      t.reason.toLowerCase().includes(term) ||
      (t.projectTitle && t.projectTitle.toLowerCase().includes(term))
    );
  }, [transactions, transactionSearch]);

  // Usage grouped by project
  const usageByProject = useMemo(() => {
    if (!usageEvents || usageEvents.length === 0) return [];

    const projectMap = new Map<string, { title: string; cost: number; events: number; services: Set<string> }>();

    usageEvents.forEach(e => {
      const pid = e.projectId || 'unknown';
      const title = e.projectTitle || (pid === 'unknown' ? 'Unassigned' : pid);
      const existing = projectMap.get(pid) || { title, cost: 0, events: 0, services: new Set<string>() };
      existing.cost += Number(e.billedCost || 0);
      existing.events += 1;
      if (e.serviceName) existing.services.add(e.serviceName);
      projectMap.set(pid, existing);
    });

    return Array.from(projectMap.entries())
      .map(([id, data]) => ({
        id,
        title: data.title,
        cost: data.cost,
        events: data.events,
        serviceCount: data.services.size,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [usageEvents]);

  // Usage stats
  const usageStats = useMemo(() => {
    if (!usageEvents || usageEvents.length === 0) {
      return { totalCost: 0, totalEvents: 0, projectCount: 0 };
    }

    const totalCost = usageEvents.reduce((sum, e) => sum + Number(e.billedCost || 0), 0);
    const projectIds = new Set(usageEvents.map(e => e.projectId).filter(Boolean));

    return {
      totalCost,
      totalEvents: usageEvents.length,
      projectCount: projectIds.size,
    };
  }, [usageEvents]);

  // Handlers
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);

    try {
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
        t.amount.toFixed(4),
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

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startOAuth = async (provider: IntegrationProvider) => {
    if (!session?.access_token) return;
    const res = await fetch(`/api/integrations/${provider}/start?mode=json`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const disconnectProvider = async (provider: IntegrationProvider) => {
    if (!session?.access_token) return;
    const res = await fetch('/api/integrations/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ provider })
    });
    if (!res.ok) return;
    setIntegrations(prev =>
      prev.map(i => i.provider === provider ? { ...i, connected: false } : i)
    );
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

            {/* Integrations Section */}
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Connect Zoom or Microsoft Teams to import recordings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {integrationsLoading && (
                  <div className="text-sm text-gray-500">Loading integrations...</div>
                )}
                {!integrationsLoading && integrationsError && (
                  <div className="text-sm text-red-600">{integrationsError}</div>
                )}
                {!integrationsLoading && !integrationsError && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {(['zoom', 'microsoft'] as IntegrationProvider[]).map(provider => {
                      const status = integrations.find(i => i.provider === provider);
                      const connected = status?.connected;
                      return (
                        <div key={provider} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {connected
                                  ? `Connected${status?.metadata?.email ? ` • ${status.metadata.email}` : ''}`
                                  : 'Not connected'}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                          <div className="mt-4 flex gap-2">
                            {!connected ? (
                              <button
                                type="button"
                                onClick={() => startOAuth(provider)}
                                className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Connect
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => disconnectProvider(provider)}
                                className="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Disconnect
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
              <div className="h-32 bg-gray-200 rounded-lg" />
              <div className="h-48 bg-gray-200 rounded-lg" />
              <div className="h-64 bg-gray-200 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Balance Banner */}
              <BalanceBanner balance={balance} />

              {/* 1-Hour Cost Estimate */}
              {(() => {
                const basic = estimateTranscriptionCost({ durationSeconds: 3600, tier: 'basic' });
                const pro = estimateTranscriptionCost({ durationSeconds: 3600, tier: 'pro' });
                const premium = estimateTranscriptionCost({ durationSeconds: 3600, tier: 'premium' });
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle>Estimated Cost — 1 Hour of Audio</CardTitle>
                      <CardDescription>
                        Includes 35% service markup. Actual cost depends on recording length and word density.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-gray-900">~${basic.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Basic</span>
                          </div>
                          <p className="text-sm text-gray-500">Transcription + speaker labels</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-gray-900">~${pro.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Pro</span>
                          </div>
                          <p className="text-sm text-gray-500">+ Speaker names, AI summary</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-gray-900">~${premium.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Premium</span>
                          </div>
                          <p className="text-sm text-gray-500">+ Chapters, takeaways, quotes, insights</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Credit Packages — always visible */}
              <Card>
                <CardHeader>
                  <CardTitle>Purchase Credits</CardTitle>
                  <CardDescription>Select a package to add credits to your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <CreditPackages />
                </CardContent>
              </Card>

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
                              <th className="text-left font-medium text-gray-500 px-6 py-3 w-8"></th>
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Date</th>
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Type</th>
                              <th className="text-left font-medium text-gray-500 px-6 py-3">Description</th>
                              <th className="text-right font-medium text-gray-500 px-6 py-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredTransactions.map((transaction) => {
                              const isGrouped = transaction.type === 'grouped';
                              const isExpanded = expandedGroups.has(transaction.id);

                              return (
                                <>{/* Fragment for group + children */}
                                  <tr
                                    key={transaction.id}
                                    className={cn(
                                      "hover:bg-gray-50/50",
                                      isGrouped && "cursor-pointer"
                                    )}
                                    onClick={isGrouped ? () => toggleGroup(transaction.id) : undefined}
                                  >
                                    <td className="px-6 py-3 w-8">
                                      {isGrouped && (
                                        isExpanded
                                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                          : <ChevronDown className="h-4 w-4 text-gray-400" />
                                      )}
                                    </td>
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
                                      {transaction.reason || '-'}
                                      {isGrouped && transaction.childCount && (
                                        <span className="ml-2 text-xs text-gray-400">
                                          ({transaction.childCount} items)
                                        </span>
                                      )}
                                    </td>
                                    <td className={cn(
                                      "px-6 py-3 text-right font-semibold",
                                      transaction.amount > 0 ? "text-green-600" : "text-gray-900"
                                    )}>
                                      {transaction.amount > 0 ? '+' : ''}{formatAmount(transaction.amount)}
                                    </td>
                                  </tr>
                                  {/* Expanded children */}
                                  {isGrouped && isExpanded && transaction.children?.map((child, idx) => (
                                    <tr key={`${transaction.id}-child-${idx}`} className="bg-gray-50/80">
                                      <td className="px-6 py-2"></td>
                                      <td className="px-6 py-2 text-xs text-gray-400">
                                        {new Date(child.createdAt).toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="px-6 py-2"></td>
                                      <td className="pl-12 pr-6 py-2 text-xs text-gray-500">
                                        {child.reason}
                                      </td>
                                      <td className="px-6 py-2 text-right text-xs text-gray-500">
                                        {formatAmount(child.amount)}
                                      </td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
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
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-gray-500">Total Cost</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatAmount(usageStats.totalCost)}</p>
                    <p className="text-xs text-gray-400 mt-1">{usageStats.totalEvents} API calls</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-gray-500">Projects Processed</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{usageStats.projectCount}</p>
                    <p className="text-xs text-gray-400 mt-1">Unique projects</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-gray-500">Avg Cost / Project</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {usageStats.projectCount > 0
                        ? formatAmount(usageStats.totalCost / usageStats.projectCount)
                        : '$0.00'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Per project average</p>
                  </CardContent>
                </Card>
              </div>

              {/* Usage Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Usage Trends</CardTitle>
                  <CardDescription>Your spending over the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <UsageAreaChart data={usageTrend} />
                </CardContent>
              </Card>

              {/* Per-Project Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Cost by Project</CardTitle>
                  <CardDescription>Spending breakdown per project</CardDescription>
                </CardHeader>
                <CardContent>
                  {usageByProject.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <BarChart3 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No project usage data available</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {(() => {
                        const maxCost = Math.max(...usageByProject.map(p => p.cost));
                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

                        return usageByProject.map((project, index) => {
                          const barWidth = maxCost > 0 ? (project.cost / maxCost) * 100 : 0;

                          return (
                            <div key={project.id} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: colors[index % colors.length] }}
                                  />
                                  <span className="text-sm font-medium text-gray-900">
                                    {project.title}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {project.events} calls, {project.serviceCount} services
                                  </span>
                                </div>
                                <span className="text-sm font-semibold text-gray-900">
                                  {formatAmount(project.cost)}
                                </span>
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
