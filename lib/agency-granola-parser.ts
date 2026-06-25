export type GranolaStructuredMetadata = {
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingType: string | null;
  participants: string[];
  decisions: string[];
  actionItems: string[];
  customerPainPoints: string[];
  notableQuotes: string[];
  followUpOpportunities: string[];
  parserWarnings: string[];
};

export type GranolaImportNormalization = {
  sourceTitle: string | null;
  rawText: string | null;
  summary: string | null;
  metadata: GranolaStructuredMetadata & {
    capturedVia: 'agency_granola_manual_import';
    importMode: 'manual_paste';
    importedBy: string;
  };
};

type StructuredListField =
  | 'participants'
  | 'decisions'
  | 'actionItems'
  | 'customerPainPoints'
  | 'notableQuotes'
  | 'followUpOpportunities';

type StructuredScalarField = 'meetingTitle' | 'meetingDate' | 'meetingType' | 'summary';
type StructuredField = StructuredListField | StructuredScalarField;

const FIELD_ALIASES: Record<StructuredField, string[]> = {
  meetingTitle: ['title', 'meeting title', 'call title'],
  meetingDate: ['date', 'meeting date', 'call date'],
  meetingType: ['type', 'meeting type', 'call type'],
  summary: ['summary', 'meeting summary', 'overview'],
  participants: ['participants', 'attendees', 'people', 'people present'],
  decisions: ['decisions', 'decision'],
  actionItems: ['action items', 'actions', 'next steps', 'to do', 'to dos', 'todos'],
  customerPainPoints: ['customer pain points', 'pain points', 'problems', 'challenges'],
  notableQuotes: ['notable quotes', 'quotes', 'customer quotes'],
  followUpOpportunities: ['follow up opportunities', 'follow-up opportunities', 'follow ups', 'follow-ups', 'opportunities'],
};

const LIST_FIELDS = new Set<StructuredField>([
  'participants',
  'decisions',
  'actionItems',
  'customerPainPoints',
  'notableQuotes',
  'followUpOpportunities',
]);

function emptyMetadata(warnings: string[] = []): GranolaStructuredMetadata {
  return {
    meetingTitle: null,
    meetingDate: null,
    meetingType: null,
    participants: [],
    decisions: [],
    actionItems: [],
    customerPainPoints: [],
    notableQuotes: [],
    followUpOpportunities: [],
    parserWarnings: warnings,
  };
}

function optionalTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fieldValue(body: any, camelKey: string, snakeKey?: string): unknown {
  if (body?.[camelKey] !== undefined) return body[camelKey];
  if (snakeKey && body?.[snakeKey] !== undefined) return body[snakeKey];
  return undefined;
}

export function normalizeGranolaList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return dedupe(value.map(optionalTrimmed).filter(Boolean) as string[]);
  }
  if (typeof value !== 'string') return [];

  const lines = value
    .split(/\r?\n|,/)
    .map(cleanListItem)
    .filter(Boolean);
  return dedupe(lines);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function cleanListItem(value: string): string {
  return value
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^["“”]+|["“”]+$/g, '')
    .trim();
}

function normalizeHeading(value: string): string {
  return value
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[_`]/g, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
}

function fieldFromHeading(value: string): StructuredField | null {
  const heading = normalizeHeading(value);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[StructuredField, string[]]>) {
    if (aliases.includes(heading)) return field;
  }
  return null;
}

function splitHeadingLine(line: string): { field: StructuredField; value: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const colonMatch = trimmed.match(/^(.{2,80}?):\s*(.*)$/);
  if (colonMatch) {
    const field = fieldFromHeading(colonMatch[1]);
    if (field) return { field, value: colonMatch[2]?.trim() || null };
  }

  const field = fieldFromHeading(trimmed);
  return field ? { field, value: null } : null;
}

function appendField(
  metadata: GranolaStructuredMetadata,
  summaryLines: string[],
  field: StructuredField,
  value: string
) {
  const cleaned = cleanListItem(value);
  if (!cleaned) return;

  if (field === 'summary') {
    summaryLines.push(cleaned);
    return;
  }

  if (LIST_FIELDS.has(field)) {
    const key = field as StructuredListField;
    metadata[key] = dedupe([...metadata[key], ...normalizeGranolaList(cleaned)]);
    return;
  }

  const key = field as Exclude<StructuredScalarField, 'summary'>;
  metadata[key] = metadata[key] ? `${metadata[key]} ${cleaned}` : cleaned;
}

export function parseGranolaNotes(rawNotes: unknown): {
  metadata: GranolaStructuredMetadata;
  summary: string | null;
} {
  const raw = optionalTrimmed(rawNotes);
  if (!raw) {
    return {
      metadata: emptyMetadata(['No raw notes were provided for parsing.']),
      summary: null,
    };
  }

  const metadata = emptyMetadata();
  const summaryLines: string[] = [];
  let currentField: StructuredField | null = null;
  let matchedSection = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = splitHeadingLine(trimmed);
    if (heading) {
      currentField = heading.field;
      matchedSection = true;
      if (heading.value) {
        appendField(metadata, summaryLines, heading.field, heading.value);
      }
      continue;
    }

    if (currentField) {
      appendField(metadata, summaryLines, currentField, trimmed);
    }
  }

  if (!matchedSection) {
    metadata.parserWarnings = ['No recognized structured Granola sections were found.'];
  }

  return {
    metadata,
    summary: summaryLines.length ? summaryLines.join('\n') : null,
  };
}

export function normalizeGranolaManualImport(body: any, userId: string): GranolaImportNormalization {
  const rawText = optionalTrimmed(fieldValue(body, 'rawNotes', 'raw_notes'))
    || optionalTrimmed(fieldValue(body, 'rawText', 'raw_text'));
  const parsed = parseGranolaNotes(rawText);
  const explicitParticipants = normalizeGranolaList(fieldValue(body, 'participants'));
  const explicitDecisions = normalizeGranolaList(fieldValue(body, 'decisions'));
  const explicitActionItems = normalizeGranolaList(fieldValue(body, 'actionItems', 'action_items'));
  const explicitPainPoints = normalizeGranolaList(fieldValue(body, 'customerPainPoints', 'customer_pain_points'));
  const explicitQuotes = normalizeGranolaList(fieldValue(body, 'notableQuotes', 'notable_quotes'));
  const explicitFollowUps = normalizeGranolaList(fieldValue(body, 'followUpOpportunities', 'follow_up_opportunities'));
  const meetingTitle = optionalTrimmed(fieldValue(body, 'meetingTitle', 'meeting_title'))
    || optionalTrimmed(fieldValue(body, 'sourceTitle', 'source_title'))
    || parsed.metadata.meetingTitle;
  const summary = optionalTrimmed(fieldValue(body, 'summary')) || parsed.summary;

  return {
    sourceTitle: meetingTitle || 'Granola meeting notes',
    rawText,
    summary,
    metadata: {
      capturedVia: 'agency_granola_manual_import',
      importMode: 'manual_paste',
      importedBy: userId,
      meetingTitle,
      meetingDate: optionalTrimmed(fieldValue(body, 'meetingDate', 'meeting_date')) || parsed.metadata.meetingDate,
      meetingType: optionalTrimmed(fieldValue(body, 'meetingType', 'meeting_type')) || parsed.metadata.meetingType,
      participants: explicitParticipants.length ? explicitParticipants : parsed.metadata.participants,
      decisions: explicitDecisions.length ? explicitDecisions : parsed.metadata.decisions,
      actionItems: explicitActionItems.length ? explicitActionItems : parsed.metadata.actionItems,
      customerPainPoints: explicitPainPoints.length ? explicitPainPoints : parsed.metadata.customerPainPoints,
      notableQuotes: explicitQuotes.length ? explicitQuotes : parsed.metadata.notableQuotes,
      followUpOpportunities: explicitFollowUps.length ? explicitFollowUps : parsed.metadata.followUpOpportunities,
      parserWarnings: parsed.metadata.parserWarnings,
    },
  };
}
