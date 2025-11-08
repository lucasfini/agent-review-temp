import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { chunkAudioFile, needsChunking, mergeChunkedTranscriptions, estimateProcessingCost } from '@/lib/audio-chunker';
import { detectSpeakers, groupSegmentsBySpeaker, TranscriptionSegment } from '@/lib/speaker-detection';
import { extractSpeakerNames } from '@/lib/name-extraction';
import { enhancedSpeakerDetection, checkPyAnnoteAvailability, getPyAnnoteSetupInstructions } from '@/lib/pyannote-integration';

// Global file storage for temporary solution
declare global {
  var uploadedFiles: Map<string, {
    buffer: ArrayBuffer;
    contentType: string;
    originalName: string;
    size: number;
  }>;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { projectId, fileName } = await request.json();

    if (!projectId || !fileName) {
      return NextResponse.json(
        { error: 'Project ID and file name are required' },
        { status: 400 }
      );
    }

    // Try to get the audio file from local storage first (temporary solution)
    let fileData, downloadError;
    
    console.log(`Looking for file: ${fileName}`);
    
    if (global.uploadedFiles && global.uploadedFiles.has(fileName)) {
      console.log('Using local file storage...');
      const localFile = global.uploadedFiles.get(fileName);
      if (localFile) {
        fileData = new Blob([localFile.buffer], { type: localFile.contentType });
        downloadError = null;
        console.log(`Local file found: ${fileData.size} bytes`);
      } else {
        downloadError = new Error('Local file not found');
      }
    } else {
      console.log('Falling back to Supabase Storage...');
      // Fallback to Supabase Storage
      const storageResult = await supabaseAdmin.storage
        .from('audio-files')
        .download(fileName);
      
      fileData = storageResult.data;
      downloadError = storageResult.error;
    }

    if (downloadError || !fileData) {
      console.error('File download error:', downloadError);
      
      // Update project status to failed
      await supabaseAdmin
        .from('projects')
        .update({ status: 'failed' })
        .eq('id', projectId);

      return NextResponse.json(
        { error: 'Failed to download audio file' },
        { status: 500 }
      );
    }

    // Convert blob to File object for OpenAI
    const audioFile = new File([fileData], fileName.split('/').pop() || 'audio.mp3', {
      type: 'audio/mpeg'
    });

    console.log(`Starting transcription for project ${projectId}...`);
    console.log(`File size: ${fileData.size} bytes (${Math.round(fileData.size / 1024 / 1024 * 100) / 100}MB)`);

    let finalTranscription: string;
    let totalDuration: number = 0;
    let totalSegments: number = 0;
    let transcriptionSegments: TranscriptionSegment[] = [];
    let speakerData: any = null;
    
    // First, try processing the full file even if it's over 25MB
    // OpenAI sometimes accepts slightly larger files
    console.log('Attempting single file transcription first...');
    
    try {
      const singleFileResult = await Promise.race([
        openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['word', 'segment']
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Single file transcription timeout after 4 minutes')), 240000)
        )
      ]) as any;

      finalTranscription = singleFileResult.text;
      totalDuration = singleFileResult.duration || 0;
      totalSegments = singleFileResult.segments?.length || 0;
      transcriptionSegments = singleFileResult.segments || [];
      
      console.log('Single file transcription succeeded!');
      console.log(`Duration: ${totalDuration}s, Segments: ${totalSegments}`);

    } catch (singleFileError) {
      console.log('Single file transcription failed:', (singleFileError as any)?.message || 'Unknown error');
      
      // Check if file needs chunking
      if (needsChunking(fileData.size)) {
        console.log('File exceeds 25MB limit, using proper audio chunking...');
      
      try {
        // Chunk the audio file with safer settings
        const chunks = await chunkAudioFile(audioFile, {
          maxSizeMB: 15, // Use 15MB to be well under limit and process faster
          overlapSeconds: 15, // Reduce overlap for faster processing
          estimatedBitrate: 128
        });

        console.log(`Split into ${chunks.length} chunks`);
        
        // Estimate cost
        const { totalMinutes, estimatedCost } = estimateProcessingCost(chunks);
        console.log(`Estimated processing: ${totalMinutes} minutes, ~$${estimatedCost}`);

        // Process each chunk
        const chunkTranscriptions = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
          
          let retryCount = 0;
          const maxRetries = 3;
          let success = false;
          
          while (retryCount < maxRetries && !success) {
            try {
              // Ensure chunk.data is a proper Blob
              const chunkBlob = chunk.data instanceof Blob ? chunk.data : new Blob([chunk.data], { type: audioFile.type });
              
              const chunkFile = new File([chunkBlob], chunk.filename, {
                type: audioFile.type
              });

              console.log(`Chunk ${i + 1} attempt ${retryCount + 1}, size: ${chunkBlob.size} bytes`);

              // Add timeout to OpenAI API call (4 minutes for chunks)
              console.log(`Starting OpenAI transcription for chunk ${i + 1}...`);
              const chunkResult = await Promise.race([
                openai.audio.transcriptions.create({
                  file: chunkFile,
                  model: 'whisper-1',
                  response_format: 'verbose_json',
                  timestamp_granularities: ['word', 'segment']
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Chunk transcription timeout after 4 minutes')), 240000)
                )
              ]) as any;
              console.log(`Completed OpenAI transcription for chunk ${i + 1}`);

              chunkTranscriptions.push({
                text: chunkResult.text,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                chunkIndex: chunk.chunkIndex,
                duration: chunkResult.duration || (chunk.endTime - chunk.startTime),
                segments: chunkResult.segments || []
              });

              totalDuration += chunkResult.duration || (chunk.endTime - chunk.startTime);
              totalSegments += chunkResult.segments?.length || 0;
              
              // Collect segments for speaker analysis
              if (chunkResult.segments && chunkResult.segments.length > 0) {
                console.log(`📊 Chunk ${i + 1}: Collected ${chunkResult.segments.length} segments for speaker analysis`);
                // Adjust segment timestamps for chunk offset
                const adjustedSegments = chunkResult.segments.map((segment: any) => ({
                  ...segment,
                  start: segment.start + chunk.startTime,
                  end: segment.end + chunk.startTime,
                  words: segment.words ? segment.words.map((word: any) => ({
                    ...word,
                    start: word.start + chunk.startTime,
                    end: word.end + chunk.startTime
                  })) : undefined
                }));
                transcriptionSegments.push(...adjustedSegments);
                console.log(`📊 Total segments collected so far: ${transcriptionSegments.length}`);
              } else {
                console.log(`⚠️ Chunk ${i + 1}: No segments available for speaker analysis`);
              }
              
              success = true;
              console.log(`Chunk ${i + 1} succeeded on attempt ${retryCount + 1}`);

            } catch (chunkError) {
              retryCount++;
              console.error(`Chunk ${i + 1} attempt ${retryCount} failed:`, (chunkError as any)?.message || 'Unknown error');
              console.error(`Chunk ${i + 1} details:`, {
                filename: chunk.filename,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                dataType: typeof chunk.data,
                dataSize: chunk.data instanceof Blob ? chunk.data.size : 'unknown'
              });
              
              if (retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
                console.log(`Retrying chunk ${i + 1} in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (!success) {
            console.error(`Chunk ${i + 1} failed after ${maxRetries} attempts`);
            chunkTranscriptions.push({
              text: `[Error processing chunk ${i + 1}: Failed after ${maxRetries} attempts]`,
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              chunkIndex: chunk.chunkIndex,
              duration: 0
            });
          }
        }

        // Merge chunked transcriptions
        finalTranscription = mergeChunkedTranscriptions(chunkTranscriptions, 30);
        
        console.log(`Chunked transcription completed: ${chunkTranscriptions.length} chunks processed`);

      } catch (chunkingError) {
        console.error('Error in chunking process:', chunkingError);
        
        // Try single file transcription as fallback (this might fail due to size, but worth trying)
        try {
          console.log('Attempting single file transcription as fallback...');
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            response_format: 'verbose_json'
          });

          finalTranscription = transcription.text;
          totalDuration = transcription.duration || 0;
          totalSegments = transcription.segments?.length || 0;
          
          console.log('Fallback single file transcription succeeded');
        } catch (fallbackError) {
          console.error('Fallback transcription also failed:', fallbackError);
          
          // Final fallback to placeholder
          finalTranscription = `[File size: ${Math.round(fileData.size / 1024 / 1024 * 100) / 100}MB - Transcription failed]\n\nThis file exceeded the 25MB limit and both chunked and fallback transcription failed. Error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`;
          totalDuration = Math.round(fileData.size / (128000 / 8));
        }
      }
      
      } else {
        // File is small enough but single file failed, try chunking anyway
        console.log('Single file failed but file is small, retrying with minimal chunking...');
        
        try {
          // Force chunking even for smaller files
          const chunks = await chunkAudioFile(audioFile, {
            maxSizeMB: 15, // Use smaller chunks
            overlapSeconds: 15, // Reduce overlap for faster processing
            estimatedBitrate: 128
          });

          console.log(`Force chunking into ${chunks.length} pieces`);
          
          // Process chunks with retry logic
          const chunkTranscriptions = [];
          
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
            
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;
            
            while (retryCount < maxRetries && !success) {
              try {
                const chunkBlob = chunk.data instanceof Blob ? chunk.data : new Blob([chunk.data], { type: audioFile.type });
                const chunkFile = new File([chunkBlob], chunk.filename, { type: audioFile.type });

                console.log(`Chunk ${i + 1} attempt ${retryCount + 1}, size: ${chunkBlob.size} bytes`);

                // Add timeout to OpenAI API call (4 minutes for chunks)
                console.log(`Starting OpenAI transcription for chunk ${i + 1}...`);
                const chunkResult = await Promise.race([
                  openai.audio.transcriptions.create({
                    file: chunkFile,
                    model: 'whisper-1',
                    response_format: 'verbose_json',
                    timestamp_granularities: ['word', 'segment']
                  }),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Chunk transcription timeout after 4 minutes')), 240000)
                  )
                ]) as any;
                console.log(`Completed OpenAI transcription for chunk ${i + 1}`);

                chunkTranscriptions.push({
                  text: chunkResult.text,
                  startTime: chunk.startTime,
                  endTime: chunk.endTime,
                  chunkIndex: chunk.chunkIndex,
                  duration: chunkResult.duration || (chunk.endTime - chunk.startTime),
                  segments: chunkResult.segments || []
                });

                totalDuration += chunkResult.duration || (chunk.endTime - chunk.startTime);
                totalSegments += chunkResult.segments?.length || 0;
                
                // Collect segments for speaker analysis
                if (chunkResult.segments && chunkResult.segments.length > 0) {
                  console.log(`📊 Chunk ${i + 1}: Collected ${chunkResult.segments.length} segments for speaker analysis`);
                  // Adjust segment timestamps for chunk offset
                  const adjustedSegments = chunkResult.segments.map((segment: any) => ({
                    ...segment,
                    start: segment.start + chunk.startTime,
                    end: segment.end + chunk.startTime,
                    words: segment.words ? segment.words.map((word: any) => ({
                      ...word,
                      start: word.start + chunk.startTime,
                      end: word.end + chunk.startTime
                    })) : undefined
                  }));
                  transcriptionSegments.push(...adjustedSegments);
                  console.log(`📊 Total segments collected so far: ${transcriptionSegments.length}`);
                } else {
                  console.log(`⚠️ Chunk ${i + 1}: No segments available for speaker analysis`);
                }
                
                success = true;
                console.log(`Chunk ${i + 1} succeeded on attempt ${retryCount + 1}`);

              } catch (chunkError) {
                retryCount++;
                console.error(`Chunk ${i + 1} attempt ${retryCount} failed:`, (chunkError as any)?.message || 'Unknown error');
                
                if (retryCount < maxRetries) {
                  const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                  console.log(`Retrying chunk ${i + 1} in ${delay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            }
            
            if (!success) {
              console.error(`Chunk ${i + 1} failed after ${maxRetries} attempts`);
              chunkTranscriptions.push({
                text: `[Error processing chunk ${i + 1}: Failed after ${maxRetries} attempts]`,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                chunkIndex: chunk.chunkIndex,
                duration: 0
              });
            }
          }

          // Merge chunked transcriptions
          finalTranscription = mergeChunkedTranscriptions(chunkTranscriptions, 30);
          console.log(`Force chunked transcription completed: ${chunkTranscriptions.length} chunks processed`);

        } catch (forceChunkError) {
          console.error('Force chunking also failed:', forceChunkError);
          throw new Error('Both single file and chunked transcription failed');
        }
      }
    }

    // If we get here, we should have a transcription
    if (!finalTranscription) {
      throw new Error('No transcription was generated');
    }

    // Save transcription first, then do speaker analysis asynchronously
    console.log('Saving transcription first, then processing speakers in background...');

    // Save transcription to database immediately
    const updateData: any = {
      transcription_text: finalTranscription,
      status: 'completed',
      processing_completed_at: new Date().toISOString(),
      processing_time_seconds: Math.round((Date.now() - new Date().getTime()) / 1000)
    };

    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (updateError) {
      console.error('Failed to update project with transcription:', updateError);
      return NextResponse.json(
        { error: 'Failed to save transcription' },
        { status: 500 }
      );
    }

    console.log(`Transcription completed for project ${projectId}`);

    // Start speaker analysis in background (don't await)
    if (transcriptionSegments.length > 0) {
      console.log(`🎯 MAIN: Starting background speaker analysis for project ${projectId} with ${transcriptionSegments.length} segments`);
      console.log(`🎯 MAIN: Transcription length: ${finalTranscription.length} characters`);
      console.log(`🎯 MAIN: Sample segments:`, transcriptionSegments.slice(0, 2).map(s => ({
        start: s.start,
        end: s.end,
        text: s.text.substring(0, 50) + '...'
      })));
      
      // Check PyAnnote availability at startup
      checkPyAnnoteAvailability().then(available => {
        console.log(`🎯 MAIN: PyAnnote availability: ${available ? '✅ Available' : '❌ Not available'}`);
        if (!available) {
          console.log('🎯 MAIN: PyAnnote setup instructions:');
          console.log(getPyAnnoteSetupInstructions());
        }
      });
      
      // Fire and forget background process with audio file info
      processSpeakerAnalysisBackground(projectId, transcriptionSegments, finalTranscription, fileName).catch(error => {
        console.error('🎯 MAIN: Background speaker analysis failed with unhandled error:', error);
        console.error('🎯 MAIN: Error stack:', error.stack);
      });
      
      console.log(`🎯 MAIN: Background speaker analysis initiated for project ${projectId}`);
    } else {
      console.log(`🎯 MAIN: No transcription segments available for speaker analysis (project ${projectId})`);
      console.log(`🎯 MAIN: Available data:`, {
        segmentsArray: Array.isArray(transcriptionSegments),
        segmentsLength: transcriptionSegments?.length,
        finalTranscriptionLength: finalTranscription?.length
      });
    }

    // Note: Content generation will be triggered separately after user selects content types

    return NextResponse.json({
      success: true,
      projectId,
      transcription: finalTranscription,
      duration: totalDuration,
      segments: totalSegments,
      method: needsChunking(fileData.size) ? 'chunked' : 'single'
    });

  } catch (error) {
    console.error('Transcription error:', error);

    // Try to update project status to failed if we have the projectId
    const body = await request.json().catch(() => ({}));
    if (body.projectId) {
      await supabaseAdmin
        .from('projects')
        .update({ status: 'failed' })
        .eq('id', body.projectId);
    }

    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    );
  }
}

/**
 * Process speaker analysis in the background after transcription is complete
 * This runs asynchronously so it doesn't delay the transcription response
 */
async function processSpeakerAnalysisBackground(
  projectId: string, 
  transcriptionSegments: TranscriptionSegment[], 
  finalTranscription: string,
  audioFileName?: string
) {
  const startTime = Date.now();
  let tempAudioFile: string | undefined; // Track temporary audio file for cleanup
  
  console.log(`[SPEAKER ANALYSIS] 🚀 Starting for project ${projectId} at ${new Date().toISOString()}`);
  console.log(`[SPEAKER ANALYSIS] Input validation:`, {
    projectId: projectId ? 'valid' : 'MISSING',
    segmentsCount: transcriptionSegments?.length || 0,
    transcriptionLength: finalTranscription?.length || 0,
    segmentsValid: Array.isArray(transcriptionSegments)
  });
  
  // Early validation
  if (!projectId) {
    console.error('[SPEAKER ANALYSIS] ❌ FATAL: No project ID provided');
    return;
  }
  
  if (!transcriptionSegments || transcriptionSegments.length === 0) {
    console.error('[SPEAKER ANALYSIS] ❌ FATAL: No transcription segments available');
    return;
  }
  
  if (!finalTranscription || finalTranscription.length === 0) {
    console.error('[SPEAKER ANALYSIS] ❌ FATAL: No transcription text available');
    return;
  }
  
  try {
    // Step 1: Enhanced speaker detection with PyAnnote support
    console.log(`[SPEAKER ANALYSIS] Step 1: Enhanced speaker detection from ${transcriptionSegments.length} segments...`);
    console.log(`[SPEAKER ANALYSIS] Audio file: ${audioFileName || 'not available'}`);
    
    // Try to get audio file for PyAnnote processing
    let audioFilePath: string | undefined;
    
    if (audioFileName) {
      try {
        audioFilePath = await prepareAudioFileForPyAnnote(audioFileName);
        if (audioFilePath) {
          console.log(`[SPEAKER ANALYSIS] 🎯 Audio file prepared for PyAnnote: ${audioFilePath}`);
          tempAudioFile = audioFilePath; // Track for cleanup
        }
      } catch (error) {
        console.log(`[SPEAKER ANALYSIS] ⚠️ Could not prepare audio file for PyAnnote: ${error}`);
      }
    }
    
    const speakerSegments = await enhancedSpeakerDetection(transcriptionSegments, audioFilePath);
    console.log(`[SPEAKER ANALYSIS] ✅ Step 1 Complete: Detected ${speakerSegments.length} speaker segments`);
    
    if (speakerSegments.length === 0) {
      console.error('[SPEAKER ANALYSIS] ❌ No speaker segments detected, cannot continue');
      throw new Error('PyAnnote returned no speaker segments');
    }
    
    // Step 2: Group segments by speaker
    console.log(`[SPEAKER ANALYSIS] Step 2: Grouping ${speakerSegments.length} segments by speaker...`);
    const detectedSpeakers = groupSegmentsBySpeaker(speakerSegments);
    const speakerIds = Object.keys(detectedSpeakers);
    console.log(`[SPEAKER ANALYSIS] ✅ Step 2 Complete: Found ${speakerIds.length} unique speakers:`, speakerIds);
    
    if (speakerIds.length === 0) {
      console.error('[SPEAKER ANALYSIS] ❌ No unique speakers found, cannot continue');
      return;
    }
    
    // Log speaker details
    speakerIds.forEach(id => {
      const speaker = detectedSpeakers[id];
      console.log(`[SPEAKER ANALYSIS] Speaker ${id}: ${speaker.segments.length} segments, total duration: ${speaker.totalDuration.toFixed(1)}s`);
    });
    
    // Step 3: Extract speaker names using AI (with timeout)
    console.log(`[SPEAKER ANALYSIS] Step 3: Extracting speaker names with AI...`);
    console.log(`[SPEAKER ANALYSIS] AI Input: ${finalTranscription.length} chars, ${speakerIds.length} speakers`);
    
    let namedSpeakers: any;
    try {
      namedSpeakers = await Promise.race([
        extractSpeakerNames(finalTranscription, detectedSpeakers),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Speaker name extraction timeout after 45 seconds')), 45000)
        )
      ]) as any;
      
      console.log(`[SPEAKER ANALYSIS] ✅ Step 3 Complete: AI name extraction successful`);
      console.log('[SPEAKER ANALYSIS] Named speakers result:', Object.keys(namedSpeakers).map(id => 
        `${id}: "${namedSpeakers[id].finalName}" (extracted: ${namedSpeakers[id].extractedName ? 'Yes' : 'No'})`
      ));
      
    } catch (aiError) {
      console.error('[SPEAKER ANALYSIS] ⚠️ AI name extraction failed, using fallback names:', aiError);
      
      // Create fallback named speakers
      namedSpeakers = {};
      speakerIds.forEach((id, index) => {
        namedSpeakers[id] = {
          ...detectedSpeakers[id],
          extractedName: null,
          finalName: `Speaker ${index + 1}`
        };
      });
      
      console.log('[SPEAKER ANALYSIS] Fallback speakers created:', Object.keys(namedSpeakers));
    }
    
    // Step 4: Prepare speaker data for storage
    console.log(`[SPEAKER ANALYSIS] Step 4: Preparing data for database storage...`);
    const speakerData = {
      segments: speakerSegments,
      speakers: namedSpeakers,
      detectionMetadata: {
        totalSpeakers: Object.keys(namedSpeakers).length,
        totalSegments: speakerSegments.length,
        processedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime
      }
    };
    
    const serializedData = JSON.stringify(speakerData);
    console.log(`[SPEAKER ANALYSIS] Data prepared:`, {
      totalSpeakers: speakerData.detectionMetadata.totalSpeakers,
      totalSegments: speakerData.detectionMetadata.totalSegments,
      dataSize: `${(serializedData.length / 1024).toFixed(1)} KB`,
      processingTimeMs: speakerData.detectionMetadata.processingTimeMs
    });
    
    // Step 5: Update database with speaker data
    console.log(`[SPEAKER ANALYSIS] Step 5: Saving to database (project: ${projectId})...`);
    
    const updatePayload = {
      transcription_segments: JSON.stringify(transcriptionSegments),
      speaker_data: serializedData
    };
    
    console.log('[SPEAKER ANALYSIS] Database update payload size:', {
      transcriptionSegments: `${(JSON.stringify(transcriptionSegments).length / 1024).toFixed(1)} KB`,
      speakerData: `${(serializedData.length / 1024).toFixed(1)} KB`
    });
    
    const { error: speakerUpdateError } = await supabaseAdmin
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId);
    
    if (speakerUpdateError) {
      console.error('[SPEAKER ANALYSIS] ❌ Database update FAILED:', speakerUpdateError);
      console.error('[SPEAKER ANALYSIS] Error details:', {
        message: speakerUpdateError.message,
        code: speakerUpdateError.code,
        details: speakerUpdateError.details,
        hint: speakerUpdateError.hint
      });
      
      // Try to check if project exists
      const { data: projectCheck, error: checkError } = await supabaseAdmin
        .from('projects')
        .select('id, title')
        .eq('id', projectId)
        .single();
        
      if (checkError) {
        console.error('[SPEAKER ANALYSIS] Project check failed:', checkError);
      } else {
        console.log('[SPEAKER ANALYSIS] Project exists:', projectCheck);
      }
      
    } else {
      const totalTime = Date.now() - startTime;
      console.log(`[SPEAKER ANALYSIS] ✅ SUCCESS! Completed for project ${projectId}`);
      console.log(`[SPEAKER ANALYSIS] Final stats:`, {
        totalProcessingTime: `${(totalTime / 1000).toFixed(1)}s`,
        speakersSaved: speakerData.detectionMetadata.totalSpeakers,
        segmentsSaved: speakerData.detectionMetadata.totalSegments,
        timestamp: new Date().toISOString()
      });
      
      // Verify the save worked
      const { data: verifyData, error: verifyError } = await supabaseAdmin
        .from('projects')
        .select('speaker_data')
        .eq('id', projectId)
        .single();
        
      if (verifyError) {
        console.error('[SPEAKER ANALYSIS] ❌ Verification failed:', verifyError);
      } else if (verifyData?.speaker_data) {
        console.log('[SPEAKER ANALYSIS] ✅ Data verified saved in database');
        try {
          const savedData = JSON.parse(verifyData.speaker_data);
          console.log('[SPEAKER ANALYSIS] Verified saved speakers:', Object.keys(savedData.speakers || {}));
        } catch (parseError) {
          console.error('[SPEAKER ANALYSIS] ❌ Saved data parsing failed:', parseError);
        }
      } else {
        console.error('[SPEAKER ANALYSIS] ❌ No speaker data found after save!');
      }
    }
    
  } catch (speakerError: unknown) {
    console.error('[SPEAKER ANALYSIS] ❌ CRITICAL ERROR in main process:', speakerError);
    console.error('[SPEAKER ANALYSIS] Error stack:', speakerError instanceof Error ? speakerError.stack : 'No stack trace');
    
    // Enhanced fallback with error tracking
    try {
      console.log('[SPEAKER ANALYSIS] Attempting fallback save...');
      const speakerSegments = detectSpeakers(transcriptionSegments);
      const basicSpeakerData = {
        segments: speakerSegments,
        speakers: {},
        detectionMetadata: {
          totalSpeakers: 0,
          totalSegments: speakerSegments.length,
          processedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
          error: speakerError instanceof Error ? speakerError.message : 'Unknown error',
          errorType: speakerError instanceof Error ? speakerError.name : 'Error'
        }
      };
      
      const { error: fallbackError } = await supabaseAdmin
        .from('projects')
        .update({
          transcription_segments: JSON.stringify(transcriptionSegments),
          speaker_data: JSON.stringify(basicSpeakerData)
        })
        .eq('id', projectId);
        
      if (fallbackError) {
        console.error('[SPEAKER ANALYSIS] ❌ Fallback save also failed:', fallbackError);
      } else {
        console.log(`[SPEAKER ANALYSIS] ⚠️ Fallback save succeeded for project ${projectId} (${speakerSegments.length} segments, no names)`);
      }
      
    } catch (fallbackError) {
      console.error('[SPEAKER ANALYSIS] ❌ FATAL: Even fallback save failed:', fallbackError);
    }
  } finally {
    // Cleanup temporary audio file if created
    if (tempAudioFile) {
      try {
        const fs = await import('fs').then(m => m.promises);
        await fs.unlink(tempAudioFile);
        console.log(`[SPEAKER ANALYSIS] 🧹 Cleaned up temporary audio file: ${tempAudioFile}`);
      } catch (cleanupError) {
        console.warn(`[SPEAKER ANALYSIS] ⚠️ Could not cleanup temp file: ${cleanupError}`);
      }
    }
  }
}

/**
 * Prepare audio file for PyAnnote processing by saving it temporarily
 */
async function prepareAudioFileForPyAnnote(audioFileName: string): Promise<string | undefined> {
  try {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    const os = await import('os');
    
    console.log(`[SPEAKER ANALYSIS] 📁 Preparing audio file: ${audioFileName}`);
    
    // Try global storage first
    if (global.uploadedFiles && global.uploadedFiles.has(audioFileName)) {
      const fileData = global.uploadedFiles.get(audioFileName);
      if (fileData) {
        console.log('[SPEAKER ANALYSIS] 📁 Found file in global storage');
        
        // Create temporary file
        const tempDir = os.tmpdir();
        const tempFileName = `pyannote_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        // Write buffer to temp file
        await fs.writeFile(tempFilePath, Buffer.from(fileData.buffer));
        console.log(`[SPEAKER ANALYSIS] 📁 Created temporary file: ${tempFilePath}`);
        
        return tempFilePath;
      }
    }
    
    // Fallback to Supabase storage
    console.log('[SPEAKER ANALYSIS] 📁 Trying Supabase storage...');
    const storageResult = await supabaseAdmin.storage
      .from('audio-files')
      .download(audioFileName);
      
    if (storageResult.error || !storageResult.data) {
      console.log(`[SPEAKER ANALYSIS] 📁 Supabase storage failed: ${storageResult.error?.message}`);
      return undefined;
    }
    
    // Create temporary file from Supabase data
    const fs_module = await import('fs').then(m => m.promises);
    const path_module = await import('path');
    const os_module = await import('os');
    
    const tempDir = os_module.tmpdir();
    const tempFileName = `pyannote_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    const tempFilePath = path_module.join(tempDir, tempFileName);
    
    const buffer = await storageResult.data.arrayBuffer();
    await fs_module.writeFile(tempFilePath, Buffer.from(buffer));
    
    console.log(`[SPEAKER ANALYSIS] 📁 Created temporary file from Supabase: ${tempFilePath}`);
    return tempFilePath;
    
  } catch (error) {
    console.error(`[SPEAKER ANALYSIS] 📁 Failed to prepare audio file: ${error}`);
    return undefined;
  }
}