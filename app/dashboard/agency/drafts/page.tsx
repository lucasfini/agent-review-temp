"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Clipboard,
  Download,
  FileText,
  Loader2,
  PackageCheck,
  Plus,
  Save,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import { type AgencyDraft } from '@/lib/agency-drafts';
import {
  CONTENT_LIBRARY_STATUSES,
  type ContentLibraryStatus,
} from '@/lib/campaigns-content-library';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type DraftFormState = {
  clientId: string;
  title: string;
  contentType: string;
  platform: string;
  status: ContentLibraryStatus;
  body: string;
  excerpt: string;
  tags: string;
  deliveryNotes: string;
};

const emptyDraftForm: DraftFormState = {
  clientId: '',
  title: 'New client draft',
  contentType: 'generated_content',
  platform: '',
  status: 'draft',
  body: '',
  excerpt: '',
  tags: '',
  deliveryNotes: '',
};

function formatLabel(value: string): string {
  if (value === 'approved') return 'Ready To Deliver';
  if (value === 'published') return 'Delivered';
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function draftToForm(draft: AgencyDraft): DraftFormState {
  return {
    clientId: draft.clientId || '',
    title: draft.title,
    contentType: draft.contentType,
    platform: draft.platform || '',
    status: draft.status,
    body: draft.body || '',
    excerpt: draft.excerpt || '',
    tags: draft.tags.join(', '),
    deliveryNotes: typeof draft.metadata.deliveryNotes === 'string' ? draft.metadata.deliveryNotes : '',
  };
}

function tagsFromText(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formToPayload(
  form: DraftFormState,
  organizationId?: string | null,
  baseMetadata: Record<string, unknown> = {},
  extraMetadata: Record<string, unknown> = {}
) {
  const deliveredAt = typeof extraMetadata.deliveredAt === 'string' ? extraMetadata.deliveredAt : null;
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId || null,
    title: form.title,
    contentType: form.contentType || 'generated_content',
    platform: form.platform || null,
    status: form.status,
    body: form.body || null,
    excerpt: form.excerpt || null,
    tags: tagsFromText(form.tags),
    publishedAt: form.status === 'published' ? deliveredAt : undefined,
    metadata: {
      ...baseMetadata,
      managedVia: 'agency_draft_review_ui',
      deliveryNotes: form.deliveryNotes || null,
      ...extraMetadata,
    },
  };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function draftMarkdown(draft: AgencyDraft, clientName: string): string {
  const tags = draft.tags.length ? `\n\nTags: ${draft.tags.join(', ')}` : '';
  const excerpt = draft.excerpt ? `\n\nExcerpt:\n${draft.excerpt}` : '';
  return [
    `# ${draft.title}`,
    '',
    `Client: ${clientName}`,
    `Status: ${formatLabel(draft.status)}`,
    `Content type: ${draft.contentType}`,
    draft.platform ? `Platform: ${draft.platform}` : null,
    excerpt.trim() ? excerpt : null,
    '',
    draft.body || '',
    tags,
  ].filter((line): line is string => line !== null).join('\n');
}

function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  rows = 8,
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

function statusVariant(status: ContentLibraryStatus) {
  if (status === 'published') return 'success';
  if (status === 'approved') return 'warning';
  if (status === 'review') return 'secondary';
  if (status === 'archived') return 'outline';
  return 'secondary';
}

export default function AgencyDraftReviewPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [drafts, setDrafts] = useState<AgencyDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState<DraftFormState>(emptyDraftForm);
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

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) || null,
    [drafts, selectedDraftId]
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) || null,
    [clients, form.clientId]
  );
  const isInternalAgency = organization?.type === 'internal_agency';
  const canEdit = canManage && !isDemoMode;
  const reviewCount = useMemo(
    () => drafts.filter((draft) => draft.status === 'review').length,
    [drafts]
  );
  const readyCount = useMemo(
    () => drafts.filter((draft) => draft.status === 'approved').length,
    [drafts]
  );
  const deliveredCount = useMemo(
    () => drafts.filter((draft) => draft.status === 'published').length,
    [drafts]
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setDrafts([]);
      setSelectedDraftId(null);
      setCanManage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterClientId) params.set('client_id', filterClientId);
      if (filterStatus) params.set('status', filterStatus);
      const draftPath = withOrganizationId(
        params.toString() ? `/api/agency/drafts?${params.toString()}` : '/api/agency/drafts',
        organizationId
      );
      const [clientsResponse, draftsResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(draftPath, {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const draftsPayload = await draftsResponse.json().catch(() => ({}));

      if (!clientsResponse.ok) {
        throw new Error(clientsPayload.error || 'Failed to load agency clients');
      }
      if (!draftsResponse.ok) {
        throw new Error(draftsPayload.error || 'Failed to load agency drafts');
      }

      const nextClients = Array.isArray(clientsPayload.clients)
        ? clientsPayload.clients as AgencyClient[]
        : [];
      const nextDrafts = Array.isArray(draftsPayload.drafts)
        ? draftsPayload.drafts as AgencyDraft[]
        : [];

      setClients(nextClients);
      setDrafts(nextDrafts);
      setCanManage(Boolean(draftsPayload.membership?.canManageAgencyDraft));

      const nextSelected = nextDrafts[0] || null;
      setSelectedDraftId(nextSelected?.id || null);
      setForm(nextSelected ? draftToForm(nextSelected) : {
        ...emptyDraftForm,
        clientId: filterClientId,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load agency drafts');
      setClients([]);
      setDrafts([]);
      setSelectedDraftId(null);
      setForm(emptyDraftForm);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filterClientId, filterStatus, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const updateField = <K extends keyof DraftFormState>(field: K, value: DraftFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectDraft = (draft: AgencyDraft) => {
    setSelectedDraftId(draft.id);
    setForm(draftToForm(draft));
    setError(null);
    setMessage(null);
  };

  const startNewDraft = () => {
    setSelectedDraftId(null);
    setForm({
      ...emptyDraftForm,
      clientId: filterClientId,
      status: (filterStatus as ContentLibraryStatus) || 'draft',
    });
    setError(null);
    setMessage(null);
  };

  const saveDraft = async (
    deliveryMetadata?: Record<string, unknown>,
    formOverride: DraftFormState = form
  ) => {
    if (!canEdit || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedDraftId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/agency/drafts/${selectedDraftId}`, organizationId)
          : withOrganizationId('/api/agency/drafts', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formToPayload(
            formOverride,
            organizationId,
            selectedDraft?.metadata || {},
            deliveryMetadata
          )),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save agency draft');
      }

      const savedDraft = payload.draft as AgencyDraft;
      setDrafts((current) => {
        if (isUpdate) {
          return current.map((draft) => draft.id === savedDraft.id ? savedDraft : draft);
        }
        return [savedDraft, ...current];
      });
      setSelectedDraftId(savedDraft.id);
      setForm(draftToForm(savedDraft));
      setCanManage(Boolean(payload.membership?.canManageAgencyDraft ?? canManage));
      setMessage(deliveryMetadata ? 'Draft marked delivered.' : isUpdate ? 'Draft updated.' : 'Draft created.');
      return savedDraft;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save agency draft');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const currentMarkdown = () => {
    const draft = {
      id: 'draft-preview',
      organizationId: organizationId || '',
      clientId: form.clientId || null,
      campaignId: null,
      brandVoiceId: null,
      projectId: null,
      outputId: null,
      title: form.title,
      contentType: form.contentType || 'generated_content',
      platform: form.platform || null,
      status: form.status,
      body: form.body || null,
      excerpt: form.excerpt || null,
      sourceLabel: null,
      tags: tagsFromText(form.tags),
      metadata: selectedDraft?.metadata || {},
      publishedAt: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
    } as AgencyDraft;
    return draftMarkdown(draft, selectedClient?.name || 'Unassigned');
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(currentMarkdown());
      setMessage('Markdown copied.');
      setError(null);
    } catch {
      setError('Clipboard access was unavailable.');
    }
  };

  const downloadMarkdown = () => {
    const filename = `${(form.title || 'agency-draft').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    downloadText(filename, currentMarkdown(), 'text/markdown;charset=utf-8');
    setMessage('Markdown export downloaded.');
  };

  const downloadCsv = () => {
    const row = [
      form.title,
      selectedClient?.name || 'Unassigned',
      formatLabel(form.status),
      form.contentType,
      form.platform,
      form.body,
    ].map(csvCell).join(',');
    downloadText('agency-draft-export.csv', `title,client,status,content_type,platform,body\n${row}\n`, 'text/csv;charset=utf-8');
    setMessage('CSV export downloaded.');
  };

  const markDelivered = async () => {
    const deliveredAt = new Date().toISOString();
    const nextForm = {
      ...form,
      status: 'published',
    } satisfies DraftFormState;
    setForm(nextForm);
    await saveDraft({
      deliveryMethod: 'manual_export',
      deliveredAt,
    }, nextForm);
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
              Draft review unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Draft review and delivery are private to internal agency organizations.
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
              <FileText className="h-3.5 w-3.5" />
              Internal Agency
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Draft Review
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Review, approve, package, and mark client content delivered from the private agency library.
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">In Review</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{reviewCount} drafts</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Ready</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{readyCount} drafts</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Delivered</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{deliveredCount} drafts</p>
              </div>
            </div>

            <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-end">
              <div>
                <FieldLabel htmlFor="draft-client-filter">Client filter</FieldLabel>
                <select
                  id="draft-client-filter"
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
              <div>
                <FieldLabel htmlFor="draft-status-filter">Status filter</FieldLabel>
                <select
                  id="draft-status-filter"
                  value={filterStatus}
                  onChange={(event) => {
                    setFilterStatus(event.target.value);
                    setMessage(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All statuses</option>
                  {CONTENT_LIBRARY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={startNewDraft}
                disabled={!canEdit}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                New Draft
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Drafts</CardTitle>
                  <CardDescription>
                    Internal review queue for client content.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {drafts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No drafts yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Create or generate client content, then review it here before delivery.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {drafts.map((draft) => {
                        const active = draft.id === selectedDraftId;
                        const client = clients.find((item) => item.id === draft.clientId);
                        return (
                          <button
                            key={draft.id}
                            type="button"
                            onClick={() => selectDraft(draft)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{draft.title}</p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {client?.name || 'Unassigned'} - {draft.platform || draft.contentType}
                                </p>
                              </div>
                              <Badge variant={statusVariant(draft.status)}>
                                {formatLabel(draft.status)}
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
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <CardTitle>{selectedDraft ? 'Review draft' : 'Create draft'}</CardTitle>
                      <CardDescription>
                        Edit content, set review status, and export delivery packages.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyMarkdown}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Clipboard className="h-4 w-4" />
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={downloadMarkdown}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Download className="h-4 w-4" />
                        MD
                      </button>
                      <button
                        type="button"
                        onClick={downloadCsv}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Download className="h-4 w-4" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDraft()}
                        disabled={!canEdit || saving}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      Draft edits require internal agency admin access.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="draft-title">Title</FieldLabel>
                      <TextInput
                        id="draft-title"
                        value={form.title}
                        onChange={(value) => updateField('title', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-client">Client</FieldLabel>
                      <select
                        id="draft-client"
                        value={form.clientId}
                        onChange={(event) => updateField('clientId', event.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        <option value="">Unassigned draft</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-status">Review status</FieldLabel>
                      <select
                        id="draft-status"
                        value={form.status}
                        onChange={(event) => updateField('status', event.target.value as ContentLibraryStatus)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        {CONTENT_LIBRARY_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-content-type">Content type</FieldLabel>
                      <TextInput
                        id="draft-content-type"
                        value={form.contentType}
                        onChange={(value) => updateField('contentType', value)}
                        disabled={!canEdit}
                        placeholder="linkedin_post, newsletter, support_reply"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-platform">Channel</FieldLabel>
                      <TextInput
                        id="draft-platform"
                        value={form.platform}
                        onChange={(value) => updateField('platform', value)}
                        disabled={!canEdit}
                        placeholder="LinkedIn, Email, Help Center"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="draft-body">Draft body</FieldLabel>
                      <TextArea
                        id="draft-body"
                        value={form.body}
                        onChange={(value) => updateField('body', value)}
                        disabled={!canEdit}
                        placeholder="Client-ready content draft."
                        rows={12}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="draft-excerpt">Review summary</FieldLabel>
                      <TextArea
                        id="draft-excerpt"
                        value={form.excerpt}
                        onChange={(value) => updateField('excerpt', value)}
                        disabled={!canEdit}
                        placeholder="Short QA note, context, or handoff summary."
                        rows={4}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-tags">Tags</FieldLabel>
                      <TextInput
                        id="draft-tags"
                        value={form.tags}
                        onChange={(value) => updateField('tags', value)}
                        disabled={!canEdit}
                        placeholder="founder, launch, newsletter"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="draft-delivery-notes">Delivery notes</FieldLabel>
                      <TextInput
                        id="draft-delivery-notes"
                        value={form.deliveryNotes}
                        onChange={(value) => updateField('deliveryNotes', value)}
                        disabled={!canEdit}
                        placeholder="Manual export notes"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {selectedClient?.name || 'Unassigned'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatLabel(form.status)} - {form.platform || form.contentType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void markDelivered()}
                      disabled={!canEdit || saving}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PackageCheck className="h-4 w-4" />
                      Mark Delivered
                    </button>
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
