import type { SpeakerSegment, SpeakerIdentityProfile, SpeakerRole } from './types';
import type { GPTSpeaker } from './gpt-speaker-intelligence';

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','for','with','on','in','at','by','from','is','are','was','were','be','been',
  'it','this','that','these','those','i','you','we','they','he','she','my','your','our','their','his','her',
  'as','but','if','so','not','do','does','did','have','has','had','can','could','would','should'
]);

const HANDOFF_PATTERNS = [
  /\bnext (?:we have|up|is)\b/i,
  /\bturning (?:it )?over to\b/i,
  /\blet's hear from\b/i,
  /\bgo ahead\b/i,
  /\bstart with\b/i,
  /\bmoving (?:on )?to\b/i,
  /\bplease welcome\b/i,
];

const AD_PHRASES = [
  'sponsor',
  'brought to you by',
  'support for the show',
  'use code',
  'promo code',
  'terms and conditions',
  'ad',
  'advertiser'
];

const GREETING_PATTERNS = [
  /^(hi|hello|hey)\b/i,
  /^(thanks|thank you)\b/i,
  /^(welcome)\b/i,
  /^(good morning|good afternoon|good evening)\b/i,
];

export const PROFILE_THRESHOLDS = {
  acousticSimilarityMin: 0.65,  // Increased from 0.35 (catch phonetic collisions)
  acousticExtremeMismatch: 0.15,
  interruptTurnSeconds: 2.0,
};

export function buildClusterProfiles(segments: SpeakerSegment[]): Record<string, SpeakerIdentityProfile> {
  const byCluster = new Map<string, SpeakerSegment[]>();
  for (const seg of segments) {
    const key = seg.speakerId;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(seg);
  }

  const result: Record<string, SpeakerIdentityProfile> = {};
  for (const [clusterId, clusterSegs] of byCluster.entries()) {
    result[clusterId] = buildProfileFromSegments(clusterSegs);
  }
  return result;
}

export function buildIdentityProfiles(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): Record<string, SpeakerIdentityProfile> {
  const byIdentity = new Map<string, SpeakerSegment[]>();
  for (const seg of segments) {
    const id = seg.finalSpeakerId || seg.speakerId;
    if (!id) continue;
    if (!byIdentity.has(id)) byIdentity.set(id, []);
    byIdentity.get(id)!.push(seg);
  }

  const result: Record<string, SpeakerIdentityProfile> = {};
  for (const speaker of roster) {
    const segs = byIdentity.get(speaker.id) || [];
    if (segs.length === 0) continue;
    result[speaker.id] = buildProfileFromSegments(segs);
  }
  return result;
}

export function buildProfileFromSegments(segments: SpeakerSegment[]): SpeakerIdentityProfile {
  const totalDuration = segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
  const avgTurnSeconds = segments.length > 0 ? totalDuration / segments.length : 0;

  const handoffGivenCount = segments.filter(s => HANDOFF_PATTERNS.some(p => p.test(s.text))).length;
  let handoffReceivedCount = 0;
  let interruptLike = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = seg.endTime - seg.startTime;
    const prev = i > 0 ? segments[i - 1] : null;
    const next = i < segments.length - 1 ? segments[i + 1] : null;

    if (prev && prev.speakerId !== seg.speakerId && HANDOFF_PATTERNS.some(p => p.test(prev.text))) {
      handoffReceivedCount++;
    }

    if (
      prev && next &&
      prev.speakerId !== seg.speakerId &&
      next.speakerId !== seg.speakerId &&
      duration <= PROFILE_THRESHOLDS.interruptTurnSeconds
    ) {
      interruptLike++;
    }
  }

  const interruptLikeTurnRate = segments.length > 0 ? interruptLike / segments.length : 0;

  const lexical = buildLexicalProfile(segments);
  const acoustic = buildAcousticProfile(segments);

  return {
    acoustic: acoustic || undefined,
    lexical,
    behavioral: {
      avgTurnSeconds,
      handoffGivenCount,
      handoffReceivedCount,
      interruptLikeTurnRate,
    }
  };
}

function buildLexicalProfile(segments: SpeakerSegment[]): SpeakerIdentityProfile['lexical'] {
  const tokens: string[] = [];
  let greetingStyle: string | undefined;

  for (const seg of segments) {
    const text = seg.text || '';
    if (!greetingStyle) {
      const match = GREETING_PATTERNS.find(p => p.test(text));
      if (match) {
        const first = text.trim().split(/\s+/)[0];
        greetingStyle = first ? first.toLowerCase() : undefined;
      }
    }
    tokens.push(...tokenize(text));
  }

  const topPhrases = extractTopBigrams(tokens, 6);
  const pronounHints = extractPronounHints(tokens);

  return {
    topPhrases,
    greetingStyle,
    pronounHints,
  };
}

function buildAcousticProfile(segments: SpeakerSegment[]): SpeakerIdentityProfile['acoustic'] | null {
  const embeddings: number[][] = [];
  for (const seg of segments) {
    if (Array.isArray(seg.embedding) && seg.embedding.length > 0) {
      embeddings.push(seg.embedding);
    }
  }
  if (embeddings.length === 0) return null;

  const centroid = meanVector(embeddings);
  const variance = averageCosineDistance(embeddings, centroid);
  return {
    centrdEmbedding: centroid,
    variance,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function acousticSimilarity(profileA?: SpeakerIdentityProfile, profileB?: SpeakerIdentityProfile): number {
  if (!profileA?.acoustic?.centrdEmbedding || !profileB?.acoustic?.centrdEmbedding) return 0;
  return cosineSimilarity(profileA.acoustic.centrdEmbedding, profileB.acoustic.centrdEmbedding);
}

export function lexicalOverlap(profileA?: SpeakerIdentityProfile, profileB?: SpeakerIdentityProfile): number {
  const a = new Set(profileA?.lexical?.topPhrases || []);
  const b = new Set(profileB?.lexical?.topPhrases || []);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / Math.max(a.size, b.size);
}

export function hasAdLexicalHint(profile?: SpeakerIdentityProfile): boolean {
  const phrases = (profile?.lexical?.topPhrases || []).map(p => p.toLowerCase());
  return phrases.some(p => AD_PHRASES.some(ad => p.includes(ad)));
}

export function summarizeProfileForPrompt(profile?: SpeakerIdentityProfile): string {
  if (!profile) return '';
  const behavioral = profile.behavioral
    ? `avgTurn=${profile.behavioral.avgTurnSeconds.toFixed(1)}s, handoffGiven=${profile.behavioral.handoffGivenCount}`
    : '';
  const lexical = profile.lexical?.topPhrases?.slice(0, 4).join(', ');
  const greeting = profile.lexical?.greetingStyle ? `greeting=${profile.lexical.greetingStyle}` : '';
  const parts = [behavioral, greeting, lexical ? `phrases=${lexical}` : ''].filter(Boolean);
  return parts.length > 0 ? `profile(${parts.join('; ')})` : '';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function extractTopBigrams(tokens: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

function extractPronounHints(tokens: string[]): string[] {
  const pronouns = new Set(['i', 'my', 'we', 'our', 'you', 'your', 'they', 'their']);
  const hints = new Set<string>();
  for (const token of tokens) {
    if (pronouns.has(token)) hints.add(token);
  }
  return [...hints];
}

function meanVector(vectors: number[][]): number[] {
  const dims = vectors[0].length;
  const sum = new Array(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) sum[i] += v[i];
  }
  return sum.map(val => val / vectors.length);
}

function averageCosineDistance(vectors: number[][], centroid: number[]): number {
  if (vectors.length === 0) return 0;
  let total = 0;
  for (const v of vectors) {
    total += 1 - cosineSimilarity(v, centroid);
  }
  return total / vectors.length;
}

export function computeRoleCompatibility(
  profile: SpeakerIdentityProfile | undefined,
  role?: SpeakerRole,
  context?: 'podcast' | 'debate'
): number {
  if (!profile || !role) return 0;

  // Debate context: role scoring disabled for candidates (all equal)
  if (context === 'debate' && (role === 'guest' || role === 'candidate')) {
    return 0;  // Don't bias towards any candidate
  }

  const behavior = profile.behavioral;
  let score = 0;

  // Podcast context: original logic
  if (role === 'host' || role === 'co_host') {
    if (behavior?.handoffGivenCount && behavior.handoffGivenCount >= 2) score += 2.0;
    if (behavior && behavior.avgTurnSeconds <= 20) score += 1.0;
    if (profile.lexical?.greetingStyle) score += 0.5;
    if (behavior && behavior.avgTurnSeconds >= 40) score -= 0.5;
  } else if (role === 'advertiser') {
    if (hasAdLexicalHint(profile)) score += 2.0;
    if (behavior && behavior.avgTurnSeconds >= 15) score += 0.5;
  } else if (role === 'guest' || role === 'candidate') {
    if (behavior && behavior.avgTurnSeconds >= 10) score += 1.0;
    if (behavior && behavior.handoffGivenCount === 0) score += 0.5;
  }

  return score;
}
