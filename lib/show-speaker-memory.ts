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
  {
    id: 'pivot',
    displayName: 'Pivot',
    titlePatterns: [
      /\bpivot\b/i,
      /\bpivot\s*-\s*pivot\s+with\s+kara\s+swisher\s+and\s+scott\s+galloway\b/i,
    ],
    filenamePatterns: [
      /\bpivot\b/i,
      /\bpivot[_\s-]+with[_\s-]+kara[_\s-]+swisher[_\s-]+and[_\s-]+scott[_\s-]+galloway\b/i,
    ],
    transcriptPatterns: [
      /\bthis\s+is\s+pivot\b/i,
      /\bwelcome\s+to\s+pivot\b/i,
      /\bpivot\s+with\s+kara\s+swisher\s+and\s+scott\s+galloway\b/i,
    ],
    roster: [
      {
        name: 'Kara Swisher',
        role: 'host',
        aliases: ['Kara'],
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

const GENERIC_SHOW_STOPWORDS = new Set([
  'the', 'and', 'with', 'from', 'into', 'about', 'episode', 'youtube', 'official', 'clip',
  'audio', 'video', 'full', 'show', 'podcast', 'news', 'interview', 'export', 'test',
  'reaction', 'edition', 'part', 'kara', 'scott',
]);

function tokenizeShowIdentity(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) =>
      token.length > 2 &&
      !/^\d+$/.test(token) &&
      !/^test\d*$/.test(token) &&
      !/^export\d*$/.test(token) &&
      !GENERIC_SHOW_STOPWORDS.has(token)
    );
}

function buildShowIdentityFragments(value: string): Array<{ raw: string; tokens: string[] }> {
  if (!value) return [];
  const cleaned = value
    .replace(/\((?:youtube|spotify|apple podcasts?|video|audio)\)/ig, ' ')
    .replace(/\bexport-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?\b/ig, ' ')
    .replace(/\btest\d+\b/ig, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .trim();

  const parts = cleaned
    .split(/\s+[—–-]\s+|\s+\|\s+|:\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const fragments = [cleaned, ...parts]
    .map((raw) => ({ raw: raw.trim(), tokens: tokenizeShowIdentity(raw) }))
    .filter((fragment) => fragment.raw.length > 0 && fragment.tokens.length >= 2);

  const seen = new Set<string>();
  return fragments.filter((fragment) => {
    const key = fragment.tokens.join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildGenericShowDisplayName(raw: string): string {
  const fragments = buildShowIdentityFragments(raw);
  if (fragments.length === 0) {
    return raw.trim();
  }

  const candidates = fragments
    .map((fragment) => ({
      raw: fragment.raw
        .replace(/\s+/g, ' ')
        .replace(/\s+(podcast|show)\b/i, '')
        .trim(),
      tokenCount: fragment.tokens.length,
    }))
    .filter((fragment) => fragment.raw.length > 0)
    .sort((a, b) => {
      if (a.tokenCount !== b.tokenCount) return a.tokenCount - b.tokenCount;
      return a.raw.length - b.raw.length;
    });

  return candidates[0]?.raw || fragments[0].raw.trim();
}

function scoreShowIdentityFragments(a: string[], b: string[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const overlap = a.filter((token) => b.includes(token));
  if (overlap.length < 2) return 0;
  const recall = overlap.length / Math.min(a.length, b.length);
  const precision = overlap.length / Math.max(a.length, b.length);
  return Number((recall * 0.7 + precision * 0.3).toFixed(3));
}

function buildGenericShowId(displayName: string): string {
  const slug = tokenizeShowIdentity(displayName).slice(0, 6).join('_') || 'show';
  return `generic_${slug}`;
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
    case 'built_in':
      return 4;
    case 'corrected':
      return 3;
    case 'auto_learned':
      return 1;
    default:
      return 0;
  }
}

function getKnownShowProfileById(id?: string | null): KnownShowProfile | null {
  if (!id) return null;
  return KNOWN_SHOW_PROFILES.find((profile) => profile.id === id) || null;
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

export function detectGenericShowIdentityFromProjects(params: {
  title?: string | null;
  filename?: string | null;
  segments?: SpeakerSegment[];
  projects?: Array<{
    title?: string | null;
    metadata?: any;
  }>;
}): ShowIdentityMatch | null {
  const titleFragments = buildShowIdentityFragments(params.title || '');
  const filenameFragments = buildShowIdentityFragments(params.filename || '');
  const currentFragments = [
    ...titleFragments,
    ...filenameFragments,
  ];

  if (currentFragments.length === 0) {
    const transcriptWindow = (params.segments || [])
      .slice(0, 12)
      .map((segment) => segment.text)
      .join(' ');
    currentFragments.push(...buildShowIdentityFragments(transcriptWindow));
  }

  if (currentFragments.length === 0 || !Array.isArray(params.projects) || params.projects.length === 0) {
    return null;
  }

  let best:
    | {
        current: { raw: string; tokens: string[] };
        score: number;
        matches: number;
      }
    | null = null;

  for (const current of currentFragments) {
    let matches = 0;
    let bestScoreForCurrent = 0;

    for (const project of params.projects) {
      const priorSources = [
        project.title || '',
        project.metadata?.originalFileName || '',
        project.metadata?.fileName || '',
      ];
      const priorFragments = priorSources.flatMap((source) => buildShowIdentityFragments(source));
      if (priorFragments.length === 0) continue;

      const priorBestScore = priorFragments.reduce(
        (score, fragment) => Math.max(score, scoreShowIdentityFragments(current.tokens, fragment.tokens)),
        0
      );

      if (priorBestScore >= 0.74) {
        matches += 1;
        bestScoreForCurrent = Math.max(bestScoreForCurrent, priorBestScore);
      }
    }

    if (matches >= 2 && (!best || matches > best.matches || (matches === best.matches && bestScoreForCurrent > best.score))) {
      best = { current, score: bestScoreForCurrent, matches };
    }
  }

  if (!best) return null;

  const normalizedDisplayName = buildGenericShowDisplayName(
    titleFragments[0]?.raw ||
    filenameFragments[0]?.raw ||
    best.current.raw
  );
  const matchedBy: ShowIdentityMatch['matchedBy'] =
    titleFragments.length > 0 ? 'title' : filenameFragments.length > 0 ? 'filename' : 'transcript';
  const matchedValue =
    matchedBy === 'title'
      ? (params.title || normalizedDisplayName)
      : matchedBy === 'filename'
        ? (params.filename || normalizedDisplayName)
        : best.current.raw;

  return {
    id: buildGenericShowId(normalizedDisplayName),
    displayName: normalizedDisplayName,
    matchedBy,
    matchedValue,
    roster: [],
  };
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
  const knownProfile = getKnownShowProfileById(match.id);
  const builtInRosterByRole = new Map<SpeakerRole, Set<string>>();
  const builtInNames = new Set<string>();

  for (const entry of knownProfile?.roster || []) {
    const normalized = normalizeName(entry.name);
    builtInNames.add(normalized);
    if (entry.role) {
      if (!builtInRosterByRole.has(entry.role)) {
        builtInRosterByRole.set(entry.role, new Set<string>());
      }
      builtInRosterByRole.get(entry.role)!.add(normalized);
    }
  }

  for (const project of projects) {
    const projectMatch = detectShowIdentityFromContext({
      title: project.title || project.metadata?.originalFileName || project.metadata?.fileName,
      filename: project.metadata?.originalFileName || project.metadata?.fileName,
    });
    const projectMatchesCurrentShow = projectMatch
      ? projectMatch.id === match.id
      : buildShowIdentityFragments(project.title || project.metadata?.originalFileName || project.metadata?.fileName || '')
        .some((fragment) => scoreShowIdentityFragments(fragment.tokens, tokenizeShowIdentity(match.displayName)) >= 0.74);
    if (!projectMatchesCurrentShow) continue;

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
      if (entry.role === 'host' || entry.role === 'co_host') {
        const normalized = normalizeName(entry.name);
        if (knownProfile) {
          if (builtInNames.has(normalized)) {
            return seen >= 1;
          }
          const roleAnchors = entry.role ? builtInRosterByRole.get(entry.role) : null;
          if (roleAnchors && roleAnchors.size > 0) {
            return false;
          }
        }
        return seen >= 2;
      }
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
    /\b(?:school|university|college|law\s+school|institute|center|centre|department|ministry|foundation|magazine|newspaper|news|opinion|world\s+service|radio|network|press|times|bloomberg|bbc|vox\s+media|general\s+assembly|security\s+council|nobel(?:\s+prize)?)\b/.test(normalizedCandidate) ||
    /\b(?:united\s+states|united\s+kingdom|u\.?s\.?|u\.?k\.?|america|israel|palestinians?|iran|russia|ukraine|china|canada|europe|european\s+union|united\s+nations|u\.?n\.?)\b/.test(normalizedCandidate) ||
    /\b(?:secretary|minister|president|prime\s+minister|senator|governor|chief\s+of\s+staff|human\s+services|department\s+of|treaty|resolution|accord|agreement|act|bill|law)\b/.test(normalizedCandidate) ||
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
