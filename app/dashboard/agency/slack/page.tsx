"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
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
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      if (form.clientId) params.set('client_id', form.clientId);
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
      const nextClientId = form.clientId || nextClients[0]?.id || '';
      const nextIntegration = statusPayload.integration || null;

      setClients(nextClients);
      setCanManage(Boolean(statusPayload.membership?.canManageAgencyClient));
      setForm((current) => {
        if (!nextClientId) return current;
        if (current.clientId && current.clientId !== nextClientId) return current;
        return integrationToForm(nextIntegration, nextClientId);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Slack foundation');
      setClients([]);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, form.clientId, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const updateField = <K extends keyof SlackStatusForm>(field: K, value: SlackStatusForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
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
      setForm(integrationToForm(nextIntegration, form.clientId));
      setMessage('Slack foundation status saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Slack status');
    } finally {
      setSaving(false);
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
              Track client Slack readiness and channel context before any external connection is built.
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

        {loading ? (
          <div className="h-[34rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Client Slack Status</CardTitle>
                <CardDescription>
                  Store readiness and channel notes. No Slack API calls are made.
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
                      Foundation metadata only
                    </p>
                  </div>
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
                        {form.workspaceName || 'Not recorded'}
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

              <Card>
                <CardHeader>
                  <CardTitle>Boundary</CardTitle>
                  <CardDescription>
                    Explicitly deferred from this phase.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <li>No Slack OAuth app install.</li>
                    <li>No bot tokens or workspace secrets.</li>
                    <li>No channel sync or message import.</li>
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
