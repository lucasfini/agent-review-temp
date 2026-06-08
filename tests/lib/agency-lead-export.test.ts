import {
  agencyLeadExportFilename,
  buildAgencyLeadsCsv,
  sanitizeCsvCell,
} from '@/lib/agency-lead-export';
import type { AgencyLead } from '@/lib/agency-leads';

const baseLead: AgencyLead = {
  id: 'lead-1',
  name: 'Lucas',
  email: 'lucas@example.com',
  company: 'Acme',
  website: 'https://example.com',
  role: 'Founder',
  packageInterest: 'monthly-founder-content',
  budgetRange: '$5k-$10k/mo',
  timeline: 'This quarter',
  message: 'Need help turning calls into content.',
  source: 'agency_website',
  status: 'new',
  qualificationScore: 72,
  qualificationTier: 'high',
  assignedTo: null,
  reviewNotes: null,
  lastContactedAt: null,
  nextFollowUpAt: null,
  metadata: {},
  convertedClientId: null,
  convertedAt: null,
  convertedBy: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

describe('agency lead export helpers', () => {
  it('quotes CSV cells and prefixes spreadsheet formulas', () => {
    expect(sanitizeCsvCell('Lucas "Founder"')).toBe('"Lucas ""Founder"""');
    expect(sanitizeCsvCell('=IMPORTXML("https://example.com")')).toBe(`"'=IMPORTXML(""https://example.com"")"`);
    expect(sanitizeCsvCell('+15555555555')).toBe(`"'+15555555555"`);
    expect(sanitizeCsvCell('@malicious')).toBe('"\'@malicious"');
  });

  it('builds CSV exports with safe lead values', () => {
    const csv = buildAgencyLeadsCsv([
      {
        ...baseLead,
        company: '=HYPERLINK("https://example.com")',
        message: 'Line one\nLine two',
      },
    ]);

    expect(csv).toContain('"Submitted At","Status","Qualification Tier"');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('creates stable dated filenames', () => {
    expect(agencyLeadExportFilename(new Date('2026-06-08T12:00:00.000Z'))).toBe('agency-leads-2026-06-08.csv');
  });
});
