import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateProcessingProgress } from '@/lib/progress-tracker';
import { computeAudioFingerprint } from '@/lib/audio-fingerprint';
import { getCachedTranscription, applyCachedTranscriptionToProject } from '@/lib/transcription-cache';

// Configure route to accept large file uploads
export const maxDuration = 300; // 5 minutes timeout for upload
export const dynamic = 'force-dynamic'; // Ensure this route is not cached

// Increase body size limit for large files
export const runtime = 'nodejs';

// Global file storage for temporary solution
declare global {
  var uploadedFiles: Map<string, {
    buffer: ArrayBuffer;
    contentType: string;
    originalName: string;
    size: number;
  }>;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/wav', 
  'audio/mp4',
  'audio/m4a',
  'audio/flac',
  'audio/ogg',
  'audio/webm'
];

const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'];

type PerformanceLevel = 'basic' | 'pro' | 'premium';

const sanitizeFileName = (name: string) => {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'audio_upload';
};

const legacyToCurrentLevel = (value: string): PerformanceLevel | null => {
  if (value === 'basic' || value === 'pro' || value === 'premium') return value as PerformanceLevel;
  if (value === 'low') return 'basic';
  if (value === 'medium') return 'pro';
  if (value === 'high') return 'premium';
  return null;
};

const normalizePerformanceLevel = (value: FormDataEntryValue | null): PerformanceLevel => {
  if (!value || typeof value !== 'string') return 'premium';
  return legacyToCurrentLevel(value) || 'premium';
};

// Helper function to generate keywords from speaker name for matching
function generateKeywordsFromName(name: string): string[] {
  const parts = name.toLowerCase().split(/\s+/).filter(p => p.length > 1);
  const keywords = [...parts, name.toLowerCase()];

  // Add "first last-initial" pattern (e.g., "john s")
  if (parts.length >= 2) {
    keywords.push(`${parts[0]} ${parts[parts.length - 1][0]}`);
  }

  // Add first name variations
  if (parts.length > 0) {
    keywords.push(parts[0]); // First name alone
  }

  return [...new Set(keywords)];
}

export async function POST(request: NextRequest) {
  console.log('Upload API called');

  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error: Missing Supabase credentials' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('audio') as File;
    const title = formData.get('title') as string;
    const performanceLevel = normalizePerformanceLevel(formData.get('performanceLevel'));
    const rosterSpeakersRaw = formData.get('rosterSpeakers');
    const speakerCountRaw = formData.get('speakerCount');
    const speakerCount = speakerCountRaw ? parseInt(speakerCountRaw as string, 10) : undefined;
    console.log(`[UPLOAD] Selected performance level: ${performanceLevel}`);
    if (speakerCount) console.log(`[UPLOAD] Expected speaker count: ${speakerCount}`);

    console.log('File received:', file?.name, 'Size:', file?.size, 'Type:', file?.type);
    console.log('Title:', title);

    // Validation
    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 500MB limit' },
        { status: 400 }
      );
    }

    // File type validation
    const isValidType = ALLOWED_TYPES.includes(file.type) ||
      ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      console.log('Invalid file type:', file.type, 'Name:', file.name);
      return NextResponse.json(
        { error: 'Invalid file type. Please upload MP3, WAV, M4A, FLAC, OGG, or WEBM files.' },
        { status: 400 }
      );
    }

    // Normalize filename for storage once up-front
    const sanitizedBaseName = sanitizeFileName(file.name);

    // Get file duration (we'll estimate it for now, can be improved later)
    const estimatedDuration = Math.round(file.size / (128000 / 8)); // Rough estimate based on 128kbps

    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);
    const audioFingerprint = computeAudioFingerprint(fileBuffer);

    console.log('Creating project record...');

    // Get the authenticated user from the session
    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      console.log('No authenticated user, creating demo project...');
      
      // For demo purposes, create a mock project without database
      const mockProject = {
        id: `demo-${Date.now()}`,
        title,
        status: 'completed'
      };
      
      return NextResponse.json({
        success: true,
        projectId: mockProject.id,
        message: 'Demo upload successful (please sign up for full functionality)',
        demo: true
      });
    }

    console.log('Authenticated user:', user.id);

    // Create project record with authenticated user
    try {
      // First attempt: try with new progress tracking fields
      let insertData: any = {
        user_id: user.id,
        title,
        audio_file_name: sanitizedBaseName,
        audio_file_size: file.size,
        audio_duration: estimatedDuration,
        audio_fingerprint: audioFingerprint,
        status: 'uploading',
        processing_stage: 'uploading',
        processing_progress: 0,
        processing_message: 'Uploading audio file...',
        stage_started_at: new Date().toISOString(),
        performance_level: performanceLevel
      };

      let { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .insert(insertData as any)
        .select()
        .single() as { data: any; error: any };

      // If error is about missing columns, retry without progress fields
      if (projectError && projectError.message?.includes('Could not find')) {
        console.log('[UPLOAD] Progress tracking columns not available, retrying without them...');

        insertData = {
          user_id: user.id,
          title,
          audio_file_name: sanitizedBaseName,
          audio_file_size: file.size,
          audio_duration: estimatedDuration,
          audio_fingerprint: audioFingerprint,
          status: 'uploading',
          performance_level: performanceLevel
        };

        const retry = await supabaseAdmin
          .from('projects')
          .insert(insertData as any)
          .select()
          .single() as { data: any; error: any };

        project = retry.data;
        projectError = retry.error;
      }

      if (projectError || !project) {
        console.error('Project creation error:', projectError);

        // If table doesn't exist, create a mock project for now
        if (projectError?.message?.includes('relation "projects" does not exist')) {
          console.log('Projects table does not exist, creating mock project...');
          const mockProject = {
            id: `mock-${Date.now()}`,
            title,
            status: 'uploading'
          };

          // Skip database operations and just return success for now
          return NextResponse.json({
            success: true,
            projectId: mockProject.id,
            message: 'File uploaded successfully (demo mode - database not configured)',
            demo: true
          });
        }

        return NextResponse.json(
          { error: `Database error: ${projectError?.message || 'Unknown error'}` },
          { status: 500 }
        );
      }

      console.log('Project created:', project.id);

      // Save roster speakers if provided
      if (rosterSpeakersRaw) {
        try {
          const rosterSpeakers = JSON.parse(rosterSpeakersRaw as string);
          console.log(`[UPLOAD] Saving ${rosterSpeakers.length} roster speakers`);

          // Auto-generate keywords from names
          const keywords = rosterSpeakers.map((speaker: any) => ({
            rosterSpeakerId: speaker.id,
            keywords: generateKeywordsFromName(speaker.name),
            autoGenerated: true
          }));

          // Update project with roster data
          await (supabaseAdmin
            .from('projects') as any)
            .update({
              preset_speakers: rosterSpeakers,
              speaker_keywords: keywords
            })
            .eq('id', project.id);

          console.log('[UPLOAD] Roster speakers saved successfully');
        } catch (error) {
          console.error('[UPLOAD] Failed to save roster speakers:', error);
          // Non-fatal error - continue with upload
        }
      }

      // Upload file to Supabase Storage - sanitize filename
      const fileName = `${project.id}/${sanitizedBaseName}`;

      console.log('Uploading file to storage...');
      console.log(`File size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      
      // Test Supabase Storage connectivity first
      try {
        console.log('Testing Supabase Storage connectivity...');
        const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
        
        if (bucketsError) {
          console.error('Failed to list buckets:', bucketsError);
          return NextResponse.json(
            { error: 'Supabase Storage configuration error. Please check your setup.' },
            { status: 500 }
          );
        }
        
        console.log('Available buckets:', buckets?.map(b => b.name));
        
        const audioBucket = buckets?.find(b => b.name === 'audio-files');
        if (!audioBucket) {
          console.error('audio-files bucket not found');
          return NextResponse.json(
            { error: 'Audio files bucket not found. Please create the "audio-files" bucket in Supabase Storage.' },
            { status: 500 }
          );
        }
        
        console.log('Storage connectivity OK, bucket exists');
        
      } catch (storageError) {
        console.error('Storage connectivity test failed:', storageError);
        return NextResponse.json(
          { error: 'Failed to connect to Supabase Storage. Please check your configuration.' },
          { status: 500 }
        );
      }
      
      // Upload directly to Supabase Storage with retry logic
      let uploadError: unknown = null;
      let uploadData: { path: string } | null = null;

      // For large files (>25MB), skip Supabase Storage and use in-memory only
      // This avoids timeout issues with Supabase Storage
      const isLargeFile = file.size > 25 * 1024 * 1024;

      if (isLargeFile) {
        console.log(`Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB) - using in-memory storage only`);
        uploadData = { path: fileName }; // Simulate success
      } else {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
          try {
            console.log(`Upload attempt ${retryCount + 1}/${maxRetries + 1}`);

            const { data, error } = await supabaseAdmin.storage
              .from('audio-files')
              .upload(fileName, fileBuffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: true,
                // Add timeout configuration for better reliability
                duplex: 'half'
              });

            uploadData = data;
            uploadError = error;

            if (error) {
              throw error;
            }

            console.log('Supabase Storage upload successful');
            break; // Success - exit retry loop

          } catch (error) {
            uploadError = error;
            console.error(`Upload attempt ${retryCount + 1} failed:`, error);

            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
              console.log(`Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              retryCount++;
            } else {
              console.error('All upload attempts failed');
              break;
            }
          }
        }
      }

      if (!uploadError || isLargeFile) {
        // Success OR large file using in-memory only

        // Keep a local in-memory copy for immediate processing to avoid re-downloading
        if (!global.uploadedFiles) {
          global.uploadedFiles = new Map();
        }
        const inMemoryFile = {
          buffer: fileArrayBuffer,
          contentType: file.type,
          originalName: file.name,
          size: file.size
        };
        global.uploadedFiles.set(fileName, inMemoryFile);
        if (sanitizedBaseName !== fileName) {
          global.uploadedFiles.set(sanitizedBaseName, inMemoryFile);
        }

        if (isLargeFile) {
          console.log('[UPLOAD] Large file stored in memory only (Supabase Storage skipped to avoid timeout)');
        } else {
          console.log('[UPLOAD] File uploaded to Supabase Storage and stored in memory');
        }

        // Check for cached transcription (base layer only)
        const cachedTranscription = await getCachedTranscription(audioFingerprint);
        if (cachedTranscription) {
          const hydrated = await applyCachedTranscriptionToProject(
            project.id,
            cachedTranscription,
            estimatedDuration
          );

          if (hydrated) {
            console.log(`[UPLOAD] ♻️ Found cached transcription for fingerprint ${audioFingerprint}`);
            console.log(`[UPLOAD] 🎯 Will apply tier-specific features based on performance level`);

            // Increment reference count
            const { incrementReferenceCount } = await import('@/lib/transcription-cache');
            await incrementReferenceCount(audioFingerprint);

            // Continue to transcription endpoint to apply tier-specific features
            // Do NOT return early - let the tier processing happen
          }
        }
      }
      
      /* Temporarily disable chunking logic
      if (file.size > 20 * 1024 * 1024) { // 20MB threshold
        console.log('Large file detected, using chunked upload approach...');
        
        try {
          // Split file into smaller chunks for upload
          const chunkSize = 10 * 1024 * 1024; // 10MB chunks
          const totalChunks = Math.ceil(file.size / chunkSize);
          
          console.log(`Splitting into ${totalChunks} chunks of ~10MB each`);
          
          const chunks = [];
          for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            chunks.push(chunk);
            console.log(`Chunk ${i + 1}: ${start}-${end} bytes (${(chunk.size / 1024 / 1024).toFixed(2)}MB)`);
          }
          
          // Upload chunks sequentially and then combine
          const chunkPaths = [];
          for (let i = 0; i < chunks.length; i++) {
            const chunkPath = `${fileName}_chunk_${i}`;
            console.log(`Uploading chunk ${i + 1}/${chunks.length}...`);
            
            const chunkResult = await supabaseAdmin.storage
              .from('audio-files')
              .upload(chunkPath, chunks[i], {
                contentType: file.type,
                upsert: false
              });
              
            if (chunkResult.error) {
              throw new Error(`Chunk ${i + 1} upload failed: ${chunkResult.error.message}`);
            }
            
            chunkPaths.push(chunkPath);
          }
          
          // Download and combine chunks back into single file
          console.log('Combining chunks...');
          const combinedChunks = [];
          
          for (const chunkPath of chunkPaths) {
            const { data: chunkData, error: downloadError } = await supabaseAdmin.storage
              .from('audio-files')
              .download(chunkPath);
              
            if (downloadError) {
              throw new Error(`Failed to download chunk: ${downloadError.message}`);
            }
            
            const arrayBuffer = await chunkData.arrayBuffer();
            combinedChunks.push(arrayBuffer);
          }
          
          // Combine all chunks into single buffer
          const totalSize = combinedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const combinedBuffer = new ArrayBuffer(totalSize);
          const combinedView = new Uint8Array(combinedBuffer);
          
          let offset = 0;
          for (const chunk of combinedChunks) {
            combinedView.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          
          // Upload the combined file
          const finalUploadResult = await supabaseAdmin.storage
            .from('audio-files')
            .upload(fileName, combinedBuffer, {
              contentType: file.type,
              upsert: true // Allow overwrite
            });
            
          uploadData = finalUploadResult.data;
          uploadError = finalUploadResult.error;
          
          // Clean up chunk files
          for (const chunkPath of chunkPaths) {
            await supabaseAdmin.storage
              .from('audio-files')
              .remove([chunkPath]);
          }
          
          if (!uploadError) {
            console.log('Chunked upload completed successfully');
          }
          
        } catch (chunkError) {
          console.error('Chunked upload failed:', chunkError);
          uploadError = chunkError;
        }
        
      } else {
        // For smaller files, use normal upload with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            console.log(`Upload attempt ${retryCount + 1}/${maxRetries}`);
            
            const uploadResult = await supabaseAdmin.storage
              .from('audio-files')
              .upload(fileName, file, {
                contentType: file.type,
                upsert: false
              });
            
            uploadData = uploadResult.data;
            uploadError = uploadResult.error;
            
            if (!uploadError) {
              console.log(`Upload successful on attempt ${retryCount + 1}`);
              break;
            }
            
            throw uploadError;
            
          } catch (error) {
            retryCount++;
            uploadError = error;
            console.error(`Upload attempt ${retryCount} failed:`, error);
            
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
              console.log(`Retrying upload in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      }
      */

      if (uploadError && !isLargeFile) {
        // Only fail if it's NOT a large file using in-memory storage
        console.error(`File upload failed:`, uploadError);

        // Clean up project record
        await supabaseAdmin
          .from('projects')
          .delete()
          .eq('id', project.id);

        // Provide specific error messages
        const errorMessage = (uploadError as any)?.message || 'Unknown storage error';
        const errorCause = (uploadError as any)?.originalError?.cause?.code;

        if (errorMessage.includes('bucket') || errorMessage.includes('not found')) {
          return NextResponse.json(
            { error: 'Storage bucket not found. Please check Supabase Storage configuration.' },
            { status: 500 }
          );
        }

        if (errorCause === 'EPIPE' || errorMessage.includes('EPIPE') || errorMessage.includes('fetch failed')) {
          return NextResponse.json(
            {
              error: 'Upload connection interrupted. This can happen with large files. Please try again or use a smaller file.',
              details: 'Network connection to storage was lost during upload'
            },
            { status: 500 }
          );
        }

        if (errorMessage.includes('timeout')) {
          return NextResponse.json(
            { error: 'Upload timed out. The file may be too large. Please try with a smaller file.' },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            error: `Upload failed: ${errorMessage}`
          },
          { status: 500 }
        );
      } else if (uploadError && isLargeFile) {
        // Large file - Supabase Storage failed but we have in-memory copy, so continue
        console.log('[UPLOAD] ℹ️ Supabase Storage skipped for large file - using in-memory storage only');
      }

      if (isLargeFile) {
        console.log('[UPLOAD] ✅ Large file ready for processing (in-memory storage)');
      } else {
        console.log('[UPLOAD] ✅ File uploaded successfully to:', fileName);
      }

      // Update progress: upload complete, starting transcription
      await updateProcessingProgress(project.id, {
        stage: 'transcribing',
        progress: 0,
        message: 'Upload complete. Starting transcription...'
      });

      // Legacy status update for backwards compatibility
      const { error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-expect-error - Supabase types issue with update
        .update({
          processing_started_at: new Date().toISOString()
        })
        .eq('id', project.id);

      if (updateError) {
        console.error('Project update error:', updateError);
      }

      // Start transcription process (async) - only if OpenAI key is available
      if (process.env.OPENAI_API_KEY) {
        const diarizationProvider = (process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY) ? 'assemblyai' : 'deepgram';
        console.log(`[UPLOAD] Starting transcription with provider: ${diarizationProvider}`);

        // Build the base URL, handling VERCEL_URL which may or may not include protocol
        let baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = `https://${baseUrl}`;
        }

        // Fire-and-forget background transcription job
        fetch(`${baseUrl}/api/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: project.id,
            fileName: fileName,
            fingerprint: audioFingerprint,
            performanceLevel,
            diarizationProvider,
            ...(speakerCount && { speakerCount })
          })
        })
          .then(response => {
            // Consume the response body to prevent "disturbed" errors
            if (!response.ok) {
              return response.text().then(text => {
                console.error('Transcription start failed:', response.status, text);
                // Mark project as failed so UI stops showing "processing"
                (supabaseAdmin
                  .from('projects') as any)
                  .update({ status: 'failed', processing_stage: 'failed', processing_message: `Transcription failed: ${response.status}` })
                  .eq('id', project.id)
                  .then(() => console.log(`[UPLOAD] Marked project ${project.id} as failed`));
              });
            }
            return response.json().catch(() => null);
          })
          .catch(error => {
            console.error('Failed to start transcription:', error);
            // Mark project as failed so UI stops showing "uploading"
            (supabaseAdmin
              .from('projects') as any)
              .update({ status: 'failed', processing_stage: 'failed', processing_message: `Failed to reach transcription service: ${error.message || error}` })
              .eq('id', project.id)
              .then(() => console.log(`[UPLOAD] Marked project ${project.id} as failed (fetch error)`));
          });
      } else {
        console.warn('OpenAI API key not found, transcription skipped');
      }

      return NextResponse.json({
        success: true,
        projectId: project.id,
        message: 'File uploaded successfully, transcription starting...'
      });

    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
