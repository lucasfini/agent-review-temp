"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpenText,
  FileText,
  Globe,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  UserRound,
  Wand2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import { CONTENT_TYPES } from '@/lib/content-types';
import {
  MANUAL_AGENCY_SOURCE_IMPORT_PROVIDERS,
  type AgencySourceImport,
  type AgencySourceImportProvider,
} from '@/lib/agency-source-imports';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type SourceFormState = {
  clientId: string;
  provider: AgencySourceImportProvider;
  sourceTitle: string;
  sourceUrl: string;
  rawText: string;
  summary: string;
};

type GenerationFormState = {
  contentTypeId: string;
  channel: string;
  quantity: number;
  instructions: string;
};

const emptySourceForm: SourceFormState = {
  clientId: '',
  provider: 'manual_note',
  sourceTitle: 'New source import',
  sourceUrl: '',
  rawText: '',
  summary: '',
};

const emptyGenerationForm: GenerationFormState = {
  contentTypeId: 'linkedin_posts',
  channel: 'linkedin',
  quantity: 1,
  instructions: '',
};

function sourceToForm(source: AgencySourceImport): SourceFormState {
  return {
    clientId: source.clientId || '',
    provider: source.provider,
    sourceTitle: source.sourceTitle || '',
    sourceUrl: source.sourceUrl || '',
    rawText: source.rawText || '',
    summary: source.summary || '',
  };
}

function formToPayload(form: SourceFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId || null,
    provider: form.provider,
    sourceTitle: form.sourceTitle,
    sourceUrl: form.sourceUrl,
    rawText: form.rawText,
    summary: form.summary,
    metadata: {
      capturedVia: 'agency_source_imports_ui',
    },
  };
}

function formatLabel(value: string): string {
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

function SummaryTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function AgencySourceImportsPage() {
  const router = useRouter();
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [sourceImports, setSourceImports] = useState<AgencySourceImport[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState('');
  const [form, setForm] = useState<SourceFormState>(emptySourceForm);
  const [generationForm, setGenerationForm] = useState<GenerationFormState>(emptyGenerationForm);
  const [canManage, setCanManage] = useState(false);
  const [canGenerateDraft, setCanGenerateDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const selectedSource = useMemo(
    () => sourceImports.find((source) => source.id === selectedSourceId) || null,
    [sourceImports, selectedSourceId]
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) || null,
    [clients, form.clientId]
  );
  const isInternalAgency = organization?.type === 'internal_agency';
  const canEdit = canManage && !isDemoMode;
  const canGenerate = canGenerateDraft && !isDemoMode && Boolean(selectedSource?.clientId);
  const generationContentTypes = useMemo(
    () => CONTENT_TYPES.filter((contentType) => contentType.enabled && contentType.outputType),
    []
  );
  const withClientCount = useMemo(
    () => sourceImports.filter((source) => Boolean(source.clientId)).length,
    [sourceImports]
  );
  const transcriptCount = useMemo(
    () => sourceImports.filter((source) => source.provider === 'transcript').length,
    [sourceImports]
  );
  const urlCount = useMemo(
    () => sourceImports.filter((source) => source.provider === 'url').length,
    [sourceImports]
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setSourceImports([]);
      setSelectedSourceId(null);
      setCanManage(false);
      setCanGenerateDraft(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const sourcePath = withOrganizationId(
        filterClientId
          ? `/api/agency/source-imports?client_id=${encodeURIComponent(filterClientId)}`
          : '/api/agency/source-imports',
        organizationId
      );
      const [clientsResponse, sourcesResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(sourcePath, {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const sourcesPayload = await sourcesResponse.json().catch(() => ({}));

      if (!clientsResponse.ok) {
        throw new Error(clientsPayload.error || 'Failed to load agency clients');
      }
      if (!sourcesResponse.ok) {
        throw new Error(sourcesPayload.error || 'Failed to load source imports');
      }

      const nextClients = Array.isArray(clientsPayload.clients)
        ? clientsPayload.clients as AgencyClient[]
        : [];
      const nextSources = Array.isArray(sourcesPayload.sourceImports)
        ? sourcesPayload.sourceImports as AgencySourceImport[]
        : [];

      setClients(nextClients);
      setSourceImports(nextSources);
      setCanManage(Boolean(sourcesPayload.membership?.canManageAgencySourceImport));
      setCanGenerateDraft(Boolean(sourcesPayload.membership?.canManageAgencyDraft));

      const nextSelected = nextSources[0] || null;
      setSelectedSourceId(nextSelected?.id || null);
      setForm(nextSelected ? sourceToForm(nextSelected) : {
        ...emptySourceForm,
        clientId: filterClientId,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load source imports');
      setClients([]);
      setSourceImports([]);
      setSelectedSourceId(null);
      setForm(emptySourceForm);
      setCanManage(false);
      setCanGenerateDraft(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filterClientId, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const updateField = <K extends keyof SourceFormState>(field: K, value: SourceFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateGenerationField = <K extends keyof GenerationFormState>(field: K, value: GenerationFormState[K]) => {
    setGenerationForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectSource = (source: AgencySourceImport) => {
    setSelectedSourceId(source.id);
    setForm(sourceToForm(source));
    setError(null);
    setMessage(null);
  };

  const startNewSource = () => {
    setSelectedSourceId(null);
    setForm({
      ...emptySourceForm,
      clientId: filterClientId,
    });
    setError(null);
    setMessage(null);
  };

  const saveSource = async () => {
    if (!canEdit || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedSourceId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/agency/source-imports/${selectedSourceId}`, organizationId)
          : withOrganizationId('/api/agency/source-imports', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formToPayload(form, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save source import');
      }

      const savedSource = payload.sourceImport as AgencySourceImport;
      setSourceImports((current) => {
        if (isUpdate) {
          return current.map((source) => source.id === savedSource.id ? savedSource : source);
        }
        return [savedSource, ...current];
      });
      setSelectedSourceId(savedSource.id);
      setForm(sourceToForm(savedSource));
      setCanManage(Boolean(payload.membership?.canManageAgencySourceImport ?? canManage));
      setCanGenerateDraft(Boolean(payload.membership?.canManageAgencyDraft ?? canGenerateDraft));
      setMessage(isUpdate ? 'Source import updated.' : 'Source import captured.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save source import');
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    if (!canGenerate || !organizationId || !selectedSource?.id || !selectedSource.clientId) return;
    setGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        withOrganizationId(`/api/agency/source-imports/${selectedSource.id}/generate`, organizationId),
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organization_id: organizationId,
            source_import_id: selectedSource.id,
            client_id: selectedSource.clientId,
            content_type: generationForm.contentTypeId,
            channel: generationForm.channel || undefined,
            quantity: generationForm.quantity,
            instructions: generationForm.instructions || undefined,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to generate agency draft');
      }

      router.push(withOrganizationId('/dashboard/agency/drafts', organizationId));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to generate agency draft');
    } finally {
      setGenerating(false);
    }
  };

  if (loadingOrganization) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
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
              Source imports unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Source capture is private to internal agency organizations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <BookOpenText className="h-3.5 w-3.5" />
              Internal Agency
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Source Imports
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Capture private client context from notes, URLs, documents, and transcripts.
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
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-300'
            }`}
          >
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <SummaryTile
                icon={<BookOpenText className="h-4 w-4" />}
                label="Imports"
                value={`${sourceImports.length} sources`}
                detail={`${withClientCount} linked to clients`}
              />
              <SummaryTile
                icon={<FileText className="h-4 w-4" />}
                label="Transcripts"
                value={`${transcriptCount} captured`}
                detail="Manual transcript or excerpt sources"
              />
              <SummaryTile
                icon={<Globe className="h-4 w-4" />}
                label="URLs"
                value={`${urlCount} links`}
                detail="Reference pages saved for context"
              />
            </div>

            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <FieldLabel htmlFor="source-client-filter">Client filter</FieldLabel>
                <select
                  id="source-client-filter"
                  value={filterClientId}
                  onChange={(event) => {
                    setFilterClientId(event.target.value);
                    setMessage(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All agency clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={startNewSource}
                disabled={!canEdit}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                New Source
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Captured Sources</CardTitle>
                  <CardDescription>
                    Private client context saved for future production work.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {sourceImports.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <BookOpenText className="h-5 w-5" />
                      </div>
                      <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No source imports yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Capture a client note, source URL, document excerpt, or transcript before production planning.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sourceImports.map((source) => {
                        const active = source.id === selectedSourceId;
                        const client = clients.find((item) => item.id === source.clientId);
                        return (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => selectSource(source)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {source.sourceTitle || source.sourceUrl || 'Untitled source'}
                                </p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {client?.name || 'Unassigned'} - {formatLabel(source.provider)}
                                </p>
                              </div>
                              <Badge variant="secondary" className="flex-shrink-0">
                                {formatLabel(source.provider)}
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
                      <CardTitle>{selectedSource ? 'Edit source' : 'Capture source'}</CardTitle>
                      <CardDescription>
                        Save manual context for later client strategy and content production.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={saveSource}
                      disabled={!canEdit || saving}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {selectedSource ? 'Save Changes' : 'Capture Source'}
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      Source import edits require internal agency operator access.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="source-client">Client</FieldLabel>
                      <select
                        id="source-client"
                        value={form.clientId}
                        onChange={(event) => updateField('clientId', event.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        <option value="">Unassigned source</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="source-provider">Source type</FieldLabel>
                      <select
                        id="source-provider"
                        value={form.provider}
                        onChange={(event) => updateField('provider', event.target.value as AgencySourceImportProvider)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        {MANUAL_AGENCY_SOURCE_IMPORT_PROVIDERS.map((provider) => (
                          <option key={provider} value={provider}>
                            {formatLabel(provider)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="source-title">Title</FieldLabel>
                      <TextInput
                        id="source-title"
                        value={form.sourceTitle}
                        onChange={(value) => updateField('sourceTitle', value)}
                        disabled={!canEdit}
                        placeholder="Discovery call notes, landing page, support themes..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="source-url">URL</FieldLabel>
                      <TextInput
                        id="source-url"
                        value={form.sourceUrl}
                        onChange={(value) => updateField('sourceUrl', value)}
                        disabled={!canEdit}
                        placeholder="https://example.com/source"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="source-raw-text">Source text</FieldLabel>
                      <TextArea
                        id="source-raw-text"
                        value={form.rawText}
                        onChange={(value) => updateField('rawText', value)}
                        disabled={!canEdit}
                        rows={8}
                        placeholder="Paste notes, transcript excerpts, document text, or customer language."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="source-summary">Summary</FieldLabel>
                      <TextArea
                        id="source-summary"
                        value={form.summary}
                        onChange={(value) => updateField('summary', value)}
                        disabled={!canEdit}
                        rows={4}
                        placeholder="Summarize the useful context, constraints, or production angle."
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <UserRound className="h-3.5 w-3.5" />
                        Client
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {selectedClient?.name || 'Unassigned'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <BookOpenText className="h-3.5 w-3.5" />
                        Type
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {formatLabel(form.provider)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Globe className="h-3.5 w-3.5" />
                        URL
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.sourceUrl || 'Not set'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Generate Draft
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          Creates an internal review draft from the selected source.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void generateDraft()}
                        disabled={!canGenerate || generating}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        Generate
                      </button>
                    </div>

                    {!selectedSource?.clientId && (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        Select a client-linked source before generating a draft.
                      </p>
                    )}
                    {!canGenerateDraft && (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        Draft generation requires agency draft management access.
                      </p>
                    )}

                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_7rem]">
                      <div>
                        <FieldLabel htmlFor="source-generate-type">Content type</FieldLabel>
                        <select
                          id="source-generate-type"
                          value={generationForm.contentTypeId}
                          onChange={(event) => {
                            const nextType = generationContentTypes.find((item) => item.id === event.target.value);
                            setGenerationForm((current) => ({
                              ...current,
                              contentTypeId: event.target.value,
                              channel: nextType?.platformType || nextType?.platform || current.channel,
                              quantity: Math.min(current.quantity, nextType?.maxCount || nextType?.count || current.quantity),
                            }));
                            setMessage(null);
                          }}
                          disabled={!canGenerate || generating}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        >
                          {generationContentTypes.map((contentType) => (
                            <option key={contentType.id} value={contentType.id}>
                              {contentType.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <FieldLabel htmlFor="source-generate-channel">Channel</FieldLabel>
                        <TextInput
                          id="source-generate-channel"
                          value={generationForm.channel}
                          onChange={(value) => updateGenerationField('channel', value)}
                          disabled={!canGenerate || generating}
                          placeholder="linkedin"
                        />
                      </div>

                      <div>
                        <FieldLabel htmlFor="source-generate-quantity">Quantity</FieldLabel>
                        <input
                          id="source-generate-quantity"
                          type="number"
                          min={1}
                          max={6}
                          value={generationForm.quantity}
                          onChange={(event) => updateGenerationField('quantity', Number(event.target.value) || 1)}
                          disabled={!canGenerate || generating}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <FieldLabel htmlFor="source-generate-instructions">Instructions</FieldLabel>
                        <TextArea
                          id="source-generate-instructions"
                          value={generationForm.instructions}
                          onChange={(value) => updateGenerationField('instructions', value)}
                          disabled={!canGenerate || generating}
                          rows={3}
                          placeholder="Angle, offer, constraints, or format notes."
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
