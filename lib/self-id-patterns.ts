/**
 * Self-identification patterns for speaker name extraction.
 *
 * Key improvements over legacy patterns:
 * - Require capitalization to avoid verbs ("I'm trying" → rejected)
 * - Add word boundaries to avoid partial matches ("I'm Colin Scott here" → "Colin Scott")
 * - Unified source of truth (previously defined in 3 places)
 */

// Negative lookahead to prevent common English words from being captured as names.
// Without this, "I'm in full support" extracts "in", "I'm so happy" extracts "so", etc.
const NON_NAME_LOOKAHEAD = '(?!(?:in|on|at|to|by|of|or|an|as|if|so|no|up|me|we|he|us|it|my|am|is|be|do|go|not|but|yet|nor|for|and|the|oh|ok|ah|um|uh|all|too|now|out|off|own|its|has|had|was|are|her|his|our|who|how|why|can|did|got|get|let|say|see|may|way|old|new|big|few|far|ago|run|put|set|try|ask|use|lot|bit|per|via|yes|here|very|just|also|going|trying|from|with|one|two|sure|glad|happy|sorry|back|well|still|over|only|like|more|than|into|been|have|will|done|really|truly|actually|currently|honestly|running|looking|hoping|feeling|speaking|working|living|studying|coming|based|born|originally)\\b)';

export const STRONG_SELF_ID_PATTERNS = [
  // "My name is Colin Scott" - captures proper names (Colin Scott)
  // Also handles initials/nicknames: "JJ", "jj", "DJ"
  new RegExp(`\\b(?:my name is|My name is|MY NAME IS)\\s+${NON_NAME_LOOKAHEAD}([A-Z]{2,}|[a-z]{2,}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})(?:\\s|[.,!?]|$)`),

  // "I'm Colin Scott" or "I am Colin Scott"
  // Requires capitalization OR all-caps/all-lowercase for initials (JJ, jj, DJ, etc.)
  new RegExp(`\\bI'?m\\s+${NON_NAME_LOOKAHEAD}([A-Z]{2,}|[a-z]{2,}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})(?:\\s|[.,!?]|$)`),
  new RegExp(`\\bI am\\s+${NON_NAME_LOOKAHEAD}([A-Z]{2,}|[a-z]{2,}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})(?:\\s|[.,!?]|$)`),

  // "This is Colin speaking" or "This is Colin here"
  new RegExp(`\\b(?:this is|This is|THIS IS)\\s+${NON_NAME_LOOKAHEAD}([A-Z]{2,}|[a-z]{2,}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s+(?:speaking|here|Speaking|Here)`),
];

/**
 * Intro handoff patterns for debates (host introducing candidates).
 * Examples: "Next up is Colin", "Moving to Emily", "Thank you, Terry"
 */
export const INTRO_HANDOFF_PATTERNS = [
  /\b(?:next (?:we have|up is|is))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:next)[,\s]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})\b/gi,
  /\b(?:and (?:last|lastly|last but not least),?\s+we have)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:you'?ll move now to|we'?ll move now to|moving now to)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:last but not least)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:please welcome|introducing)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:let's (?:hear from|turn to))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:thank you,?\s+)([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/gi,
  /\b(?:start with|begin with)[.,\s]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})\b/gi,
];

/**
 * Medium-strength handoff patterns (for general use, not just intros).
 */
export const MEDIUM_HANDOFF_PATTERNS = [
  /(?:next|up) (?:is|we have|hear from)\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /turning (?:it )?over to\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /let's hear from\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /start with(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /go ahead(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /moving (?:on )?to\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /and lastly,?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /(?:okay|alright|so)(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})[.,]?$/i,
  /^(?:okay|alright|so)?(?:[.,])?\s*([a-zA-Z][a-zA-Z]+)[.,?]?$/i,
  // Panel-style direct address: "Tony, let's bring you in" / "Tony, how do you see..."
  /\b([A-Z][a-z]{1,15}),\s+(?:let'?s bring|let me bring|how do you|what do you|you'?ve)/i,
  // "with you, NAME" — moderator passes to panel member: "start with you, Amy" / "true with you, Alex"
  /\bwith you,\s+([a-zA-Z][a-zA-Z]{1,14})\b/i,
];

/**
 * Address patterns (thanking previous speaker).
 */
export const MEDIUM_ADDRESS_PATTERNS = [
  /thank(?:s| you),?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /what do you think,?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
];

/**
 * Title-based direct address at the start of a segment.
 * "Prime Minister, where does this podcast find you?" → speaker is NOT the PM.
 * When matched, the current segment's speaker is the host/interviewer addressing a titled guest.
 * The NEXT segment is typically the titled person's response.
 */
export const TITLE_ADDRESS_PATTERNS: RegExp[] = [
  /^(?:Prime\s+Minister|President|Senator|Governor|Minister|Dr\.?|Doctor|Professor|Chancellor|Secretary)[,\s]/i,
];

/**
 * Weak indirect reference patterns ("as Colin mentioned").
 */
export const WEAK_INDIRECT_PATTERNS = [
  /as\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+(?:said|mentioned|noted|pointed out)/i,
  /like\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+(?:was saying|said)/i,
  /([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})(?:'s|s) point about/i,
];
