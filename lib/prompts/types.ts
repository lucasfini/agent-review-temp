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
}

export interface ResearchLinksVars {
  label: string;
  context: string;
}

export interface ContentGenerationVars {
  projectTitle: string;
  speakerNames: string;
  transcriptionText: string;
  count: number;
}

export interface NarrativeCoverageVars {
  coverageWindow: string;
  maxTopics: number;
  projectTitle: string;
  tier: string;
  goalsText: string;
  transcriptSlice: string;
  summarySnippet?: string;
  MAX_TRANSCRIPT_CHARS: number;
}

export interface SpeakerNameExtractionVars {
  transcriptionText: string;
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
