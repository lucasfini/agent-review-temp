// AI-powered name extraction from podcast transcriptions
import OpenAI from 'openai';
import { SpeakerSegment, DetectedSpeaker } from './speaker-detection';

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
}

/**
 * Extract speaker names from transcription using enhanced AI with multiple passes
 */
export async function extractSpeakerNames(
  transcriptionText: string,
  speakers: Record<string, DetectedSpeaker>
): Promise<Record<string, NamedSpeaker>> {
  console.log(`[NAME EXTRACTION] Starting enhanced name extraction for ${Object.keys(speakers).length} speakers`);
  
  try {
    // Multiple AI passes for better accuracy
    const extractedNames = await multiPassNameExtraction(transcriptionText);
    console.log(`[NAME EXTRACTION] Found ${extractedNames.length} potential names across multiple passes`);
    
    // Enhanced mapping with context analysis
    const namedSpeakers = await enhancedNameMapping(speakers, extractedNames, transcriptionText);
    
    console.log(`[NAME EXTRACTION] Final mapping:`, Object.keys(namedSpeakers).map(id => 
      `${id}: "${namedSpeakers[id].finalName}" (confidence: ${namedSpeakers[id].extractedName?.confidence || 'fallback'})`
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
async function identifyNamesWithAI(transcriptionText: string, strategy: string = 'general'): Promise<ExtractedName[]> {
  // Create OpenAI client only when needed
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  let prompt: string;
  
  switch (strategy) {
    case 'introduction':
      prompt = `
Analyze this podcast/interview transcription and extract speaker names ONLY from self-introductions. Focus on:

1. SELF-introductions ONLY: "I'm [Name]", "My name is [Name]", "I am [Name]"
2. Host self-introductions: "This is [Name] from...", "I'm your host [Name]"

IGNORE these patterns:
- Names mentioned about other people: "John told me...", "I spoke with Sarah..."
- Guest introductions by host: "Today we have [Name]" (this is the host speaking, not the guest)
- References to other people: "Thanks [Name]" (person thanking is the speaker)

Return ONLY a valid JSON array:

[
  {
    "name": "Primary name used",
    "fullName": "Full name if mentioned (optional)",
    "nicknames": ["alternative names"],
    "context": "Self-introduction phrase used",
    "confidence": 0.95
  }
]

Rules:
- Only extract names from SELF-introductions where the speaker identifies themselves
- Ignore all mentions of other people's names
- Rate confidence 0.1-1.0 based on clarity of self-identification
- Return empty array [] if no clear self-introductions found
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.substring(0, 3000)}...`;
      break;
      
    case 'qa_pattern':
      prompt = `
Analyze this conversation transcript for direct address patterns where someone speaks TO another person. Look for:

1. Direct address responses: "Well [Interviewer name], I believe..." (person being addressed is speaking)
2. Response acknowledgments: "Thanks for that question, [Host name]..." (person being addressed is speaking)
3. Conversational responses: "You're right about that, [Name]..." (person being addressed is speaking)

IGNORE these patterns:
- Questions TO others: "[Name], what do you think..." (questioner is speaking, not [Name])
- References ABOUT others: "As [Name] mentioned earlier..." (speaker is mentioning someone else)
- Third-person mentions: "[Name] told me..." (speaker is talking about someone else)

Return ONLY a valid JSON array:

[
  {
    "name": "Primary name used",
    "fullName": "Full name if mentioned (optional)", 
    "nicknames": ["alternative names"],
    "context": "How the speaker addressed the other person",
    "confidence": 0.85
  }
]

Rules:
- Only extract names when the speaker is responding TO or addressing that person
- Ignore names mentioned when speaking ABOUT other people
- Rate confidence based on clarity of direct address
- Return empty array [] if no clear patterns found
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.substring(1500, 4500)}...`;
      break;
      
    default: // general
      prompt = `
Analyze this podcast transcription and extract speaker names from SELF-IDENTIFICATION ONLY. Look for:

1. Self-introductions: "I'm [Name]", "My name is [Name]", "I am [Name]"
2. Self-identification: "This is [Name]", "[Name] here"
3. Host self-identification: "I'm your host [Name]", "Welcome to the show, I'm [Name]"

COMPLETELY IGNORE:
- Names mentioned about other people: "I spoke with John", "Sarah told me"
- Third-person references: "As Mike mentioned", "Thanks to Lisa"
- People being introduced BY others: "Today we have [Name]" (host introducing guest)
- Names in questions TO others: "[Name], what do you think"

Return ONLY a valid JSON array:

[
  {
    "name": "Primary name used",
    "fullName": "Full name if mentioned (optional)",
    "nicknames": ["alternative names", "nicknames"],
    "context": "Self-identification phrase used",
    "confidence": 0.95
  }
]

Rules:
- ONLY extract names when someone identifies THEMSELVES
- Completely ignore all other name mentions
- Rate confidence from 0.1 to 1.0 based on clarity of self-identification
- Return empty array [] if no clear self-identifications found
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.substring(0, 4000)}...`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { 
        role: 'system', 
        content: 'You are a name extraction specialist. Return only valid JSON arrays, no explanations.' 
      },
      { 
        role: 'user', 
        content: prompt 
      }
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  try {
    const content = response?.choices[0]?.message?.content || '[]';
    console.log(`[NAME EXTRACTION] Raw AI ${strategy} response:`, content.substring(0, 200) + '...');
    
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
    
    // Convert to ExtractedName format and add timing
    return extractedNames.map((name, index) => ({
      name: name.name || `Unknown ${index + 1}`,
      fullName: name.fullName || name.name,
      nicknames: Array.isArray(name.nicknames) ? name.nicknames : [],
      firstMentionTime: 0, // Will be calculated later
      confidence: typeof name.confidence === 'number' ? name.confidence : 0.7,
      context: name.context || `Mentioned in transcription (${strategy})`
    }));
    
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
  
  // Look for quoted names in the response
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
  if (namedSpeaker.extractedName) {
    return namedSpeaker.extractedName.name;
  }
  return namedSpeaker.finalName;
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
 * Multi-pass name extraction for better accuracy
 */
async function multiPassNameExtraction(transcriptionText: string): Promise<ExtractedName[]> {
  const allNames: ExtractedName[] = [];
  
  // Pass 1: General name extraction
  try {
    console.log('[NAME EXTRACTION] Pass 1: General name extraction');
    const generalNames = await identifyNamesWithAI(transcriptionText, 'general');
    allNames.push(...generalNames);
  } catch (error) {
    console.warn('[NAME EXTRACTION] Pass 1 failed:', error);
  }
  
  // Pass 2: Introduction-focused extraction
  try {
    console.log('[NAME EXTRACTION] Pass 2: Introduction-focused extraction');
    const introNames = await identifyNamesWithAI(transcriptionText, 'introduction');
    allNames.push(...introNames);
  } catch (error) {
    console.warn('[NAME EXTRACTION] Pass 2 failed:', error);
  }
  
  // Pass 3: Question/answer pattern extraction
  try {
    console.log('[NAME EXTRACTION] Pass 3: Q&A pattern extraction');
    const qaNames = await identifyNamesWithAI(transcriptionText, 'qa_pattern');
    allNames.push(...qaNames);
  } catch (error) {
    console.warn('[NAME EXTRACTION] Pass 3 failed:', error);
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
 * Generate better fallback names based on speaker characteristics
 */
function generateFallbackName(speaker: DetectedSpeaker, index: number, totalSpeakers: number): string {
  // For two speakers, use Host/Guest pattern
  if (totalSpeakers === 2) {
    // Assume longer speaking time = host
    const isLikelyHost = speaker.totalDuration > (speaker.segments.length * 10); // Rough heuristic
    return index === 0 && isLikelyHost ? 'Host' : index === 0 ? 'Guest' : isLikelyHost ? 'Host' : 'Guest';
  }
  
  // For more speakers, use descriptive names
  if (totalSpeakers <= 4) {
    const roles = ['Host', 'Guest', 'Moderator', 'Panelist'];
    return roles[index] || `Speaker ${index + 1}`;
  }
  
  // Fall back to numbered speakers
  return `Speaker ${index + 1}`;
}