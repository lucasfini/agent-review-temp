import type { AgencyLead } from '@/lib/agency-leads';

const EXPORT_COLUMNS: Array<{
  key: string;
  header: string;
  value: (lead: AgencyLead) => unknown;
}> = [
  { key: 'createdAt', header: 'Submitted At', value: (lead) => lead.createdAt },
  { key: 'status', header: 'Status', value: (lead) => lead.status },
  { key: 'qualificationTier', header: 'Qualification Tier', value: (lead) => lead.qualificationTier },
  { key: 'qualificationScore', header: 'Qualification Score', value: (lead) => lead.qualificationScore },
  { key: 'nextFollowUpAt', header: 'Next Follow Up At', value: (lead) => lead.nextFollowUpAt },
  { key: 'lastContactedAt', header: 'Last Contacted At', value: (lead) => lead.lastContactedAt },
  { key: 'assignedTo', header: 'Assigned To', value: (lead) => lead.assignedTo },
  { key: 'name', header: 'Name', value: (lead) => lead.name },
  { key: 'email', header: 'Email', value: (lead) => lead.email },
  { key: 'company', header: 'Company', value: (lead) => lead.company },
  { key: 'website', header: 'Website', value: (lead) => lead.website },
  { key: 'role', header: 'Role', value: (lead) => lead.role },
  { key: 'packageInterest', header: 'Package Interest', value: (lead) => lead.packageInterest },
  { key: 'budgetRange', header: 'Budget Range', value: (lead) => lead.budgetRange },
  { key: 'timeline', header: 'Timeline', value: (lead) => lead.timeline },
  { key: 'source', header: 'Source', value: (lead) => lead.source },
  { key: 'message', header: 'Message', value: (lead) => lead.message },
  { key: 'reviewNotes', header: 'Review Notes', value: (lead) => lead.reviewNotes },
];

function normalizeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function sanitizeCsvCell(value: unknown): string {
  const normalized = normalizeCsvValue(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmedStart = normalized.trimStart();
  const protectedValue = /^[=+\-@\t]/.test(trimmedStart)
    ? `'${normalized}`
    : normalized;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function buildAgencyLeadsCsv(leads: AgencyLead[]): string {
  const header = EXPORT_COLUMNS.map((column) => sanitizeCsvCell(column.header)).join(',');
  const rows = leads.map((lead) => (
    EXPORT_COLUMNS.map((column) => sanitizeCsvCell(column.value(lead))).join(',')
  ));

  return `${[header, ...rows].join('\n')}\n`;
}

export function agencyLeadExportFilename(now = new Date()): string {
  return `agency-leads-${now.toISOString().slice(0, 10)}.csv`;
}
