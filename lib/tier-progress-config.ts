// Tier-Specific Progress Stage Configuration
// Defines processing stages and progress weights for each performance tier

import { TierLevel } from './tier-config';

export type ProcessingStage =
  | 'pending'
  | 'uploading'
  | 'cancelled'
  | 'transcribing'
  | 'diarization'
  | 'name_extraction'
  | 'summary'
  | 'role_classification'
  | 'chapters'
  | 'takeaways'
  | 'quotes'
  | 'story_angles'
  | 'twitter_thread'
  | 'linkedin_post'
  | 'youtube_description'
  | 'tiktok_script'
  | 'show_notes'
  | 'newsletter'
  | 'blog_post'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ProgressStageDefinition {
  id: ProcessingStage;
  displayName: string;
  icon: string; // lucide-react icon name
  description: string;
  progressStart: number; // Overall progress % when stage starts
  progressEnd: number; // Overall progress % when stage completes
}

// Standard Tier: Core transcription and diarization only
const TRANSCRIPT_STAGES: ProgressStageDefinition[] = [
  {
    id: 'uploading',
    displayName: 'Uploading Audio',
    icon: 'Upload',
    description: 'Uploading your audio file to secure storage...',
    progressStart: 0,
    progressEnd: 10
  },
  {
    id: 'transcribing',
    displayName: 'Transcribing',
    icon: 'FileText',
    description: 'Turning your audio into a transcript...',
    progressStart: 10,
    progressEnd: 60
  },
  {
    id: 'diarization',
    displayName: 'Speaker Detection',
    icon: 'Users',
    description: 'Identifying different speakers in the conversation...',
    progressStart: 60,
    progressEnd: 85
  },
  {
    id: 'finalizing',
    displayName: 'Finalizing',
    icon: 'CheckCircle',
    description: 'Saving your transcription...',
    progressStart: 85,
    progressEnd: 100
  }
];

// Pro Tier: + Name Extraction + AI Summary + Roles + Chapters + Takeaways + Quotes
const CONTENT_KIT_STAGES: ProgressStageDefinition[] = [
  {
    id: 'uploading',
    displayName: 'Uploading Audio',
    icon: 'Upload',
    description: 'Uploading your audio file to secure storage...',
    progressStart: 0,
    progressEnd: 5
  },
  {
    id: 'transcribing',
    displayName: 'Transcribing',
    icon: 'FileText',
    description: 'Turning your audio into a transcript...',
    progressStart: 5,
    progressEnd: 40
  },
  {
    id: 'diarization',
    displayName: 'Speaker Detection',
    icon: 'Users',
    description: 'Identifying different speakers in the conversation...',
    progressStart: 40,
    progressEnd: 55
  },
  {
    id: 'name_extraction',
    displayName: 'Finding Speaker Names',
    icon: 'UserCheck',
    description: 'Matching speakers to the names mentioned in the episode...',
    progressStart: 55,
    progressEnd: 62
  },
  {
    id: 'summary',
    displayName: 'Creating Summary',
    icon: 'FileText',
    description: 'Writing a concise summary of the episode...',
    progressStart: 62,
    progressEnd: 70
  },
  {
    id: 'role_classification',
    displayName: 'Understanding Roles',
    icon: 'Award',
    description: 'Working out who is hosting, co-hosting, or guesting...',
    progressStart: 70,
    progressEnd: 78
  },
  {
    id: 'chapters',
    displayName: 'Building Chapters',
    icon: 'BookOpen',
    description: 'Breaking the episode into clear chapter sections...',
    progressStart: 78,
    progressEnd: 85
  },
  {
    id: 'takeaways',
    displayName: 'Pulling Out Key Takeaways',
    icon: 'Lightbulb',
    description: 'Pulling out the main ideas worth remembering...',
    progressStart: 85,
    progressEnd: 92
  },
  {
    id: 'quotes',
    displayName: 'Finding Shareable Quotes',
    icon: 'Quote',
    description: 'Pulling out strong quotes that are worth sharing...',
    progressStart: 92,
    progressEnd: 97
  },
  {
    id: 'finalizing',
    displayName: 'Finalizing',
    icon: 'CheckCircle',
    description: 'Saving your complete content package...',
    progressStart: 97,
    progressEnd: 100
  }
];

const REPURPOSE_PACK_STAGES: ProgressStageDefinition[] = [
  {
    id: 'uploading',
    displayName: 'Uploading Audio',
    icon: 'Upload',
    description: 'Uploading your audio file to secure storage...',
    progressStart: 0,
    progressEnd: 4
  },
  {
    id: 'transcribing',
    displayName: 'Transcribing',
    icon: 'FileText',
    description: 'Turning your audio into a transcript...',
    progressStart: 4,
    progressEnd: 24
  },
  {
    id: 'diarization',
    displayName: 'Speaker Detection',
    icon: 'Users',
    description: 'Identifying different speakers in the conversation...',
    progressStart: 24,
    progressEnd: 34
  },
  {
    id: 'name_extraction',
    displayName: 'Finding Speaker Names',
    icon: 'UserCheck',
    description: 'Matching speakers to names from the episode...',
    progressStart: 34,
    progressEnd: 40
  },
  {
    id: 'summary',
    displayName: 'Creating Summary',
    icon: 'FileText',
    description: 'Writing a concise summary of the episode...',
    progressStart: 40,
    progressEnd: 46
  },
  {
    id: 'role_classification',
    displayName: 'Understanding Roles',
    icon: 'Award',
    description: 'Working out who is hosting, co-hosting, or guesting...',
    progressStart: 46,
    progressEnd: 52
  },
  {
    id: 'chapters',
    displayName: 'Building Chapters',
    icon: 'BookOpen',
    description: 'Breaking the episode into clear chapter sections...',
    progressStart: 52,
    progressEnd: 58
  },
  {
    id: 'takeaways',
    displayName: 'Pulling Out Key Takeaways',
    icon: 'Lightbulb',
    description: 'Pulling out the main ideas worth remembering...',
    progressStart: 58,
    progressEnd: 64
  },
  {
    id: 'quotes',
    displayName: 'Finding Shareable Quotes',
    icon: 'Quote',
    description: 'Pulling out strong quotes that are worth sharing...',
    progressStart: 64,
    progressEnd: 70
  },
  {
    id: 'story_angles',
    displayName: 'Planning Angles',
    icon: 'Sparkles',
    description: 'Identifying strong hooks for downstream content...',
    progressStart: 70,
    progressEnd: 75
  },
  {
    id: 'twitter_thread',
    displayName: 'Writing X Thread',
    icon: 'Zap',
    description: 'Drafting the thread version of your episode...',
    progressStart: 75,
    progressEnd: 79
  },
  {
    id: 'linkedin_post',
    displayName: 'Writing LinkedIn Post',
    icon: 'Zap',
    description: 'Drafting the LinkedIn version of your episode...',
    progressStart: 79,
    progressEnd: 83
  },
  {
    id: 'youtube_description',
    displayName: 'Writing YouTube Description',
    icon: 'Zap',
    description: 'Packaging the episode for YouTube discovery...',
    progressStart: 83,
    progressEnd: 87
  },
  {
    id: 'tiktok_script',
    displayName: 'Writing Video Script',
    icon: 'Zap',
    description: 'Drafting a short-form script for clips and reels...',
    progressStart: 87,
    progressEnd: 91
  },
  {
    id: 'show_notes',
    displayName: 'Writing Show Notes',
    icon: 'Zap',
    description: 'Turning the episode into polished show notes...',
    progressStart: 91,
    progressEnd: 94
  },
  {
    id: 'newsletter',
    displayName: 'Writing Newsletter',
    icon: 'Zap',
    description: 'Drafting the email newsletter version...',
    progressStart: 94,
    progressEnd: 97
  },
  {
    id: 'blog_post',
    displayName: 'Writing Blog Post',
    icon: 'Zap',
    description: 'Turning the episode into a long-form article...',
    progressStart: 97,
    progressEnd: 99
  },
  {
    id: 'finalizing',
    displayName: 'Finalizing',
    icon: 'CheckCircle',
    description: 'Saving your repurpose pack...',
    progressStart: 99,
    progressEnd: 100
  }
];

/**
 * Get the processing stages for a specific tier
 */
export function getTierStages(tier: TierLevel): ProgressStageDefinition[] {
  switch (tier) {
    case 'transcript':
      return TRANSCRIPT_STAGES;
    case 'content_kit':
      return CONTENT_KIT_STAGES;
    case 'repurpose_pack':
      return REPURPOSE_PACK_STAGES;
    default:
      return CONTENT_KIT_STAGES;
  }
}

/**
 * Get stage definition for a specific stage ID and tier
 */
export function getStageDefinition(
  tier: TierLevel,
  stageId: ProcessingStage
): ProgressStageDefinition | undefined {
  const stages = getTierStages(tier);
  return stages.find((stage) => stage.id === stageId);
}

/**
 * Calculate overall progress percentage based on tier, stage, and stage progress
 */
export function calculateOverallProgress(
  tier: TierLevel,
  currentStage: ProcessingStage,
  stageProgress: number = 0
): number {
  if (currentStage === 'cancelled') {
    return 0;
  }

  const stageDef = getStageDefinition(tier, currentStage);

  if (!stageDef) {
    // Unknown stage, return 0
    return 0;
  }

  // Clamp stageProgress to 0-100
  const clampedProgress = Math.max(0, Math.min(100, stageProgress));

  // Calculate contribution from this stage
  const stageRange = stageDef.progressEnd - stageDef.progressStart;
  const contribution = (clampedProgress / 100) * stageRange;

  // Total progress = stage start + contribution
  const totalProgress = stageDef.progressStart + contribution;

  return Math.round(Math.max(0, Math.min(100, totalProgress)));
}

/**
 * Get the next stage after the current one
 */
export function getNextStage(
  tier: TierLevel,
  currentStage: ProcessingStage
): ProcessingStage | null {
  const stages = getTierStages(tier);
  const currentIndex = stages.findIndex((s) => s.id === currentStage);

  if (currentIndex === -1 || currentIndex === stages.length - 1) {
    return null;
  }

  return stages[currentIndex + 1].id;
}

/**
 * Check if a stage is included in a specific tier
 */
export function isStageSupportedByTier(
  tier: TierLevel,
  stageId: ProcessingStage
): boolean {
  const stages = getTierStages(tier);
  return stages.some((s) => s.id === stageId);
}

/**
 * Get human-friendly stage display name
 */
export function getStageDisplayName(
  tier: TierLevel,
  stageId: ProcessingStage
): string {
  if (stageId === 'cancelled') {
    return 'Cancelled';
  }
  const stageDef = getStageDefinition(tier, stageId);
  return stageDef?.displayName || stageId.replace(/_/g, ' ');
}

/**
 * Get stage description message
 */
export function getStageDescription(
  tier: TierLevel,
  stageId: ProcessingStage
): string {
  if (stageId === 'cancelled') {
    return 'Upload cancelled.';
  }
  const stageDef = getStageDefinition(tier, stageId);
  return stageDef?.description || 'Processing...';
}

const MODEL_NAME_PATTERNS = [
  /\bassemblyai\b/gi,
  /\bdeepgram\b/gi,
  /\bgpt-?\s*5(?:-mini|-nano)?\b/gi,
  /\bgpt-?\s*4o(?:-mini)?\b/gi,
  /\bclaude(?:-[\w.]+)?\b/gi,
];

function stripModelNames(message: string): string {
  let sanitized = message;

  for (const pattern of MODEL_NAME_PATTERNS) {
    sanitized = sanitized.replace(pattern, 'AI');
  }

  sanitized = sanitized
    .replace(/\(\s*AI\s*\+\s*AI\s*\)/gi, '')
    .replace(/\(\s*AI\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.)!?])/g, '$1')
    .trim();

  return sanitized;
}

export function getUserFacingProcessingMessage(
  tier: TierLevel,
  stageId: ProcessingStage,
  message?: string | null
): string {
  const fallback = getStageDescription(tier, stageId);
  if (!message || !message.trim()) {
    return fallback;
  }

  const sanitized = stripModelNames(message);
  return sanitized || fallback;
}
