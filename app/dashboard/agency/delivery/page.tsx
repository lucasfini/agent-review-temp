"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Download,
  Loader2,
  PackageCheck,
  Save,
  Send,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import { type AgencyDeliveryPackage } from '@/lib/agency-delivery-packages';
import { type AgencyDraft } from '@/lib/agency-drafts';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type PackageFormState = {
  clientId: string;
  title: string;
  status: string;
  deliveryNotes: string;
  itemIds: string[];
};

const emptyForm: PackageFormState = {
  clientId: '',
  title: 'Client delivery package',
  status: 'draft',
  deliveryNotes: '',
  itemIds: [],
};

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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

function TextArea({
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
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      rows={4}
      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
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

function packageToForm(pkg: AgencyDeliveryPackage): PackageFormState {
  return {
    clientId: pkg.clientId,
    title: pkg.title,
    status: pkg.status,
    deliveryNotes: pkg.deliveryNotes || '',
    itemIds: (pkg.items || []).map((item) => item.id),
  };
}

function formPayload(form: PackageFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId,
    title: form.title,
    status: form.status,
    deliveryNotes: form.deliveryNotes || null,
    itemIds: form.itemIds,
    metadata: {
      managedVia: 'agency_delivery_ui',
    },
  };
}

export default function AgencyDeliveryPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [packages, setPackages] = useState<AgencyDeliveryPackage[]>([]);
  const [drafts, setDrafts] = useState<AgencyDraft[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageFormState>(emptyForm);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);
  const isInternalAgency = organization?.type === 'internal_agency';
  const canEdit = canManage && !isDemoMode;
  const selectedClient = clients.find((client) => client.id === form.clientId) || null;

  const loadDrafts = useCallback(async (clientId: string) => {
    if (!organizationId || !clientId) {
      setDrafts([]);
      return;
    }
    const response = await fetch(
      withOrganizationId(`/api/agency/drafts?client_id=${encodeURIComponent(clientId)}&status=approved`, organizationId),
      { headers: authHeaders, cache: 'no-store' }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to load ready drafts');
    setDrafts(Array.isArray(payload.drafts) ? payload.drafts as AgencyDraft[] : []);
  }, [authHeaders, organizationId]);

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setPackages([]);
      setDrafts([]);
      setCanManage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [clientsResponse, packagesResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/agency/delivery/packages', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const packagesPayload = await packagesResponse.json().catch(() => ({}));
      if (!clientsResponse.ok) throw new Error(clientsPayload.error || 'Failed to load clients');
      if (!packagesResponse.ok) throw new Error(packagesPayload.error || 'Failed to load delivery packages');

      const nextClients = Array.isArray(clientsPayload.clients) ? clientsPayload.clients as AgencyClient[] : [];
      const nextPackages = Array.isArray(packagesPayload.packages) ? packagesPayload.packages as AgencyDeliveryPackage[] : [];
      const firstPackage = nextPackages[0] || null;
      const firstClientId = firstPackage?.clientId || nextClients[0]?.id || '';

      setClients(nextClients);
      setPackages(nextPackages);
      setCanManage(Boolean(packagesPayload.membership?.canManageAgencyDelivery));
      setSelectedPackageId(firstPackage?.id || null);
      setForm(firstPackage ? packageToForm(firstPackage) : { ...emptyForm, clientId: firstClientId });
      if (firstClientId) await loadDrafts(firstClientId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load delivery workflow');
      setClients([]);
      setPackages([]);
      setDrafts([]);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isInternalAgency, loadDrafts, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const selectPackage = async (pkg: AgencyDeliveryPackage) => {
    setSelectedPackageId(pkg.id);
    setError(null);
    setMessage(null);
    const response = await fetch(withOrganizationId(`/api/agency/delivery/packages/${pkg.id}`, organizationId), {
      headers: authHeaders,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || 'Failed to load delivery package');
      return;
    }
    const detail = payload.package as AgencyDeliveryPackage;
    setForm(packageToForm(detail));
    setCanManage(Boolean(payload.membership?.canManageAgencyDelivery ?? canManage));
    await loadDrafts(detail.clientId);
  };

  const updateField = <K extends keyof PackageFormState>(field: K, value: PackageFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const savePackage = async (statusOverride?: string) => {
    if (!canEdit || !organizationId || !form.clientId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const body = formPayload({
        ...form,
        status: statusOverride || form.status,
      }, organizationId);
      const response = await fetch(
        selectedPackageId
          ? withOrganizationId(`/api/agency/delivery/packages/${selectedPackageId}`, organizationId)
          : withOrganizationId('/api/agency/delivery/packages', organizationId),
        {
          method: selectedPackageId ? 'PATCH' : 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save delivery package');

      const saved = payload.package as AgencyDeliveryPackage;
      setSelectedPackageId(saved.id);
      setForm(packageToForm(saved));
      setPackages((current) => {
        const exists = current.some((pkg) => pkg.id === saved.id);
        return exists
          ? current.map((pkg) => pkg.id === saved.id ? { ...saved, itemCount: saved.items?.length || saved.itemCount } : pkg)
          : [{ ...saved, itemCount: saved.items?.length || 0 }, ...current];
      });
      setCanManage(Boolean(payload.membership?.canManageAgencyDelivery ?? canManage));
      setMessage(statusOverride === 'delivered' ? 'Delivery package marked delivered.' : 'Delivery package saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save delivery package');
    } finally {
      setSaving(false);
    }
  };

  const exportPackage = async (format: 'markdown' | 'csv' | 'text') => {
    if (!selectedPackageId || !organizationId) return;
    setExporting(format);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(withOrganizationId(`/api/agency/delivery/packages/${selectedPackageId}/export`, organizationId), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, organization_id: organizationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to export package');
      downloadText(payload.export.filename, payload.export.body, payload.export.contentType);
      setMessage('Delivery package exported.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export package');
    } finally {
      setExporting(null);
    }
  };

  const toggleItem = (itemId: string) => {
    setForm((current) => ({
      ...current,
      itemIds: current.itemIds.includes(itemId)
        ? current.itemIds.filter((id) => id !== itemId)
        : [...current.itemIds, itemId],
    }));
    setMessage(null);
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
              Delivery unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Delivery packages are private to internal agency organizations.
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
              <PackageCheck className="h-3.5 w-3.5" />
              Internal Agency
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Client Delivery
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Package approved drafts for manual client delivery and export.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && <Badge variant="outline">{organization.name}</Badge>}
            {!canManage && !loading && <Badge variant="secondary">Read only</Badge>}
            {isDemoMode && <Badge variant="warning">Demo</Badge>}
          </div>
        </div>

        {(error || message) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
          }`}>
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Packages</CardTitle>
                <CardDescription>Manual delivery bundles.</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPackageId(null);
                    setForm({ ...emptyForm, clientId: clients[0]?.id || '' });
                    if (clients[0]?.id) void loadDrafts(clients[0].id);
                  }}
                  disabled={!canEdit}
                  className="mb-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  New Package
                </button>
                <div className="space-y-2">
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => void selectPackage(pkg)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                        pkg.id === selectedPackageId
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-800/70 dark:bg-blue-950/30'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900'
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{pkg.title}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {pkg.status} - {pkg.itemCount || 0} items
                      </p>
                    </button>
                  ))}
                  {packages.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No packages yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <CardTitle>{selectedPackageId ? 'Edit Package' : 'Create Package'}</CardTitle>
                    <CardDescription>{selectedClient?.name || 'Select a client'}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['markdown', 'csv', 'text'] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => void exportPackage(format)}
                        disabled={!selectedPackageId || Boolean(exporting)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        {exporting === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {format.toUpperCase()}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void savePackage()}
                      disabled={!canEdit || saving || !form.clientId}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => void savePackage('delivered')}
                      disabled={!canEdit || saving || !selectedPackageId}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      <Send className="h-4 w-4" />
                      Delivered
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!canEdit && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    Delivery package changes require internal agency admin access.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="delivery-client">Client</FieldLabel>
                    <select
                      id="delivery-client"
                      value={form.clientId}
                      onChange={(event) => {
                        updateField('clientId', event.target.value);
                        updateField('itemIds', []);
                        void loadDrafts(event.target.value);
                      }}
                      disabled={!canEdit}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                    >
                      <option value="">Select a client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="delivery-status">Status</FieldLabel>
                    <select
                      id="delivery-status"
                      value={form.status}
                      onChange={(event) => updateField('status', event.target.value)}
                      disabled={!canEdit}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                    >
                      {['draft', 'ready', 'delivered', 'archived'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="delivery-title">Title</FieldLabel>
                    <TextInput
                      id="delivery-title"
                      value={form.title}
                      onChange={(value) => updateField('title', value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="delivery-notes">Delivery notes</FieldLabel>
                    <TextArea
                      id="delivery-notes"
                      value={form.deliveryNotes}
                      onChange={(value) => updateField('deliveryNotes', value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ready Drafts</p>
                    <Badge variant="outline">{form.itemIds.length} selected</Badge>
                  </div>
                  <div className="space-y-2">
                    {drafts.map((draft) => (
                      <label
                        key={draft.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={form.itemIds.includes(draft.id)}
                          onChange={() => toggleItem(draft.id)}
                          disabled={!canEdit}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{draft.title}</span>
                          <span className="mt-1 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">
                            {draft.excerpt || draft.body || 'No preview'}
                          </span>
                        </span>
                      </label>
                    ))}
                    {drafts.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No approved drafts for this client</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
