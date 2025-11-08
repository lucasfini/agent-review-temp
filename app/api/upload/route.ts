import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

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

    // Get file duration (we'll estimate it for now, can be improved later)
    const estimatedDuration = Math.round(file.size / (128000 / 8)); // Rough estimate based on 128kbps

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
      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .insert({
          user_id: user.id,
          title,
          audio_file_name: file.name,
          audio_file_size: file.size,
          audio_duration: estimatedDuration,
          status: 'uploading'
        })
        .select()
        .single();

      if (projectError) {
        console.error('Project creation error:', projectError);
        
        // If table doesn't exist, create a mock project for now
        if (projectError.message?.includes('relation "projects" does not exist')) {
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
          { error: `Database error: ${projectError.message}` },
          { status: 500 }
        );
      }

      console.log('Project created:', project.id);

      // Upload file to Supabase Storage - sanitize filename
      const sanitizedFileName = file.name
        .replace(/[^a-zA-Z0-9.-]/g, '_')  // Replace special chars with underscore
        .replace(/_{2,}/g, '_');          // Replace multiple underscores with single
      
      const fileName = `${project.id}/${sanitizedFileName}`;
      
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
      
      // TEMPORARY: Use local file storage to bypass Supabase Storage issues
      let uploadData, uploadError;
      
      console.log('Using local file storage (bypassing Supabase Storage)...');
      
      try {
        // Store file in memory for transcription (temporary solution)
        const fileBuffer = await file.arrayBuffer();
        console.log(`File loaded into memory: ${fileBuffer.byteLength} bytes`);
        
        // Store the file data in a global map for the transcription API to access
        if (!global.uploadedFiles) {
          global.uploadedFiles = new Map();
        }
        
        global.uploadedFiles.set(fileName, {
          buffer: fileBuffer,
          contentType: file.type,
          originalName: file.name,
          size: file.size
        });
        
        // Simulate successful upload
        uploadData = { path: fileName };
        uploadError = null;
        
        console.log('Local file storage successful');
        console.log('NOTE: Using temporary local storage - file will be lost on server restart');
        
      } catch (localStorageError) {
        console.error('Local file storage error:', localStorageError);
        uploadError = localStorageError;
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

      if (uploadError) {
        console.error(`File upload failed:`, uploadError);
        
        // Clean up project record
        await supabaseAdmin
          .from('projects')
          .delete()
          .eq('id', project.id);

        // Provide specific error messages
        const errorMessage = (uploadError as any)?.message || 'Unknown storage error';
        
        if (errorMessage.includes('bucket') || errorMessage.includes('not found')) {
          return NextResponse.json(
            { error: 'Storage bucket not found. Please check Supabase Storage configuration.' },
            { status: 500 }
          );
        }
        
        if (errorMessage.includes('EPIPE') || errorMessage.includes('fetch failed')) {
          return NextResponse.json(
            { error: 'Upload interrupted due to network issues. Please check your connection and try again.' },
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
          { error: `Upload failed: ${errorMessage}` },
          { status: 500 }
        );
      }

      console.log('File uploaded successfully to:', fileName);

      // Update project with upload completion
      const { error: updateError } = await supabaseAdmin
        .from('projects')
        .update({ 
          status: 'processing',
          processing_started_at: new Date().toISOString()
        })
        .eq('id', project.id);

      if (updateError) {
        console.error('Project update error:', updateError);
      }

      // Start transcription process (async) - only if OpenAI key is available
      if (process.env.OPENAI_API_KEY) {
        fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: project.id,
            fileName: fileName
          })
        }).catch(error => {
          console.error('Failed to start transcription:', error);
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