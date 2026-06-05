"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  CalendarRange,
  FileText,
  FolderKanban,
  Library,
  Loader2,
  Plus,
  Save,
  Tags,
  Trash2,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import {
  CAMPAIGN_STATUSES,
  CONTENT_LIBRARY_STATUSES,
  type Campaign,
  type CampaignStatus,
  type ContentLibraryItem,
  type ContentLibraryStatus,
} from '@/lib/campaigns-content-library';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type CampaignFormState = {
  name: string;
  status: CampaignStatus;
  objective: string;
  audience: string;
  channelsText: string;
  startDate: string;
  endDate: string;
};

type ContentFormState = {
  title: string;
  contentType: string;
  platform: string;
  status: ContentLibraryStatus;
  campaignId: string;
  tagsText: string;
  excerpt: string;
  body: string;
  sourceLabel: string;
  publishedAt: string;
};

const emptyCampaignForm: CampaignFormState = {
  name: 'New campaign',
  status: 'planned',
  objective: '',
  audience: '',
  channelsText: '',
  startDate: '',
  endDate: '',
};

const emptyContentForm: ContentFormState = {
  title: 'New library item',
  contentType: 'linkedin_post',
  platform: 'LinkedIn',
  status: 'draft',
  campaignId: '',
  tagsText: '',
  excerpt: '',
  body: '',
  sourceLabel: '',
  publishedAt: '',
};

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
    startDate: campaign.startDate || '',
    endDate: campaign.endDate || '',
  };
}

function contentToForm(item: ContentLibraryItem): ContentFormState {
  return {
    title: item.title,
    contentType: item.contentType,
    platform: item.platform || '',
    status: item.status,
    campaignId: item.campaignId || '',
    tagsText: listToText(item.tags),
    excerpt: item.excerpt || '',
    body: item.body || '',
    sourceLabel: item.sourceLabel || '',
    publishedAt: item.publishedAt ? item.publishedAt.slice(0, 16) : '',
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
    startDate: form.startDate,
    endDate: form.endDate,
  };
}

function contentFormToPayload(form: ContentFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    title: form.title,
    contentType: form.contentType,
    platform: form.platform,
    status: form.status,
    campaignId: form.campaignId || null,
    tags: textToList(form.tagsText),
    excerpt: form.excerpt,
    body: form.body,
    sourceLabel: form.sourceLabel,
    publishedAt: form.publishedAt || null,
  };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-200">
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
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
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
      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
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
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    >
      {children}
    </select>
  );
}

export default function CampaignsPage() {
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useCurrentOrganization();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm);
  const [contentForm, setContentForm] = useState<ContentFormState>(emptyContentForm);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [deletingContent, setDeletingContent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'campaign' | 'content' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );
  const selectedContent = useMemo(
    () => contentItems.find((item) => item.id === selectedContentId) || null,
    [contentItems, selectedContentId]
  );
  const canEdit = canManage && !isDemoMode;

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const loadWorkspace = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [campaignsResponse, contentResponse] = await Promise.all([
        fetch(withOrganizationId('/api/campaigns', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/content-library', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const campaignsPayload = await campaignsResponse.json().catch(() => ({}));
      const contentPayload = await contentResponse.json().catch(() => ({}));

      if (!campaignsResponse.ok) {
        throw new Error(campaignsPayload.error || 'Failed to load campaigns');
      }
      if (!contentResponse.ok) {
        throw new Error(contentPayload.error || 'Failed to load content library');
      }

      const nextCampaigns = Array.isArray(campaignsPayload.campaigns)
        ? campaignsPayload.campaigns as Campaign[]
        : [];
      const nextContentItems = Array.isArray(contentPayload.contentItems)
        ? contentPayload.contentItems as ContentLibraryItem[]
        : [];
      setCampaigns(nextCampaigns);
      setContentItems(nextContentItems);
      setCanManage(Boolean(
        campaignsPayload.membership?.canManageCampaignLibrary
        || contentPayload.membership?.canManageCampaignLibrary
      ));

      const nextCampaign = nextCampaigns[0] || null;
      const nextContent = nextContentItems[0] || null;
      setSelectedCampaignId(nextCampaign?.id || null);
      setSelectedContentId(nextContent?.id || null);
      setCampaignForm(nextCampaign ? campaignToForm(nextCampaign) : emptyCampaignForm);
      setContentForm(nextContent ? contentToForm(nextContent) : emptyContentForm);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load campaign workspace');
      setCampaigns([]);
      setContentItems([]);
      setSelectedCampaignId(null);
      setSelectedContentId(null);
      setCampaignForm(emptyCampaignForm);
      setContentForm(emptyContentForm);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadWorkspace();
  }, [loadWorkspace, loadingOrganization]);

  const updateCampaignField = <K extends keyof CampaignFormState>(field: K, value: CampaignFormState[K]) => {
    setCampaignForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateContentField = <K extends keyof ContentFormState>(field: K, value: ContentFormState[K]) => {
    setContentForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectCampaign = (campaign: Campaign) => {
    setSelectedCampaignId(campaign.id);
    setCampaignForm(campaignToForm(campaign));
    setError(null);
    setMessage(null);
  };

  const selectContent = (item: ContentLibraryItem) => {
    setSelectedContentId(item.id);
    setContentForm(contentToForm(item));
    setError(null);
    setMessage(null);
  };

  const startNewCampaign = () => {
    setSelectedCampaignId(null);
    setCampaignForm(emptyCampaignForm);
    setError(null);
    setMessage(null);
  };

  const startNewContent = () => {
    setSelectedContentId(null);
    setContentForm({
      ...emptyContentForm,
      campaignId: selectedCampaignId || '',
    });
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
        throw new Error(payload.error || 'Failed to save campaign');
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
      setMessage(isUpdate ? 'Campaign updated.' : 'Campaign created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save campaign');
    } finally {
      setSavingCampaign(false);
    }
  };

  const saveContent = async () => {
    if (!canEdit || !organizationId) return;
    setSavingContent(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedContentId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/content-library/${selectedContentId}`, organizationId)
          : withOrganizationId('/api/content-library', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contentFormToPayload(contentForm, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save content library item');
      }

      const savedContent = payload.contentItem as ContentLibraryItem;
      setContentItems((current) => {
        if (isUpdate) {
          return current.map((item) => item.id === savedContent.id ? savedContent : item);
        }
        return [savedContent, ...current];
      });
      setSelectedContentId(savedContent.id);
      setContentForm(contentToForm(savedContent));
      setMessage(isUpdate ? 'Library item updated.' : 'Library item created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save content library item');
    } finally {
      setSavingContent(false);
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
        throw new Error(payload.error || 'Failed to delete campaign');
      }

      const deletedCampaignId = selectedCampaignId;
      const remaining = campaigns.filter((campaign) => campaign.id !== deletedCampaignId);
      const nextSelected = remaining[0] || null;
      setCampaigns(remaining);
      setContentItems((current) => current.map((item) => (
        item.campaignId === deletedCampaignId ? { ...item, campaignId: null } : item
      )));
      setSelectedCampaignId(nextSelected?.id || null);
      setCampaignForm(nextSelected ? campaignToForm(nextSelected) : emptyCampaignForm);
      setMessage('Campaign deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete campaign');
    } finally {
      setDeletingCampaign(false);
    }
  };

  const deleteContent = async () => {
    if (!canEdit || !organizationId || !selectedContentId) return;
    setDeletingContent(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/content-library/${selectedContentId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete content library item');
      }

      const remaining = contentItems.filter((item) => item.id !== selectedContentId);
      const nextSelected = remaining[0] || null;
      setContentItems(remaining);
      setSelectedContentId(nextSelected?.id || null);
      setContentForm(nextSelected ? contentToForm(nextSelected) : emptyContentForm);
      setMessage('Library item deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete content library item');
    } finally {
      setDeletingContent(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
              <FolderKanban className="h-3.5 w-3.5" />
              Campaigns
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Campaigns and Content Library
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Organize campaigns and keep reusable content drafts tied to the current workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && (
              <Badge variant="outline" className="w-fit">
                {organization.name}
              </Badge>
            )}
            {!canManage && !loading && (
              <Badge variant="secondary" className="w-fit">
                Read only
              </Badge>
            )}
            {isDemoMode && (
              <Badge variant="warning" className="w-fit">
                Demo
              </Badge>
            )}
          </div>
        </div>

        {(error || message) && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            }`}
          >
            {error || message}
          </div>
        )}

        {loading || loadingOrganization ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Campaigns</CardTitle>
                      <CardDescription>
                        Planning containers for recurring themes and launches.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={startNewCampaign}
                      disabled={!canEdit}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                      aria-label="Create campaign"
                      title="Create campaign"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {campaigns.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No campaigns yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {campaigns.map((campaign) => {
                        const active = campaign.id === selectedCampaignId;
                        return (
                          <button
                            key={campaign.id}
                            type="button"
                            onClick={() => selectCampaign(campaign)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{campaign.name}</p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {campaign.channels.length > 0 ? campaign.channels.join(', ') : campaign.objective || 'No channels set'}
                                </p>
                              </div>
                              <Badge variant={campaign.status === 'active' ? 'success' : 'secondary'} className="flex-shrink-0">
                                {formatLabel(campaign.status)}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{selectedCampaign ? 'Edit campaign' : 'Create campaign'}</CardTitle>
                      <CardDescription>
                        Capture campaign scope, timing, audience, and channel focus.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCampaign && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget('campaign')}
                          disabled={!canEdit || deletingCampaign}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {deletingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={saveCampaign}
                        disabled={!canEdit || savingCampaign || !campaignForm.name.trim()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {selectedCampaign ? 'Save changes' : 'Create campaign'}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      You can view campaigns, but only organization owners and admins can change workspace campaign settings.
                    </div>
                  )}

                  <div className="grid gap-5">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                      <div>
                        <FieldLabel htmlFor="campaign-name">Campaign name</FieldLabel>
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
                        <div className="flex items-center gap-2">
                          <CalendarRange className="h-4 w-4 text-slate-400" />
                          <FieldLabel htmlFor="campaign-start">Start date</FieldLabel>
                        </div>
                        <TextInput
                          id="campaign-start"
                          type="date"
                          value={campaignForm.startDate}
                          onChange={(value) => updateCampaignField('startDate', value)}
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Archive className="h-4 w-4 text-slate-400" />
                          <FieldLabel htmlFor="campaign-end">End date</FieldLabel>
                        </div>
                        <TextInput
                          id="campaign-end"
                          type="date"
                          value={campaignForm.endDate}
                          onChange={(value) => updateCampaignField('endDate', value)}
                          disabled={!canEdit}
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
                        rows={3}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="campaign-channels">Channels</FieldLabel>
                      </div>
                      <TextArea
                        id="campaign-channels"
                        value={campaignForm.channelsText}
                        onChange={(value) => updateCampaignField('channelsText', value)}
                        disabled={!canEdit}
                        placeholder={'One per line\nLinkedIn\nNewsletter\nBlog'}
                        rows={4}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Content Library</CardTitle>
                      <CardDescription>
                        Curated drafts, snippets, and reusable campaign assets.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={startNewContent}
                      disabled={!canEdit}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                      aria-label="Create content library item"
                      title="Create content library item"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {contentItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No library items yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contentItems.map((item) => {
                        const active = item.id === selectedContentId;
                        const campaign = campaigns.find((entry) => entry.id === item.campaignId);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectContent(item)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Library className={`mt-0.5 h-4 w-4 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'}`} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{item.title}</p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {formatLabel(item.contentType)}
                                  {item.platform ? ` · ${item.platform}` : ''}
                                  {campaign ? ` · ${campaign.name}` : ''}
                                </p>
                              </div>
                              <Badge variant={item.status === 'approved' || item.status === 'published' ? 'success' : 'secondary'} className="flex-shrink-0">
                                {formatLabel(item.status)}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{selectedContent ? 'Edit library item' : 'Create library item'}</CardTitle>
                      <CardDescription>
                        Store reusable drafts and references for campaign work.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedContent && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget('content')}
                          disabled={!canEdit || deletingContent}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {deletingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={saveContent}
                        disabled={!canEdit || savingContent || !contentForm.title.trim()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {selectedContent ? 'Save changes' : 'Create item'}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      You can view library items, but only organization owners and admins can change workspace content library settings.
                    </div>
                  )}

                  <div className="grid gap-5">
                    <div>
                      <FieldLabel htmlFor="content-title">Title</FieldLabel>
                      <TextInput
                        id="content-title"
                        value={contentForm.title}
                        onChange={(value) => updateContentField('title', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <FieldLabel htmlFor="content-type">Type</FieldLabel>
                        <TextInput
                          id="content-type"
                          value={contentForm.contentType}
                          onChange={(value) => updateContentField('contentType', value)}
                          disabled={!canEdit}
                          placeholder="linkedin_post"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="content-platform">Platform</FieldLabel>
                        <TextInput
                          id="content-platform"
                          value={contentForm.platform}
                          onChange={(value) => updateContentField('platform', value)}
                          disabled={!canEdit}
                          placeholder="LinkedIn"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="content-status">Status</FieldLabel>
                        <SelectInput
                          id="content-status"
                          value={contentForm.status}
                          onChange={(value) => updateContentField('status', value as ContentLibraryStatus)}
                          disabled={!canEdit}
                        >
                          {CONTENT_LIBRARY_STATUSES.map((status) => (
                            <option key={status} value={status}>{formatLabel(status)}</option>
                          ))}
                        </SelectInput>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="content-campaign">Campaign</FieldLabel>
                        <SelectInput
                          id="content-campaign"
                          value={contentForm.campaignId}
                          onChange={(value) => updateContentField('campaignId', value)}
                          disabled={!canEdit}
                        >
                          <option value="">No campaign</option>
                          {campaigns.map((campaign) => (
                            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                          ))}
                        </SelectInput>
                      </div>
                      <div>
                        <FieldLabel htmlFor="content-published">Published at</FieldLabel>
                        <TextInput
                          id="content-published"
                          type="datetime-local"
                          value={contentForm.publishedAt}
                          onChange={(value) => updateContentField('publishedAt', value)}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel htmlFor="content-source">Source label</FieldLabel>
                      <TextInput
                        id="content-source"
                        value={contentForm.sourceLabel}
                        onChange={(value) => updateContentField('sourceLabel', value)}
                        disabled={!canEdit}
                        placeholder="Imported from project, webinar, customer call, or manual draft"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="content-tags">Tags</FieldLabel>
                      </div>
                      <TextArea
                        id="content-tags"
                        value={contentForm.tagsText}
                        onChange={(value) => updateContentField('tagsText', value)}
                        disabled={!canEdit}
                        placeholder={'One per line\nCustomer proof\nLaunch\nFounder POV'}
                        rows={3}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="content-excerpt">Excerpt</FieldLabel>
                      <TextArea
                        id="content-excerpt"
                        value={contentForm.excerpt}
                        onChange={(value) => updateContentField('excerpt', value)}
                        disabled={!canEdit}
                        rows={3}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="content-body">Body</FieldLabel>
                      </div>
                      <TextArea
                        id="content-body"
                        value={contentForm.body}
                        onChange={(value) => updateContentField('body', value)}
                        disabled={!canEdit}
                        rows={10}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTarget === 'campaign' ? deleteCampaign : deleteContent}
        title={deleteTarget === 'campaign' ? 'Delete campaign?' : 'Delete library item?'}
        description={
          deleteTarget === 'campaign'
            ? 'This removes the selected campaign and leaves existing library items uncategorized.'
            : 'This removes the selected content library item.'
        }
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
}
