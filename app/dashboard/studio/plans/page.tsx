"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpenText,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  FolderKanban,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import {
  StudioAccessControl,
  StudioHeaderControls,
  StudioMobileActionBar,
  useStudioWorkspace,
} from '@/components/dashboard/studio/studio-page-header';
import { ActionButton, ActionSelectTrigger } from '@/components/dashboard/action-controls';
import { DashboardPageHeader } from '@/components/dashboard/shell';
import ConfirmModal from '@/components/ui/confirm-modal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth/context';
import type { BrandVoice } from '@/lib/brand-voices';
import {
  CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignStatus,
  type ContentLibraryItem,
} from '@/lib/campaigns-content-library';
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

type StudioSaveVisibility = 'private' | 'team';

const emptyCampaignForm: CampaignFormState = {
  name: 'New content plan',
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
  'Launch announcements',
  'Customer story',
  'Email sequence',
  'Short clips',
] as const;

const inputClassName =
  'mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

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

function formatDateLabel(value?: string | null): string {
  if (!value) return 'No date';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

function campaignFormToPayload(
  form: CampaignFormState,
  organizationId?: string | null,
  visibility?: StudioSaveVisibility
) {
  return {
    organization_id: organizationId || undefined,
    visibility,
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
      className={inputClassName}
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
      className={cn(inputClassName, 'h-auto resize-y py-2.5 leading-6')}
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
      className={inputClassName}
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
  const channels = useMemo(() => textToList(value), [value]);
  const channelKeys = useMemo(
    () => new Set(channels.map((channel) => channel.toLowerCase())),
    [channels]
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
  };

  const removeChannel = (channelToRemove: string) => {
    updateChannels(channels.filter((channel) => channel !== channelToRemove));
  };

  return (
    <div className="mt-1.5 space-y-2">
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950',
          disabled && 'cursor-not-allowed bg-slate-50 dark:bg-slate-900'
        )}
      >
        {channels.map((channel) => (
          <span
            key={channel}
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <span className="truncate">{channel}</span>
            {!disabled && (
              <ActionButton
                type="button"
                onClick={() => removeChannel(channel)}
                variant="ghost"
                className="h-6 w-6 rounded-md p-0 text-sm"
                aria-label={`Remove ${channel}`}
              >
                <X className="h-3.5 w-3.5" />
              </ActionButton>
            )}
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!disabled) addChannel(draft);
            }
          }}
          disabled={disabled}
          placeholder={channels.length ? 'Add channel' : 'Add channels'}
          className="h-full min-w-[9rem] flex-1 bg-transparent px-1 text-sm text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <ActionButton
          type="button"
          onClick={() => addChannel(draft)}
          disabled={disabled || !draft.trim()}
          variant="primary"
        >
          Add
        </ActionButton>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {channelSuggestions
          .filter((channel) => !channelKeys.has(channel.toLowerCase()))
          .slice(0, 5)
          .map((channel) => (
            <ActionButton
              key={channel}
              type="button"
              onClick={() => addChannel(channel)}
              disabled={disabled}
              variant="outline"
            >
              + {channel}
            </ActionButton>
          ))}
      </div>
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
  tone: 'blue' | 'violet' | 'green' | 'slate';
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[tone];

  return (
    <Card className="rounded-md">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md', toneClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanSelector({
  campaigns,
  selectedCampaignId,
  selectedCampaign,
  draftName,
  loading,
  onSelectCampaign,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  selectedCampaign: Campaign | null;
  draftName: string;
  loading?: boolean;
  onSelectCampaign: (campaign: Campaign) => void;
}) {
  const selectedLabel = selectedCampaign?.name || draftName.trim() || 'New plan draft';
  const selectedScope = selectedCampaign
    ? selectedCampaign.scope === 'organization' ? 'Team' : 'Private'
    : 'Draft';
  const trigger = (
    <ActionSelectTrigger
      icon={<FolderKanban className="h-4 w-4" />}
      label={loading ? 'Loading plans' : selectedLabel}
      scopeLabel={selectedScope}
      loading={loading}
      className="h-11 px-3.5 sm:w-[300px]"
    />
  );

  if (loading) {
    return <div className="w-full sm:w-auto">{trigger}</div>;
  }

  return (
    <DropdownMenu
      align="right"
      portal
      className="w-full sm:w-auto"
      trigger={trigger}
    >
      <div className="w-[min(24rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Select plan</DropdownMenuLabel>
        {campaigns.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
            No saved plans yet.
          </div>
        ) : (
          campaigns.map((campaign) => {
            const active = campaign.id === selectedCampaignId;
            const channelSummary = campaign.channels.length > 0 ? campaign.channels.join(', ') : 'No channels yet';

            return (
              <DropdownMenuItem
                key={campaign.id}
                onClick={() => onSelectCampaign(campaign)}
                className="items-start gap-3 px-3 py-3"
              >
                <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full', campaign.status === 'active' ? 'bg-emerald-500' : campaign.status === 'draft' ? 'bg-blue-500' : 'bg-slate-400')} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{campaign.name}</span>
                    {active && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatLabel(campaign.status)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{campaign.scope === 'organization' ? 'Team' : 'Private'}</span>
                    {campaign.startDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Starts {formatDateLabel(campaign.startDate)}</span>
                      </>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                    {channelSummary}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </div>
    </DropdownMenu>
  );
}

export default function StudioPlansPage() {
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useStudioWorkspace();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [loading, setLoading] = useState(true);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [sharingCampaign, setSharingCampaign] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedCampaign ? Boolean(selectedCampaign.canEdit) : true);
  const isPersonalWorkspace = organization?.type === 'personal_legacy';
  const shareUnavailableMessage = isPersonalWorkspace ? 'Switch to a team workspace first.' : null;
  const canShareSelectedCampaign = !isDemoMode && Boolean(selectedCampaign?.canShare) && !isPersonalWorkspace;

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const activeCampaignCount = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'active').length,
    [campaigns]
  );
  const upcomingCampaignCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return campaigns.filter((campaign) => {
      if (!campaign.startDate) return false;
      const start = new Date(`${campaign.startDate}T00:00:00.000Z`);
      return Number.isFinite(start.getTime()) && start > today;
    }).length;
  }, [campaigns]);
  const sharedCampaignCount = useMemo(
    () => campaigns.filter((campaign) => campaign.scope === 'organization').length,
    [campaigns]
  );
  const canSaveNewCampaignPrivately = !selectedCampaignId && !isPersonalWorkspace;

  const loadPlans = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [plansResponse, voicesResponse, contentResponse] = await Promise.all([
        fetch(withOrganizationId('/api/campaigns', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/brand-voices', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/content-library?limit=100', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);

      const [plansPayload, voicesPayload, contentPayload] = await Promise.all([
        plansResponse.json().catch(() => ({})),
        voicesResponse.json().catch(() => ({})),
        contentResponse.json().catch(() => ({})),
      ]);

      if (!plansResponse.ok) {
        throw new Error(plansPayload.error || 'Failed to load plans');
      }

      const nextCampaigns = Array.isArray(plansPayload.campaigns)
        ? plansPayload.campaigns as Campaign[]
        : [];
      setCampaigns(nextCampaigns);
      setBrandVoices(voicesResponse.ok && Array.isArray(voicesPayload.brandVoices)
        ? voicesPayload.brandVoices as BrandVoice[]
        : []);
      setContentItems(contentResponse.ok && Array.isArray(contentPayload.contentItems)
        ? contentPayload.contentItems as ContentLibraryItem[]
        : []);

      const nextCampaign = nextCampaigns[0] || null;
      setSelectedCampaignId(nextCampaign?.id || null);
      setCampaignForm(nextCampaign ? campaignToForm(nextCampaign) : emptyCampaignForm);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load plans');
      setCampaigns([]);
      setBrandVoices([]);
      setContentItems([]);
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

  const validateCampaignVoiceScope = (visibility?: StudioSaveVisibility): boolean => {
    if (!campaignForm.brandVoiceId) return true;

    const selectedVoice = brandVoices.find((voice) => voice.id === campaignForm.brandVoiceId) || null;
    if (!selectedVoice) return true;

    const targetScope = selectedCampaign?.scope
      || (visibility === 'private' || isPersonalWorkspace ? 'private' : 'organization');

    if (targetScope === 'organization' && selectedVoice.scope !== 'organization') {
      setError('Choose a team voice before creating a team plan, or save this plan privately.');
      return false;
    }

    if (targetScope === 'private' && selectedVoice.scope === 'organization') {
      setError('Choose a private voice before saving this private plan, or leave voice selection empty.');
      return false;
    }

    return true;
  };

  const saveCampaign = async (visibility?: StudioSaveVisibility) => {
    if (!canEdit || !organizationId) return;
    if (!validateCampaignVoiceScope(visibility)) return;
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
          body: JSON.stringify(campaignFormToPayload(campaignForm, organizationId, isUpdate ? undefined : visibility)),
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
      setMessage(isUpdate
        ? 'Plan updated.'
        : savedCampaign.scope === 'organization'
          ? 'Team plan created.'
          : 'Private plan created.');
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
    if (isPersonalWorkspace) {
      setError('Switch to a team workspace before publishing this plan.');
      return;
    }
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
        throw new Error(payload.error || 'Failed to publish plan');
      }

      const sharedCampaign = payload.campaign as Campaign;
      setCampaigns((current) => {
        const withoutDuplicate = current.filter((campaign) => campaign.id !== sharedCampaign.id);
        return [sharedCampaign, ...withoutDuplicate];
      });
      setSelectedCampaignId(sharedCampaign.id);
      setCampaignForm(campaignToForm(sharedCampaign));
      setMessage('Plan published to your team.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to publish plan');
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
        throw new Error(payload.error || 'Failed to move plan to private');
      }

      const privateCampaign = payload.campaign as Campaign | null | undefined;
      const remaining = campaigns.filter((campaign) => campaign.id !== selectedCampaign.id);
      const nextCampaigns = privateCampaign ? [privateCampaign, ...remaining] : remaining;
      const nextCampaign = privateCampaign
        || remaining.find((campaign) => campaign.id === selectedCampaign.sharedFromCampaignId)
        || remaining[0]
        || null;
      setCampaigns(nextCampaigns);
      setSelectedCampaignId(nextCampaign?.id || null);
      setCampaignForm(nextCampaign ? campaignToForm(nextCampaign) : emptyCampaignForm);
      setMessage('Plan moved to private.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to move plan to private');
    } finally {
      setSharingCampaign(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-0 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
        <DashboardPageHeader
          density="compact"
          icon={FolderKanban}
          title="Plans"
          description="Review available plans, features, and upgrade options."
          actions={(
            <StudioHeaderControls
              selector={(
                <PlanSelector
                  campaigns={campaigns}
                  selectedCampaignId={selectedCampaignId}
                  selectedCampaign={selectedCampaign}
                  draftName={campaignForm.name}
                  loading={loading || loadingOrganization}
                  onSelectCampaign={selectCampaign}
                />
              )}
              action={(
                <ActionButton
                  type="button"
                  onClick={startNewCampaign}
                  disabled={!canCreate || loading || loadingOrganization}
                  variant="primary"
                  className="h-11 w-full px-4 sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  New plan
                </ActionButton>
              )}
            />
          )}
        />
        {(error || message) && (
          <div
            role="status"
            className={cn(
              'mb-5 rounded-md border px-4 py-3 text-sm shadow-sm',
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
            <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
              <div className="h-28 animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
              <div className="h-28 animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
              <div className="h-28 animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
              <div className="h-28 animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
            </div>
            <div className="mx-auto w-full max-w-6xl">
              <div className="h-[42rem] animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryTile
                icon={<CalendarDays className="h-5 w-5" />}
                label="Active plans"
                value={`${activeCampaignCount}`}
                detail="Plans currently running"
                tone="blue"
              />
              <SummaryTile
                icon={<Clock3 className="h-5 w-5" />}
                label="Upcoming"
                value={`${upcomingCampaignCount}`}
                detail="Plans scheduled to start"
                tone="violet"
              />
              <SummaryTile
                icon={<FileText className="h-5 w-5" />}
                label="Generated drafts"
                value={`${contentItems.length}`}
                detail="Drafts saved in Library"
                tone="green"
              />
              <SummaryTile
                icon={<Users className="h-5 w-5" />}
                label="Team plans"
                value={`${sharedCampaignCount}`}
                detail="Team-owned plans"
                tone="slate"
              />
            </div>

            <div className="mx-auto w-full max-w-6xl">
              <Card className="rounded-md">
                <CardHeader className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {selectedCampaign ? 'Edit content plan' : 'Create content plan'}
                      </CardTitle>
                      <CardDescription className="mt-2 leading-5">
                        Saved plans can be selected when generating content from completed projects.
                      </CardDescription>
                    </div>
                    <StudioAccessControl
                      entityLabel="plan"
                      scope={selectedCampaign?.scope ?? null}
                      canShare={canShareSelectedCampaign}
                      canUnshare={!isDemoMode && Boolean(selectedCampaign?.canUnshare)}
                      loading={sharingCampaign}
                      onShare={() => { void shareCampaign(); }}
                      onUnshare={() => { void unshareCampaign(); }}
                      shareUnavailableMessage={selectedCampaign?.canShare ? shareUnavailableMessage : null}
                      show={!isPersonalWorkspace}
                      className="w-full sm:w-auto"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 p-5">
                  {!canEdit && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      {isDemoMode
                        ? 'Demo accounts can view plans but cannot change Studio settings.'
                        : 'You can view this plan, but you do not have permission to change it.'}
                    </div>
                  )}

                  <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">1. Basics</h2>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
                      <div>
                        <FieldLabel htmlFor="campaign-name">Plan name</FieldLabel>
                        <TextInput
                          id="campaign-name"
                          value={campaignForm.name}
                          onChange={(value) => updateCampaignField('name', value)}
                          disabled={!canEdit}
                          placeholder="Q3 Customer Proof Campaign"
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
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <FieldLabel htmlFor="campaign-start">Start date</FieldLabel>
                        <TextInput
                          id="campaign-start"
                          type="date"
                          value={campaignForm.startDate}
                          onChange={(value) => updateCampaignField('startDate', value)}
                          disabled={!canEdit}
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
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="campaign-voice">Brand voice</FieldLabel>
                        <SelectInput
                          id="campaign-voice"
                          value={campaignForm.brandVoiceId}
                          onChange={(value) => updateCampaignField('brandVoiceId', value)}
                          disabled={!canEdit}
                        >
                          <option value="">Use generation selection</option>
                          {brandVoices.map((voice) => (
                            <option key={voice.id} value={voice.id}>
                              {voice.name}
                              {voice.scope === 'organization' ? ' (Team)' : ' (Private)'}
                            </option>
                          ))}
                        </SelectInput>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">2. Strategy brief</h2>
                    <div>
                      <FieldLabel htmlFor="campaign-objective">Objective</FieldLabel>
                      <TextArea
                        id="campaign-objective"
                        value={campaignForm.objective}
                        onChange={(value) => updateCampaignField('objective', value)}
                        disabled={!canEdit}
                        placeholder="Turn customer conversations into proof-driven content that helps teams understand the ROI of repurposing recorded calls."
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
                        placeholder="B2B founders, product marketers, RevOps leads, and content teams."
                        rows={3}
                      />
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">3. Output channels</h2>
                    <div>
                      <FieldLabel htmlFor="campaign-channels">Channels</FieldLabel>
                      <ChannelEditor
                        id="campaign-channels"
                        value={campaignForm.channelsText}
                        onChange={(value) => updateCampaignField('channelsText', value)}
                        disabled={!canEdit}
                      />
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">4. Generation guidance</h2>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tone / voice notes</p>
                        <p className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
                          {campaignForm.brandVoiceId
                            ? brandVoices.find((voice) => voice.id === campaignForm.brandVoiceId)?.name || 'Selected voice'
                            : 'Use the selected generation voice or default profile context.'}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">What to emphasize</p>
                        <p className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
                          {campaignForm.objective.trim() || 'Add an objective to guide angle and CTA.'}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">What to avoid</p>
                        <p className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
                          Keep claims grounded in the transcript and avoid adding results that were not stated.
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                    <div className="flex items-start gap-3">
                      <BookOpenText className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <p>
                        Generated drafts save to your <Link href="/dashboard/library" className="font-semibold underline">Library</Link> and carry this plan context in their generation metadata.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedCampaign && (
                        <ActionButton
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          disabled={!canEdit || deletingCampaign}
                          variant="danger"
                        >
                          {deletingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </ActionButton>
                      )}
                      <ActionButton
                        type="button"
                        variant="secondary"
                        onClick={() => { void saveCampaign('private'); }}
                        disabled={!canSaveNewCampaignPrivately || !canEdit || savingCampaign || !campaignForm.name.trim()}
                        className={canSaveNewCampaignPrivately ? undefined : 'hidden'}
                      >
                        {savingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save privately
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="primary"
                        onClick={() => { void saveCampaign(); }}
                        disabled={!canEdit || savingCampaign || !campaignForm.name.trim()}
                      >
                        {savingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {!selectedCampaignId && !isPersonalWorkspace ? 'Create team plan' : 'Save plan'}
                      </ActionButton>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <StudioMobileActionBar
        primaryLabel={!selectedCampaignId && !isPersonalWorkspace ? 'Create team plan' : 'Save plan'}
        onPrimary={() => { void saveCampaign(); }}
        disabled={!canEdit || !campaignForm.name.trim()}
        loading={savingCampaign}
        primaryIcon={<Save className="h-4 w-4" />}
        secondary={canSaveNewCampaignPrivately ? (
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => { void saveCampaign('private'); }}
            disabled={!canEdit || savingCampaign || !campaignForm.name.trim()}
            className="h-11"
          >
            Private
          </ActionButton>
        ) : undefined}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete plan?"
        description="Saved drafts that referenced this plan will remain available, but future generation cannot select it."
        confirmText="Delete plan"
        cancelText="Cancel"
        isDestructive
        onConfirm={deleteCampaign}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
