// Tier-Specific Progress Stage Configuration
// Defines processing stages and progress weights for each performance tier

import { TierLevel } from './tier-config';

export type ProcessingStage =
  | 'pending'
  | 'uploading'
  | 'transcribing'
  | 'diarization'
  | 'name_extraction'
  | 'summary'
  | 'role_classification'
  | 'chapters'
  | 'takeaways'
  | 'quotes'
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

// Basic Tier: Core transcription and diarization only
const BASIC_STAGES: ProgressStageDefinition[] = [
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
    description: 'Converting speech to text with AssemblyAI...',
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

// Pro Tier: + Name Extraction + AI Summary
const PRO_STAGES: ProgressStageDefinition[] = [
  {
    id: 'uploading',
    displayName: 'Uploading Audio',
    icon: 'Upload',
    description: 'Uploading your audio file to secure storage...',
    progressStart: 0,
    progressEnd: 8
  },
  {
    id: 'transcribing',
    displayName: 'Transcribing',
    icon: 'FileText',
    description: 'Converting speech to text with AssemblyAI...',
    progressStart: 8,
    progressEnd: 50
  },
  {
    id: 'diarization',
    displayName: 'Speaker Detection',
    icon: 'Users',
    description: 'Identifying different speakers in the conversation...',
    progressStart: 50,
    progressEnd: 70
  },
  {
    id: 'name_extraction',
    displayName: 'Name Extraction',
    icon: 'UserCheck',
    description: 'Extracting speaker names from the conversation...',
    progressStart: 70,
    progressEnd: 80
  },
  {
    id: 'summary',
    displayName: 'AI Summary',
    icon: 'FileText',
    description: 'Generating podcast summary with AI...',
    progressStart: 80,
    progressEnd: 90
  },
  {
    id: 'finalizing',
    displayName: 'Finalizing',
    icon: 'CheckCircle',
    description: 'Saving your enhanced transcription...',
    progressStart: 90,
    progressEnd: 100
  }
];

// Premium Tier: + Roles + Chapters + Takeaways + Quotes
const PREMIUM_STAGES: ProgressStageDefinition[] = [
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
    description: 'Converting speech to text with AssemblyAI...',
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
    displayName: 'Name Extraction',
    icon: 'UserCheck',
    description: 'Extracting speaker names from the conversation...',
    progressStart: 55,
    progressEnd: 62
  },
  {
    id: 'summary',
    displayName: 'AI Summary',
    icon: 'FileText',
    description: 'Generating podcast summary with AI...',
    progressStart: 62,
    progressEnd: 70
  },
  {
    id: 'role_classification',
    displayName: 'Role Classification',
    icon: 'Award',
    description: 'Classifying speaker roles (host, guest, etc.)...',
    progressStart: 70,
    progressEnd: 78
  },
  {
    id: 'chapters',
    displayName: 'Chapter Detection',
    icon: 'BookOpen',
    description: 'Detecting chapter markers and topics...',
    progressStart: 78,
    progressEnd: 85
  },
  {
    id: 'takeaways',
    displayName: 'Key Takeaways',
    icon: 'Lightbulb',
    description: 'Extracting key insights and takeaways...',
    progressStart: 85,
    progressEnd: 92
  },
  {
    id: 'quotes',
    displayName: 'Social Quotes',
    icon: 'Quote',
    description: 'Finding shareable quotes for social media...',
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

/**
 * Get the processing stages for a specific tier
 */
export function getTierStages(tier: TierLevel): ProgressStageDefinition[] {
  switch (tier) {
    case 'basic':
      return BASIC_STAGES;
    case 'pro':
      return PRO_STAGES;
    case 'premium':
      return PREMIUM_STAGES;
    default:
      return BASIC_STAGES;
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
  const stageDef = getStageDefinition(tier, stageId);
  return stageDef?.description || 'Processing...';
}
