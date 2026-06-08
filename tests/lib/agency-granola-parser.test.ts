import {
  normalizeGranolaList,
  normalizeGranolaManualImport,
  parseGranolaNotes,
} from '@/lib/agency-granola-parser';

describe('agency Granola parser', () => {
  it('parses structured Granola sections without external APIs', () => {
    const parsed = parseGranolaNotes(`
Meeting Title: Expansion Call
Meeting Date: 2026-06-08
Meeting Type: Customer interview
Participants: Lucas, Dana

Summary:
- Customer wants cleaner reporting.

Decisions:
- Keep the MVP workflow manual.

Action Items:
1. Send revised package.

Customer Pain Points:
- Hard to turn calls into reusable content.

Notable Quotes:
- "We need this every week."

Follow-up Opportunities:
- Build a monthly review bundle.
    `);

    expect(parsed.summary).toBe('Customer wants cleaner reporting.');
    expect(parsed.metadata).toMatchObject({
      meetingTitle: 'Expansion Call',
      meetingDate: '2026-06-08',
      meetingType: 'Customer interview',
      participants: ['Lucas', 'Dana'],
      decisions: ['Keep the MVP workflow manual.'],
      actionItems: ['Send revised package.'],
      customerPainPoints: ['Hard to turn calls into reusable content.'],
      notableQuotes: ['We need this every week.'],
      followUpOpportunities: ['Build a monthly review bundle.'],
      parserWarnings: [],
    });
  });

  it('deduplicates comma and line separated list values', () => {
    expect(normalizeGranolaList('Lucas, Dana\n- Lucas\n1. Pat')).toEqual(['Lucas', 'Dana', 'Pat']);
  });

  it('lets explicit manual fields override parsed sections', () => {
    const normalized = normalizeGranolaManualImport({
      sourceTitle: 'Manual title',
      rawText: `
Meeting Type: Discovery
Participants: Parsed Person
Action Items:
- Parsed action
      `,
      meetingType: 'Strategy call',
      participants: 'Lucas, Dana',
      actionItems: 'Manual action',
      summary: 'Explicit summary',
    }, 'user-1');

    expect(normalized.sourceTitle).toBe('Manual title');
    expect(normalized.summary).toBe('Explicit summary');
    expect(normalized.metadata).toMatchObject({
      capturedVia: 'agency_granola_manual_import',
      importMode: 'manual_paste',
      importedBy: 'user-1',
      meetingType: 'Strategy call',
      participants: ['Lucas', 'Dana'],
      actionItems: ['Manual action'],
    });
  });

  it('returns warnings instead of failing when notes are unstructured', () => {
    const parsed = parseGranolaNotes('A plain block of meeting notes with no headings.');

    expect(parsed.metadata.parserWarnings).toEqual(['No recognized structured Granola sections were found.']);
    expect(parsed.summary).toBeNull();
  });
});
