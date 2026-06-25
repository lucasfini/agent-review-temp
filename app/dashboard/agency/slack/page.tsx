"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Hash,
  Loader2,
  MessageSquare,
  Save,
  ShieldAlert,
  Slack,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import {
  AGENCY_CLIENT_INTEGRATION_STATUSES,
  type AgencyClientIntegration,
  type AgencyClientIntegrationStatus,
} from '@/lib/agency-client-integrations';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type SlackStatusForm = {
  clientId: string;
  status: AgencyClientIntegrationStatus;
  workspaceName: string;
  workspaceUrl: string;
  channelNames: string;
  notes: string;
};

type OAuthNotice = {
  tone: 'success' | 'error';
  text: string;
} | null;

type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount: number | null;
};

const emptySlackForm: SlackStatusForm = {
  clientId: '',
  status: 'not_connected',
  workspaceName: '',
  workspaceUrl: '',
  channelNames: '',
  notes: '',
};

function statusLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function integrationToForm(integration: AgencyClientIntegration | null, clientId: string): SlackStatusForm {
  const metadata = integration?.metadata || {};
  return {
    clientId,
    status: integration?.status || 'not_connected',
    workspaceName: typeof metadata.workspaceName === 'string' ? metadata.workspaceName : '',
    workspaceUrl: typeof metadata.workspaceUrl === 'string' ? metadata.workspaceUrl : '',
    channelNames: typeof metadata.channelNames === 'string' ? metadata.channelNames : '',
    notes: typeof metadata.notes === 'string' ? metadata.notes : '',
  };
}

function isOAuthConnected(integration: AgencyClientIntegration | null): boolean {
  const metadata = integration?.metadata || {};
  return integration?.status === 'connected'
    && (metadata.mode === 'oauth_connected' || metadata.externalConnection === true);
}

function stringMetadata(metadata: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function selectedChannelsFromIntegration(integration: AgencyClientIntegration | null): SlackChannel[] {
  const value = integration?.metadata?.selectedChannels;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name : id;
    if (!id) return [];
    return [{
      id,
      name,
      isPrivate: record.isPrivate === true,
      isArchived: record.isArchived === true,
      memberCount: typeof record.memberCount === 'number' ? record.memberCount : null,
    }];
  });
}

function formToPayload(form: SlackStatusForm, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId,
    status: form.status,
    workspaceName: form.workspaceName,
    workspaceUrl: form.workspaceUrl,
    channelNames: form.channelNames,
    notes: form.notes,
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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
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
  rows = 5,
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

export default function AgencySlackFoundationPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [form, setForm] = useState<SlackStatusForm>(emptySlackForm);
  const [integration, setIntegration] = useState<AgencyClientIntegration | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [queryClientId, setQueryClientId] = useState('');
  const [oauthNotice, setOauthNotice] = useState<OAuthNotice>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<SlackChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [importingChannelId, setImportingChannelId] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) || null,
    [clients, form.clientId]
  );
  const isInternalAgency = organization?.type === 'internal_agency';
  const canEdit = canManage && !isDemoMode;
  const oauthConnected = isOAuthConnected(integration);
  const integrationMetadata = integration?.metadata || {};
  const connectedWorkspaceName = stringMetadata(integrationMetadata, 'workspaceName', 'teamName');
  const connectedWorkspaceId = stringMetadata(integrationMetadata, 'workspaceId', 'teamId');
  const connectedAt = stringMetadata(integrationMetadata, 'connectedAt');
  const tokenStored = integration?.tokenStored === true || integrationMetadata.tokenStored === true;
  const selectedChannelIds = useMemo(
    () => new Set(selectedChannels.map((channel) => channel.id)),
    [selectedChannels]
  );
  const noticeText = error || message || oauthNotice?.text || null;
  const noticeIsError = Boolean(error || oauthNotice?.tone === 'error');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    setQueryClientId(params.get('client_id') || '');

    const oauthStatus = params.get('slack_oauth');
    if (oauthStatus === 'success') {
      setOauthNotice({
        tone: 'success',
        text: 'Slack workspace connected.',
      });
    } else if (oauthStatus === 'error') {
      setOauthNotice({
        tone: 'error',
        text: `Slack OAuth failed: ${statusLabel(params.get('reason') || 'oauth_failed')}`,
      });
    } else {
      setOauthNotice(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setCanManage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const activeClientId = form.clientId || queryClientId;
      if (activeClientId) params.set('client_id', activeClientId);
      const statusPath = withOrganizationId(
        params.toString() ? `/api/agency/slack/status?${params.toString()}` : '/api/agency/slack/status',
        organizationId
      );
      const [clientsResponse, statusResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(statusPath, {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const statusPayload = await statusResponse.json().catch(() => ({}));

      if (!clientsResponse.ok) {
        throw new Error(clientsPayload.error || 'Failed to load agency clients');
      }
      if (!statusResponse.ok) {
        throw new Error(statusPayload.error || 'Failed to load Slack status');
      }

      const nextClients = Array.isArray(clientsPayload.clients)
        ? clientsPayload.clients as AgencyClient[]
        : [];
      const nextClientId = activeClientId || nextClients[0]?.id || '';
      const nextIntegration = statusPayload.integration || null;

      setClients(nextClients);
      setCanManage(Boolean(statusPayload.membership?.canManageAgencyClient));
      setIntegration(nextIntegration);
      setForm((current) => {
        if (!nextClientId) return current;
        if (current.clientId && current.clientId !== nextClientId) return current;
        return integrationToForm(nextIntegration, nextClientId);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Slack foundation');
      setClients([]);
      setCanManage(false);
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, form.clientId, isInternalAgency, organizationId, queryClientId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  useEffect(() => {
    setSelectedChannels(selectedChannelsFromIntegration(integration));
  }, [integration]);

  const updateField = <K extends keyof SlackStatusForm>(field: K, value: SlackStatusForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'clientId') {
      setIntegration(null);
    }
    setMessage(null);
  };

  const loadSlackChannels = useCallback(async () => {
    if (!organizationId || !form.clientId || !oauthConnected || !tokenStored) {
      setChannels([]);
      return;
    }

    setLoadingChannels(true);
    setError(null);

    try {
      const path = withOrganizationId(
        `/api/agency/slack/channels?client_id=${encodeURIComponent(form.clientId)}`,
        organizationId
      );
      const response = await fetch(path, {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load Slack channels');
      }
      setChannels(Array.isArray(payload.channels) ? payload.channels : []);
    } catch (channelError) {
      setChannels([]);
      setError(channelError instanceof Error ? channelError.message : 'Failed to load Slack channels');
    } finally {
      setLoadingChannels(false);
    }
  }, [authHeaders, form.clientId, oauthConnected, organizationId, tokenStored]);

  useEffect(() => {
    if (!oauthConnected || !tokenStored) {
      setChannels([]);
      return;
    }
    void loadSlackChannels();
  }, [loadSlackChannels, oauthConnected, tokenStored]);

  const toggleSelectedChannel = (channel: SlackChannel) => {
    if (!canEdit) return;
    setSelectedChannels((current) => {
      if (current.some((item) => item.id === channel.id)) {
        return current.filter((item) => item.id !== channel.id);
      }
      return [...current, channel];
    });
    setMessage(null);
  };

  const saveChannelSelection = async () => {
    if (!canEdit || !organizationId || !form.clientId) return;
    setSavingChannels(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId('/api/agency/slack/channels/selection', organizationId), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          client_id: form.clientId,
          channels: selectedChannels,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save Slack channel selection');
      }
      setIntegration(payload.integration as AgencyClientIntegration);
      setMessage('Slack channel selection saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Slack channel selection');
    } finally {
      setSavingChannels(false);
    }
  };

  const importSlackChannel = async (channel: SlackChannel) => {
    if (!canEdit || !organizationId || !form.clientId) return;
    setImportingChannelId(channel.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId('/api/agency/slack/import', organizationId), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          client_id: form.clientId,
          channel_id: channel.id,
          limit: 50,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to import Slack messages');
      }
      setMessage(`Imported ${payload.messageCount || 0} Slack messages from #${channel.name}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import Slack messages');
    } finally {
      setImportingChannelId(null);
    }
  };

  const saveStatus = async () => {
    if (!canEdit || !organizationId || !form.clientId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId('/api/agency/slack/status', organizationId), {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formToPayload(form, organizationId)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save Slack status');
      }

      const nextIntegration = payload.integration as AgencyClientIntegration;
      setIntegration(nextIntegration);
      setForm(integrationToForm(nextIntegration, form.clientId));
      setMessage('Slack foundation status saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Slack status');
    } finally {
      setSaving(false);
    }
  };

  const startSlackOAuth = async () => {
    if (!canEdit || !organizationId || !form.clientId) return;
    setConnecting(true);
    setError(null);
    setMessage(null);

    try {
      const path = withOrganizationId(
        `/api/agency/slack/oauth/start?client_id=${encodeURIComponent(form.clientId)}&mode=json`,
        organizationId
      );
      const response = await fetch(path, {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || typeof payload.url !== 'string') {
        throw new Error(payload.error || 'Failed to start Slack OAuth');
      }

      window.location.assign(payload.url);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to start Slack OAuth');
      setConnecting(false);
    }
  };

  if (loadingOrganization) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="h-[34rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  if (!isInternalAgency) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
          <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-slate-50">
              Slack foundation unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Slack integration planning is private to internal agency organizations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <Slack className="h-3.5 w-3.5" />
              Foundation Only
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Slack Foundation
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Track client Slack readiness, workspace connection state, and future channel context.
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

        {noticeText && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              noticeIsError
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            }`}
          >
            {noticeText}
          </div>
        )}

        {loading ? (
          <div className="h-[34rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Client Slack Status</CardTitle>
                <CardDescription>
                  Store readiness, workspace connection state, and channel notes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!canEdit && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    Slack status edits require internal agency admin access.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="slack-client">Client</FieldLabel>
                    <select
                      id="slack-client"
                      value={form.clientId}
                      onChange={(event) => updateField('clientId', event.target.value)}
                      disabled={!canEdit}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                    >
                      <option value="">Select a client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel htmlFor="slack-status">Status</FieldLabel>
                    <select
                      id="slack-status"
                      value={form.status}
                      onChange={(event) => updateField('status', event.target.value as AgencyClientIntegrationStatus)}
                      disabled={!canEdit}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                    >
                      {AGENCY_CLIENT_INTEGRATION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel htmlFor="slack-workspace">Workspace name</FieldLabel>
                    <TextInput
                      id="slack-workspace"
                      value={form.workspaceName}
                      onChange={(value) => updateField('workspaceName', value)}
                      disabled={!canEdit}
                      placeholder="Client workspace"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="slack-url">Workspace URL</FieldLabel>
                    <TextInput
                      id="slack-url"
                      value={form.workspaceUrl}
                      onChange={(value) => updateField('workspaceUrl', value)}
                      disabled={!canEdit}
                      placeholder="https://client.slack.com"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="slack-channels">Priority channels</FieldLabel>
                    <TextArea
                      id="slack-channels"
                      value={form.channelNames}
                      onChange={(value) => updateField('channelNames', value)}
                      disabled={!canEdit}
                      placeholder="#support, #product, #announcements"
                      rows={4}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="slack-notes">Internal notes</FieldLabel>
                    <TextArea
                      id="slack-notes"
                      value={form.notes}
                      onChange={(value) => updateField('notes', value)}
                      disabled={!canEdit}
                      placeholder="Access requirements, channel context, or future import plan."
                      rows={5}
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedClient?.name || 'No client selected'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {oauthConnected
                        ? `Connected to ${connectedWorkspaceName || 'Slack workspace'}`
                        : 'Foundation metadata only'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void startSlackOAuth()}
                        disabled={connecting || !form.clientId}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                      >
                        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                        {oauthConnected ? 'Reconnect Slack' : 'Connect Slack'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveStatus()}
                      disabled={!canEdit || saving || !form.clientId}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Status
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Status Snapshot</CardTitle>
                  <CardDescription>
                    Stored Slack foundation metadata.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Slack className="h-3.5 w-3.5" />
                        Connection
                      </div>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {oauthConnected ? 'OAuth connected' : 'Not connected'}
                      </p>
                      {oauthConnected && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {connectedWorkspaceId || connectedAt || 'Workspace metadata stored'}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Status
                      </div>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {statusLabel(form.status)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Slack className="h-3.5 w-3.5" />
                        Workspace
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {connectedWorkspaceName || form.workspaceName || 'Not recorded'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Hash className="h-3.5 w-3.5" />
                        Channels
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                        {form.channelNames || 'Not recorded'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {oauthConnected && (
                <Card>
                  <CardHeader>
                    <CardTitle>Channel Imports</CardTitle>
                    <CardDescription>
                      Select channels and run bounded manual imports.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!tokenStored ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        Reconnect Slack to store an encrypted token before channel imports.
                      </div>
                    ) : loadingChannels ? (
                      <div className="flex min-h-24 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading channels
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {channels.length === 0 ? (
                          <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            No Slack channels returned.
                          </div>
                        ) : channels.slice(0, 12).map((channel) => {
                          const selected = selectedChannelIds.has(channel.id);
                          return (
                            <div
                              key={channel.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                            >
                              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={!canEdit}
                                  onChange={() => toggleSelectedChannel(channel)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                />
                                <span className="truncate">#{channel.name}</span>
                                {channel.isPrivate && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                    private
                                  </span>
                                )}
                              </label>
                              <button
                                type="button"
                                onClick={() => void importSlackChannel(channel)}
                                disabled={!canEdit || !selected || importingChannelId === channel.id}
                                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                              >
                                {importingChannelId === channel.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Import
                              </button>
                            </div>
                          );
                        })}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => void loadSlackChannels()}
                            disabled={loadingChannels}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                          >
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveChannelSelection()}
                            disabled={!canEdit || savingChannels}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingChannels && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Save Channels
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Boundary</CardTitle>
                  <CardDescription>
                    Explicitly deferred from this phase.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <li>No automatic Slack sync.</li>
                    <li>No bot posting or Slack event subscriptions.</li>
                    <li>No workspace-wide history import.</li>
                    <li>No tokens or workspace secrets are shown in the dashboard.</li>
                    <li>No SaaS customer Slack surface.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
