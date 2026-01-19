import { SpeakerSegment } from '@/lib/types';

export interface SegmentFilterResult {
  speakerId: string;
  isNonSpeaker: boolean;
  filterReason?: 'ad_read' | 'intro' | 'outro' | 'promo' | 'venue_announcement';
  confidence: number;
  evidence: string;
}

export function detectNonSpeakerSegments(
  segments: SpeakerSegment[]
): Map<string, SegmentFilterResult> {
  const filters = new Map<string, SegmentFilterResult>();

  // Group segments by speaker first
  const speakerSegments = new Map<string, SpeakerSegment[]>();
  for (const seg of segments) {
    if (!speakerSegments.has(seg.speakerId)) {
      speakerSegments.set(seg.speakerId, []);
    }
    speakerSegments.get(seg.speakerId)!.push(seg);
  }

  // Check each speaker's segments for non-speaker patterns
  for (const [speakerId, segs] of speakerSegments) {
    const result = analyzeForNonSpeaker(segs);
    if (result.isNonSpeaker) {
      filters.set(speakerId, result);
    }
  }

  return filters;
}

function analyzeForNonSpeaker(
  segments: SpeakerSegment[]
): SegmentFilterResult {
  let score = 0;
  const reasons: string[] = [];
  let filterReason: SegmentFilterResult['filterReason'] | undefined;

  // HEURISTIC 1: Early timestamp (0-120 seconds)
  const hasEarlySegments = segments.some(s => s.startTime < 120);
  if (hasEarlySegments) {
    score += 30;
    reasons.push('early_timestamp');
  }

  // HEURISTIC 2: Line label patterns (location, venue, show title)
  const lineLabelPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\d+\s+(?:second|minute)/;

  const locationNames = [
    'new york', 'los angeles', 'london', 'chicago', 'boston',
    'seattle', 'portland', 'austin', 'nashville', 'atlanta'
  ];

  const venueKeywords = [
    'theatre', 'theater', 'auditorium', 'arena', 'hall', 'club',
    'comedy store', 'improv', 'laugh factory', 'ucb'
  ];

  for (const seg of segments) {
    const match = seg.text.match(lineLabelPattern);
    if (match) {
      const label = match[1].toLowerCase();

      // Check for location names
      if (locationNames.some(loc => label.includes(loc))) {
        score += 40;
        reasons.push('location_name');
        filterReason = 'venue_announcement';
      }

      // Check for venue keywords
      if (venueKeywords.some(venue => label.includes(venue))) {
        score += 40;
        reasons.push('venue_keyword');
        filterReason = 'venue_announcement';
      }
    }
  }

  // HEURISTIC 3: Ad read keywords
  const adKeywords = [
    'welcome to', 'brought to you by', 'this episode is sponsored',
    'special thanks to', 'brought to you in partnership',
    'today\'s episode', 'this week\'s episode', 'subscribe to',
    'follow us on', 'available now', 'get tickets'
  ];

  const combinedText = segments.map(s => s.text.toLowerCase()).join(' ');
  const matchedAdKeywords = adKeywords.filter(kw => combinedText.includes(kw));

  if (matchedAdKeywords.length >= 2) {
    score += 50;
    reasons.push(`ad_keywords:${matchedAdKeywords.length}`);
    filterReason = 'ad_read';
  }

  // HEURISTIC 4: Show title repetition (e.g., "Raging Moderates" appears multiple times)
  const words = combinedText.split(/\s+/);
  const wordFreq = new Map<string, number>();

  for (const word of words) {
    if (word.length > 3) {  // Skip short words
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  const hasRepeatedPhrase = Array.from(wordFreq.values()).some(freq => freq >= 3);
  if (hasRepeatedPhrase && hasEarlySegments) {
    score += 25;
    reasons.push('repeated_phrase');
    filterReason = filterReason || 'intro';
  }

  // HEURISTIC 5: Very short speaking time (< 15 seconds total)
  const totalDuration = segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
  if (totalDuration < 15 && segments.length <= 2) {
    score += 20;
    reasons.push('very_short_duration');
    filterReason = filterReason || 'promo';
  }

  // DECISION THRESHOLD: 50+ points = non-speaker
  const isNonSpeaker = score >= 50;
  const confidence = Math.min(score / 100, 0.95);

  return {
    speakerId: segments[0].speakerId,
    isNonSpeaker,
    filterReason: isNonSpeaker ? filterReason : undefined,
    confidence,
    evidence: reasons.join(', ')
  };
}
