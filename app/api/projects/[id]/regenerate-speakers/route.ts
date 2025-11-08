import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { enhancedSpeakerDetection } from '@/lib/pyannote-integration';
import { groupSegmentsBySpeaker, TranscriptionSegment } from '@/lib/speaker-detection';
import { extractSpeakerNames } from '@/lib/name-extraction';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get project data
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!project.transcription_segments) {
      return NextResponse.json(
        { error: 'No transcription segments found. Upload and transcribe first.' },
        { status: 400 }
      );
    }

    console.log(`[REGENERATE] Starting speaker analysis regeneration for project ${projectId}`);

    // Parse existing transcription segments
    const transcriptionSegments: TranscriptionSegment[] = JSON.parse(project.transcription_segments);
    
    if (!transcriptionSegments || transcriptionSegments.length === 0) {
      return NextResponse.json(
        { error: 'No valid transcription segments found' },
        { status: 400 }
      );
    }

    // Try to get the audio file for PyAnnote
    let audioFilePath: string | undefined;
    const audioFileName = project.audio_file_name;
    
    if (audioFileName) {
      try {
        audioFilePath = await prepareAudioFileForPyAnnote(projectId, audioFileName);
        if (audioFilePath) {
          console.log(`[REGENERATE] Audio file prepared for PyAnnote: ${audioFilePath}`);
        }
      } catch (error) {
        console.log(`[REGENERATE] Could not prepare audio file for PyAnnote: ${error}`);
      }
    }

    // Run enhanced speaker detection (with PyAnnote if available)
    console.log(`[REGENERATE] Running PyAnnote speaker analysis...`);
    const speakerSegments = await enhancedSpeakerDetection(transcriptionSegments, audioFilePath);
    
    if (speakerSegments.length === 0) {
      return NextResponse.json(
        { error: 'No speaker segments detected' },
        { status: 500 }
      );
    }

    console.log(`[REGENERATE] Detected ${speakerSegments.length} speaker segments`);

    // Group segments by speaker
    const detectedSpeakers = groupSegmentsBySpeaker(speakerSegments);
    const speakerIds = Object.keys(detectedSpeakers);
    
    console.log(`[REGENERATE] Found ${speakerIds.length} unique speakers:`, speakerIds);

    // Extract speaker names using AI
    let namedSpeakers: any;
    try {
      namedSpeakers = await extractSpeakerNames(project.transcription_text, detectedSpeakers);
      console.log(`[REGENERATE] AI name extraction successful`);
    } catch (aiError) {
      console.error('[REGENERATE] AI name extraction failed, using fallback names:', aiError);
      
      // Create fallback named speakers
      namedSpeakers = {};
      speakerIds.forEach((id, index) => {
        namedSpeakers[id] = {
          ...detectedSpeakers[id],
          extractedName: null,
          finalName: `Speaker ${index + 1}`
        };
      });
    }

    // Prepare speaker data for storage
    const speakerData = {
      segments: speakerSegments,
      speakers: namedSpeakers,
      detectionMetadata: {
        totalSpeakers: Object.keys(namedSpeakers).length,
        totalSegments: speakerSegments.length,
        processedAt: new Date().toISOString(),
        regenerated: true
      }
    };

    // Update database with new speaker data
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update({
        speaker_data: JSON.stringify(speakerData)
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('[REGENERATE] Database update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to save updated speaker data' },
        { status: 500 }
      );
    }

    // Cleanup temporary audio file if created
    if (audioFilePath) {
      try {
        const fs = await import('fs').then(m => m.promises);
        await fs.unlink(audioFilePath);
        console.log(`[REGENERATE] Cleaned up temporary audio file`);
      } catch (cleanupError) {
        console.warn(`[REGENERATE] Could not cleanup temp file: ${cleanupError}`);
      }
    }

    console.log(`[REGENERATE] Successfully regenerated speaker data for project ${projectId}`);

    return NextResponse.json({
      success: true,
      speakerData,
      message: `Speaker analysis regenerated successfully. Found ${speakerData.detectionMetadata.totalSpeakers} speakers.`
    });

  } catch (error) {
    console.error('[REGENERATE] Error regenerating speaker analysis:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate speaker analysis' },
      { status: 500 }
    );
  }
}

// Helper function to prepare audio file for PyAnnote
async function prepareAudioFileForPyAnnote(projectId: string, audioFileName: string): Promise<string | undefined> {
  try {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    const os = await import('os');
    
    console.log(`[REGENERATE] Preparing audio file: ${audioFileName}`);
    
    // Try global storage first
    if (global.uploadedFiles && global.uploadedFiles.has(audioFileName)) {
      const fileData = global.uploadedFiles.get(audioFileName);
      if (fileData) {
        console.log('[REGENERATE] Found file in global storage');
        
        // Create temporary file
        const tempDir = os.tmpdir();
        const tempFileName = `pyannote_regen_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        // Write buffer to temp file
        await fs.writeFile(tempFilePath, Buffer.from(fileData.buffer));
        console.log(`[REGENERATE] Created temporary file: ${tempFilePath}`);
        
        return tempFilePath;
      }
    }
    
    // First, let's see what files exist in storage
    console.log('[REGENERATE] Checking Supabase storage structure...');
    const { data: fileList, error: listError } = await supabaseAdmin.storage
      .from('audio-files')
      .list('', { limit: 100 });
      
    if (listError) {
      console.log(`[REGENERATE] Storage list error: ${listError.message}`);
    } else {
      console.log(`[REGENERATE] Files in root:`, fileList?.map(f => f.name) || []);
    }
    
    // Also check project-specific folder
    const { data: projectFiles, error: projectListError } = await supabaseAdmin.storage
      .from('audio-files')
      .list(projectId, { limit: 100 });
      
    if (!projectListError && projectFiles) {
      console.log(`[REGENERATE] Files in ${projectId}:`, projectFiles.map(f => f.name) || []);
    }
    
    // Try different storage path formats
    const possiblePaths = [
      `${projectId}/${audioFileName}`,
      audioFileName,
      `${projectId}/${audioFileName.split('/').pop()}` // In case it has path components
    ];
    
    let storageResult = null;
    let successfulPath = null;
    
    for (const path of possiblePaths) {
      console.log(`[REGENERATE] Trying path: ${path}`);
      const result = await supabaseAdmin.storage
        .from('audio-files')
        .download(path);
        
      if (!result.error && result.data) {
        storageResult = result;
        successfulPath = path;
        console.log(`[REGENERATE] Found file at path: ${path}`);
        break;
      } else {
        console.log(`[REGENERATE] Path failed: ${path} - ${result.error?.message}`);
      }
    }
      
    if (!storageResult || storageResult.error || !storageResult.data) {
      console.log(`[REGENERATE] All Supabase storage paths failed`);
      console.log(`[REGENERATE] Will proceed without audio file - using rule-based detection only`);
      return undefined;
    }
    
    // Create temporary file from Supabase data
    const fs_module = await import('fs').then(m => m.promises);
    const path_module = await import('path');
    const os_module = await import('os');
    
    const tempDir = os_module.tmpdir();
    const tempFileName = `pyannote_regen_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    const tempFilePath = path_module.join(tempDir, tempFileName);
    
    const buffer = await storageResult.data.arrayBuffer();
    await fs_module.writeFile(tempFilePath, Buffer.from(buffer));
    
    console.log(`[REGENERATE] Created temporary file from Supabase: ${tempFilePath}`);
    return tempFilePath;
    
  } catch (error) {
    console.error(`[REGENERATE] Failed to prepare audio file: ${error}`);
    return undefined;
  }
}