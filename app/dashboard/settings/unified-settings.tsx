"use client";

import { Fragment, useState, useEffect, useMemo, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
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
  Camera,
  Trash2,
  Sparkles,
  Video,
  Users,
  MessageSquare,
  Youtube,
  type LucideIcon,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';
import CreditPackages from '@/components/billing/credit-packages';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatSiteCreditDeltaFromUsd, formatSiteCreditsFromUsd } from '@/lib/billing/display';
import { isIntegrationEnabled } from '@/lib/integrations/availability';
import { isValidEmail } from '@/lib/auth/validation';

// ============================================================================
// TYPES
// ============================================================================

interface Balance {
  balance: number;
  formatted: string;
  availableBalance?: number;
  reservedPending?: number;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
}

interface GroupedTransaction {
  id: string;
  type: 'single' | 'workflow' | 'project';
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  projectTitle?: string;
  balanceAfter: number;
  invoiceNumber?: string | null;
  workflowType?: string;
  holdAmount?: number;
  finalCharge?: number;
  releasedAmount?: number;
  reservationStatus?: string;
  childCount?: number;
  children?: { reason: string; amount: number; createdAt: string; kind?: 'hold' | 'charge' | 'release' | 'usage'; detail?: string }[];
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
  userEmail: string;
  forcedSection?: 'preferences' | 'billing' | 'usage';
}

type IntegrationProvider = 'zoom' | 'microsoft' | 'youtube';

interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  metadata?: { email?: string; name?: string; channelTitle?: string } | null;
  updatedAt?: string | null;
}

const SETTINGS_INTEGRATIONS: Array<{
  provider?: IntegrationProvider;
  name: string;
  detail: string;
  Icon: LucideIcon;
  accent: string;
  bg: string;
  border: string;
}> = [
  {
    provider: 'zoom',
    name: 'Zoom',
    detail: 'Meeting recordings',
    Icon: Video,
    accent: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-100 dark:border-blue-400/20',
  },
  {
    provider: 'microsoft',
    name: 'Teams',
    detail: 'Call recordings',
    Icon: Users,
    accent: 'text-indigo-600 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    border: 'border-indigo-100 dark:border-indigo-400/20',
  },
  {
    provider: 'youtube',
    name: 'YouTube',
    detail: 'Channel access',
    Icon: Youtube,
    accent: 'text-red-600 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/10',
    border: 'border-red-100 dark:border-red-400/20',
  },
  {
    name: 'Slack',
    detail: 'Huddles and clips',
    Icon: MessageSquare,
    accent: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-100 dark:border-emerald-400/20',
  },
];

const integrationLabel = (provider: IntegrationProvider) => {
  if (provider === 'zoom') return 'Zoom';
  if (provider === 'microsoft') return 'Microsoft Teams';
  return 'YouTube';
};

// ============================================================================
// HELPERS
// ============================================================================

function formatAmount(amount: number): string {
  return formatSiteCreditDeltaFromUsd(amount);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { variant: 'success' | 'secondary' | 'info' | 'warning'; label: string }> = {
    purchase: { variant: 'success', label: 'Purchase' },
    debit: { variant: 'secondary', label: 'Usage' },
    workflow: { variant: 'secondary', label: 'Workflow' },
    project: { variant: 'secondary', label: 'Project' },
    refund: { variant: 'info', label: 'Refund' },
    reserve: { variant: 'warning', label: 'Hold' },
    release: { variant: 'info', label: 'Release' },
    settle: { variant: 'secondary', label: 'Charge' },
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
      isLow ? "border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-900/20" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Credit Balance</p>
          <p className="text-4xl font-bold text-slate-900 dark:text-slate-50">{formatSiteCreditsFromUsd(current)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {formatSiteCreditsFromUsd(spent)} spent of {formatSiteCreditsFromUsd(total)} total
          </p>
        </div>

        <div className="flex-1 max-w-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>{pctRemaining}% remaining</span>
            <span>{formatSiteCreditsFromUsd(current)} left</span>
          </div>
          <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
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
        <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Low balance — add credits to keep processing projects.</span>
        </div>
      )}

      {!!balance?.reservedPending && balance.reservedPending > 0 && (
        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Temporary reservation holds stay hidden here until the final charge posts.
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
        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#cbd5e1' }}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatSiteCreditsFromUsd(Number(value))}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 6px -1px rgb(15 23 42 / 0.12)',
          }}
          formatter={(value: number | undefined, name: string | undefined) => {
            const isCost = name === 'cost';
            return [isCost ? formatAmount(value ?? 0) : (value ?? 0), isCost ? 'Cost' : 'Events'];
          }}
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

export default function UnifiedSettings({ userEmail, forcedSection }: UnifiedSettingsProps) {
  const { session, isDemoMode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSection = forcedSection || searchParams.get('section') || 'preferences';
  const section = rawSection === 'general' ? 'preferences' : rawSection;

  // Provider detection
  const isGoogleAuth = ((session?.user?.app_metadata?.providers as string[] | undefined) ?? []).includes('google');

  // Preferences state
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email] = useState(userEmail);
  const [newEmail, setNewEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [reauthNonce, setReauthNonce] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [sendingReauth, setSendingReauth] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailChangeMessage, setEmailChangeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Billing tab state
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<GroupedTransaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  // Usage tab state
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageTrend, setUsageTrend] = useState<Array<{ date: string; cost: number; events: number }>>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [showDeletedUsageProjects, setShowDeletedUsageProjects] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);

  const TRANSACTIONS_PER_PAGE = 10;
  const deleteTarget = username.trim() || email.trim();
  const deleteTargetLabel = username.trim() ? 'username' : 'email';
  const isDeleteConfirmationValid = username.trim()
    ? deleteConfirmation.trim() === username.trim()
    : deleteConfirmation.trim().toLowerCase() === email.trim().toLowerCase();

  function friendlyError(fallback: string, error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  useEffect(() => {
    const fetchDashboardSettings = async () => {
      if (!session?.access_token) {
        setLoadingBilling(false);
        setLoadingTransactions(false);
        setIntegrationsLoading(false);
        setLoadingUsage(false);
        return;
      }

      setLoadingBilling(true);
      setIntegrationsError(null);
      setLoadingTransactions(true);
      setIntegrationsLoading(true);
      setLoadingUsage(true);

      try {
        const response = await fetch(
          `/api/dashboard/settings?transactionLimit=${TRANSACTIONS_PER_PAGE}&transactionOffset=0&usageLimit=200`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to load settings' }));
          throw new Error(payload.error || 'Failed to load settings');
        }

        const data = await response.json();
        setBalance(data.balance || null);
        setTransactions(data.transactions || []);
        setTransactionTotal(data.transactionTotal || 0);
        setIntegrations(data.integrations || []);
        setUsername(data.preferences?.username || '');
        setFirstName(data.preferences?.firstName || '');
        setLastName(data.preferences?.lastName || '');
        setAvatarUrl(data.preferences?.avatarUrl || '');
        setUsageEvents(data.usageEvents || []);
        setUsageTrend(data.usageTrend || []);
      } catch (error) {
        console.error('Error fetching settings data:', error);
        setIntegrationsError(friendlyError('Failed to load integrations', error));
      } finally {
        setLoadingBilling(false);
        setLoadingTransactions(false);
        setIntegrationsLoading(false);
        setLoadingUsage(false);
      }
    };

    fetchDashboardSettings();
  }, [session?.access_token]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!session?.access_token) {
        setLoadingTransactions(false);
        return;
      }

      setLoadingTransactions(true);

      try {
        const response = await fetch(
          `/api/billing/transactions/grouped?limit=${TRANSACTIONS_PER_PAGE}&offset=${(transactionPage - 1) * TRANSACTIONS_PER_PAGE}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Failed to load transactions' }));
          throw new Error(payload.error || 'Failed to load transactions');
        }

        const data = await response.json();
        setTransactions(data.transactions || []);
        setTransactionTotal(data.total || 0);
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, [session?.access_token, transactionPage]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

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
      const pid = e.projectId || (e.projectTitle ? `deleted-${e.projectTitle}` : 'unknown');
      const baseTitle = e.projectTitle || (pid === 'unknown' ? 'Unassigned' : pid);
      const title = !e.projectId && e.projectTitle ? `${baseTitle} (Deleted)` : baseTitle;
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
        isDeleted: id.startsWith('deleted-'),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [usageEvents]);

  const visibleUsageByProject = useMemo(() => {
    if (showDeletedUsageProjects) return usageByProject;
    return usageByProject.filter((project) => !project.isDeleted);
  }, [showDeletedUsageProjects, usageByProject]);

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
    if (isDemoMode) {
      toast.error('Demo account settings are read-only.');
      return;
    }

    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const trimmedUsername = username.trim();
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      const fullName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ').trim();
      const displayName = fullName || trimmedUsername;
      let nextAvatarUrl = avatarUrl.trim();

      if (!isGoogleAuth && avatarFile) {
        if (!session?.access_token) {
          throw new Error('You need to be signed in to upload a profile photo.');
        }

        const uploadData = new FormData();
        uploadData.append('file', avatarFile);

        const uploadRes = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          body: uploadData,
        });

        if (!uploadRes.ok) {
          const error = await uploadRes.json().catch(() => ({}));
          throw new Error(error.error || 'Failed to upload profile photo.');
        }

        const uploadResult = await uploadRes.json();
        nextAvatarUrl = uploadResult.avatarUrl || '';
      }

      const updateData: Record<string, unknown> = {
        username: trimmedUsername,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        full_name: fullName,
        display_name: displayName,
        avatar_url: nextAvatarUrl || null,
      };
      const { error: profileError } = await supabase.auth.updateUser({ data: updateData });
      if (profileError) throw profileError;

      if (!session?.access_token) {
        throw new Error('You need to be signed in to save preferences.');
      }

      const prefsRes = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          username: trimmedUsername,
          firstName: trimmedFirst,
          lastName: trimmedLast,
          avatarUrl: nextAvatarUrl,
        })
      });

      if (!prefsRes.ok) {
        const error = await prefsRes.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to save preferences.');
      }

      if (!isGoogleAuth && newPassword.trim()) {
        if (newPassword.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        if (newPassword !== confirmPassword) {
          throw new Error('New password and confirmation do not match.');
        }

        const passwordUpdate: { password: string; nonce?: string } = { password: newPassword };
        if (reauthNonce.trim()) {
          passwordUpdate.nonce = reauthNonce.trim();
        }

        const { error: passwordError } = await supabase.auth.updateUser(passwordUpdate);
        if (passwordError) throw passwordError;
      }

      setProfileMessage({ type: 'success', text: 'Settings saved successfully' });
      setAvatarUrl(nextAvatarUrl);
      setAvatarFile(null);
      setNewPassword('');
      setConfirmPassword('');
      setReauthNonce('');
    } catch (error) {
      setProfileMessage({ type: 'error', text: friendlyError('Failed to save settings.', error) });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (isDemoMode) {
      toast.error('Demo account settings are read-only.');
      return;
    }

    const trimmedEmail = newEmail.trim();
    if (!isValidEmail(trimmedEmail)) {
      setEmailChangeMessage({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (trimmedEmail.toLowerCase() === email.trim().toLowerCase()) {
      setEmailChangeMessage({ type: 'error', text: 'Enter a different email address.' });
      return;
    }

    setChangingEmail(true);
    setEmailChangeMessage(null);

    try {
      const { error } = await supabase.auth.updateUser(
        { email: trimmedEmail },
        { emailRedirectTo: `${window.location.origin}/auth/callback` }
      );
      if (error) throw error;

      setNewEmail('');
      setEmailChangeMessage({
        type: 'success',
        text: 'Confirmation email sent. Check your new email address to finish the change.',
      });
    } catch (error) {
      setEmailChangeMessage({ type: 'error', text: friendlyError('Failed to send email change confirmation.', error) });
    } finally {
      setChangingEmail(false);
    }
  };

  const handleSendReauthCode = async () => {
    if (isDemoMode) {
      toast.error('Demo account settings are read-only.');
      return;
    }

    setSendingReauth(true);
    setProfileMessage(null);

    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      setProfileMessage({ type: 'success', text: 'Verification code sent to your account email.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: friendlyError('Failed to send verification code.', error) });
    } finally {
      setSendingReauth(false);
    }
  };

  const handleAvatarSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setProfileMessage({ type: 'error', text: 'Use a JPG, PNG, or WebP image.' });
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage({ type: 'error', text: 'Profile photos must be 5MB or smaller.' });
      event.target.value = '';
      return;
    }

    setProfileMessage(null);
    setAvatarFile(file);
    event.target.value = '';
  };

  const handleRemoveAvatar = async () => {
    if (isDemoMode) {
      toast.error('Demo account settings are read-only.');
      return;
    }

    if (!session?.access_token) {
      setProfileMessage({ type: 'error', text: 'You need to be signed in to remove your profile photo.' });
      return;
    }

    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const response = await fetch('/api/user/avatar', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to remove profile photo.');
      }

      const metaUpdate = await supabase.auth.updateUser({
        data: { avatar_url: null }
      });
      if (metaUpdate.error) throw metaUpdate.error;

      setAvatarUrl('');
      setAvatarFile(null);
      setProfileMessage({ type: 'success', text: 'Profile photo removed.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: friendlyError('Failed to remove profile photo.', error) });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDemoMode) {
      toast.error('Demo accounts cannot be deleted from the demo environment.');
      return;
    }

    try {
      setDeletingAccount(true);
      if (!session?.access_token) {
        throw new Error('You need to be signed in to delete your account.');
      }
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete account');
      }
      // Log out
      await supabase.auth.signOut();
      router.push('/auth/login?deleted=true');
    } catch (error) {
      toast.error(friendlyError('Failed to delete account.', error));
      setDeletingAccount(false);
    }
  };

  const handleExportTransactions = () => {
    const rows = transactions.flatMap(t => {
      const parentRow = [
        new Date(t.createdAt).toISOString(),
        t.transactionType,
        t.amount.toFixed(4),
        t.reason,
        t.invoiceNumber || ''
      ];

      if (!t.children?.length) return [parentRow];

      return [
        parentRow,
        ...t.children.map(child => [
          new Date(child.createdAt).toISOString(),
          child.kind || 'usage',
          child.amount.toFixed(4),
          `${t.reason} - ${child.reason}`,
          ''
        ]),
      ];
    });

    const csv = [
      ['Date', 'Type', 'Amount', 'Reason', 'Invoice Number'],
      ...rows
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
    if (isDemoMode) {
      toast.error('Demo accounts cannot connect integrations.');
      return;
    }
    if (!session?.access_token) return;
    try {
      const res = await fetch(`/api/integrations/${provider}/start?mode=json`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        throw new Error(`Unable to connect ${integrationLabel(provider)} right now.`);
      }
      const data = await res.json();
      if (!data?.url) {
        throw new Error('Missing redirect URL.');
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(friendlyError('Failed to start the integration connection.', error));
    }
  };

  const disconnectProvider = async (provider: IntegrationProvider) => {
    if (isDemoMode) {
      toast.error('Demo accounts cannot manage integrations.');
      return;
    }
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ provider })
      });
      if (!res.ok) {
        throw new Error(`Unable to disconnect ${integrationLabel(provider)}.`);
      }
      setIntegrations(prev =>
        prev.map(i => i.provider === provider ? { ...i, connected: false } : i)
      );
      toast.success(`${integrationLabel(provider)} disconnected`);
    } catch (error) {
      toast.error(friendlyError('Failed to disconnect the integration.', error));
    }
  };

  return (
    <div className="py-6">

      {/* ================================================================ */}
      {/* PREFERENCES */}
      {/* ================================================================ */}
      {section === 'preferences' && (
        <div className="space-y-6">
          {isDemoMode && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-300">
              Demo account settings are read-only. Sign up to edit your profile, password, integrations, and account controls.
            </div>
          )}

          {/* Profile Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Keep your account details current and easy to manage
                  </CardDescription>
                </div>
                {isGoogleAuth && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google Account
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-4">
                {!isGoogleAuth && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Profile Photo
                    </label>
                    <div className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {avatarPreview || avatarUrl ? (
                          <Image
                            src={avatarPreview || avatarUrl}
                            alt="Profile preview"
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-xl object-cover border border-slate-300 dark:border-slate-600"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500">
                            <Camera className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            Add a profile photo
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            JPG, PNG, or WebP up to 5MB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                          <Camera className="h-4 w-4" />
                          Choose photo
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleAvatarSelection}
                            disabled={savingProfile}
                            className="sr-only"
                          />
                        </label>
                        {(avatarPreview || avatarUrl) && (
                          <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            disabled={savingProfile}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isDemoMode || savingProfile}
                    placeholder="@yourname"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label htmlFor="first-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    First Name
                  </label>
                  <input
                    id="first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isDemoMode || savingProfile}
                    placeholder="First name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label htmlFor="last-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Last Name
                  </label>
                  <input
                    id="last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isDemoMode || savingProfile}
                    placeholder="Last name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-sm cursor-not-allowed opacity-60"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Current account email.</p>
                </div>
                <div>
                  <label htmlFor="new-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    New Email Address
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        id="new-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        disabled={isDemoMode || changingEmail}
                        placeholder="new@example.com"
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestEmailChange}
                      disabled={isDemoMode || changingEmail || !newEmail.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {changingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Send confirmation
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    We will send confirmation instructions before changing your login email.
                  </p>
                  {emailChangeMessage && (
                    <div className={cn(
                      "mt-2 p-3 rounded-lg text-sm",
                      emailChangeMessage.type === 'success'
                        ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                    )}>
                      {emailChangeMessage.text}
                    </div>
                  )}
                </div>
              </div>

              {profileMessage && (
                <div className={cn(
                  "p-3 rounded-lg text-sm",
                  profileMessage.type === 'success'
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                )}>
                  {profileMessage.text}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isDemoMode || savingProfile}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingProfile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
              </div>
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
                    <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        disabled={isDemoMode}
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Use at least 8 characters.</p>
                  </div>
                  <div>
                    <label htmlFor="confirm-new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        id="confirm-new-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        disabled={isDemoMode}
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="reauth-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Verification Code
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        id="reauth-code"
                        type="text"
                        inputMode="numeric"
                        value={reauthNonce}
                        onChange={(e) => setReauthNonce(e.target.value)}
                        placeholder="6-digit code"
                        disabled={isDemoMode || sendingReauth}
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendReauthCode}
                      disabled={isDemoMode || sendingReauth}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {sendingReauth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Send code
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Use this if Supabase asks for reauthentication before changing your password.
                  </p>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isDemoMode || savingProfile || (!newPassword.trim() && !confirmPassword.trim())}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingProfile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save password
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Integrations Section */}
          <Card className="overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Connected platforms</h2>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          Connect creator channels and recording sources as they become available.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 motion-safe:animate-pulse" />
                    Warming up
                  </div>
                </div>

                {integrationsLoading && (
                  <div className="mt-4 text-sm text-slate-400">Loading integrations...</div>
                )}
                {!integrationsLoading && integrationsError && (
                  <div className="mt-4 text-sm text-red-400">{integrationsError}</div>
                )}

                <div className="mt-4 grid gap-2 lg:grid-cols-3">
                  {SETTINGS_INTEGRATIONS.map(({ provider, name, detail, Icon, accent, bg, border }) => {
                    const status = provider ? integrations.find(i => i.provider === provider) : undefined;
                    const connected = Boolean(status?.connected);
                    const providerEnabled = provider ? isIntegrationEnabled(provider) : false;
                    const connectedLabel = status?.metadata?.channelTitle || status?.metadata?.email || status?.metadata?.name;
                    const connectedDetail = connectedLabel ? `Connected - ${connectedLabel}` : 'Connected';
                    const showAction = Boolean(provider && !isDemoMode && (providerEnabled || connected) && !integrationsLoading && !integrationsError);

                    return (
                      <div
                        key={name}
                        className={`rounded-lg border ${border} ${bg} p-3`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/80 shadow-sm dark:bg-slate-900/80">
                              <Icon className={`h-4 w-4 ${accent}`} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{name}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {connected ? connectedDetail : detail}
                              </p>
                            </div>
                          </div>
                          {connected && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                              Connected
                            </span>
                          )}
                        </div>
                        {showAction && provider && (
                          <button
                            type="button"
                            onClick={() => connected ? disconnectProvider(provider) : startOAuth(provider)}
                            disabled={!providerEnabled && !connected}
                            className="mt-3 inline-flex w-fit rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                          >
                            {connected ? 'Disconnect' : 'Connect'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-900/50">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-500">Danger Zone</CardTitle>
              <CardDescription className="text-red-600/80 dark:text-red-400/80">
                Irreversible actions for your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Delete Account</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-lg">
                    Permanently delete your account, projects, and all associated media from our servers. This action cannot be undone.
                  </p>
                </div>
                {!isDemoMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmation('');
                      setDeleteModalOpen(true);
                    }}
                    disabled={deletingAccount}
                    className="inline-flex w-fit whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-medium text-red-700 transition-colors hover:bg-red-100 hover:text-red-800 disabled:opacity-50 sm:self-start dark:border-red-800 dark:bg-red-900/50 dark:text-red-500 dark:hover:bg-red-800 dark:hover:text-red-100"
                  >
                    Delete Account
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
          <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-red-600 dark:text-red-500">Delete Account</DialogTitle>
                <DialogDescription>
                  This permanently deletes your account, projects, and media. Type your {deleteTargetLabel} to continue.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200/80 bg-red-50/70 p-4 dark:border-red-900/60 dark:bg-red-950/30">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Are you sure you want to delete your account?
                  </p>
                  <p className="mt-1 text-sm text-red-700/80 dark:text-red-400/80">
                    Type <span className="font-semibold">{deleteTarget}</span> to confirm.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {deleteTargetLabel === 'username' ? 'Username' : 'Email'}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    disabled={deletingAccount}
                    placeholder={`Type your ${deleteTargetLabel}`}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    The delete button stays disabled until the value matches exactly.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setDeleteConfirmation('');
                    }}
                    disabled={deletingAccount}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || !isDeleteConfirmationValid}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 hover:text-red-800 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/50 dark:text-red-500 dark:hover:bg-red-800 dark:hover:text-red-100"
                  >
                    {deletingAccount ? 'Deleting...' : 'Delete Account'}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ================================================================ */}
      {/* BILLING */}
      {/* ================================================================ */}
      {section === 'billing' && (
        loadingBilling ? (
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Balance Banner */}
            <BalanceBanner balance={balance} />

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
                    <CardDescription>Projects are grouped with their credit charges inside each dropdown</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:flex-none">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={transactionSearch}
                        onChange={(e) => setTransactionSearch(e.target.value)}
                        className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg w-full sm:w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleExportTransactions}
                      className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingTransactions ? (
                  <div className="py-12 text-center text-slate-400">
                    Loading transactions...
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    No transactions found
                  </div>
                ) : (
                  <>
                    <div className="sm:hidden divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredTransactions.map((transaction) => {
                        const hasChildren = (transaction.children?.length || 0) > 0;
                        const isExpanded = hasChildren && expandedGroups.has(transaction.id);

                        return (
                          <div key={transaction.id} className="px-4 py-4">
                            <button
                              type="button"
                              onClick={hasChildren ? () => toggleGroup(transaction.id) : undefined}
                              className={`w-full text-left ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <TransactionTypeBadge type={transaction.transactionType} />
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })}
                                    </span>
                                  </div>
                                  <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {transaction.reason || '-'}
                                  </p>
                                  {transaction.projectTitle && (
                                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                      {transaction.projectTitle}
                                    </p>
                                  )}
                                  {!transaction.type || (transaction.type !== 'workflow' && transaction.type !== 'project') ? (
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      Invoice: {transaction.invoiceNumber || '-'}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <span className={cn(
                                    "text-sm font-semibold whitespace-nowrap",
                                    transaction.amount > 0 ? "text-green-600" : "text-slate-900 dark:text-slate-50"
                                  )}>
                                    {formatAmount(transaction.amount)}
                                  </span>
                                  {hasChildren && (
                                    isExpanded
                                      ? <ChevronUp className="h-4 w-4 text-slate-500" />
                                      : <ChevronDown className="h-4 w-4 text-slate-500" />
                                  )}
                                </div>
                              </div>
                            </button>

                            {isExpanded && transaction.children?.length ? (
                              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                                {transaction.children.map((child, idx) => (
                                  <div key={`${transaction.id}-mobile-child-${idx}`} className="flex items-start justify-between gap-3 text-xs">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-slate-600 dark:text-slate-300">{child.reason}</p>
                                      <p className="mt-1 text-slate-400 dark:text-slate-500">
                                        {child.detail ? `${child.detail} - ` : ''}{new Date(child.createdAt).toLocaleTimeString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                      </p>
                                    </div>
                                    <span className={cn(
                                      "whitespace-nowrap font-medium",
                                      child.amount > 0 ? "text-green-600" : "text-slate-500 dark:text-slate-400"
                                    )}>
                                      {formatAmount(child.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                            <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3 w-8"></th>
                            <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3">Date</th>
                            <th className="hidden sm:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3">Type</th>
                            <th className="text-left font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3">Description</th>
                            <th className="hidden md:table-cell text-left font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3">Invoice</th>
                            <th className="text-right font-medium text-slate-500 dark:text-slate-400 px-3 sm:px-6 py-3">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {filteredTransactions.map((transaction) => {
                            const isGrouped = transaction.type === 'workflow' || transaction.type === 'project';
                            const hasChildren = (transaction.children?.length || 0) > 0;
                            const isExpanded = hasChildren && expandedGroups.has(transaction.id);

                            return (
                              <Fragment key={transaction.id}>{/* Fragment for group + children */}
                                <tr
                                  className={cn(
                                    "hover:bg-slate-50 dark:hover:bg-slate-800/30",
                                    hasChildren && "cursor-pointer"
                                  )}
                                  onClick={hasChildren ? () => toggleGroup(transaction.id) : undefined}
                                >
                                  <td className="px-3 sm:px-6 py-3 w-8">
                                    {hasChildren && (
                                      isExpanded
                                        ? <ChevronUp className="h-4 w-4 text-slate-500" />
                                        : <ChevronDown className="h-4 w-4 text-slate-500" />
                                    )}
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {new Date(transaction.createdAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </td>
                                  <td className="hidden sm:table-cell px-3 sm:px-6 py-3">
                                    <TransactionTypeBadge type={transaction.transactionType} />
                                  </td>
                                  <td className="px-3 sm:px-6 py-3 text-slate-700 dark:text-slate-300 max-w-[140px] sm:max-w-xs truncate">
                                    <div className="truncate">{transaction.reason || '-'}</div>
                                    {transaction.projectTitle && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {transaction.projectTitle}
                                      </div>
                                    )}
                                  </td>
                                  <td className="hidden md:table-cell px-3 sm:px-6 py-3 text-slate-600 dark:text-slate-300">
                                    {isGrouped ? '-' : (transaction.invoiceNumber || '-')}
                                  </td>
                                  <td className={cn(
                                    "px-3 sm:px-6 py-3 text-right font-semibold whitespace-nowrap",
                                    transaction.amount > 0 ? "text-green-600" : "text-slate-900 dark:text-slate-50"
                                  )}>
                                    {formatAmount(transaction.amount)}
                                  </td>
                                </tr>
                                {/* Expanded children */}
                                {isGrouped && isExpanded && transaction.children?.map((child, idx) => (
                                  <tr key={`${transaction.id}-child-${idx}`} className="bg-slate-100/80 dark:bg-slate-800/50">
                                    <td className="px-3 sm:px-6 py-2"></td>
                                    <td className="px-3 sm:px-6 py-2 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                      {new Date(child.createdAt).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </td>
                                    <td className="hidden sm:table-cell px-3 sm:px-6 py-2"></td>
                                    <td className="pl-8 sm:pl-12 pr-3 sm:pr-6 py-2 text-xs text-slate-500 dark:text-slate-400">
                                      <span>{child.reason}</span>
                                      {child.detail && (
                                        <span className="ml-2 text-slate-400 dark:text-slate-500">{child.detail}</span>
                                      )}
                                    </td>
                                    <td className="hidden md:table-cell px-3 sm:px-6 py-2"></td>
                                    <td className={cn(
                                      "px-3 sm:px-6 py-2 text-right text-xs",
                                      child.amount > 0 ? "text-green-600" : "text-slate-500 dark:text-slate-400"
                                    )}>
                                      {formatAmount(child.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, transactionTotal)} of {transactionTotal}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTransactionPage(p => Math.max(1, p - 1))}
                          disabled={transactionPage === 1}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransactionPage(p => p + 1)}
                          disabled={transactionPage * TRANSACTIONS_PER_PAGE >= transactionTotal}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              ))}
            </div>
            <div className="h-80 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        ) : usageEvents.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-1">No usage data yet</h3>
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
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Cost</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{formatAmount(usageStats.totalCost)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{usageStats.totalEvents} API calls</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Projects Processed</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{usageStats.projectCount}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Unique projects</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Cost / Project</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {usageStats.projectCount > 0
                      ? formatAmount(usageStats.totalCost / usageStats.projectCount)
                      : '$0.00'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Per project average</p>
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
              <CardHeader className="gap-3">
                <div>
                  <CardTitle>Cost by Project</CardTitle>
                  <CardDescription>Spending breakdown per project</CardDescription>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showDeletedUsageProjects}
                    onChange={(event) => setShowDeletedUsageProjects(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950"
                  />
                  Show deleted projects
                </label>
              </CardHeader>
              <CardContent>
                {visibleUsageByProject.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3 text-slate-500" />
                    <p className="text-sm">No project usage data available</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(() => {
                      const maxCost = Math.max(...visibleUsageByProject.map(p => p.cost));
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

                      return visibleUsageByProject.map((project, index) => {
                        const barWidth = maxCost > 0 ? (project.cost / maxCost) * 100 : 0;

                        return (
                          <div key={project.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: colors[index % colors.length] }}
                                />
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                                  {project.title}
                                </span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {project.events} calls, {project.serviceCount} services
                                </span>
                              </div>
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                {formatAmount(project.cost)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
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
