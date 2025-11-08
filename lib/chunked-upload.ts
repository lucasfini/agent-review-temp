// Chunked upload utility for large files to avoid timeout issues

export interface UploadChunk {
  data: Promise<ArrayBuffer>;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
  uploadId: string;
}

export interface ChunkedUploadOptions {
  chunkSizeMB?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: (progress: number) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
}

const DEFAULT_OPTIONS: Required<ChunkedUploadOptions> = {
  chunkSizeMB: 10, // 10MB chunks
  maxRetries: 3,
  retryDelayMs: 1000,
  onProgress: () => {},
  onChunkComplete: () => {}
};

/**
 * Check if file needs chunked upload
 */
export function needsChunkedUpload(fileSizeBytes: number, chunkSizeMB: number = 25): boolean {
  const chunkSizeBytes = chunkSizeMB * 1024 * 1024;
  return fileSizeBytes > chunkSizeBytes;
}

/**
 * Split file into chunks for upload
 */
export function createFileChunks(file: File, chunkSizeMB: number = 10): UploadChunk[] {
  const chunkSizeBytes = chunkSizeMB * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSizeBytes);
  const uploadId = generateUploadId();
  const chunks: UploadChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const chunkBlob = file.slice(start, end);
    
    chunks.push({
      data: chunkBlob.arrayBuffer(),
      chunkIndex: i,
      totalChunks,
      fileName: file.name,
      uploadId
    });
  }

  return chunks;
}

/**
 * Upload file with chunking support and retry logic
 */
export async function uploadFileWithChunking(
  file: File,
  uploadUrl: string,
  options: ChunkedUploadOptions = {}
): Promise<{ success: boolean; uploadId?: string; error?: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Check if chunking is needed
    if (!needsChunkedUpload(file.size, opts.chunkSizeMB)) {
      // Upload normally for smaller files
      return await uploadSingleFile(file, uploadUrl, opts);
    }

    // Create chunks
    const chunks = createFileChunks(file, opts.chunkSizeMB);
    const uploadId = chunks[0].uploadId;

    console.log(`Uploading ${file.name} in ${chunks.length} chunks of ~${opts.chunkSizeMB}MB each`);

    // Upload chunks sequentially with retry logic
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkData = await chunk.data; // Resolve the ArrayBuffer promise

      let retryCount = 0;
      let success = false;

      while (retryCount < opts.maxRetries && !success) {
        try {
          console.log(`Uploading chunk ${i + 1}/${chunks.length} (attempt ${retryCount + 1})`);

          const formData = new FormData();
          formData.append('chunk', new Blob([chunkData], { type: file.type }));
          formData.append('chunkIndex', i.toString());
          formData.append('totalChunks', chunks.length.toString());
          formData.append('uploadId', uploadId);
          formData.append('fileName', file.name);

          const response = await fetch(`${uploadUrl}/chunk`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Chunk upload failed: ${response.statusText}`);
          }

          success = true;
          opts.onChunkComplete(i, chunks.length);
          opts.onProgress((i + 1) / chunks.length * 100);

        } catch (error) {
          retryCount++;
          console.error(`Chunk ${i + 1} upload attempt ${retryCount} failed:`, error);

          if (retryCount < opts.maxRetries) {
            const delay = opts.retryDelayMs * Math.pow(2, retryCount - 1); // Exponential backoff
            console.log(`Retrying chunk ${i + 1} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!success) {
        throw new Error(`Failed to upload chunk ${i + 1} after ${opts.maxRetries} attempts`);
      }
    }

    // Finalize upload
    const finalizeResponse = await fetch(`${uploadUrl}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        fileName: file.name,
        totalChunks: chunks.length,
        fileSize: file.size
      })
    });

    if (!finalizeResponse.ok) {
      throw new Error(`Failed to finalize upload: ${finalizeResponse.statusText}`);
    }

    return { success: true, uploadId };

  } catch (error) {
    console.error('Chunked upload failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown upload error' 
    };
  }
}

/**
 * Upload single file (for smaller files)
 */
async function uploadSingleFile(
  file: File,
  uploadUrl: string,
  options: Required<ChunkedUploadOptions>
): Promise<{ success: boolean; uploadId?: string; error?: string }> {
  try {
    console.log(`Uploading ${file.name} as single file (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    options.onProgress(100);

    return { success: true, uploadId: result.projectId };

  } catch (error) {
    console.error('Single file upload failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown upload error' 
    };
  }
}

/**
 * Generate unique upload ID
 */
function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Calculate total upload time estimate
 */
export function estimateUploadTime(fileSizeBytes: number, avgSpeedMbps: number = 10): number {
  const fileSizeMb = fileSizeBytes / 1024 / 1024;
  return Math.ceil(fileSizeMb / avgSpeedMbps * 8); // Convert to seconds
}