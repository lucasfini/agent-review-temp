// Progress tracking utility for transcription pipeline
import { supabaseAdmin } from './supabase/server';
import { type ProcessingStage } from './tier-progress-config';

export { type ProcessingStage } from './tier-progress-config';

export interface ProgressUpdate {
  stage: ProcessingStage;
  progress: number; // 0-100
  message?: string;
}

/**
 * Update project processing progress
 */
export async function updateProcessingProgress(
  projectId: string,
  update: ProgressUpdate
): Promise<boolean> {
  try {
    const { progress, stage, message } = update;

    // Validate progress
    const validProgress = Math.max(0, Math.min(100, progress));

    // Build update object
    const updateData: any = {
      processing_stage: stage,
      processing_progress: validProgress,
      processing_message: message,
      stage_started_at: new Date().toISOString()
    };

    // Update legacy status field for backwards compatibility
    if (stage === 'completed') {
      updateData.status = 'completed';
    } else if (stage === 'failed') {
      updateData.status = 'failed';
    } else if (stage === 'cancelled') {
      updateData.status = 'cancelled';
    } else if (stage === 'uploading') {
      updateData.status = 'uploading';
    } else {
      updateData.status = 'processing';
    }

    const { error } = await (supabaseAdmin
      .from('projects') as any)
      .update(updateData)
      .eq('id', projectId);

    if (error) {
      console.error(`[PROGRESS] Failed to update progress for ${projectId}:`, error);
      return false;
    }

    console.log(`[PROGRESS] ${projectId}: ${stage} (${validProgress}%) - ${message}`);
    return true;
  } catch (error) {
    console.error('[PROGRESS] Error updating progress:', error);
    return false;
  }
}

/**
 * Mark processing as failed
 */
export async function markProcessingFailed(
  projectId: string,
  errorMessage: string
): Promise<void> {
  await updateProcessingProgress(projectId, {
    stage: 'failed',
    progress: 0,
    message: errorMessage
  });
}

/**
 * Mark processing as completed
 */
export async function markProcessingCompleted(
  projectId: string
): Promise<void> {
  await updateProcessingProgress(projectId, {
    stage: 'completed',
    progress: 100,
    message: 'Processing complete! Your content is ready.'
  });
}
