// Audio chunking utility for large files that exceed Whisper's 25MB limit
// Based on the Python implementation with overlap to preserve context

export interface AudioChunk {
  data: Blob;
  filename: string;
  startTime: number;
  endTime: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface ChunkingOptions {
  maxSizeMB?: number;
  overlapSeconds?: number;
  estimatedBitrate?: number; // kbps
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  maxSizeMB: 20, // Use 20MB to be well under OpenAI's 25MB limit
  overlapSeconds: 30, // 30 seconds of overlap for good context
  estimatedBitrate: 128 // 128 kbps default
};

/**
 * Calculate how many segments we need and their duration
 */
function calculateSegmentInfo(
  durationSeconds: number, 
  overlapSeconds: number, 
  maxSizeMB: number, 
  bitrateKbps: number
): { numSegments: number; segmentDuration: number } {
  // Calculate max seconds per chunk based on file size limit
  const secondsForMaxSize = (maxSizeMB * 8 * 1024) / bitrateKbps;
  
  // Calculate number of segments needed
  const numSegments = Math.max(2, Math.floor(durationSeconds / secondsForMaxSize) + 1);
  
  // Calculate actual segment duration including overlap
  const totalOverlap = (numSegments - 1) * overlapSeconds;
  const actualPlayableDuration = (durationSeconds - totalOverlap) / numSegments;
  const segmentDuration = actualPlayableDuration + overlapSeconds;
  
  return { numSegments, segmentDuration };
}

/**
 * Estimate audio duration from file size and bitrate
 */
function estimateAudioDuration(fileSizeBytes: number, bitrateKbps: number): number {
  return (fileSizeBytes * 8) / (bitrateKbps * 1000);
}

/**
 * Check if file needs chunking
 */
export function needsChunking(fileSizeBytes: number, maxSizeMB: number = 20): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return fileSizeBytes > maxSizeBytes;
}

/**
 * Simple chunking for audio files - creates time-based segments
 * Note: This creates approximate chunks by byte slicing, which may not be perfect
 * but works reasonably well for most MP3 files
 */
export async function chunkAudioFile(
  audioFile: File, 
  options: ChunkingOptions = {}
): Promise<AudioChunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Check if chunking is needed
  if (!needsChunking(audioFile.size, opts.maxSizeMB)) {
    return [{
      data: audioFile,
      filename: audioFile.name,
      startTime: 0,
      endTime: estimateAudioDuration(audioFile.size, opts.estimatedBitrate),
      chunkIndex: 0,
      totalChunks: 1
    }];
  }

  try {
    // Use a simpler approach: divide file into equal byte chunks
    // This isn't perfect but works better than complex time-based calculation
    
    const chunkSizeBytes = opts.maxSizeMB * 1024 * 1024;
    const numSegments = Math.ceil(audioFile.size / chunkSizeBytes);
    const estimatedDuration = estimateAudioDuration(audioFile.size, opts.estimatedBitrate);
    
    console.log(`Chunking ${audioFile.name} into ${numSegments} segments of ~${opts.maxSizeMB}MB each`);

    const chunks: AudioChunk[] = [];
    
    for (let i = 0; i < numSegments; i++) {
      const startByte = i * chunkSizeBytes;
      const endByte = Math.min(startByte + chunkSizeBytes, audioFile.size);
      
      // Calculate estimated time positions
      const startTime = (startByte / audioFile.size) * estimatedDuration;
      const endTime = (endByte / audioFile.size) * estimatedDuration;
      
      // Create chunk blob - simple byte slicing
      const chunkBlob = audioFile.slice(startByte, endByte, audioFile.type);
      
      console.log(`Creating chunk ${i + 1}: ${startByte} - ${endByte} bytes (${(chunkBlob.size / 1024 / 1024).toFixed(2)}MB)`);
      
      chunks.push({
        data: chunkBlob,
        filename: `${audioFile.name.replace(/\.[^/.]+$/, '')}_chunk_${i + 1}.mp3`,
        startTime,
        endTime,
        chunkIndex: i,
        totalChunks: numSegments
      });
    }

    return chunks;

  } catch (error) {
    console.error('Error chunking audio file:', error);
    throw new Error('Failed to chunk audio file');
  }
}

/**
 * Merge transcription results from multiple chunks, handling overlap
 */
export function mergeChunkedTranscriptions(
  transcriptions: Array<{
    text: string;
    startTime: number;
    endTime: number;
    chunkIndex: number;
  }>,
  overlapSeconds: number = 30
): string {
  if (transcriptions.length === 1) {
    return transcriptions[0].text;
  }

  // Sort by chunk index to ensure proper order
  const sortedTranscriptions = transcriptions.sort((a, b) => a.chunkIndex - b.chunkIndex);
  
  let mergedText = sortedTranscriptions[0].text;

  for (let i = 1; i < sortedTranscriptions.length; i++) {
    const currentChunk = sortedTranscriptions[i];
    const previousChunk = sortedTranscriptions[i - 1];
    
    // Simple overlap handling - in production you'd want more sophisticated deduplication
    // Look for repeated sentences at the beginning of the current chunk
    const currentWords = currentChunk.text.split(' ');
    const overlapWordCount = Math.floor(currentWords.length * 0.1); // Remove ~10% from start (overlap portion)
    
    const deduplicatedText = currentWords.slice(overlapWordCount).join(' ');
    mergedText += ' ' + deduplicatedText;
  }

  return mergedText.trim();
}

/**
 * Estimate processing cost for chunked audio
 */
export function estimateProcessingCost(
  chunks: AudioChunk[], 
  costPerMinute: number = 0.006
): { totalMinutes: number; estimatedCost: number } {
  const totalMinutes = chunks.reduce((sum, chunk) => {
    return sum + (chunk.endTime - chunk.startTime) / 60;
  }, 0);
  
  return {
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    estimatedCost: Math.round(totalMinutes * costPerMinute * 100) / 100
  };
}