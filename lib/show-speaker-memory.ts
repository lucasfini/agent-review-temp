import type { SpeakerRole, SpeakerSegment } from '@/lib/types';

export type ShowRosterEntry = {
  name: string;
  role?: SpeakerRole;
  aliases?: string[];
  confidenceSource?: 'manual' | 'built_in' | 'auto_learned' | 'corrected';
  lastConfirmedShowMatch?: string | null;
};

export type ShowIdentityMatch = {
  id: string;
  displayName: string;
  matchedBy: 'title' | 'filename' | 'transcript';
  matchedValue: string;
  roster: ShowRosterEntry[];
};

type KnownShowProfile = {
  id: string;
  displayName: string;
  titlePatterns: RegExp[];
  filenamePatterns: RegExp[];
  transcriptPatterns: RegExp[];
  roster: ShowRosterEntry[];
};

const KNOWN_SHOW_PROFILES: KnownShowProfile[] = [
  {
    id: 'prof_g_markets',
    displayName: 'Prof G Markets',
    titlePatterns: [
      /\bprof\.?\s*g\s+markets\b/i,
      /\bprop\s+team\s+markets\b/i,
      /\bprofi(?:t|te)e?\s+markets\b/i,
    ],
    filenamePatterns: [
      /\bprof\.?\s*g\s+markets\b/i,
      /\bprop[_\s-]*team[_\s-]*markets\b/i,
      /\bprofi(?:t|te)e?[_\s-]*markets\b/i,
    ],
    transcriptPatterns: [
      /\bwelcome\s+to\s+prof\.?\s*g\s+markets\b/i,
      /\bwe'?re\s+back\s+with\s+prof\.?\s*g\s+markets\b/i,
      /\bwelcome\s+to\s+prop\s+team\s+markets\b/i,
      /\bwelcome\s+to\s+profi(?:t|te)e?\s+markets\b/i,
    ],
    roster: [
      {
        name: 'Ed Elson',
        role: 'host',
        aliases: ['Ed'],
        confidenceSource: 'built_in',
      },
      {
        name: 'Scott Galloway',
        role: 'co_host',
        aliases: ['Scott', 'Prof G'],
        confidenceSource: 'built_in',
      },
    ],
  },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(name: string): string {
  return normalizeText(name);
}

function mergeAliases(...aliasGroups: Array<string[] | undefined>): string[] {
  return [...new Set(
    aliasGroups
      .flatMap((group) => group || [])
      .map((alias) => alias.trim())
      .filter(Boolean)
  )];
}

function sourcePriority(source?: ShowRosterEntry['confidenceSource']): number {
  switch (source) {
    case 'manual':
      return 4;
    case 'corrected':
      return 3;
    case 'built_in':
      return 2;
    case 'auto_learned':
      return 1;
    default:
      return 0;
  }
}

function chooseRole(
  currentRole?: SpeakerRole,
  nextRole?: SpeakerRole
): SpeakerRole | undefined {
  if (!nextRole) return currentRole;
  if (!currentRole) return nextRole;
  if (currentRole === nextRole) return currentRole;
  if (currentRole === 'unknown') return nextRole;
  if (nextRole === 'unknown') return currentRole;
  if (currentRole === 'guest' && (nextRole === 'host' || nextRole === 'co_host')) return nextRole;
  if (nextRole === 'guest' && (currentRole === 'host' || currentRole === 'co_host')) return currentRole;
  return currentRole;
}

export function detectShowIdentityFromContext(params: {
  title?: string | null;
  filename?: string | null;
  segments?: SpeakerSegment[];
}): ShowIdentityMatch | null {
  const title = params.title || '';
  const filename = params.filename || '';
  const transcriptWindow = (params.segments || [])
    .slice(0, 12)
    .map((segment) => segment.text)
    .join(' ');

  for (const profile of KNOWN_SHOW_PROFILES) {
    if (profile.titlePatterns.some((pattern) => pattern.test(title))) {
      return {
        id: profile.id,
        displayName: profile.displayName,
        matchedBy: 'title',
        matchedValue: title,
        roster: profile.roster.map((entry) => ({ ...entry })),
      };
    }
    if (profile.filenamePatterns.some((pattern) => pattern.test(filename))) {
      return {
        id: profile.id,
        displayName: profile.displayName,
        matchedBy: 'filename',
        matchedValue: filename,
        roster: profile.roster.map((entry) => ({ ...entry })),
      };
    }
    if (profile.transcriptPatterns.some((pattern) => pattern.test(transcriptWindow))) {
      return {
        id: profile.id,
        displayName: profile.displayName,
        matchedBy: 'transcript',
        matchedValue: transcriptWindow,
        roster: profile.roster.map((entry) => ({ ...entry })),
      };
    }
  }

  return null;
}

export function mergeShowRosterEntries(
  ...sources: Array<Array<ShowRosterEntry | { name: string; role?: string | null; aliases?: string[] }> | undefined>
): ShowRosterEntry[] {
  const merged = new Map<string, ShowRosterEntry>();

  for (const source of sources) {
    for (const rawEntry of source || []) {
      const name = String(rawEntry?.name || '').trim();
      if (!name) continue;
      const normalized = normalizeName(name);
      const existing = merged.get(normalized);
      const nextEntry: ShowRosterEntry = {
        name,
        role: rawEntry.role as SpeakerRole | undefined,
        aliases: mergeAliases(rawEntry.aliases, [name.split(/\s+/)[0]]),
        confidenceSource: (rawEntry as ShowRosterEntry).confidenceSource,
        lastConfirmedShowMatch: (rawEntry as ShowRosterEntry).lastConfirmedShowMatch || null,
      };

      if (!existing) {
        merged.set(normalized, nextEntry);
        continue;
      }

      const keepExisting = sourcePriority(existing.confidenceSource) >= sourcePriority(nextEntry.confidenceSource);
      merged.set(normalized, {
        name: keepExisting ? existing.name : nextEntry.name,
        role: chooseRole(existing.role, nextEntry.role),
        aliases: mergeAliases(existing.aliases, nextEntry.aliases),
        confidenceSource: keepExisting ? existing.confidenceSource : nextEntry.confidenceSource,
        lastConfirmedShowMatch: existing.lastConfirmedShowMatch || nextEntry.lastConfirmedShowMatch || null,
      });
    }
  }

  return Array.from(merged.values());
}

function isValidHumanRosterName(name: string): boolean {
  if (!name || /^speaker\s+\d+$/i.test(name)) return false;
  if (/\b(?:markets?|podcast|show|tour|newsletter|dot com|\.com|\.org|\.net|www)\b/i.test(name)) return false;
  return /^[A-Z][A-Za-z'-.]+(?:\s+[A-Z][A-Za-z'-.]+){0,3}$/.test(name);
}

export function extractLearnedShowRosterFromProjects(
  projects: Array<{
    title?: string | null;
    metadata?: any;
    speaker_data?: any;
    preset_speakers?: any[] | null;
    processing_completed_at?: string | null;
  }>,
  match: ShowIdentityMatch | null
): ShowRosterEntry[] {
  if (!match) return [];

  const aggregated = new Map<string, { entry: ShowRosterEntry; seen: number }>();

  for (const project of projects) {
    const projectMatch = detectShowIdentityFromContext({
      title: project.title || project.metadata?.originalFileName || project.metadata?.fileName,
      filename: project.metadata?.originalFileName || project.metadata?.fileName,
    });
    if (!projectMatch || projectMatch.id !== match.id) continue;

    const sources: ShowRosterEntry[] = [];

    if (Array.isArray(project.preset_speakers)) {
      for (const speaker of project.preset_speakers) {
        if (!isValidHumanRosterName(speaker?.name || '')) continue;
        sources.push({
          name: speaker.name,
          role: speaker.role,
          aliases: speaker.aliases,
          confidenceSource: 'manual',
          lastConfirmedShowMatch: project.processing_completed_at || null,
        });
      }
    }

    const speakers = project.speaker_data?.speakers || {};
    for (const speaker of Object.values(speakers) as any[]) {
      const name = String(speaker?.finalName || '').trim();
      const role = speaker?.role as SpeakerRole | undefined;
      if (!isValidHumanRosterName(name)) continue;
      if (role === 'advertiser' || role === 'quoted_audio' || role === 'narrator') continue;
      if (role !== 'host' && role !== 'co_host') continue;
      sources.push({
        name,
        role,
        aliases: speaker?.aliases,
        confidenceSource: 'auto_learned',
        lastConfirmedShowMatch: project.processing_completed_at || null,
      });
    }

    for (const entry of sources) {
      const normalized = normalizeName(entry.name);
      const existing = aggregated.get(normalized);
      if (!existing) {
        aggregated.set(normalized, { entry, seen: 1 });
      } else {
        aggregated.set(normalized, {
          entry: {
            ...existing.entry,
            role: chooseRole(existing.entry.role, entry.role),
            aliases: mergeAliases(existing.entry.aliases, entry.aliases),
            confidenceSource: sourcePriority(existing.entry.confidenceSource) >= sourcePriority(entry.confidenceSource)
              ? existing.entry.confidenceSource
              : entry.confidenceSource,
            lastConfirmedShowMatch: entry.lastConfirmedShowMatch || existing.entry.lastConfirmedShowMatch || null,
          },
          seen: existing.seen + 1,
        });
      }
    }
  }

  return Array.from(aggregated.values())
    .filter(({ entry, seen }) => {
      if (entry.confidenceSource === 'manual' || entry.confidenceSource === 'built_in') return true;
      if (entry.role === 'host' || entry.role === 'co_host') return seen >= 1;
      return false;
    })
    .map(({ entry }) => entry);
}

export function isLikelyNonHumanConversationalNameCandidate(
  candidate: string,
  params: {
    showIdentity?: ShowIdentityMatch | null;
    title?: string | null;
    filename?: string | null;
  } = {}
): boolean {
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate) return true;

  if (
    /\b(?:markets?|podcast|show|tour|newsletter|episode|promo|advertiser|sponsor)\b/.test(normalizedCandidate) ||
    /\b[a-z0-9-]+\.(?:com|org|net|io|co)\b/.test(normalizedCandidate)
  ) {
    return true;
  }

  const showIdentity = params.showIdentity || detectShowIdentityFromContext({
    title: params.title || null,
    filename: params.filename || null,
  });

  const candidateTokens = normalizedCandidate.split(' ').filter((token) => token.length > 2);
  if (showIdentity) {
    const showTokens = normalizeText(showIdentity.displayName).split(' ').filter((token) => token.length > 2);
    const overlap = candidateTokens.filter((token) => showTokens.includes(token)).length;
    if (overlap >= Math.min(2, showTokens.length)) {
      return true;
    }
  }

  return false;
}
