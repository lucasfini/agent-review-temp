"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  Globe,
  Loader2,
  Mail,
  Package,
  Plus,
  Save,
  ShieldAlert,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import {
  AGENCY_CLIENT_STATUSES,
  type AgencyClient,
  type AgencyClientStatus,
} from '@/lib/agency-clients';
import { type AgencyClientProfile } from '@/lib/agency-client-profiles';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type ClientFormState = {
  name: string;
  website: string;
  industry: string;
  primaryContactName: string;
  primaryContactEmail: string;
  packageType: string;
  status: AgencyClientStatus;
  notes: string;
};

type ClientProfileFormState = {
  businessOverview: string;
  idealCustomerProfile: string;
  positioning: string;
  offers: string;
  competitors: string;
  contentPillars: string;
  customerPainPoints: string;
  voiceNotes: string;
  customerServiceTone: string;
};

const emptyClientForm: ClientFormState = {
  name: 'New agency client',
  website: '',
  industry: '',
  primaryContactName: '',
  primaryContactEmail: '',
  packageType: '',
  status: 'active',
  notes: '',
};

const emptyProfileForm: ClientProfileFormState = {
  businessOverview: '',
  idealCustomerProfile: '',
  positioning: '',
  offers: '',
  competitors: '',
  contentPillars: '',
  customerPainPoints: '',
  voiceNotes: '',
  customerServiceTone: '',
};

function clientToForm(client: AgencyClient): ClientFormState {
  return {
    name: client.name,
    website: client.website || '',
    industry: client.industry || '',
    primaryContactName: client.primaryContactName || '',
    primaryContactEmail: client.primaryContactEmail || '',
    packageType: client.packageType || '',
    status: client.status,
    notes: client.notes || '',
  };
}

function listToText(value: string[] | null | undefined): string {
  return (value || []).join('\n');
}

function textToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function profileToForm(profile: AgencyClientProfile | null | undefined): ClientProfileFormState {
  if (!profile) return emptyProfileForm;

  return {
    businessOverview: profile.businessOverview || '',
    idealCustomerProfile: profile.idealCustomerProfile || '',
    positioning: profile.positioning || '',
    offers: listToText(profile.offers),
    competitors: listToText(profile.competitors),
    contentPillars: listToText(profile.contentPillars),
    customerPainPoints: listToText(profile.customerPainPoints),
    voiceNotes: profile.voiceNotes || '',
    customerServiceTone: profile.customerServiceTone || '',
  };
}

function formToPayload(
  form: ClientFormState,
  profileForm: ClientProfileFormState,
  organizationId?: string | null
) {
  return {
    organization_id: organizationId || undefined,
    name: form.name,
    website: form.website,
    industry: form.industry,
    primaryContactName: form.primaryContactName,
    primaryContactEmail: form.primaryContactEmail,
    packageType: form.packageType,
    status: form.status,
    notes: form.notes,
    profile: {
      businessOverview: profileForm.businessOverview,
      idealCustomerProfile: profileForm.idealCustomerProfile,
      positioning: profileForm.positioning,
      offers: textToList(profileForm.offers),
      competitors: textToList(profileForm.competitors),
      contentPillars: textToList(profileForm.contentPillars),
      customerPainPoints: textToList(profileForm.customerPainPoints),
      voiceNotes: profileForm.voiceNotes,
      customerServiceTone: profileForm.customerServiceTone,
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

function SelectInput({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: AgencyClientStatus) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as AgencyClientStatus)}
      disabled={disabled}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    >
      {children}
    </select>
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

function statusVariant(status: AgencyClientStatus) {
  if (status === 'active') return 'success';
  if (status === 'lead') return 'default';
  if (status === 'paused') return 'warning';
  return 'secondary';
}

export default function AgencyDashboardPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyClientForm);
  const [profileForm, setProfileForm] = useState<ClientProfileFormState>(emptyProfileForm);
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
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );
  const canEdit = canManage && !isDemoMode;
  const isInternalAgency = organization?.type === 'internal_agency';
  const activeCount = useMemo(
    () => clients.filter((client) => client.status === 'active').length,
    [clients]
  );
  const leadCount = useMemo(
    () => clients.filter((client) => client.status === 'lead').length,
    [clients]
  );
  const pausedCount = useMemo(
    () => clients.filter((client) => client.status === 'paused').length,
    [clients]
  );

  const loadClientDetail = useCallback(async (clientId: string) => {
    if (!organizationId) return;

    const response = await fetch(withOrganizationId(`/api/agency/clients/${clientId}`, organizationId), {
      headers: authHeaders,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load agency client');
    }

    const detailClient = payload.client as AgencyClient;
    setClients((current) => current.map((client) => (
      client.id === detailClient.id ? detailClient : client
    )));
    setSelectedClientId(detailClient.id);
    setForm(clientToForm(detailClient));
    setProfileForm(profileToForm(payload.profile as AgencyClientProfile | null));
    setCanManage(Boolean(payload.membership?.canManageAgencyClient));
  }, [authHeaders, organizationId]);

  const loadClients = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setSelectedClientId(null);
      setCanManage(false);
      setProfileForm(emptyProfileForm);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(withOrganizationId('/api/agency/clients', organizationId), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load agency clients');
      }

      const nextClients = Array.isArray(payload.clients)
        ? payload.clients as AgencyClient[]
        : [];
      setClients(nextClients);
      setCanManage(Boolean(payload.membership?.canManageAgencyClient));

      const nextSelected = nextClients[0] || null;
      setSelectedClientId(nextSelected?.id || null);
      setForm(nextSelected ? clientToForm(nextSelected) : emptyClientForm);
      setProfileForm(emptyProfileForm);
      if (nextSelected) {
        await loadClientDetail(nextSelected.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load agency clients');
      setClients([]);
      setSelectedClientId(null);
      setForm(emptyClientForm);
      setProfileForm(emptyProfileForm);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isInternalAgency, loadClientDetail, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadClients();
  }, [loadClients, loadingOrganization]);

  const updateField = <K extends keyof ClientFormState>(field: K, value: ClientFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateProfileField = <K extends keyof ClientProfileFormState>(
    field: K,
    value: ClientProfileFormState[K]
  ) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectClient = (client: AgencyClient) => {
    setSelectedClientId(client.id);
    setForm(clientToForm(client));
    setProfileForm(emptyProfileForm);
    setError(null);
    setMessage(null);
    void loadClientDetail(client.id).catch((detailError) => {
      setError(detailError instanceof Error ? detailError.message : 'Failed to load agency client');
    });
  };

  const startNewClient = () => {
    setSelectedClientId(null);
    setForm(emptyClientForm);
    setProfileForm(emptyProfileForm);
    setError(null);
    setMessage(null);
  };

  const saveClient = async () => {
    if (!canEdit || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedClientId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/agency/clients/${selectedClientId}`, organizationId)
          : withOrganizationId('/api/agency/clients', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formToPayload(form, profileForm, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save agency client');
      }

      const savedClient = payload.client as AgencyClient;
      const savedProfile = payload.profile as AgencyClientProfile | null;
      setClients((current) => {
        if (isUpdate) {
          return current.map((client) => client.id === savedClient.id ? savedClient : client);
        }
        return [savedClient, ...current];
      });
      setSelectedClientId(savedClient.id);
      setForm(clientToForm(savedClient));
      setProfileForm(profileToForm(savedProfile));
      setCanManage(Boolean(payload.membership?.canManageAgencyClient ?? canManage));
      setMessage(isUpdate ? 'Agency client updated.' : 'Agency client created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save agency client');
    } finally {
      setSaving(false);
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
              Agency console unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              This workspace is not an internal agency organization. Agency clients and production operations remain private to the internal agency team.
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
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Internal Agency
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Agency Clients
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Manage private client records for done-for-you content and communication work.
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <SummaryTile
                icon={<Building2 className="h-4 w-4" />}
                label="Client Base"
                value={`${clients.length} clients`}
                detail={`${activeCount} active accounts`}
              />
              <SummaryTile
                icon={<BriefcaseBusiness className="h-4 w-4" />}
                label="Leads"
                value={`${leadCount} leads`}
                detail="Prospects tracked before onboarding"
              />
              <SummaryTile
                icon={<Package className="h-4 w-4" />}
                label="Paused"
                value={`${pausedCount} paused`}
                detail="Accounts not currently in production"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Clients</CardTitle>
                      <CardDescription>
                        Internal records for agency service accounts.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={startNewClient}
                      disabled={!canEdit}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                      aria-label="Create agency client"
                      title="Create agency client"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {clients.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <BriefcaseBusiness className="h-5 w-5" />
                      </div>
                      <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No agency clients yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Add a client record before building source imports, production queues, and delivery workflows.
                      </p>
                      <button
                        type="button"
                        onClick={startNewClient}
                        disabled={!canEdit}
                        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Add Client
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {clients.map((client) => {
                        const active = client.id === selectedClientId;
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => selectClient(client)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{client.name}</p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {client.industry || client.packageType || client.primaryContactEmail || 'No client details yet'}
                                </p>
                              </div>
                              <Badge variant={statusVariant(client.status)} className="flex-shrink-0">
                                {formatLabel(client.status)}
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
                      <CardTitle>{selectedClient ? 'Edit client' : 'Create client'}</CardTitle>
                      <CardDescription>
                        Store core client context before imports and production work begin.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={saveClient}
                      disabled={!canEdit || saving}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {selectedClient ? 'Save Changes' : 'Create Client'}
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      Agency client edits require internal agency admin access.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="agency-client-name">Client name</FieldLabel>
                      <TextInput
                        id="agency-client-name"
                        value={form.name}
                        onChange={(value) => updateField('name', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-status">Status</FieldLabel>
                      <SelectInput
                        id="agency-client-status"
                        value={form.status}
                        onChange={(value) => updateField('status', value)}
                        disabled={!canEdit}
                      >
                        {AGENCY_CLIENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </SelectInput>
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-package">Package</FieldLabel>
                      <TextInput
                        id="agency-client-package"
                        value={form.packageType}
                        onChange={(value) => updateField('packageType', value)}
                        disabled={!canEdit}
                        placeholder="Founder content, newsletter ops..."
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-industry">Industry</FieldLabel>
                      <TextInput
                        id="agency-client-industry"
                        value={form.industry}
                        onChange={(value) => updateField('industry', value)}
                        disabled={!canEdit}
                        placeholder="B2B SaaS"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-website">Website</FieldLabel>
                      <TextInput
                        id="agency-client-website"
                        value={form.website}
                        onChange={(value) => updateField('website', value)}
                        disabled={!canEdit}
                        placeholder="https://example.com"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-contact">Primary contact</FieldLabel>
                      <TextInput
                        id="agency-client-contact"
                        value={form.primaryContactName}
                        onChange={(value) => updateField('primaryContactName', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-client-email">Contact email</FieldLabel>
                      <TextInput
                        id="agency-client-email"
                        type="email"
                        value={form.primaryContactEmail}
                        onChange={(value) => updateField('primaryContactEmail', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="agency-client-notes">Internal notes</FieldLabel>
                      <TextArea
                        id="agency-client-notes"
                        value={form.notes}
                        onChange={(value) => updateField('notes', value)}
                        disabled={!canEdit}
                        placeholder="Service context, onboarding state, next action..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Client Profile
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          Internal context used for agency planning, source imports, and future generation workflows.
                        </p>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="agency-profile-overview">Business overview</FieldLabel>
                      <TextArea
                        id="agency-profile-overview"
                        value={profileForm.businessOverview}
                        onChange={(value) => updateProfileField('businessOverview', value)}
                        disabled={!canEdit}
                        placeholder="What the client does, who they serve, and why the account matters."
                        rows={4}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-icp">Ideal customer profile</FieldLabel>
                      <TextArea
                        id="agency-profile-icp"
                        value={profileForm.idealCustomerProfile}
                        onChange={(value) => updateProfileField('idealCustomerProfile', value)}
                        disabled={!canEdit}
                        placeholder="Buyer roles, segments, company stage, and qualification notes."
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-positioning">Positioning</FieldLabel>
                      <TextArea
                        id="agency-profile-positioning"
                        value={profileForm.positioning}
                        onChange={(value) => updateProfileField('positioning', value)}
                        disabled={!canEdit}
                        placeholder="Core positioning, category, differentiators, and proof."
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-offers">Offers</FieldLabel>
                      <TextArea
                        id="agency-profile-offers"
                        value={profileForm.offers}
                        onChange={(value) => updateProfileField('offers', value)}
                        disabled={!canEdit}
                        placeholder="One offer per line"
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-competitors">Competitors</FieldLabel>
                      <TextArea
                        id="agency-profile-competitors"
                        value={profileForm.competitors}
                        onChange={(value) => updateProfileField('competitors', value)}
                        disabled={!canEdit}
                        placeholder="One competitor per line"
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-pillars">Content pillars</FieldLabel>
                      <TextArea
                        id="agency-profile-pillars"
                        value={profileForm.contentPillars}
                        onChange={(value) => updateProfileField('contentPillars', value)}
                        disabled={!canEdit}
                        placeholder="One pillar per line"
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-pain-points">Customer pain points</FieldLabel>
                      <TextArea
                        id="agency-profile-pain-points"
                        value={profileForm.customerPainPoints}
                        onChange={(value) => updateProfileField('customerPainPoints', value)}
                        disabled={!canEdit}
                        placeholder="One pain point per line"
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-voice">Voice notes</FieldLabel>
                      <TextArea
                        id="agency-profile-voice"
                        value={profileForm.voiceNotes}
                        onChange={(value) => updateProfileField('voiceNotes', value)}
                        disabled={!canEdit}
                        placeholder="Words, tone, examples, and things to avoid."
                        rows={5}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="agency-profile-service-tone">Customer service tone</FieldLabel>
                      <TextArea
                        id="agency-profile-service-tone"
                        value={profileForm.customerServiceTone}
                        onChange={(value) => updateProfileField('customerServiceTone', value)}
                        disabled={!canEdit}
                        placeholder="Support and customer communication tone."
                        rows={5}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <UserRound className="h-3.5 w-3.5" />
                        Contact
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.primaryContactName || 'Unassigned'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.primaryContactEmail || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Globe className="h-3.5 w-3.5" />
                        Website
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.website || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <Package className="h-3.5 w-3.5" />
                        Package
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.packageType || 'Not set'}
                      </p>
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
