"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  CalendarRange,
  ChevronDown,
  FolderKanban,
  Info,
  Library,
  Loader2,
  Plus,
  Save,
  Share2,
  Sparkles,
  Tags,
  Trash2,
  X,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import {
  CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignStatus,
} from '@/lib/campaigns-content-library';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type CampaignFormState = {
  name: string;
  status: CampaignStatus;
  objective: string;
  audience: string;
  channelsText: string;
  brandVoiceId: string;
  startDate: string;
  endDate: string;
};

const emptyCampaignForm: CampaignFormState = {
  name: 'New plan',
  status: 'draft',
  objective: '',
  audience: '',
  channelsText: '',
  brandVoiceId: '',
  startDate: '',
  endDate: '',
};

const channelSuggestions = [
  'LinkedIn',
  'Newsletter',
  'Blog',
  'Sales enablement',
  'Customer story',
  'Podcast',
  'Webinar',
  'Email sequence',
  'Case study',
  'Landing page',
  'Executive briefing',
  'Ads',
] as const;

function listToText(items: string[]): string {
  return items.join('\n');
}

function textToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function campaignToForm(campaign: Campaign): CampaignFormState {
  return {
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective || '',
    audience: campaign.audience || '',
    channelsText: listToText(campaign.channels),
    brandVoiceId: campaign.brandVoiceId || '',
    startDate: campaign.startDate || '',
    endDate: campaign.endDate || '',
  };
}

function campaignFormToPayload(form: CampaignFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    name: form.name,
    status: form.status,
    objective: form.objective,
    audience: form.audience,
    channels: textToList(form.channelsText),
    brandVoiceId: form.brandVoiceId || null,
    startDate: form.startDate,
    endDate: form.endDate,
  };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700 dark:text-slate-200">
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 4,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={rows}
      className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900 shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

function SelectInput({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    >
      {children}
    </select>
  );
}

function ChannelEditor({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const channels = useMemo(() => textToList(value), [value]);
  const channelKeys = useMemo(
    () => new Set(channels.map((channel) => channel.toLowerCase())),
    [channels]
  );
  const availableSuggestions = channelSuggestions.filter(
    (channel) => !channelKeys.has(channel.toLowerCase())
  );

  const updateChannels = (nextChannels: string[]) => {
    onChange(listToText(nextChannels));
  };

  const addChannel = (rawValue: string) => {
    const nextChannel = rawValue.trim();
    if (!nextChannel || channelKeys.has(nextChannel.toLowerCase())) {
      setDraft('');
      return;
    }

    updateChannels([...channels, nextChannel]);
    setDraft('');
    setShowSuggestions(false);
  };

  const removeChannel = (channelToRemove: string) => {
    updateChannels(channels.filter((channel) => channel !== channelToRemove));
  };

  return (
    <div className="mt-1.5">
      <div
        className={cn(
          'relative flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950',
          disabled && 'cursor-not-allowed bg-slate-100 dark:bg-slate-900'
        )}
      >
        {channels.map((channel) => (
          <span
            key={channel}
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <span className="truncate">{channel}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeChannel(channel)}
                className="rounded p-0.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                aria-label={`Remove ${channel}`}
                title={`Remove ${channel}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}

        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addChannel(draft);
            }
            if (event.key === 'Backspace' && !draft && channels.length > 0) {
              removeChannel(channels[channels.length - 1]);
            }
          }}
          disabled={disabled}
          className="h-8 min-w-[8rem] flex-1 border-0 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100"
          placeholder={channels.length === 0 ? (disabled ? 'No channels' : 'Add channel') : ''}
          aria-label="Add channel"
        />

        <button
          type="button"
          onClick={() => {
            if (!disabled) setShowSuggestions((current) => !current);
          }}
          disabled={disabled || availableSuggestions.length === 0}
          className="ml-auto inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-expanded={showSuggestions}
          aria-label="Show channel suggestions"
          title="Show channel suggestions"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', showSuggestions && 'rotate-180')} />
        </button>
      </div>

      {showSuggestions && availableSuggestions.length > 0 && !disabled && (
        <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-3">
          {availableSuggestions.map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() => addChannel(channel)}
              className="rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-slate-200 dark:hover:bg-blue-950/30 dark:hover:text-blue-200"
            >
              {channel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'violet' | 'green';
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex items-start gap-5">
        <div className={cn('flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg', toneClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-none text-slate-950 dark:text-white">{value}</p>
          <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useCurrentOrganization();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [loading, setLoading] = useState(true);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [sharingCampaign, setSharingCampaign] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );
  const privateCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.scope !== 'organization'),
    [campaigns]
  );
  const workspaceCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.scope === 'organization'),
    [campaigns]
  );
  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedCampaign ? Boolean(selectedCampaign.canEdit) : true);
  const activeCampaignCount = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'active').length,
    [campaigns]
  );
  const plannedCampaignCount = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'draft').length,
    [campaigns]
  );

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const loadPlans = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const plansResponse = await fetch(withOrganizationId('/api/campaigns', organizationId), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const plansPayload = await plansResponse.json().catch(() => ({}));

      if (!plansResponse.ok) {
        throw new Error(plansPayload.error || 'Failed to load plans');
      }

      const nextCampaigns = Array.isArray(plansPayload.campaigns)
        ? plansPayload.campaigns as Campaign[]
        : [];
      setCampaigns(nextCampaigns);

      const nextCampaign = nextCampaigns[0] || null;
      setSelectedCampaignId(nextCampaign?.id || null);
      setCampaignForm(nextCampaign ? campaignToForm(nextCampaign) : emptyCampaignForm);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load plans');
      setCampaigns([]);
      setSelectedCampaignId(null);
      setCampaignForm(emptyCampaignForm);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadPlans();
  }, [loadPlans, loadingOrganization]);

  const updateCampaignField = <K extends keyof CampaignFormState>(field: K, value: CampaignFormState[K]) => {
    setCampaignForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectCampaign = (campaign: Campaign) => {
    setSelectedCampaignId(campaign.id);
    setCampaignForm(campaignToForm(campaign));
    setError(null);
    setMessage(null);
  };

  const startNewCampaign = () => {
    setSelectedCampaignId(null);
    setCampaignForm(emptyCampaignForm);
    setError(null);
    setMessage(null);
  };

  const saveCampaign = async () => {
    if (!canEdit || !organizationId) return;
    setSavingCampaign(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedCampaignId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/campaigns/${selectedCampaignId}`, organizationId)
          : withOrganizationId('/api/campaigns', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(campaignFormToPayload(campaignForm, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save plan');
      }

      const savedCampaign = payload.campaign as Campaign;
      setCampaigns((current) => {
        if (isUpdate) {
          return current.map((campaign) => campaign.id === savedCampaign.id ? savedCampaign : campaign);
        }
        return [savedCampaign, ...current];
      });
      setSelectedCampaignId(savedCampaign.id);
      setCampaignForm(campaignToForm(savedCampaign));
      setMessage(isUpdate ? 'Plan updated.' : 'Plan created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save plan');
    } finally {
      setSavingCampaign(false);
    }
  };

  const deleteCampaign = async () => {
    if (!canEdit || !organizationId || !selectedCampaignId) return;
    setDeletingCampaign(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/campaigns/${selectedCampaignId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete plan');
      }

      const remaining = campaigns.filter((campaign) => campaign.id !== selectedCampaignId);
      const nextSelected = remaining[0] || null;
      setCampaigns(remaining);
      setSelectedCampaignId(nextSelected?.id || null);
      setCampaignForm(nextSelected ? campaignToForm(nextSelected) : emptyCampaignForm);
      setMessage('Plan deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete plan');
    } finally {
      setDeletingCampaign(false);
      setConfirmDelete(false);
    }
  };

  const shareCampaign = async () => {
    if (!selectedCampaign?.canShare || !organizationId) return;
    setSharingCampaign(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/campaigns/${selectedCampaign.id}/share`, organizationId), {
        method: 'POST',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to share plan');
      }

      const sharedCampaign = payload.campaign as Campaign;
      setCampaigns((current) => {
        const withoutDuplicate = current.filter((campaign) => campaign.id !== sharedCampaign.id);
        return [sharedCampaign, ...withoutDuplicate];
      });
      setSelectedCampaignId(sharedCampaign.id);
      setCampaignForm(campaignToForm(sharedCampaign));
      setMessage('Plan shared with this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to share plan');
    } finally {
      setSharingCampaign(false);
    }
  };

  const unshareCampaign = async () => {
    if (!selectedCampaign?.canUnshare || !organizationId) return;
    setSharingCampaign(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/campaigns/${selectedCampaign.id}/share`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to unshare plan');
      }

      const remaining = campaigns.filter((campaign) => campaign.id !== selectedCampaign.id);
      const nextCampaign = remaining.find((campaign) => campaign.id === selectedCampaign.sharedFromCampaignId)
        || remaining[0]
        || null;
      setCampaigns(remaining);
      setSelectedCampaignId(nextCampaign?.id || null);
      setCampaignForm(nextCampaign ? campaignToForm(nextCampaign) : emptyCampaignForm);
      setMessage('Plan removed from this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to unshare plan');
    } finally {
      setSharingCampaign(false);
    }
  };

  const renderCampaignButton = (campaign: Campaign) => {
    const active = campaign.id === selectedCampaignId;
    const channelSummary = campaign.channels.length > 0
      ? campaign.channels.join(', ')
      : 'No channels yet';

    return (
      <button
        key={campaign.id}
        type="button"
        onClick={() => selectCampaign(campaign)}
        className={cn(
          'w-full rounded-lg border px-4 py-4 text-left transition focus:outline-none focus:ring-4 focus:ring-blue-500/15',
          active
            ? 'border-blue-500 bg-blue-50/60 text-blue-950 shadow-[0_18px_45px_-30px_rgba(37,99,235,0.9)] dark:border-blue-500/80 dark:bg-blue-950/30 dark:text-blue-50'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{campaign.name}</p>
            <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
              {channelSummary}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <Badge variant={campaign.scope === 'organization' ? 'secondary' : 'outline'}>
              {campaign.scope === 'organization' ? 'Workspace' : 'Private'}
            </Badge>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-bold',
                campaign.status === 'active'
                  ? 'border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
                  : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              )}
            >
              {formatLabel(campaign.status)}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#f8fbff] text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-[34rem] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.28),rgba(219,234,254,0.16)_38%,transparent_68%)]" />
      <div className="pointer-events-none absolute right-2 top-10 h-56 w-56 opacity-45 [background-image:radial-gradient(rgba(59,130,246,0.24)_1px,transparent_1px)] [background-size:10px_10px]" />

      <div className="relative mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Plans
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              Give generated content a goal, audience, timing, and channel focus without mixing saved drafts into Studio setup.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && <Badge variant="outline">Workspace: {organization.name}</Badge>}
            {isDemoMode && <Badge variant="warning">Demo</Badge>}
            <Link
              href="/dashboard/studio/profile"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-blue-600 shadow-[0_12px_35px_-20px_rgba(15,23,42,0.6)] transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
            >
              <Sparkles className="h-4 w-4" />
              Studio
            </Link>
          </div>
        </div>

        {(error || message) && (
          <div
            role="status"
            className={cn(
              'mb-5 rounded-lg border px-4 py-3 text-sm shadow-sm',
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            )}
          >
            {error || message}
          </div>
        )}

        {loading || loadingOrganization ? (
          <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="h-32 animate-pulse rounded-lg bg-white/80 shadow-sm dark:bg-slate-900" />
              <div className="h-32 animate-pulse rounded-lg bg-white/80 shadow-sm dark:bg-slate-900" />
              <div className="h-32 animate-pulse rounded-lg bg-white/80 shadow-sm dark:bg-slate-900" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(20rem,31rem)_minmax(0,1fr)]">
              <div className="h-[34rem] animate-pulse rounded-lg bg-white/80 shadow-sm dark:bg-slate-900" />
              <div className="h-[34rem] animate-pulse rounded-lg bg-white/80 shadow-sm dark:bg-slate-900" />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 grid gap-4 lg:grid-cols-3">
              <SummaryTile
                icon={<CalendarCheck className="h-6 w-6" />}
                label="Active"
                value={`${activeCampaignCount}`}
                detail={`${campaigns.length} total plan${campaigns.length === 1 ? '' : 's'}`}
                tone="blue"
              />
              <SummaryTile
                icon={<CalendarRange className="h-6 w-6" />}
                label="Planned"
                value={`${plannedCampaignCount}`}
                detail="Plans waiting to start"
                tone="violet"
              />
              <SummaryTile
                icon={<Library className="h-6 w-6" />}
                label="Saved Drafts"
                value="Library"
                detail="Saved content now lives in Library"
                tone="green"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(20rem,31rem)_minmax(0,1fr)]">
              <Card className="min-h-[34rem] border-slate-200/80 bg-white/95 shadow-[0_22px_65px_-35px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-950 dark:text-white">Plans</CardTitle>
                      <CardDescription className="mt-2 max-w-xs text-sm leading-6 text-slate-600 dark:text-slate-300">
                        Planning spaces for launches and recurring themes.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={startNewCampaign}
                      disabled={!canCreate}
                      className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                      aria-label="Create plan"
                      title="Create plan"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                  {campaigns.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-950/50">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-300">
                        <FolderKanban className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-sm font-bold text-slate-950 dark:text-white">
                        No plans yet
                      </h3>
                      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600 dark:text-slate-300">
                        Create a plan when generated content should follow a specific goal, channel, or launch window.
                      </p>
                      <button
                        type="button"
                        onClick={startNewCampaign}
                        disabled={!canCreate}
                        className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Create Plan
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {privateCampaigns.length > 0 && (
                        <div className="space-y-2">
                          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            My private
                          </p>
                          {privateCampaigns.map(renderCampaignButton)}
                        </div>
                      )}
                      {workspaceCampaigns.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Workspace shared
                          </p>
                          {workspaceCampaigns.map(renderCampaignButton)}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white/95 shadow-[0_22px_65px_-35px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-950 dark:text-white">
                        {selectedCampaign ? 'Edit plan' : 'Create plan'}
                      </CardTitle>
                      <CardDescription className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        Content settings can select this Plan before generation.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCampaign?.canShare && (
                        <button
                          type="button"
                          onClick={shareCampaign}
                          disabled={sharingCampaign}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/60 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-blue-950/30"
                        >
                          {sharingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                          Share
                        </button>
                      )}
                      {selectedCampaign?.canUnshare && (
                        <button
                          type="button"
                          onClick={unshareCampaign}
                          disabled={sharingCampaign}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          {sharingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                          Unshare
                        </button>
                      )}
                      {selectedCampaign && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          disabled={!canEdit || deletingCampaign}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {deletingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={saveCampaign}
                        disabled={!canEdit || savingCampaign || !campaignForm.name.trim()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {selectedCampaign ? 'Save changes' : 'Create plan'}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                  {!canEdit && (
                    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      {isDemoMode
                        ? 'Demo accounts can view plans but cannot change Studio settings.'
                        : 'You can view this plan, but you do not have permission to change it.'}
                    </div>
                  )}

                  <div className="grid gap-5">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                      <div>
                        <FieldLabel htmlFor="campaign-name">Plan name</FieldLabel>
                        <TextInput
                          id="campaign-name"
                          value={campaignForm.name}
                          onChange={(value) => updateCampaignField('name', value)}
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="campaign-status">Status</FieldLabel>
                        <SelectInput
                          id="campaign-status"
                          value={campaignForm.status}
                          onChange={(value) => updateCampaignField('status', value as CampaignStatus)}
                          disabled={!canEdit}
                        >
                          {CAMPAIGN_STATUSES.map((status) => (
                            <option key={status} value={status}>{formatLabel(status)}</option>
                          ))}
                        </SelectInput>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="campaign-start">Start date</FieldLabel>
                        <TextInput
                          id="campaign-start"
                          type="date"
                          value={campaignForm.startDate}
                          onChange={(value) => updateCampaignField('startDate', value)}
                          disabled={!canEdit}
                          placeholder="yyyy-mm-dd"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="campaign-end">End date</FieldLabel>
                        <TextInput
                          id="campaign-end"
                          type="date"
                          value={campaignForm.endDate}
                          onChange={(value) => updateCampaignField('endDate', value)}
                          disabled={!canEdit}
                          placeholder="yyyy-mm-dd"
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel htmlFor="campaign-objective">Objective</FieldLabel>
                      <TextArea
                        id="campaign-objective"
                        value={campaignForm.objective}
                        onChange={(value) => updateCampaignField('objective', value)}
                        disabled={!canEdit}
                        rows={3}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="campaign-audience">Audience</FieldLabel>
                      <TextArea
                        id="campaign-audience"
                        value={campaignForm.audience}
                        onChange={(value) => updateCampaignField('audience', value)}
                        disabled={!canEdit}
                        rows={2}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="campaign-channels">Channels</FieldLabel>
                      </div>
                      <ChannelEditor
                        id="campaign-channels"
                        value={campaignForm.channelsText}
                        onChange={(value) => updateCampaignField('channelsText', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                      <p>
                        Saved drafts are organized in{' '}
                        <Link href="/dashboard/library" className="font-bold text-blue-700 hover:underline dark:text-blue-300">
                          Library
                        </Link>
                        . Plans stay focused on the generation brief.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete plan?"
        description="Saved drafts that referenced this Plan will remain available, but future generation cannot select it."
        confirmText="Delete plan"
        cancelText="Cancel"
        isDestructive
        onConfirm={deleteCampaign}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
