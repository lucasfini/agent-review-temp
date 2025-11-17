// AI-powered name extraction from podcast transcriptions
// Uses segment-based mapping for accurate speaker attribution
import OpenAI from 'openai';
import { SpeakerSegment, DetectedSpeaker } from './types';
import { getPrompt, getSystemMessage, prompts } from '@/lib/prompts/loader';
import type { SpeakerNameExtractionVars } from '@/lib/prompts/types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface ExtractedName {
  name: string;
  fullName?: string;
  nicknames: string[];
  firstMentionTime: number;
  confidence: number;
  context: string;
}

export interface NamedSpeaker extends DetectedSpeaker {
  extractedName: ExtractedName | null;
  finalName: string;
  role?: string;
  roleConfidence?: number;
  roleSummary?: string;
  roleEvidence?: string[];
  autoRoleAssigned?: boolean;
  customName?: string;
}

/**
 * Extract speaker names using segment-based mapping for accurate attribution
 *
 * NEW APPROACH: Uses speaker segment data directly instead of text position estimation
 * This ensures names are correctly mapped to the speaker who actually said them
 */
export async function extractSpeakerNames(
  transcriptionText: string,
  speakers: Record<string, DetectedSpeaker>,
  speakerSegments: SpeakerSegment[],
  options?: {
    userId?: string;
    projectId?: string;
  }
): Promise<Record<string, NamedSpeaker>> {
  console.log(`[NAME EXTRACTION] Starting segment-based name extraction for ${Object.keys(speakers).length} speakers`);
  console.log(`[NAME EXTRACTION] Analyzing ${speakerSegments.length} speaker segments`);

  try {
    // NEW: Extract names directly from segments (no text position estimation!)
    const segmentNames = await extractNamesFromSegments(speakerSegments, transcriptionText, options);

    // Map segment names to speakers
    const namedSpeakers: Record<string, NamedSpeaker> = {};
    const speakerIds = Object.keys(speakers).sort();

    speakerIds.forEach((id, index) => {
      const speaker = speakers[id];
      const extractedName = segmentNames.get(id);

      namedSpeakers[id] = {
        ...speaker,
        extractedName: extractedName || null,
        finalName: extractedName?.name || generateFallbackName(speaker, index, speakerIds.length)
      };
    });

    console.log(`[NAME EXTRACTION] Final mapping:`, Object.keys(namedSpeakers).map(id =>
      `${id}: "${namedSpeakers[id].finalName}" ${namedSpeakers[id].extractedName ? `(confidence: ${namedSpeakers[id].extractedName?.confidence})` : '(fallback)'}`
    ));

    return namedSpeakers;
  } catch (error) {
    console.error('[NAME EXTRACTION] Error extracting speaker names:', error);

    // Enhanced fallback with better default names
    const result: Record<string, NamedSpeaker> = {};
    const speakerIds = Object.keys(speakers).sort();

    speakerIds.forEach((id, index) => {
      const speaker = speakers[id];
      const fallbackName = generateFallbackName(speaker, index, speakerIds.length);

      result[id] = {
        ...speaker,
        extractedName: null,
        finalName: fallbackName
      };
    });

    console.log(`[NAME EXTRACTION] Using fallback names:`, Object.keys(result).map(id =>
      `${id}: "${result[id].finalName}"`
    ));

    return result;
  }
}

/**
 * Use OpenAI to identify names mentioned in the transcription
 */
async function identifyNamesWithAI(
  transcriptionText: string,
  strategy: string = 'general',
  options?: {
    userId?: string;
    projectId?: string;
  }
): Promise<ExtractedName[]> {
  // Create OpenAI client only when needed
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Get config for speaker name extraction
  const config = prompts.audioRepurpose.speakerNameExtraction;

  // Map strategy names to config keys
  const strategyMap: Record<string, keyof typeof config.strategies> = {
    'general': 'general',
    'introduction': 'introductionFocused',
    'qa_pattern': 'qaPattern'
  };

  const configKey = strategyMap[strategy] || 'general';
  const strategyConfig = config.strategies[configKey];

  // Build template variables
  const vars: SpeakerNameExtractionVars = {
    transcriptionText
  };

  // Get prompt using config loader (note: system message is separate in config)
  const systemMessage = strategyConfig.system;
  const { prompt } = getPrompt(
    ['audioRepurpose', 'speakerNameExtraction', 'strategies', configKey],
    vars
  );

  const response = await openai.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: systemMessage
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: config.temperature,
    max_tokens: config.max_tokens,
  });

  // Track usage and billing (don't throw on billing errors)
  if (options?.userId) {
    try {
      await trackOpenAIUsage({
        userId: options.userId,
        projectId: options.projectId,
        response,
        modelName: config.model,
        purpose: `Name Extraction (${strategy})`,
        metadata: {
          strategy,
          transcriptLength: transcriptionText.length,
        },
        shouldDebit: false, // Don't debit yet - will batch later
      });
    } catch (billingError) {
      console.error('[NAME EXTRACTION] Billing tracking failed:', billingError);
      // Continue processing even if billing fails
    }
  }

  try {
    let content = response?.choices[0]?.message?.content || '[]';
    console.log(`[NAME EXTRACTION] Raw AI ${strategy} response:`, content.substring(0, 200) + '...');

    // Strip markdown code blocks if present
    if (content.trim().startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
    }

    // Enhanced JSON extraction with better error handling
    let jsonContent = '';

    // Strategy 1: Try to extract complete JSON array
    const fullArrayMatch = content.match(/\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g);
    if (fullArrayMatch) {
      jsonContent = fullArrayMatch[0];
    } else {
      // Strategy 2: Look for JSON-like structure between brackets
      const bracketMatch = content.match(/\[([\s\S]*?)\]/);
      if (bracketMatch) {
        let innerContent = bracketMatch[1].trim();
        
        // Clean up common AI response issues
        innerContent = innerContent
          .replace(/,\s*}/g, '}')  // Remove trailing commas before }
          .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
          .replace(/}\s*{/g, '}, {')  // Add commas between objects
          .replace(/"\s*\n\s*"/g, '", "')  // Fix broken string quotes across lines
          .replace(/"\s*:\s*"([^"]*?)"\s*([}\],])/g, '": "$1"$2');  // Fix quote issues
        
        // Ensure proper object separation
        if (innerContent && !innerContent.trim().startsWith('{')) {
          innerContent = '{' + innerContent;
        }
        if (innerContent && !innerContent.trim().endsWith('}')) {
          innerContent = innerContent + '}';
        }
        
        jsonContent = '[' + innerContent + ']';
      } else {
        jsonContent = '[]';
      }
    }
    
    console.log(`[NAME EXTRACTION] Cleaned JSON for ${strategy}:`, jsonContent);

    const extractedNames: any[] = JSON.parse(jsonContent);

    // Handle both formats:
    // New format (general strategy): ["First Last", "First Last"]
    // Old format (intro/qa strategies): [{ name: "...", fullName: "...", ... }]
    return extractedNames.map((name, index) => {
      // New format: simple string
      if (typeof name === 'string') {
        return {
          name: name.trim(),
          fullName: name.trim(),
          nicknames: [],
          firstMentionTime: 0,
          confidence: 0.9, // High confidence for new prompt format
          context: `Mentioned in transcription (${strategy})`
        };
      }

      // Old format: object with properties
      return {
        name: name.name || `Unknown ${index + 1}`,
        fullName: name.fullName || name.name,
        nicknames: Array.isArray(name.nicknames) ? name.nicknames : [],
        firstMentionTime: 0,
        confidence: typeof name.confidence === 'number' ? name.confidence : 0.7,
        context: name.context || `Mentioned in transcription (${strategy})`
      };
    });
    
  } catch (parseError) {
    console.error(`[NAME EXTRACTION] Failed to parse AI ${strategy} response:`, parseError);
    console.log(`[NAME EXTRACTION] AI response content:`, response?.choices[0]?.message?.content);
    
    // Fallback: Manual name extraction from response text
    const content = response?.choices[0]?.message?.content || '';
    const fallbackNames = extractNamesFromText(content, strategy);
    
    if (fallbackNames.length > 0) {
      console.log(`[NAME EXTRACTION] Fallback extraction found ${fallbackNames.length} names for ${strategy}`);
      return fallbackNames;
    }
    
    return [];
  }
}

/**
 * Fallback name extraction from AI response text when JSON parsing fails
 */
function extractNamesFromText(content: string, strategy: string): ExtractedName[] {
  const names: ExtractedName[] = [];

  // Try to extract from simple string array format first: ["Name", "Name"]
  const simpleArrayPattern = /\[\s*"([^"]+)"\s*(?:,\s*"([^"]+)"\s*)*\]/;
  const arrayMatch = content.match(simpleArrayPattern);
  if (arrayMatch) {
    const quotedNames = content.match(/"([^"]+)"/g);
    if (quotedNames) {
      quotedNames.forEach(quoted => {
        const name = quoted.replace(/"/g, '').trim();
        if (name && name.length > 1 && /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(name)) {
          names.push({
            name: name,
            fullName: name,
            nicknames: [],
            firstMentionTime: 0,
            confidence: 0.7,
            context: `Extracted from ${strategy} response text`
          });
        }
      });
      if (names.length > 0) return names;
    }
  }

  // Look for quoted names in old object format
  const namePattern = /"name":\s*"([^"]+)"/gi;
  const matches: RegExpMatchArray[] = [];
  let match;
  while ((match = namePattern.exec(content)) !== null) {
    matches.push(match);
  }

  matches.forEach((match, index) => {
    const name = match[1].trim();
    if (name && name.length > 1 && name !== 'Unknown') {
      names.push({
        name: name,
        fullName: name,
        nicknames: [],
        firstMentionTime: 0,
        confidence: 0.6, // Lower confidence for fallback extraction
        context: `Extracted from ${strategy} response text`
      });
    }
  });
  
  // If no names found, try looking for common self-introduction patterns
  if (names.length === 0) {
    const introPatterns = [
      /I'm ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /My name is ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /This is ([A-Z][a-z]+ [A-Z][a-z]+)/g
    ];
    
    for (const pattern of introPatterns) {
      const matches: RegExpMatchArray[] = [];
      let match;
      while ((match = pattern.exec(content)) !== null) {
        matches.push(match);
      }
      matches.forEach(match => {
        const name = match[1].trim();
        if (name && !names.some(n => n.name === name)) {
          names.push({
            name: name,
            fullName: name,
            nicknames: [],
            firstMentionTime: 0,
            confidence: 0.7,
            context: `Pattern extraction from ${strategy}`
          });
        }
      });
    }
  }
  
  return names;
}

/**
 * Map extracted names to specific speakers based on timing and context
 */
async function mapNamesToSpeakers(
  speakers: Record<string, DetectedSpeaker>,
  extractedNames: ExtractedName[],
  transcriptionText: string
): Promise<Record<string, NamedSpeaker>> {
  const namedSpeakers: Record<string, NamedSpeaker> = {};
  
  // Convert speakers to named speakers initially
  Object.entries(speakers).forEach(([id, speaker]) => {
    namedSpeakers[id] = {
      ...speaker,
      extractedName: null,
      finalName: speaker.id
    };
  });
  
  if (extractedNames.length === 0) {
    return namedSpeakers;
  }
  
  // For each extracted name, find timing and map to speakers
  for (const extractedName of extractedNames) {
    try {
      // Find when this name is first mentioned in the text
      const namePattern = new RegExp(`\\b${extractedName.name}\\b`, 'i');
      const match = transcriptionText.match(namePattern);
      
      if (match) {
        // Estimate timing based on text position (rough approximation)
        const textPosition = match.index || 0;
        const estimatedTime = (textPosition / transcriptionText.length) * getTotalDuration(speakers);
        
        extractedName.firstMentionTime = estimatedTime;
        
        // Find the speaker most likely to be this person
        const matchedSpeaker = findBestSpeakerMatch(speakers, extractedName, estimatedTime);
        
        if (matchedSpeaker) {
          namedSpeakers[matchedSpeaker.id].extractedName = extractedName;
          namedSpeakers[matchedSpeaker.id].finalName = extractedName.name;
        }
      }
    } catch (error) {
      console.error('Error mapping name to speaker:', error);
    }
  }
  
  // If we have exactly 2 speakers and 2 names, do smart mapping
  const speakerIds = Object.keys(speakers);
  if (speakerIds.length === 2 && extractedNames.length >= 2) {
    namedSpeakers[speakerIds[0]].finalName = extractedNames[0].name;
    namedSpeakers[speakerIds[0]].extractedName = extractedNames[0];
    
    namedSpeakers[speakerIds[1]].finalName = extractedNames[1].name;
    namedSpeakers[speakerIds[1]].extractedName = extractedNames[1];
  }
  
  return namedSpeakers;
}

/**
 * Find the best speaker match for an extracted name based on timing
 */
function findBestSpeakerMatch(
  speakers: Record<string, DetectedSpeaker>,
  extractedName: ExtractedName,
  estimatedTime: number
): DetectedSpeaker | null {
  let bestMatch: DetectedSpeaker | null = null;
  let closestDistance = Infinity;
  
  Object.values(speakers).forEach(speaker => {
    // Find the segment closest to when the name was mentioned
    speaker.segments.forEach(segment => {
      const segmentMidpoint = (segment.startTime + segment.endTime) / 2;
      const distance = Math.abs(segmentMidpoint - estimatedTime);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        bestMatch = speaker;
      }
    });
  });
  
  return bestMatch;
}

/**
 * Calculate total duration of all speakers
 */
function getTotalDuration(speakers: Record<string, DetectedSpeaker>): number {
  return Math.max(...Object.values(speakers).map(speaker => 
    Math.max(...speaker.segments.map(segment => segment.endTime))
  ));
}

/**
 * Get the display name for a speaker, preferring extracted names
 */
export function getSpeakerDisplayName(namedSpeaker: NamedSpeaker): string {
  if (namedSpeaker.customName && namedSpeaker.customName.trim().length > 0) {
    return namedSpeaker.customName.trim();
  }
  if (namedSpeaker.extractedName) {
    return namedSpeaker.extractedName.name;
  }
  if (namedSpeaker.finalName) {
    return namedSpeaker.finalName;
  }
  // Fallback for edge cases where finalName is missing
  if (namedSpeaker.fallbackName) {
    return namedSpeaker.fallbackName;
  }
  return `Speaker ${namedSpeaker.id}`;
}

/**
 * Generate speaker colors for UI display
 */
export function getSpeakerColor(speakerId: string): string {
  const colors = [
    'text-blue-600 bg-blue-50',
    'text-green-600 bg-green-50', 
    'text-purple-600 bg-purple-50',
    'text-orange-600 bg-orange-50',
    'text-pink-600 bg-pink-50',
    'text-indigo-600 bg-indigo-50'
  ];
  
  // Generate consistent color based on speaker ID
  const hash = speakerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * Extract speaker names directly from speaker segments (NEW APPROACH)
 * This uses segment data with accurate speaker IDs instead of text position estimation
 */
async function extractNamesFromSegments(
  speakerSegments: SpeakerSegment[],
  transcriptionText: string,
  options?: {
    userId?: string;
    projectId?: string;
  }
): Promise<Map<string, ExtractedName>> {
  const speakerNames = new Map<string, ExtractedName>();

  console.log(`[NAME EXTRACTION] Analyzing ${speakerSegments.length} segments for self-introductions`);

  // Self-introduction patterns with confidence scores
  // NOTE: No /i flag - requires actual capitalized names only
  const selfIntroPatterns = [
    { pattern: /\bmy name (?:is|'s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/, confidence: 0.98, type: 'self' },
    { pattern: /\bI'?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/, confidence: 0.95, type: 'self' },
    { pattern: /\bI am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/, confidence: 0.90, type: 'self' },
    { pattern: /\bthis is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|from|speaking|and)\b/, confidence: 0.92, type: 'self' },
    { pattern: /\byou'?re listening to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/, confidence: 0.88, type: 'self' },
    { pattern: /\byour host\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/, confidence: 0.85, type: 'self' },
  ];

  // Guest introduction patterns (host introducing someone else)
  // These names should be mapped to OTHER speakers, not the current speaker
  const guestIntroPatterns = [
    { pattern: /\b(?:joined|join|joining)\s+(?:once again\s+)?by\s+(?:my friend\s+)?(?:[^,]+,\s+)*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/, confidence: 0.90, type: 'guest' },
    { pattern: /\bwith (?:me|us)\s+(?:is|today)\s+(?:[^,]+,\s+)*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/, confidence: 0.90, type: 'guest' },
    { pattern: /\b(?:today|here)\s+(?:we have|I have)\s+(?:[^,]+,\s+)*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/, confidence: 0.88, type: 'guest' },
    { pattern: /\bwelcome(?:,|\s+to\s+the\s+show)?\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b/, confidence: 0.85, type: 'guest' },
  ];

  // Anti-patterns (should NOT be considered self-introductions)
  const antiPatterns = [
    /\b(?:today|here|now) (?:we have|with)\s+[A-Z][a-z]+/i,  // "today we have John"
    /\b(?:thanks|thank you)\s+[A-Z][a-z]+/i,                 // "thanks John"
    /\b(?:welcome)\s+[A-Z][a-z]+/i,                          // "welcome Sarah"
    /\b(?:I'?m|I am)\s+(?:not|never|still|also|just|always|really|very|so|too)\b/i,  // "I'm not...", "I am never..."
  ];

  // Common words that should NOT be names
  const commonWords = [
    'not', 'never', 'trying', 'going', 'coming', 'looking', 'making', 'taking',
    'working', 'getting', 'doing', 'being', 'having', 'saying', 'thinking',
    'really', 'very', 'quite', 'pretty', 'still', 'always', 'just', 'also'
  ];

  // Titles and roles that should NOT be extracted as names
  const titlesAndRoles = [
    'host', 'co-host', 'cohost', 'guest', 'moderator', 'panelist',
    'commentator', 'analyst', 'expert', 'journalist', 'reporter', 'correspondent',
    'lawyer', 'attorney', 'doctor', 'professor', 'teacher', 'instructor',
    'author', 'writer', 'blogger', 'podcaster', 'youtuber', 'influencer',
    'entrepreneur', 'founder', 'ceo', 'executive', 'director', 'manager',
    'political', 'sensation', 'friend', 'colleague', 'partner'
  ];

  // Helper function to validate extracted names
  const isValidName = (name: string, commonWords: string[], titlesAndRoles: string[]): boolean => {
    // Validate name (basic sanity check)
    if (name.length < 2 || name.length > 50) return false;

    // Ensure first character is actually uppercase (proper noun)
    if (!/^[A-Z]/.test(name)) {
      console.log(`[NAME EXTRACTION] Rejected "${name}" - not capitalized`);
      return false;
    }

    // Reject common words that are not names
    const nameLower = name.toLowerCase();
    if (commonWords.some(word => nameLower.includes(word))) {
      console.log(`[NAME EXTRACTION] Rejected "${name}" - contains common word`);
      return false;
    }

    // Reject titles and roles (e.g., "political commentator" should not be a name)
    const nameWords = nameLower.split(/\s+/);
    if (titlesAndRoles.some(title => nameWords.includes(title))) {
      console.log(`[NAME EXTRACTION] Rejected "${name}" - contains title/role word`);
      return false;
    }

    // Reject if contains non-letter characters (except spaces and hyphens)
    if (!/^[A-Za-z\s-]+$/.test(name)) {
      console.log(`[NAME EXTRACTION] Rejected "${name}" - invalid characters`);
      return false;
    }

    return true;
  };

  // Track guest names that need to be mapped to other speakers
  const guestNameCandidates: Array<{ name: string; introducerSpeakerId: string; segmentIndex: number; confidence: number; context: string }> = [];

  // Check each segment for self-introductions and guest introductions
  for (let i = 0; i < speakerSegments.length; i++) {
    const segment = speakerSegments[i];
    const segmentText = segment.text.trim();

    // Skip very short segments
    if (segmentText.length < 10) continue;

    // Check anti-patterns first (but not for guest introductions)
    const hasAntiPattern = antiPatterns.some(pattern => pattern.test(segmentText));

    // Check SELF-introduction patterns
    if (!hasAntiPattern) {
      for (const { pattern, confidence, type } of selfIntroPatterns) {
        const match = segmentText.match(pattern);
        if (match) {
          const name = match[1].trim();
          const speakerId = segment.speakerId;

          // Validate name
          if (!isValidName(name, commonWords, titlesAndRoles)) continue;

          // Only store if this speaker doesn't have a name yet, or this is higher confidence
          const existing = speakerNames.get(speakerId);
          if (!existing || confidence > existing.confidence) {
            speakerNames.set(speakerId, {
              name,
              fullName: name,
              nicknames: [],
              firstMentionTime: segment.startTime,
              confidence,
              context: segmentText.substring(0, 150)
            });

            console.log(`[NAME EXTRACTION] Self-intro: "${speakerId}" → "${name}" (confidence: ${confidence}) from: "${segmentText.substring(0, 80)}..."`);
          }

          // Don't check other patterns for this segment
          break;
        }
      }
    }

    // Check GUEST introduction patterns (host introducing someone else)
    for (const { pattern, confidence, type } of guestIntroPatterns) {
      const match = segmentText.match(pattern);
      if (match) {
        const name = match[1].trim();
        const introducerSpeakerId = segment.speakerId;

        // Validate name
        if (!isValidName(name, commonWords, titlesAndRoles)) continue;

        // Store as guest candidate (will be mapped to another speaker later)
        guestNameCandidates.push({
          name,
          introducerSpeakerId,
          segmentIndex: i,
          confidence,
          context: segmentText.substring(0, 150)
        });

        console.log(`[NAME EXTRACTION] Guest intro: Host "${introducerSpeakerId}" introduces guest "${name}" at segment ${i}`);
        break;
      }
    }
  }

  // Map guest names to other speakers (not the introducer)
  for (const guest of guestNameCandidates) {
    // Find the next speaker after the introduction (likely the guest responding)
    let guestSpeakerId: string | null = null;

    // Look at the next few segments to find a different speaker
    for (let i = guest.segmentIndex + 1; i < Math.min(guest.segmentIndex + 5, speakerSegments.length); i++) {
      const nextSegment = speakerSegments[i];
      if (nextSegment.speakerId !== guest.introducerSpeakerId) {
        guestSpeakerId = nextSegment.speakerId;
        break;
      }
    }

    // If no speaker found after, look before
    if (!guestSpeakerId) {
      for (let i = guest.segmentIndex - 1; i >= Math.max(0, guest.segmentIndex - 3); i--) {
        const prevSegment = speakerSegments[i];
        if (prevSegment.speakerId !== guest.introducerSpeakerId) {
          guestSpeakerId = prevSegment.speakerId;
          break;
        }
      }
    }

    // Assign guest name to the identified speaker
    if (guestSpeakerId && !speakerNames.has(guestSpeakerId)) {
      speakerNames.set(guestSpeakerId, {
        name: guest.name,
        fullName: guest.name,
        nicknames: [],
        firstMentionTime: speakerSegments[guest.segmentIndex].startTime,
        confidence: guest.confidence,
        context: guest.context
      });

      console.log(`[NAME EXTRACTION] Guest mapping: "${guestSpeakerId}" → "${guest.name}" (introduced by "${guest.introducerSpeakerId}")`);
    }
  }

  console.log(`[NAME EXTRACTION] Pattern matching found ${speakerNames.size} names`);

  // If we didn't find enough names via pattern matching, fall back to AI extraction
  const uniqueSpeakers = new Set(speakerSegments.map(s => s.speakerId)).size;
  if (speakerNames.size < Math.min(2, uniqueSpeakers)) {
    console.log('[NAME EXTRACTION] Pattern matching found insufficient names, using AI fallback...');

    try {
      const aiNames = await multiPassNameExtraction(transcriptionText, options);

      // Map AI-extracted names to segments (but still use segment data, not text position!)
      for (const aiName of aiNames) {
        const matchedSegment = findSegmentContainingName(speakerSegments, aiName.name);
        if (matchedSegment && !speakerNames.has(matchedSegment.speakerId)) {
          speakerNames.set(matchedSegment.speakerId, {
            ...aiName,
            firstMentionTime: matchedSegment.startTime,
            context: matchedSegment.text.substring(0, 150)
          });

          console.log(`[NAME EXTRACTION] AI match: "${matchedSegment.speakerId}" → "${aiName.name}" from segment`);
        }
      }
    } catch (error) {
      console.warn('[NAME EXTRACTION] AI fallback failed:', error);
    }
  }

  return speakerNames;
}

/**
 * Find the segment where a name is first mentioned (for AI-extracted names)
 * This ensures even AI-extracted names use segment data for mapping
 */
function findSegmentContainingName(
  segments: SpeakerSegment[],
  name: string
): SpeakerSegment | null {
  const namePattern = new RegExp(`\\b${name}\\b`, 'i');

  // Look for self-introduction patterns first
  const selfIntroPattern = new RegExp(`\\b(?:I'?m|my name is|I am)\\s+${name}\\b`, 'i');

  for (const segment of segments) {
    if (selfIntroPattern.test(segment.text)) {
      return segment;
    }
  }

  // Fall back to any mention
  for (const segment of segments) {
    if (namePattern.test(segment.text)) {
      return segment;
    }
  }

  return null;
}

/**
 * Multi-pass name extraction for better accuracy
 */
async function multiPassNameExtraction(
  transcriptionText: string,
  options?: {
    userId?: string;
    projectId?: string;
  }
): Promise<ExtractedName[]> {
  const allNames: ExtractedName[] = [];

  // Pass 1: General name extraction
  const MIN_UNIQUE_NAMES = 2;
  const pushNamesFromPass = async (label: string, strategy: string) => {
    try {
      console.log(`[NAME EXTRACTION] ${label}`);
      const names = await identifyNamesWithAI(transcriptionText, strategy, options);
      allNames.push(...names);
    } catch (error) {
      console.warn(`[NAME EXTRACTION] ${label} failed:`, error);
    }
  };

  await pushNamesFromPass('Pass 1: General name extraction', 'general');

  if (countUniqueNames(allNames) < MIN_UNIQUE_NAMES) {
    await pushNamesFromPass('Pass 2: Introduction-focused extraction', 'introduction');
  } else {
    console.log('[NAME EXTRACTION] Skipping introduction pass (enough names found).');
  }
  
  if (countUniqueNames(allNames) < MIN_UNIQUE_NAMES) {
    await pushNamesFromPass('Pass 3: Q&A pattern extraction', 'qa_pattern');
  } else {
    console.log('[NAME EXTRACTION] Skipping Q&A pass (enough names found).');
  }
  
  // Deduplicate and merge names
  return deduplicateNames(allNames);
}


/**
 * Deduplicate and merge similar names from multiple passes
 */
function deduplicateNames(names: ExtractedName[]): ExtractedName[] {
  if (names.length === 0) return names;
  
  const uniqueNames: ExtractedName[] = [];
  
  for (const name of names) {
    // Check if this name already exists (case-insensitive)
    const existing = uniqueNames.find(existing => 
      existing.name.toLowerCase() === name.name.toLowerCase() ||
      existing.fullName?.toLowerCase() === name.name.toLowerCase() ||
      existing.nicknames.some(nick => nick.toLowerCase() === name.name.toLowerCase())
    );
    
    if (existing) {
      // Merge information and use higher confidence
      if (name.confidence > existing.confidence) {
        existing.name = name.name;
        existing.confidence = name.confidence;
      }
      
      // Merge nicknames
      name.nicknames.forEach(nick => {
        if (!existing.nicknames.includes(nick)) {
          existing.nicknames.push(nick);
        }
      });
      
      // Update context with more information
      if (name.context && !existing.context.includes(name.context)) {
        existing.context += ` | ${name.context}`;
      }
    } else {
      uniqueNames.push({ ...name });
    }
  }
  
  console.log(`[NAME EXTRACTION] Deduplicated ${names.length} names to ${uniqueNames.length} unique names`);
  return uniqueNames;
}

function countUniqueNames(names: ExtractedName[]): number {
  const unique = new Set(names.map((name) => name.name.toLowerCase()));
  return unique.size;
}

/**
 * Enhanced name mapping with better speaker assignment
 */
async function enhancedNameMapping(
  speakers: Record<string, DetectedSpeaker>,
  extractedNames: ExtractedName[],
  transcriptionText: string
): Promise<Record<string, NamedSpeaker>> {
  const namedSpeakers: Record<string, NamedSpeaker> = {};
  const speakerIds = Object.keys(speakers);
  
  // Initialize all speakers with fallback names
  speakerIds.forEach((id, index) => {
    const speaker = speakers[id];
    namedSpeakers[id] = {
      ...speaker,
      extractedName: null,
      finalName: generateFallbackName(speaker, index, speakerIds.length)
    };
  });
  
  if (extractedNames.length === 0) {
    console.log('[NAME EXTRACTION] No names extracted, using fallback names');
    return namedSpeakers;
  }
  
  // Enhanced mapping strategies
  
  // Strategy 1: Timing-based mapping for names with clear context
  for (const extractedName of extractedNames) {
    if (extractedName.confidence > 0.8) {
      const bestSpeaker = findBestSpeakerByContext(extractedName, speakers, transcriptionText);
      if (bestSpeaker && !namedSpeakers[bestSpeaker.id].extractedName) {
        namedSpeakers[bestSpeaker.id].extractedName = extractedName;
        namedSpeakers[bestSpeaker.id].finalName = extractedName.name;
        console.log(`[NAME EXTRACTION] High-confidence mapping: ${bestSpeaker.id} -> ${extractedName.name}`);
      }
    }
  }
  
  // Strategy 2: Simple assignment for remaining names
  const remainingNames = extractedNames.filter(name => 
    !Object.values(namedSpeakers).some(speaker => speaker.extractedName?.name === name.name)
  );
  
  const unnamedSpeakers = speakerIds.filter(id => !namedSpeakers[id].extractedName);
  
  for (let i = 0; i < Math.min(remainingNames.length, unnamedSpeakers.length); i++) {
    const speakerId = unnamedSpeakers[i];
    const name = remainingNames[i];
    
    namedSpeakers[speakerId].extractedName = name;
    namedSpeakers[speakerId].finalName = name.name;
    console.log(`[NAME EXTRACTION] Remaining assignment: ${speakerId} -> ${name.name}`);
  }
  
  return namedSpeakers;
}

/**
 * Find best speaker match based on context analysis
 */
function findBestSpeakerByContext(
  extractedName: ExtractedName,
  speakers: Record<string, DetectedSpeaker>,
  transcriptionText: string
): DetectedSpeaker | null {
  // Look for the name in the transcription and try to map to speaker timing
  const namePattern = new RegExp(`\\b${extractedName.name}\\b`, 'gi');
  const matches: RegExpMatchArray[] = [];
  let match;
  while ((match = namePattern.exec(transcriptionText)) !== null) {
    matches.push(match);
  }
  
  if (matches.length === 0) return null;
  
  // Find the first clear mention
  const firstMatch = matches[0];
  const textPosition = firstMatch.index || 0;
  
  // Estimate timing based on text position (rough approximation)
  const estimatedTime = (textPosition / transcriptionText.length) * getTotalDuration(speakers);
  
  // Find speaker closest to this time
  return findBestSpeakerMatch(speakers, extractedName, estimatedTime);
}

/**
 * Generate fallback names - try to use descriptive roles, then numbered speakers
 * Preference: Actual Name > Role (e.g., "Political Commentator") > Generic (e.g., "Speaker 1")
 */
function generateFallbackName(speaker: DetectedSpeaker, index: number, totalSpeakers: number): string {
  // Try to extract a role from the speaker's segments
  const role = extractRoleFromSegments(speaker);

  if (role) {
    return role;
  }

  // Fall back to numbered speakers
  return `Speaker ${index + 1}`;
}

/**
 * Try to extract a professional role/title from speaker segments
 * Returns roles like "Political Commentator", "Journalist", "Host", etc.
 */
function extractRoleFromSegments(speaker: DetectedSpeaker): string | null {
  // Common role patterns to look for
  const rolePatterns = [
    /\b(political commentator|political analyst)\b/i,
    /\b(commentator|analyst|expert)\b/i,
    /\b(journalist|reporter|correspondent)\b/i,
    /\b(lawyer|attorney)\b/i,
    /\b(host|co-host|moderator)\b/i,
    /\b(doctor|professor|teacher)\b/i,
    /\b(author|writer)\b/i,
    /\b(entrepreneur|founder|ceo)\b/i,
  ];

  // Search through the speaker's segments
  for (const segment of speaker.segments) {
    const text = segment.text;

    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Capitalize properly (e.g., "political commentator" -> "Political Commentator")
        const role = match[1]
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');

        return role;
      }
    }
  }

  return null;
}
