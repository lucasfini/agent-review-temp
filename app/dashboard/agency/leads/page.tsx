"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  RefreshCcw,
  ShieldAlert,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import type { AgencyLead, AgencyLeadStatus } from '@/lib/agency-leads';
import {
  AGENCY_LEAD_QUALIFICATION_TIERS,
  type AgencyLeadQualificationTier,
} from '@/lib/agency-lead-qualification';

const LEAD_STATUSES: AgencyLeadStatus[] = [
  'new',
  'reviewed',
  'qualified',
  'converted',
  'archived',
  'spam',
];
const QUALIFICATION_TIERS: AgencyLeadQualificationTier[] = [...AGENCY_LEAD_QUALIFICATION_TIERS];

function statusLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusVariant(status: AgencyLeadStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'qualified' || status === 'converted') return 'default';
  if (status === 'spam' || status === 'archived') return 'destructive';
  if (status === 'reviewed') return 'secondary';
  return 'outline';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function leadTitle(lead: AgencyLead): string {
  return lead.company || lead.name || lead.email;
}

function externalWebsiteHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isoFromDateInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-1 text-sm leading-6 text-slate-800 dark:text-slate-100">{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function AgencyLeadsPage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AgencyLeadStatus>('all');
  const [tierFilter, setTierFilter] = useState<'all' | AgencyLeadQualificationTier>('all');
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [qualificationDraft, setQualificationDraft] = useState({
    qualificationScore: '',
    qualificationTier: 'unqualified' as AgencyLeadQualificationTier,
    assignedTo: '',
    reviewNotes: '',
    lastContactedAt: '',
    nextFollowUpAt: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const isInternalAgency = organization?.type === 'internal_agency';
  const canWrite = canManage && !isDemoMode;

  const filteredLeads = useMemo(
    () => leads.filter((lead) => {
      const statusMatches = statusFilter === 'all' || lead.status === statusFilter;
      const tierMatches = tierFilter === 'all' || lead.qualificationTier === tierFilter;
      return statusMatches && tierMatches;
    }),
    [leads, statusFilter, tierFilter]
  );
  const selectedLead = useMemo(
    () => filteredLeads.find((lead) => lead.id === selectedLeadId) || filteredLeads[0] || null,
    [filteredLeads, selectedLeadId]
  );
  const newLeadCount = useMemo(
    () => leads.filter((lead) => lead.status === 'new').length,
    [leads]
  );
  const qualifiedLeadCount = useMemo(
    () => leads.filter((lead) => lead.status === 'qualified').length,
    [leads]
  );
  const convertedLeadCount = useMemo(
    () => leads.filter((lead) => lead.status === 'converted').length,
    [leads]
  );
  const highFitLeadCount = useMemo(
    () => leads.filter((lead) => lead.qualificationTier === 'high').length,
    [leads]
  );

  const loadLeads = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setLeads([]);
      setCanManage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(withOrganizationId('/api/agency/leads?limit=100', organizationId), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load agency leads');
      }

      const nextLeads = Array.isArray(payload.leads) ? payload.leads as AgencyLead[] : [];
      setLeads(nextLeads);
      setCanManage(payload.membership?.canManageAgencyClient === true);
      setSelectedLeadId((current) => current || nextLeads[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load agency leads');
      setLeads([]);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadLeads();
  }, [loadLeads, loadingOrganization]);

  useEffect(() => {
    if (!selectedLead) return;
    setQualificationDraft({
      qualificationScore: selectedLead.qualificationScore === null || selectedLead.qualificationScore === undefined
        ? ''
        : String(selectedLead.qualificationScore),
      qualificationTier: selectedLead.qualificationTier || 'unqualified',
      assignedTo: selectedLead.assignedTo || '',
      reviewNotes: selectedLead.reviewNotes || '',
      lastContactedAt: dateInputValue(selectedLead.lastContactedAt),
      nextFollowUpAt: dateInputValue(selectedLead.nextFollowUpAt),
    });
  }, [selectedLead?.id, selectedLead]);

  const updateLeadStatus = async (lead: AgencyLead, status: AgencyLeadStatus) => {
    if (!organizationId || !canWrite) return;
    setSavingLeadId(lead.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/agency/leads/${lead.id}`, organizationId), {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          status,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update agency lead');
      }

      setLeads((current) => current.map((item) => item.id === lead.id ? payload.lead as AgencyLead : item));
      setMessage(`Lead marked ${statusLabel(status)}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update agency lead');
    } finally {
      setSavingLeadId(null);
    }
  };

  const convertLead = async (lead: AgencyLead) => {
    if (!organizationId || !canWrite) return;
    const confirmed = window.confirm(`Convert ${leadTitle(lead)} into an agency client?`);
    if (!confirmed) return;

    setConvertingLeadId(lead.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/agency/leads/${lead.id}/convert`, organizationId), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to convert agency lead');
      }

      setLeads((current) => current.map((item) => item.id === lead.id ? payload.lead as AgencyLead : item));
      setMessage('Lead converted to an agency client.');
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : 'Failed to convert agency lead');
    } finally {
      setConvertingLeadId(null);
    }
  };

  const updateLeadQualification = async (lead: AgencyLead) => {
    if (!organizationId || !canWrite) return;
    setSavingLeadId(lead.id);
    setError(null);
    setMessage(null);

    try {
      const score = qualificationDraft.qualificationScore.trim()
        ? Number(qualificationDraft.qualificationScore)
        : null;
      const response = await fetch(withOrganizationId(`/api/agency/leads/${lead.id}`, organizationId), {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          qualificationScore: score,
          qualificationTier: qualificationDraft.qualificationTier,
          assignedTo: qualificationDraft.assignedTo.trim() || null,
          reviewNotes: qualificationDraft.reviewNotes,
          lastContactedAt: isoFromDateInput(qualificationDraft.lastContactedAt),
          nextFollowUpAt: isoFromDateInput(qualificationDraft.nextFollowUpAt),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update lead qualification');
      }

      setLeads((current) => current.map((item) => item.id === lead.id ? payload.lead as AgencyLead : item));
      setMessage('Lead qualification updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update lead qualification');
    } finally {
      setSavingLeadId(null);
    }
  };

  const exportLeads = async () => {
    if (!organizationId || !canManage) return;
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (tierFilter !== 'all') params.set('qualification_tier', tierFilter);

      const response = await fetch(`/api/agency/leads/export?${params.toString()}`, {
        headers: authHeaders,
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to export agency leads');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `agency-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage('Lead export downloaded.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export agency leads');
    } finally {
      setExporting(false);
    }
  };

  if (loadingOrganization || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isInternalAgency) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Internal agency access required
            </CardTitle>
            <CardDescription>
              Agency lead review is available only inside an active internal agency organization.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-emerald-600 dark:text-emerald-300">
            Agency Leads
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            Public intake review
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Review public agency inquiries, qualify fit, and deliberately convert approved leads into internal agency clients.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void exportLeads()}
            disabled={!canManage || exporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:bg-slate-950"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void loadLeads()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <InfoItem
          icon={<Mail className="h-4 w-4" />}
          label="New"
          value={`${newLeadCount} leads`}
        />
        <InfoItem
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Qualified"
          value={`${qualifiedLeadCount} leads`}
        />
        <InfoItem
          icon={<Building2 className="h-4 w-4" />}
          label="Converted"
          value={`${convertedLeadCount} clients`}
        />
        <InfoItem
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="High fit"
          value={`${highFitLeadCount} leads`}
        />
      </div>

      {(error || message) ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          error
            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
        }`}>
          {error || message}
        </div>
      ) : null}

      {isDemoMode ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Demo mode is read-only. Lead status updates and conversions are disabled.
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Agency lead review requires owner, admin, or agency_admin access.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
            <CardDescription>Public agency inquiries from the website intake form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
              <label htmlFor="lead-status-filter" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Status
              </label>
              <select
                id="lead-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | AgencyLeadStatus)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">All statuses</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              </div>
              <div>
                <label htmlFor="lead-tier-filter" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Fit
                </label>
                <select
                  id="lead-tier-filter"
                  value={tierFilter}
                  onChange={(event) => setTierFilter(event.target.value as 'all' | AgencyLeadQualificationTier)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All fit tiers</option>
                  {QUALIFICATION_TIERS.map((tier) => (
                    <option key={tier} value={tier}>{statusLabel(tier)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredLeads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <Mail className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">No leads found.</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">New public intake submissions will appear here.</p>
                </div>
              ) : filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    selectedLead?.id === lead.id
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{leadTitle(lead)}</p>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{lead.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={statusVariant(lead.status)}>{statusLabel(lead.status)}</Badge>
                      {lead.qualificationTier ? (
                        <Badge variant="secondary">
                          {statusLabel(lead.qualificationTier)}
                          {typeof lead.qualificationScore === 'number' ? ` ${lead.qualificationScore}` : ''}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Submitted {formatDate(lead.createdAt)}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead details</CardTitle>
            <CardDescription>Review fit before changing status or converting to a client.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedLead ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <UserRound className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">Select a lead.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {leadTitle(selectedLead)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedLead.email}</p>
                  </div>
                  <Badge variant={statusVariant(selectedLead.status)}>{statusLabel(selectedLead.status)}</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem
                    icon={<UserRound className="h-4 w-4" />}
                    label="Contact"
                    value={selectedLead.name || 'Not provided'}
                  />
                  <InfoItem
                    icon={<Building2 className="h-4 w-4" />}
                    label="Company"
                    value={selectedLead.company || 'Not provided'}
                  />
                  <InfoItem
                    icon={<ArrowRight className="h-4 w-4" />}
                    label="Package"
                    value={selectedLead.packageInterest ? statusLabel(selectedLead.packageInterest) : 'Not sure yet'}
                  />
                  <InfoItem
                    icon={<RefreshCcw className="h-4 w-4" />}
                    label="Timeline"
                    value={selectedLead.timeline || 'Not provided'}
                  />
                  <InfoItem
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Qualification"
                    value={`${selectedLead.qualificationTier ? statusLabel(selectedLead.qualificationTier) : 'Not scored'}${typeof selectedLead.qualificationScore === 'number' ? ` (${selectedLead.qualificationScore})` : ''}`}
                  />
                  <InfoItem
                    icon={<UserRound className="h-4 w-4" />}
                    label="Assigned"
                    value={selectedLead.assignedTo || 'Unassigned'}
                  />
                </div>

                {selectedLead.message ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Message</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {selectedLead.message}
                    </p>
                  </div>
                ) : null}

                {selectedLead.website ? (
                  <Link
                    href={externalWebsiteHref(selectedLead.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    Visit website
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}

                {selectedLead.convertedClientId ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Converted to client on {formatDate(selectedLead.convertedAt)}.
                  </div>
                ) : null}

                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Qualification and follow-up</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Deterministic score is only a prioritization aid. It does not auto-approve, reject, or convert leads.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Score
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={qualificationDraft.qualificationScore}
                        onChange={(event) => setQualificationDraft((current) => ({
                          ...current,
                          qualificationScore: event.target.value,
                        }))}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Fit tier
                      <select
                        value={qualificationDraft.qualificationTier}
                        onChange={(event) => setQualificationDraft((current) => ({
                          ...current,
                          qualificationTier: event.target.value as AgencyLeadQualificationTier,
                        }))}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        {QUALIFICATION_TIERS.map((tier) => (
                          <option key={tier} value={tier}>{statusLabel(tier)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Assigned user ID
                      <input
                        type="text"
                        value={qualificationDraft.assignedTo}
                        onChange={(event) => setQualificationDraft((current) => ({
                          ...current,
                          assignedTo: event.target.value,
                        }))}
                        placeholder="UUID or leave blank"
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Last contacted
                      <input
                        type="date"
                        value={qualificationDraft.lastContactedAt}
                        onChange={(event) => setQualificationDraft((current) => ({
                          ...current,
                          lastContactedAt: event.target.value,
                        }))}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
                      Next follow-up
                      <input
                        type="date"
                        value={qualificationDraft.nextFollowUpAt}
                        onChange={(event) => setQualificationDraft((current) => ({
                          ...current,
                          nextFollowUpAt: event.target.value,
                        }))}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Review notes
                    <textarea
                      value={qualificationDraft.reviewNotes}
                      onChange={(event) => setQualificationDraft((current) => ({
                        ...current,
                        reviewNotes: event.target.value,
                      }))}
                      rows={4}
                      disabled={!canWrite}
                      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void updateLeadQualification(selectedLead)}
                    disabled={!canWrite || savingLeadId === selectedLead.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 dark:disabled:bg-slate-900"
                  >
                    {savingLeadId === selectedLead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save qualification
                  </button>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:flex-wrap">
                  <select
                    value={selectedLead.status}
                    onChange={(event) => updateLeadStatus(selectedLead, event.target.value as AgencyLeadStatus)}
                    disabled={!canWrite || savingLeadId === selectedLead.id || selectedLead.status === 'converted'}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                  >
                    {LEAD_STATUSES.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void convertLead(selectedLead)}
                    disabled={
                      !canWrite
                      || convertingLeadId === selectedLead.id
                      || selectedLead.status === 'converted'
                      || selectedLead.status === 'spam'
                      || selectedLead.status === 'archived'
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/60"
                  >
                    {convertingLeadId === selectedLead.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    Convert to client
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
