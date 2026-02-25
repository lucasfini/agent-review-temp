// Content generation progress tracking
import { supabaseAdmin } from '@/lib/supabase/server';

export type GenerationStatus = 'preparing' | 'generating' | 'completed' | 'failed';

export interface GenerationProgressData {
  project_id: string;
  status: GenerationStatus;
  current_block?: {
    name: string;
    number: number;
    total: number;
  };
  completed_blocks: number;
  total_blocks: number;
  message?: string;
  updated_at?: string;
}

/**
 * Initialize progress tracking for a new generation session
 */
export async function initializeGenerationProgress(
  projectId: string,
  totalBlocks: number
): Promise<void> {
  try {
    // Upsert so this is idempotent — safe to call from both generate-selected-content
    // (pre-creation, before fire-and-forget) and generate-content (actual worker).
    const { error } = await (supabaseAdmin
      .from('generation_progress') as any)
      .upsert({
        project_id: projectId,
        status: 'preparing',
        completed_blocks: 0,
        total_blocks: totalBlocks,
        message: 'Preparing to generate content...',
        updated_at: new Date().toISOString()
      }, { onConflict: 'project_id' });

    if (error) {
      console.error('[PROGRESS] Failed to initialize:', error);
    } else {
      console.log(`[PROGRESS] Initialized for project ${projectId}: ${totalBlocks} blocks`);
    }
  } catch (error) {
    console.error('[PROGRESS] Exception initializing:', error);
  }
}

/**
 * Update progress when starting a new block
 */
export async function updateGenerationProgress(
  projectId: string,
  blockName: string,
  blockNumber: number,
  totalBlocks: number
): Promise<void> {
  try {
    const { error } = await (supabaseAdmin
      .from('generation_progress') as any)
      .update({
        status: 'generating',
        current_block: {
          name: blockName,
          number: blockNumber,
          total: totalBlocks
        },
        message: `Generating ${blockName}...`,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (error) {
      console.error('[PROGRESS] Failed to update:', error);
    } else {
      console.log(`[PROGRESS] Updated: Block ${blockNumber}/${totalBlocks} - ${blockName}`);
    }
  } catch (error) {
    console.error('[PROGRESS] Exception updating:', error);
  }
}

/**
 * Update progress when a block is completed
 */
export async function completeBlock(
  projectId: string,
  completedCount: number
): Promise<void> {
  try {
    const { error } = await (supabaseAdmin
      .from('generation_progress') as any)
      .update({
        completed_blocks: completedCount,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (error) {
      console.error('[PROGRESS] Failed to complete block:', error);
    } else {
      console.log(`[PROGRESS] Completed block ${completedCount}`);
    }
  } catch (error) {
    console.error('[PROGRESS] Exception completing block:', error);
  }
}

/**
 * Mark generation as completed - update status first for realtime, then delete after delay
 */
export async function completeGenerationProgress(
  projectId: string,
  totalBlocks: number
): Promise<void> {
  try {
    // First UPDATE to 'completed' status so realtime subscription triggers
    const { error: updateError } = await (supabaseAdmin
      .from('generation_progress') as any)
      .update({
        status: 'completed',
        completed_blocks: totalBlocks,
        message: 'Content generation complete!',
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateError) {
      console.error('[PROGRESS] Failed to update to completed:', updateError);
    } else {
      console.log(`[PROGRESS] Updated to completed for project ${projectId} (${totalBlocks} blocks)`);
    }

    // Delete the entry after a short delay to allow realtime to propagate
    setTimeout(async () => {
      try {
        const { error: deleteError } = await (supabaseAdmin
          .from('generation_progress') as any)
          .delete()
          .eq('project_id', projectId);

        if (deleteError) {
          console.error('[PROGRESS] Failed to delete completed entry:', deleteError);
        } else {
          console.log(`[PROGRESS] Cleaned up progress entry for project ${projectId}`);
        }
      } catch (error) {
        console.error('[PROGRESS] Exception cleaning up:', error);
      }
    }, 2000);

  } catch (error) {
    console.error('[PROGRESS] Exception completing:', error);
  }
}

/**
 * Mark generation as failed - update status first for realtime, then delete after delay
 */
export async function failGenerationProgress(
  projectId: string,
  errorMessage: string
): Promise<void> {
  try {
    console.log(`[PROGRESS] Generation failed for project ${projectId}: ${errorMessage}`);

    // First UPDATE to 'failed' status so realtime subscription triggers
    const { error: updateError } = await (supabaseAdmin
      .from('generation_progress') as any)
      .update({
        status: 'failed',
        message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (updateError) {
      console.error('[PROGRESS] Failed to update to failed:', updateError);
    } else {
      console.log(`[PROGRESS] Updated to failed for project ${projectId}`);
    }

    // Delete the entry after a short delay to allow realtime to propagate
    setTimeout(async () => {
      try {
        const { error: deleteError } = await (supabaseAdmin
          .from('generation_progress') as any)
          .delete()
          .eq('project_id', projectId);

        if (deleteError) {
          console.error('[PROGRESS] Failed to delete failed entry:', deleteError);
        } else {
          console.log(`[PROGRESS] Cleaned up progress entry for failed project ${projectId}`);
        }
      } catch (error) {
        console.error('[PROGRESS] Exception cleaning up:', error);
      }
    }, 2000);
  } catch (error) {
    console.error('[PROGRESS] Exception marking as failed:', error);
  }
}

/**
 * Clean up old progress entries (optional, for maintenance)
 */
export async function cleanupOldProgress(olderThanHours: number = 24): Promise<void> {
  try {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    const { error } = await (supabaseAdmin
      .from('generation_progress') as any)
      .delete()
      .lt('updated_at', cutoffTime.toISOString());

    if (error) {
      console.error('[PROGRESS] Failed to cleanup old progress:', error);
    }
  } catch (error) {
    console.error('[PROGRESS] Exception cleaning up:', error);
  }
}
