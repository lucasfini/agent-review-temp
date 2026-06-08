"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenText,
  Calendar,
  CheckSquare,
  FileText,
  Loader2,
  Quote,
  Save,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import { type AgencyClientIntegration } from '@/lib/agency-client-integrations';
import { normalizeGranolaManualImport } from '@/lib/agency-granola-parser';
import { type AgencySourceImport } from '@/lib/agency-source-imports';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type GranolaImportForm = {
  clientId: string;
  sourceTitle: string;
  meetingDate: string;
  meetingType: string;
  participants: string;
  rawText: string;
  summary: string;
  decisions: string;
  actionItems: string;
  customerPainPoints: string;
  notableQuotes: string;
  followUpOpportunities: string;
};

const emptyGranolaForm: GranolaImportForm = {
  clientId: '',
  sourceTitle: 'Granola meeting notes',
  meetingDate: '',
  meetingType: '',
  participants: '',
  rawText: '',
  summary: '',
  decisions: '',
  actionItems: '',
  customerPainPoints: '',
  notableQuotes: '',
  followUpOpportunities: '',
};

function formatDate(value: string | null): string {
  if (!value) return 'Not synced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusLabel(value?: string | null): string {
  if (!value) return 'Not connected';
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  rows = 6,
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

function formToPayload(form: GranolaImportForm, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId,
    sourceTitle: form.sourceTitle,
    meetingTitle: form.sourceTitle,
    rawText: form.rawText,
    summary: form.summary,
    meetingDate: form.meetingDate || null,
    meetingType: form.meetingType || null,
    participants: form.participants || null,
    decisions: form.decisions || null,
    actionItems: form.actionItems || null,
    customerPainPoints: form.customerPainPoints || null,
    notableQuotes: form.notableQuotes || null,
    followUpOpportunities: form.followUpOpportunities || null,
  };
}

function PreviewList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {values.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm leading-5 text-slate-700 dark:text-slate-300">
          {values.slice(0, 4).map((value) => (
            <li key={value} className="line-clamp-2">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function metadataString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metadataList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export default function AgencyGranolaImportPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [imports, setImports] = useState<AgencySourceImport[]>([]);
  const [integration, setIntegration] = useState<AgencyClientIntegration | null>(null);
  const [form, setForm] = useState<GranolaImportForm>(emptyGranolaForm);
  const [canManage, setCanManage] = useState(false);
  const [canTrackIntegration, setCanTrackIntegration] = useState(false);
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
  const structuredPreview = useMemo(
    () => normalizeGranolaManualImport({
      ...form,
      meetingTitle: form.sourceTitle,
    }, 'preview').metadata,
    [form]
  );
  const isInternalAgency = organization?.type === 'internal_agency';
  const canImport = canManage && !isDemoMode;

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setImports([]);
      setIntegration(null);
      setCanManage(false);
      setCanTrackIntegration(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (form.clientId) params.set('client_id', form.clientId);
      const importsPath = withOrganizationId(
        params.toString() ? `/api/agency/granola/imports?${params.toString()}` : '/api/agency/granola/imports',
        organizationId
      );
      const [clientsResponse, importsResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(importsPath, {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const importsPayload = await importsResponse.json().catch(() => ({}));

      if (!clientsResponse.ok) {
        throw new Error(clientsPayload.error || 'Failed to load agency clients');
      }
      if (!importsResponse.ok) {
        throw new Error(importsPayload.error || 'Failed to load Granola imports');
      }

      const nextClients = Array.isArray(clientsPayload.clients)
        ? clientsPayload.clients as AgencyClient[]
        : [];
      setClients(nextClients);
      setImports(Array.isArray(importsPayload.imports) ? importsPayload.imports as AgencySourceImport[] : []);
      setIntegration(importsPayload.integration || null);
      setCanManage(Boolean(importsPayload.membership?.canManageAgencySourceImport));
      setCanTrackIntegration(Boolean(importsPayload.membership?.canManageAgencyClient));

      if (!form.clientId && nextClients[0]) {
        setForm((current) => ({ ...current, clientId: nextClients[0].id }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Granola import workflow');
      setClients([]);
      setImports([]);
      setIntegration(null);
      setCanManage(false);
      setCanTrackIntegration(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, form.clientId, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const updateField = <K extends keyof GranolaImportForm>(field: K, value: GranolaImportForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const saveImport = async () => {
    if (!canImport || !organizationId || !form.clientId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId('/api/agency/granola/imports', organizationId), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formToPayload(form, organizationId)),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to import Granola notes');
      }

      setImports((current) => [payload.sourceImport as AgencySourceImport, ...current]);
      setIntegration(payload.integration || null);
      setMessage('Granola notes imported.');
      setForm((current) => ({
        ...current,
        sourceTitle: 'Granola meeting notes',
        meetingDate: '',
        meetingType: '',
        participants: '',
        rawText: '',
        summary: '',
        decisions: '',
        actionItems: '',
        customerPainPoints: '',
        notableQuotes: '',
        followUpOpportunities: '',
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to import Granola notes');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOrganization) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="h-[38rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
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
              Granola imports unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Granola manual imports are private to internal agency organizations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <BookOpenText className="h-3.5 w-3.5" />
              Manual Import
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Granola Imports
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Paste client meeting notes from Granola into the private agency source library.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && (
              <Badge variant="outline" className="w-fit">
                {organization.name}
              </Badge>
            )}
            {!canTrackIntegration && !loading && (
              <Badge variant="secondary" className="w-fit">
                Import only
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.5fr)]">
            <div className="h-[38rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[38rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.5fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Import Notes</CardTitle>
                <CardDescription>
                  Manual paste workflow only. No Granola API connection is used.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!canImport && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    Granola imports require internal agency operator access.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="granola-client">Client</FieldLabel>
                    <select
                      id="granola-client"
                      value={form.clientId}
                      onChange={(event) => updateField('clientId', event.target.value)}
                      disabled={!canImport}
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
                    <FieldLabel htmlFor="granola-title">Source title</FieldLabel>
                    <TextInput
                      id="granola-title"
                      value={form.sourceTitle}
                      onChange={(value) => updateField('sourceTitle', value)}
                      disabled={!canImport}
                      placeholder="Customer interview notes"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-date">Meeting date</FieldLabel>
                    <TextInput
                      id="granola-date"
                      type="date"
                      value={form.meetingDate}
                      onChange={(value) => updateField('meetingDate', value)}
                      disabled={!canImport}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-type">Meeting type</FieldLabel>
                    <TextInput
                      id="granola-type"
                      value={form.meetingType}
                      onChange={(value) => updateField('meetingType', value)}
                      disabled={!canImport}
                      placeholder="Customer interview, strategy call"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-participants">Participants</FieldLabel>
                    <TextInput
                      id="granola-participants"
                      value={form.participants}
                      onChange={(value) => updateField('participants', value)}
                      disabled={!canImport}
                      placeholder="Names or roles"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="granola-summary">Summary</FieldLabel>
                    <TextArea
                      id="granola-summary"
                      value={form.summary}
                      onChange={(value) => updateField('summary', value)}
                      disabled={!canImport}
                      placeholder="Optional short summary for the production team."
                      rows={4}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="granola-notes">Granola notes</FieldLabel>
                    <TextArea
                      id="granola-notes"
                      value={form.rawText}
                      onChange={(value) => updateField('rawText', value)}
                      disabled={!canImport}
                      placeholder="Paste Granola notes here."
                      rows={12}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-decisions">Decisions</FieldLabel>
                    <TextArea
                      id="granola-decisions"
                      value={form.decisions}
                      onChange={(value) => updateField('decisions', value)}
                      disabled={!canImport}
                      placeholder="One decision per line."
                      rows={4}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-actions">Action items</FieldLabel>
                    <TextArea
                      id="granola-actions"
                      value={form.actionItems}
                      onChange={(value) => updateField('actionItems', value)}
                      disabled={!canImport}
                      placeholder="One action item per line."
                      rows={4}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-pain-points">Customer pain points</FieldLabel>
                    <TextArea
                      id="granola-pain-points"
                      value={form.customerPainPoints}
                      onChange={(value) => updateField('customerPainPoints', value)}
                      disabled={!canImport}
                      placeholder="Problems, objections, or friction."
                      rows={4}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="granola-follow-ups">Follow-up opportunities</FieldLabel>
                    <TextArea
                      id="granola-follow-ups"
                      value={form.followUpOpportunities}
                      onChange={(value) => updateField('followUpOpportunities', value)}
                      disabled={!canImport}
                      placeholder="Ideas to revisit with the client."
                      rows={4}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="granola-quotes">Notable quotes</FieldLabel>
                    <TextArea
                      id="granola-quotes"
                      value={form.notableQuotes}
                      onChange={(value) => updateField('notableQuotes', value)}
                      disabled={!canImport}
                      placeholder="One quote per line."
                      rows={4}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Structured Preview
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Meeting details saved with this import.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <UsersRound className="h-3.5 w-3.5" />
                        {structuredPreview.participants.length}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckSquare className="h-3.5 w-3.5" />
                        {structuredPreview.actionItems.length}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Quote className="h-3.5 w-3.5" />
                        {structuredPreview.notableQuotes.length}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <PreviewList title="Participants" values={structuredPreview.participants} />
                    <PreviewList title="Decisions" values={structuredPreview.decisions} />
                    <PreviewList title="Action Items" values={structuredPreview.actionItems} />
                    <PreviewList title="Pain Points" values={structuredPreview.customerPainPoints} />
                    <PreviewList title="Quotes" values={structuredPreview.notableQuotes} />
                    <PreviewList title="Follow Ups" values={structuredPreview.followUpOpportunities} />
                  </div>
                  {form.rawText.trim() && structuredPreview.parserWarnings.length > 0 && (
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {structuredPreview.parserWarnings[0]}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedClient?.name || 'No client selected'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Manual Granola import into source library
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveImport()}
                    disabled={!canImport || saving || !form.clientId}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Import Notes
                  </button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Granola Status</CardTitle>
                  <CardDescription>
                    Passive tracking for manual imports.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <FileText className="h-3.5 w-3.5" />
                        Status
                      </div>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {statusLabel(integration?.status)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        Last Import
                      </div>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {formatDate(integration?.lastSyncAt || null)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <UsersRound className="h-3.5 w-3.5" />
                        Selected Client
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {selectedClient?.name || 'None'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Imports</CardTitle>
                  <CardDescription>
                    Latest Granola source records.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {imports.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No Granola imports yet
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Paste notes for a selected client to create the first import.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {imports.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                        >
                          {(() => {
                            const meetingType = metadataString(item.metadata?.meetingType);
                            const participants = metadataList(item.metadata?.participants);
                            const actionItems = metadataList(item.metadata?.actionItems);
                            return (
                              <>
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.sourceTitle || 'Granola notes'}
                          </p>
                          {(meetingType || participants.length > 0 || actionItems.length > 0) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {meetingType && (
                                <Badge variant="secondary" className="text-[0.68rem]">
                                  {meetingType}
                                </Badge>
                              )}
                              {participants.length > 0 && (
                                <Badge variant="outline" className="text-[0.68rem]">
                                  {participants.length} participants
                                </Badge>
                              )}
                              {actionItems.length > 0 && (
                                <Badge variant="outline" className="text-[0.68rem]">
                                  {actionItems.length} actions
                                </Badge>
                              )}
                            </div>
                          )}
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {item.summary || item.rawText || 'No summary'}
                          </p>
                          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                            {formatDate(item.createdAt)}
                          </p>
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
