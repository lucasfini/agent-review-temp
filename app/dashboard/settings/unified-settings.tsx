"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  Globe,
  Bell,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';
import CreditPackages from '@/components/billing/credit-packages';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';
import { supabase } from '@/lib/supabase/client';

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
  invoiceNumber?: string | null;
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
      isLow ? "border-amber-800/30 bg-amber-900/20" : "border-slate-700 bg-slate-900"
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-400 mb-1">Credit Balance</p>
          <p className="text-4xl font-bold text-slate-50">{formatAmount(current)}</p>
          <p className="text-sm text-slate-400 mt-1">
            {formatAmount(spent)} spent of {formatAmount(total)} total
          </p>
        </div>

        <div className="flex-1 max-w-xs">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>{pctRemaining}% remaining</span>
            <span>{formatAmount(current)} left</span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
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
        <div className="mt-4 flex items-center gap-2 text-sm text-amber-400">
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
      <div className="flex items-center justify-center h-64 text-slate-400">
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
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#334155' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)',
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
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'general';

  // Provider detection
  const isGoogleAuth = ((session?.user?.app_metadata?.providers as string[] | undefined) ?? []).includes('google');

  // General tab state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preferences state
  const [timezone, setTimezone] = useState('America/New_York');
  const [locale, setLocale] = useState('en-US');
  const [outputPreference, setOutputPreference] = useState('balanced');

  // Notifications state
  const [notifications, setNotifications] = useState({
    processing_complete: true,
    processing_failed: true,
    low_credits: true,
    weekly_summary: false,
  });

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
  const [dataSharingOptIn, setDataSharingOptIn] = useState<boolean | null>(null);
  const [dataSharingSaving, setDataSharingSaving] = useState(false);

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

  useEffect(() => {
    const fetchUserPrefs = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const meta = data.user?.user_metadata || {};
        setDataSharingOptIn(Boolean(meta.openai_data_sharing_opt_in));
        setDisplayName(meta.display_name || meta.full_name || '');
        if (meta.timezone) setTimezone(meta.timezone);
        if (meta.locale) setLocale(meta.locale);
        if (meta.output_preference) setOutputPreference(meta.output_preference);
        if (meta.notifications) {
          setNotifications({
            processing_complete: meta.notifications.processing_complete ?? true,
            processing_failed: meta.notifications.processing_failed ?? true,
            low_credits: meta.notifications.low_credits ?? true,
            weekly_summary: meta.notifications.weekly_summary ?? false,
          });
        }
      } catch (error) {
        console.warn('Failed to load user preferences:', error);
      }
    };
    fetchUserPrefs();
  }, []);

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
      const updateData: Record<string, unknown> = {
        timezone,
        locale,
        output_preference: outputPreference,
        notifications,
      };
      if (!isGoogleAuth) {
        updateData.display_name = displayName;
      }
      const { error } = await supabase.auth.updateUser({ data: updateData });
      if (error) throw error;
      setProfileMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportTransactions = () => {
    const csv = [
      ['Date', 'Type', 'Amount', 'Reason', 'Invoice Number'],
      ...transactions.map(t => [
        new Date(t.createdAt).toISOString(),
        t.transactionType,
        t.amount.toFixed(4),
        t.reason,
        t.invoiceNumber || ''
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

  const handleToggleDataSharing = async () => {
    if (dataSharingOptIn === null) return;
    setDataSharingSaving(true);
    try {
      const next = !dataSharingOptIn;
      const now = new Date().toISOString();
      await supabase.auth.updateUser({
        data: {
          openai_data_sharing_opt_in: next,
          openai_data_sharing_opt_in_at: next ? now : null,
        }
      });
      setDataSharingOptIn(next);
    } catch (error) {
      console.error('Failed to update data sharing preference:', error);
    } finally {
      setDataSharingSaving(false);
    }
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
        {/* Tab navigation */}
        <div className="flex gap-1 mb-8 border-b border-slate-800">
          {[
            { label: 'General', href: '/dashboard/settings?section=general', id: 'general', icon: <User className="h-4 w-4" /> },
            { label: 'Billing', href: '/dashboard/settings?section=billing', id: 'billing', icon: <CreditCard className="h-4 w-4" /> },
            { label: 'Usage', href: '/dashboard/settings?section=usage', id: 'usage', icon: <BarChart3 className="h-4 w-4" /> },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              {...(tab.id === 'usage' ? { 'data-tour': 'usage-tab' } : {})}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
                section === tab.id
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </div>

        {/* ================================================================ */}
        {/* GENERAL */}
        {/* ================================================================ */}
        {section === 'general' && (
          <div className="space-y-6">
            {/* Profile Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                      {isGoogleAuth
                        ? 'Your name and email are managed by Google'
                        : 'Update your account display name'}
                    </CardDescription>
                  </div>
                  {isGoogleAuth && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 rounded-full">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Google Account
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={isGoogleAuth || savingProfile}
                      placeholder="Your name"
                      className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {isGoogleAuth && (
                      <p className="mt-1 text-xs text-slate-500">Managed by your Google account</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Email Address
                    </label>
                    <div className="relative" title="To change your email address, please contact support">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        disabled
                        className="w-full pl-10 pr-3 py-2 border border-slate-700 bg-slate-800 text-slate-400 rounded-lg text-sm cursor-not-allowed opacity-60"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Contact support to change your email</p>
                  </div>
                </div>

                {!isGoogleAuth && (
                  <>
                    {profileMessage && (
                      <div className={cn(
                        "p-3 rounded-lg text-sm",
                        profileMessage.type === 'success' ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"
                      )}>
                        {profileMessage.text}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Password Section — email/password users only */}
            {!isGoogleAuth && (
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
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Current Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="w-full pl-10 pr-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="w-full pl-10 pr-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preferences Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-slate-400" />
                  <div>
                    <CardTitle>Preferences</CardTitle>
                    <CardDescription>
                      Set your timezone, locale, and default content style
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="America/Anchorage">Alaska Time (AKT)</option>
                      <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                      <option value="Europe/London">London (GMT)</option>
                      <option value="Europe/Paris">Paris (CET)</option>
                      <option value="Europe/Berlin">Berlin (CET)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Shanghai">Shanghai (CST)</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Australia/Sydney">Sydney (AEDT)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Date Format / Locale
                    </label>
                    <select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="en-US">English (US) — MM/DD/YYYY</option>
                      <option value="en-GB">English (UK) — DD/MM/YYYY</option>
                      <option value="en-CA">English (CA) — YYYY-MM-DD</option>
                      <option value="fr-FR">French — DD/MM/YYYY</option>
                      <option value="de-DE">German — DD.MM.YYYY</option>
                      <option value="ja-JP">Japanese — YYYY年MM月DD日</option>
                      <option value="zh-CN">Chinese (Simplified)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Default Output Style
                    </label>
                    <select
                      value={outputPreference}
                      onChange={(e) => setOutputPreference(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="concise">Concise — shorter, punchy outputs</option>
                      <option value="balanced">Balanced — default length</option>
                      <option value="detailed">Detailed — longer, thorough outputs</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notifications Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-400" />
                  <div>
                    <CardTitle>Notifications</CardTitle>
                    <CardDescription>
                      Choose which alerts you want to receive
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-0 divide-y divide-slate-800">
                {([
                  { key: 'processing_complete' as const, label: 'Processing Complete', description: 'When your audio has finished transcribing and generating content' },
                  { key: 'processing_failed' as const, label: 'Processing Failed', description: 'When an upload or AI generation job fails' },
                  { key: 'low_credits' as const, label: 'Low Credits', description: 'When your credit balance drops below a threshold' },
                  { key: 'weekly_summary' as const, label: 'Weekly Summary', description: 'A weekly digest of your usage and activity' },
                ] as const).map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifications[key]}
                      onClick={() => setNotifications(prev => ({ ...prev, [key]: !prev[key] }))}
                      className={cn(
                        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                        notifications[key] ? 'bg-blue-600' : 'bg-slate-700'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200',
                          notifications[key] ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Global Save Button (covers Profile, Preferences, Notifications) */}
            <div className="flex items-center justify-between">
              <div>
                {profileMessage && (
                  <p className={cn(
                    "text-sm",
                    profileMessage.type === 'success' ? "text-green-400" : "text-red-400"
                  )}>
                    {profileMessage.text}
                  </p>
                )}
              </div>
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
                Save Settings
              </button>
            </div>

            {/* Data & AI Preferences */}
            <Card>
              <CardHeader>
                <CardTitle>Data & AI</CardTitle>
                <CardDescription>
                  Control whether your data is shared with OpenAI for free token benefits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      Share data with OpenAI (opt-in)
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">
                      If enabled, we will route your AI processing through the OpenAI project with data sharing enabled.
                      You can change this anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleDataSharing}
                    disabled={dataSharingSaving || dataSharingOptIn === null}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      dataSharingOptIn
                        ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    } ${dataSharingSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700/50'}`}
                  >
                    {dataSharingOptIn ? 'Opted In' : 'Not Opted In'}
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
                  <div className="text-sm text-slate-400">Loading integrations...</div>
                )}
                {!integrationsLoading && integrationsError && (
                  <div className="text-sm text-red-400">{integrationsError}</div>
                )}
                {!integrationsLoading && !integrationsError && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {(['zoom', 'microsoft'] as IntegrationProvider[]).map(provider => {
                      const status = integrations.find(i => i.provider === provider);
                      const connected = status?.connected;
                      return (
                        <div key={provider} className="border border-slate-700 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-50">
                                {provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                {connected
                                  ? `Connected${status?.metadata?.email ? ` • ${status.metadata.email}` : ''}`
                                  : 'Not connected'}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-900/20 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
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
                                className="px-3 py-2 text-sm font-medium bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
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
        )}

        {/* ================================================================ */}
        {/* BILLING */}
        {/* ================================================================ */}
        {section === 'billing' && (
          loadingBilling ? (
            <div className="animate-pulse space-y-6">
              <div className="h-32 bg-slate-700 rounded-lg" />
              <div className="h-48 bg-slate-700 rounded-lg" />
              <div className="h-64 bg-slate-700 rounded-lg" />
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
                            <span className="text-2xl font-semibold text-slate-50">~${basic.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Basic</span>
                          </div>
                          <p className="text-sm text-slate-400">Transcription + speaker labels</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-slate-50">~${pro.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Pro</span>
                          </div>
                          <p className="text-sm text-slate-400">+ Speaker names, AI summary</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-slate-50">~${premium.total.toFixed(2)}</span>
                            <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Premium</span>
                          </div>
                          <p className="text-sm text-slate-400">+ Chapters, takeaways, quotes, insights</p>
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={transactionSearch}
                          onChange={(e) => setTransactionSearch(e.target.value)}
                          className="pl-9 pr-3 py-1.5 text-sm border border-slate-700 bg-slate-800 text-slate-200 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleExportTransactions}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800/50"
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      No transactions found
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-800/30">
                              <th className="text-left font-medium text-slate-400 px-6 py-3 w-8"></th>
                              <th className="text-left font-medium text-slate-400 px-6 py-3">Date</th>
                              <th className="text-left font-medium text-slate-400 px-6 py-3">Type</th>
                              <th className="text-left font-medium text-slate-400 px-6 py-3">Description</th>
                              <th className="text-left font-medium text-slate-400 px-6 py-3">Invoice</th>
                              <th className="text-right font-medium text-slate-400 px-6 py-3">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {filteredTransactions.map((transaction) => {
                              const isGrouped = transaction.type === 'grouped';
                              const isExpanded = expandedGroups.has(transaction.id);

                              return (
                                <>{/* Fragment for group + children */}
                                  <tr
                                    key={transaction.id}
                                    className={cn(
                                      "hover:bg-slate-800/30",
                                      isGrouped && "cursor-pointer"
                                    )}
                                    onClick={isGrouped ? () => toggleGroup(transaction.id) : undefined}
                                  >
                                    <td className="px-6 py-3 w-8">
                                      {isGrouped && (
                                        isExpanded
                                          ? <ChevronUp className="h-4 w-4 text-slate-500" />
                                          : <ChevronDown className="h-4 w-4 text-slate-500" />
                                      )}
                                    </td>
                                    <td className="px-6 py-3 text-slate-400">
                                      {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })}
                                    </td>
                                    <td className="px-6 py-3">
                                      <TransactionTypeBadge type={transaction.transactionType} />
                                    </td>
                                    <td className="px-6 py-3 text-slate-300 max-w-xs truncate">
                                      {transaction.reason || '-'}
                                      {isGrouped && transaction.childCount && (
                                        <span className="ml-2 text-xs text-slate-500">
                                          ({transaction.childCount} items)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-6 py-3 text-slate-300">
                                      {isGrouped ? '-' : (transaction.invoiceNumber || '-')}
                                    </td>
                                    <td className={cn(
                                      "px-6 py-3 text-right font-semibold",
                                      transaction.amount > 0 ? "text-green-600" : "text-slate-50"
                                    )}>
                                      {transaction.amount > 0 ? '+' : ''}{formatAmount(transaction.amount)}
                                    </td>
                                  </tr>
                                  {/* Expanded children */}
                                  {isGrouped && isExpanded && transaction.children?.map((child, idx) => (
                                    <tr key={`${transaction.id}-child-${idx}`} className="bg-slate-800/50/80">
                                      <td className="px-6 py-2"></td>
                                      <td className="px-6 py-2 text-xs text-slate-500">
                                        {new Date(child.createdAt).toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="px-6 py-2"></td>
                                      <td className="pl-12 pr-6 py-2 text-xs text-slate-400">
                                        {child.reason}
                                      </td>
                                      <td className="px-6 py-2 text-right text-xs text-slate-400">
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
                      <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-800/30">
                        <span className="text-sm text-slate-400">
                          Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, transactionTotal)} of {transactionTotal}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTransactionPage(p => Math.max(1, p - 1))}
                            disabled={transactionPage === 1}
                            className="p-1 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransactionPage(p => p + 1)}
                            disabled={transactionPage * TRANSACTIONS_PER_PAGE >= transactionTotal}
                            className="p-1 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
          )
        )}

        {/* ================================================================ */}
        {/* USAGE */}
        {/* ================================================================ */}
        {section === 'usage' && (
          loadingUsage ? (
            <div className="animate-pulse space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-slate-700 rounded-lg" />
                ))}
              </div>
              <div className="h-80 bg-slate-700 rounded-lg" />
            </div>
          ) : usageEvents.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                  <h3 className="text-lg font-medium text-slate-50 mb-1">No usage data yet</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto">
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
                    <p className="text-sm font-medium text-slate-400">Total Cost</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">{formatAmount(usageStats.totalCost)}</p>
                    <p className="text-xs text-slate-500 mt-1">{usageStats.totalEvents} API calls</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-slate-400">Projects Processed</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">{usageStats.projectCount}</p>
                    <p className="text-xs text-slate-500 mt-1">Unique projects</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-slate-400">Avg Cost / Project</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">
                      {usageStats.projectCount > 0
                        ? formatAmount(usageStats.totalCost / usageStats.projectCount)
                        : '$0.00'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Per project average</p>
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
                    <div className="py-8 text-center text-slate-400">
                      <BarChart3 className="h-10 w-10 mx-auto mb-3 text-slate-500" />
                      <p className="text-sm">No project usage data available</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
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
                                  <span className="text-sm font-medium text-slate-50">
                                    {project.title}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {project.events} calls, {project.serviceCount} services
                                  </span>
                                </div>
                                <span className="text-sm font-semibold text-slate-50">
                                  {formatAmount(project.cost)}
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
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
          )
        )}
    </div>
  );
}
