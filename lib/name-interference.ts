export const COMMON_NON_NAME_WORDS = new Set([
  'in', 'on', 'at', 'to', 'by', 'of', 'or', 'an', 'as', 'if', 'so', 'no', 'up',
  'me', 'we', 'he', 'us', 'it', 'my', 'am', 'is', 'be', 'do', 'go', 'not', 'but',
  'yet', 'nor', 'for', 'and', 'the', 'oh', 'ok', 'ah', 'um', 'uh', 'all', 'too',
  'now', 'out', 'off', 'own', 'its', 'has', 'had', 'was', 'are', 'her', 'his', 'our',
  'who', 'how', 'why', 'can', 'did', 'got', 'get', 'let', 'say', 'see', 'may', 'way',
  'day', 'old', 'new', 'big', 'few', 'far', 'ago', 'run', 'put', 'set', 'try', 'ask',
  'use', 'lot', 'bit', 'per', 'via', 'yes', 'there', 'their', 'theyre',
]);

const STANDALONE_NAME_PREFIXES = new Set([
  'dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'sir',
  'madam', 'lord', 'lady', 'rev', 'reverend', 'pastor', 'rabbi', 'imam', 'coach',
  'captain', 'officer', 'chief', 'president', 'senator', 'governor', 'minister',
  'secretary', 'judge', 'justice', 'mayor', 'representative', 'congressman',
  'congresswoman',
]);

const ROLE_NOUN_NAME_POISON_WORDS = new Set([
  'doctor', 'professor', 'teacher', 'student', 'engineer', 'lawyer', 'therapist',
  'psychologist', 'psychiatrist', 'coach', 'streamer', 'creator', 'founder',
  'ceo', 'host', 'guest', 'moderator', 'interviewer', 'caller', 'patient', 'developer',
]);

const DEMONYM_NAME_POISON_WORDS = new Set([
  'american', 'british', 'canadian', 'australian', 'indian', 'chinese', 'japanese',
  'korean', 'french', 'german', 'italian', 'spanish', 'mexican', 'brazilian',
  'african', 'european', 'asian', 'christian', 'muslim', 'jewish', 'hindu', 'buddhist',
  'nigerian',
]);

const TITLE_FRAGMENT_NAME_POISON_PATTERNS = [
  /^an honest$/i,
  /^honest conversation$/i,
  /^conversation with$/i,
  /^episode$/i,
  /^podcast$/i,
  /^interview$/i,
  /^debate$/i,
  /^roundtable$/i,
  /^special$/i,
  /^part (?:one|two|three|1|2|3)$/i,
  /^clip$/i,
  /^highlights?$/i,
  /^recap$/i,
  /^reaction$/i,
  /^livestream$/i,
  /^stream$/i,
  /^show$/i,
  /^markets$/i,
  /^future$/i,
  /^update$/i,
];

const SELF_ID_PHRASE_POISON_PATTERNS = [
  /^to be honest$/i,
  /^to be fair$/i,
  /^for sure$/i,
  /^right now$/i,
  /^kind of$/i,
  /^sort of$/i,
];

const SELF_ID_STOPWORDS = new Set([
  'here', 'back', 'going', 'just', 'not', 'so', 'very', 'really',
  'happy', 'glad', 'excited', 'thrilled', 'honored', 'delighted',
  'sure', 'fine', 'good', 'great', 'well', 'okay', 'the', 'your',
  'his', 'her', 'their', 'myself', 'yourself', 'himself', 'herself',
  'themselves', 'student', 'teacher', 'professor', 'doctor', 'engineer',
  'grateful', 'thankful', 'proud', 'humble', 'wrong', 'right', 'better',
  'curious', 'hopeful', 'worried', 'interested', 'aware', 'confused',
  'upset', 'angry', 'honest', 'serious', 'actually', 'basically',
  'seriously', 'literally', 'honestly', 'anyway', 'alright', 'trying',
  'getting', 'thinking', 'doing', 'talking', 'saying', 'making',
  'wondering', 'waiting', 'looking', 'working', 'using', 'sending',
  'driving', 'creating', 'suggesting', 'problem', 'truth', 'support',
  'part', 'stage', 'share',
]);

const NAME_POISON_WORDS = new Set([
  'is', 'are', 'was', 'were', 'will', 'would', 'shall', 'should', 'has', 'have',
  'had', 'do', 'does', 'did', 'can', 'could', 'may', 'might', 'must', 'being',
  'been', 'get', 'got', 'getting', 'go', 'going', 'gone', 'went', 'say', 'said',
  'tell', 'told', 'think', 'thought', 'make', 'made', 'take', 'took', 'give',
  'gave', 'come', 'came', 'see', 'saw', 'know', 'knew', 'want', 'need', 'like',
  'feel', 'felt', 'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'from',
  'and', 'but', 'or', 'not', 'that', 'this', 'so', 'very', 'really', 'just',
  'also', 'still', 'even', 'happy', 'glad', 'excited', 'full', 'support', 'share',
  'pressuring', 'stage', 'here', 'there', 'now', 'then', 'myself', 'yourself',
  'himself', 'herself', 'themselves', 'ourselves', 'student', 'teacher',
  'professor', 'doctor', 'engineer', 'lawyer', 'grateful', 'thankful', 'proud',
  'humble', 'honored', 'nigerian', 'american', 'british', 'canadian', 'australian',
  'indian', 'chinese', 'japanese', 'korean', 'french', 'german', 'italian',
  'spanish', 'mexican', 'brazilian', 'african', 'european', 'asian', 'wrong',
  'right', 'better', 'curious', 'hopeful', 'worried', 'interested', 'aware',
  'confused', 'upset', 'angry', 'honest', 'serious', 'actually', 'basically',
  'seriously', 'literally', 'honestly', 'anyway', 'alright', 'trying',
  'getting', 'thinking', 'doing', 'talking', 'saying', 'making',
  'wondering', 'waiting', 'looking', 'working', 'using', 'sending',
  'driving', 'creating', 'suggesting', 'problem', 'truth', 'part',
]);

export function normalizeNameToken(token: string): string {
  return token.toLowerCase().replace(/[.'-]/g, '').trim();
}

export function isInterferenceName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return true;

  if (TITLE_FRAGMENT_NAME_POISON_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (SELF_ID_PHRASE_POISON_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean).map(normalizeNameToken);
  if (tokens.length === 0) return true;

  if (tokens.length === 1) {
    const token = tokens[0];
    if (
      STANDALONE_NAME_PREFIXES.has(token) ||
      ROLE_NOUN_NAME_POISON_WORDS.has(token) ||
      DEMONYM_NAME_POISON_WORDS.has(token) ||
      COMMON_NON_NAME_WORDS.has(token)
    ) {
      return true;
    }
  }

  return false;
}

export function hasRequiredFollowingName(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const first = normalizeNameToken(words[0]);
  if (!STANDALONE_NAME_PREFIXES.has(first)) return true;
  if (words.length < 2) return false;
  return words.slice(1).every((word) => /^[A-Z][a-zA-Z'.-]+$/.test(word));
}

export function isValidProperNameCandidate(name: string): boolean {
  if (!/[a-zA-Z]/.test(name)) return false;
  if (isInterferenceName(name)) return false;
  if (COMMON_NON_NAME_WORDS.has(name.toLowerCase())) return false;

  const isInitials = /^[A-Z]{2,3}$/.test(name) || /^[a-z]{2,3}$/.test(name);
  if (isInitials) return true;
  if (name === name.toLowerCase()) return false;
  return true;
}

export function isPlausibleHumanName(name: string): boolean {
  if (isInterferenceName(name)) return false;
  if (!hasRequiredFollowingName(name)) return false;

  const words = name.split(/\s+/);
  if (words.length > 3) return false;

  if (words.length === 1) {
    if (name.length < 2) return false;
    if (name.length > 3 && !/^[A-Z]/.test(name)) return false;
  }

  if (words.length > 1) {
    for (const word of words) {
      if (!/^[A-Z]/.test(word)) return false;
    }
  }

  for (const word of words) {
    const normalizedWord = normalizeNameToken(word);
    if (
      NAME_POISON_WORDS.has(normalizedWord) ||
      ROLE_NOUN_NAME_POISON_WORDS.has(normalizedWord) ||
      DEMONYM_NAME_POISON_WORDS.has(normalizedWord)
    ) return false;
  }

  if (SELF_ID_STOPWORDS.has(name.toLowerCase())) return false;
  return true;
}

export function extractValidatedSelfIdName(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;

    const extracted = match[1].trim();
    const candidate = extracted
      .replace(/\b(Dr|Prof|Mr|Mrs|Ms|Miss|Mx)\.?$/i, '$1')
      .trim();

    if (!isValidProperNameCandidate(candidate)) continue;
    if (!isPlausibleHumanName(candidate)) continue;
    return candidate;
  }

  return null;
}
