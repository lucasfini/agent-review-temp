/**
 * TypeScript types for AI prompts configuration
 * Auto-generated from config/prompts.json
 */

export interface PromptConfig {
  id: string;
  model: string;
  temperature: number;
  max_tokens: number;
  prompt: string;
  system?: string;
  params?: Record<string, any>;
  response_format?: { type: 'json_object' | 'text' };
}

export interface ContentGenerationPrompt {
  id: string;
  instructions: string;
}

export interface NameExtractionStrategy {
  system: string;
  prompt: string;
}

export interface PromptsConfig {
  audioRepurpose: {
    insightExtraction: PromptConfig & {
      params: {
        maxTranscriptChars: number;
        targetInsightCountRange: [number, number];
      };
    };
    researchLinks: {
      person: PromptConfig & {
        params: {
          recency: string;
          return_citations: boolean;
        };
      };
      concept: PromptConfig & {
        params: {
          recency: string;
          return_citations: boolean;
        };
      };
    };
    contentGeneration: {
      baseContext: PromptConfig;
      twitterThreads: ContentGenerationPrompt;
      linkedInPosts: ContentGenerationPrompt;
      instagramCaptions: ContentGenerationPrompt;
      blogPost: ContentGenerationPrompt;
      emailNewsletter: ContentGenerationPrompt;
      showNotes: ContentGenerationPrompt;
      quoteGraphics: ContentGenerationPrompt;
    };
    narrativeCoverage: PromptConfig;
    speakerNameExtraction: {
      id: string;
      model: string;
      temperature: number;
      max_tokens: number;
      strategies: {
        general: NameExtractionStrategy;
        introductionFocused: NameExtractionStrategy;
        qaPattern: NameExtractionStrategy;
      };
    };
    speakerRoleClassification: PromptConfig;
  };
}

// Template variable substitution types
export type TemplateVars = Record<string, string | number | boolean>;

export interface InsightExtractionVars {
  titleContext: string;
  speakerContext: string;
  transcript: string;
  [key: string]: string | number | boolean;
}

export interface ResearchLinksVars {
  label: string;
  context: string;
  [key: string]: string | number | boolean;
}

export interface ContentGenerationVars {
  projectTitle: string;
  speakerNames: string;
  transcriptionText: string;
  count: number;
  [key: string]: string | number | boolean;
}

export interface NarrativeCoverageVars {
  coverageWindow: string;
  maxTopics: number;
  projectTitle: string;
  tier: string;
  projectFormat: string;
  goalsText: string;
  transcriptSlice: string;
  summarySection: string;
  MAX_TRANSCRIPT_CHARS: number;
  [key: string]: string | number | boolean;
}

export interface SpeakerNameExtractionVars {
  speakerIds: string[];
  segments: CompactSegment[];
  totalSpeakers: number;
}

export interface CompactSegment {
  speakerId: string;
  time: string; // "0:00-0:15"
  text: string;
}

export interface LLMExtractionResult {
  assignments: LLMAssignment[];
  unassignedNames: Array<{
    name: string;
    reason: 'mentioned_only' | 'show_title' | 'location' | 'unclear_context';
  }>;
}

export interface LLMAssignment {
  speakerId: string;
  name: string;
  confidence: number;
  nameType: 'self_intro' | 'introduced_by_other' | 'direct_address' | 'label_line' | 'uncertain';
  evidence: Array<{
    speakerId: string;
    startTime: number;
    endTime: number;
    text: string;
  }>;
  notes: string;
}

export interface HeuristicResult {
  speakerId: string;
  name: string;
  confidence: number;
  method: 'self_intro' | 'guest_intro' | 'label_line' | 'direct_address';
  evidence: Array<{
    speakerId: string;
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

export interface SpeakerRoleVars {
  summary: {
    id: string;
    duration: number;
    segmentCount: number;
    sample: string;
  };
  transcriptSnippet: string;
}
