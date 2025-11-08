// PyAnnote Speaker Diarization Integration
// This module provides a bridge between Node.js and the Python PyAnnote service

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TranscriptionSegment, SpeakerSegment } from './speaker-detection';
// import { alignByWords } from './speaker-align';

export interface PyAnnoteResult {
  success: boolean;
  method: string;
  speaker_segments?: SpeakerSegment[];
  metadata?: {
    total_speakers: number;
    total_segments: number;
    audio_file: string;
    processed_at: string;
  };
  error?: string;
}

export interface PyAnnoteConfig {
  pythonPath?: string;
  scriptPath?: string;
  timeout?: number;
  tempDir?: string;
}

/**
 * Check if PyAnnote dependencies are available
 */
export async function checkPyAnnoteAvailability(): Promise<boolean> {
  try {
    console.log('[PYANNOTE] Checking availability...');
    
    const scriptPath = path.join(process.cwd(), 'scripts', 'pyannote_diarization.py');
    const scriptExists = await fs.access(scriptPath).then(() => true).catch(() => false);
    
    if (!scriptExists) {
      console.log('[PYANNOTE] ❌ Python script not found at:', scriptPath);
      return false;
    }
    
    // Test Python and dependencies
    const pythonPath = process.env.PYANNOTE_PYTHON_PATH || 'python3';
    
    return new Promise((resolve) => {
      const testProcess = spawn(pythonPath, ['-c', 'import pyannote.audio; import torch; print("OK")'], {
        stdio: 'pipe'
      });
      
      let output = '';
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      testProcess.on('close', (code) => {
        const available = code === 0 && output.includes('OK');
        console.log(`[PYANNOTE] Availability check: ${available ? '✅ Available' : '❌ Not available'}`);
        if (!available) {
          console.log('[PYANNOTE] Install dependencies: cd scripts && pip install -r requirements.txt');
        }
        resolve(available);
      });
      
      testProcess.on('error', (error) => {
        console.log('[PYANNOTE] ❌ Python execution error:', error.message);
        resolve(false);
      });
      
      // Timeout after 30 seconds (PyAnnote imports can be slow)
      setTimeout(() => {
        testProcess.kill();
        console.log('[PYANNOTE] ❌ Availability check timeout');
        resolve(false);
      }, 30000);
    });
    
  } catch (error) {
    console.log('[PYANNOTE] ❌ Availability check failed:', error);
    return false;
  }
}

/**
 * Calculate optimal timeout based on expected device performance
 */
function calculateOptimalTimeout(durationMinutes: number, fileSizeMB: number): number {
  // Base timeout calculations for different scenarios
  // These are based on PyAnnote 3.1 performance benchmarks
  
  // GPU scenarios (MPS/CUDA) - much faster processing
  const gpuTimeoutMinutes = Math.max(5, durationMinutes * 3); // 3x audio duration minimum
  
  // CPU scenarios - significantly slower, especially with PyAnnote 3.1
  const cpuTimeoutMinutes = Math.max(10, durationMinutes * 20); // 20x audio duration minimum
  
  // Default to CPU timeout for safety (script will detect actual device)
  // The Python script will use GPU if available, but we plan for worst case
  const timeoutMinutes = cpuTimeoutMinutes;
  
  // Convert to milliseconds
  const timeoutMs = timeoutMinutes * 60 * 1000;
  
  console.log(`[PYANNOTE] ⏱️ Timeout calculation: ${durationMinutes.toFixed(1)}min audio → ${timeoutMinutes.toFixed(1)}min timeout (assuming CPU worst-case)`);
  
  return timeoutMs;
}

/**
 * Run PyAnnote speaker diarization on an audio file
 */
export async function runPyAnnoteDiarization(
  audioFilePath: string,
  transcriptionSegments?: TranscriptionSegment[],
  config: PyAnnoteConfig = {}
): Promise<PyAnnoteResult> {
  const startTime = Date.now();
  console.log(`[PYANNOTE] 🚀 Starting diarization for: ${path.basename(audioFilePath)}`);
  
  // Calculate intelligent timeout based on expected device performance
  const audioStats = await fs.stat(audioFilePath);
  const audioSizeGB = audioStats.size / (1024 * 1024 * 1024);
  const audioSizeMB = audioSizeGB * 1024;
  
  // Estimate audio duration from file size (rough approximation: 1MB ≈ 1 minute for typical quality)
  const estimatedDurationMinutes = Math.max(1, audioSizeMB / 1024 * 60); // Rough duration estimate
  
  // Device-aware timeout calculation
  // GPU/MPS: 2-3x audio duration, CPU: 15-20x audio duration (based on PyAnnote 3.1 performance)
  const dynamicTimeout = calculateOptimalTimeout(estimatedDurationMinutes, audioSizeMB);
  
  console.log(`[PYANNOTE] 📊 Estimated duration: ${estimatedDurationMinutes.toFixed(1)} minutes, timeout: ${(dynamicTimeout/60000).toFixed(1)} minutes`);
  
  const {
    pythonPath = process.env.PYANNOTE_PYTHON_PATH || 'python3',
    scriptPath = path.join(process.cwd(), 'scripts', 'pyannote_diarization.py'),
    timeout = dynamicTimeout,
    tempDir = os.tmpdir()
  } = config;
  
  console.log(`[PYANNOTE] 📊 Audio size: ${audioSizeGB.toFixed(2)}GB, estimated timeout: ${(timeout/60000).toFixed(1)} minutes`);
  
  // Check if script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    console.error('[PYANNOTE] ❌ Script not found:', scriptPath);
    return {
      success: false,
      method: 'pyannote',
      error: 'PyAnnote script not found'
    };
  }
  
  // Check if audio file exists
  try {
    await fs.access(audioFilePath);
  } catch (error) {
    console.error('[PYANNOTE] ❌ Audio file not found:', audioFilePath);
    return {
      success: false,
      method: 'pyannote',
      error: 'Audio file not found'
    };
  }
  
  let tempTranscriptionFile: string | null = null;
  let tempOutputFile: string | null = null;
  
  try {
    // Create temporary files for input/output
    tempOutputFile = path.join(tempDir, `pyannote_output_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    
    const args = [scriptPath, audioFilePath, '--output', tempOutputFile];
    
    // Note: We now do alignment in TypeScript, not in Python
    // This allows for better error handling and more flexible alignment algorithms
    
    console.log(`[PYANNOTE] 🐍 Executing: ${pythonPath} ${args.join(' ')}`);
    
    // Run PyAnnote script with environment variables
    const result = await new Promise<PyAnnoteResult>((resolve, reject) => {
      const pyannoteProcess = spawn(pythonPath, args, {
        stdio: 'pipe',
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          HUGGING_FACE_ACCESS_TOKEN: process.env.HUGGING_FACE_ACCESS_TOKEN
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      pyannoteProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pyannoteProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log Python script output in real-time
        console.log('[PYANNOTE]', data.toString().trim());
      });
      
      pyannoteProcess.on('close', async (code) => {
        try {
          if (code === 0) {
            // Read result from output file
            const resultData = await fs.readFile(tempOutputFile!, 'utf-8');
            const pyannoteResult: PyAnnoteResult = JSON.parse(resultData);
            
            // Add processing time metadata
            if (pyannoteResult.metadata) {
              pyannoteResult.metadata.processed_at = new Date().toISOString();
            }
            
            console.log(`[PYANNOTE] ✅ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            console.log(`[PYANNOTE] Result: ${pyannoteResult.metadata?.total_speakers || 0} speakers, ${pyannoteResult.metadata?.total_segments || 0} segments`);
            
            resolve(pyannoteResult);
          } else {
            console.error(`[PYANNOTE] ❌ Process failed with code ${code}`);
            console.error(`[PYANNOTE] stderr:`, stderr);
            resolve({
              success: false,
              method: 'pyannote',
              error: `PyAnnote process failed with code ${code}: ${stderr}`
            });
          }
        } catch (error) {
          console.error('[PYANNOTE] ❌ Failed to read result:', error);
          resolve({
            success: false,
            method: 'pyannote',
            error: `Failed to read PyAnnote result: ${error}`
          });
        }
      });
      
      pyannoteProcess.on('error', (error) => {
        console.error('[PYANNOTE] ❌ Process error:', error);
        resolve({
          success: false,
          method: 'pyannote',
          error: `PyAnnote process error: ${error.message}`
        });
      });
      
      // Set timeout with periodic progress logging
      let progressInterval: NodeJS.Timeout;
      const timeoutId = setTimeout(() => {
        console.log(`[PYANNOTE] ⏰ Timeout reached after ${(timeout/60000).toFixed(1)} minutes, killing process`);
        clearInterval(progressInterval);
        try {
          pyannoteProcess.kill('SIGTERM');
          setTimeout(() => {
            if (!pyannoteProcess.killed) {
              console.log('[PYANNOTE] 💥 Force killing with SIGKILL');
              pyannoteProcess.kill('SIGKILL');
            }
          }, 5000);
        } catch (killError) {
          console.log('[PYANNOTE] ❌ Error killing process:', killError);
        }
        resolve({
          success: false,
          method: 'pyannote',
          error: `PyAnnote process timeout after ${(timeout/60000).toFixed(1)} minutes`
        });
      }, timeout);
      
      // Progress logging every 30 seconds
      progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[PYANNOTE] 🔄 Still processing... elapsed: ${elapsed.toFixed(0)}s / ${(timeout/1000).toFixed(0)}s`);
      }, 30000);
      
      pyannoteProcess.on('close', () => {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
      });
    });
    
    return result;
    
  } catch (error) {
    console.error('[PYANNOTE] ❌ Unexpected error:', error);
    return {
      success: false,
      method: 'pyannote',
      error: `Unexpected error: ${error}`
    };
  } finally {
    // Cleanup temporary files
    try {
      if (tempTranscriptionFile) {
        await fs.unlink(tempTranscriptionFile);
        console.log('[PYANNOTE] 🧹 Cleaned up transcription temp file');
      }
      if (tempOutputFile) {
        await fs.unlink(tempOutputFile);
        console.log('[PYANNOTE] 🧹 Cleaned up output temp file');
      }
    } catch (cleanupError) {
      console.warn('[PYANNOTE] ⚠️ Cleanup warning:', cleanupError);
    }
  }
}

/**
 * Convert PyAnnote result to our SpeakerSegment format
 */
export function convertPyAnnoteResult(pyannoteResult: PyAnnoteResult): SpeakerSegment[] {
  if (!pyannoteResult.success || !pyannoteResult.speaker_segments) {
    console.warn('[PYANNOTE] ⚠️ Invalid result, returning empty segments');
    return [];
  }
  
  return pyannoteResult.speaker_segments.map(segment => ({
    speakerId: segment.speakerId,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text || '',
    confidence: segment.confidence || 0.9
  }));
}

/**
 * Enhanced speaker detection using NeMo Sortformer with PyAnnote fallback
 * This implements NeMo (primary) + PyAnnote (fallback) + Whisper pipeline
 */
export async function enhancedSpeakerDetection(
  transcriptionSegments: TranscriptionSegment[],
  audioFilePath?: string
): Promise<SpeakerSegment[]> {
  console.log(`[SPEAKER] 🎯 Enhanced speaker detection starting...`);
  console.log(`[SPEAKER] Input: ${transcriptionSegments.length} transcription segments`);
  console.log(`[SPEAKER] Audio file: ${audioFilePath ? 'provided' : 'not provided'}`);
  
  // Audio file is REQUIRED for proper voice analysis
  if (!audioFilePath) {
    console.log('[SPEAKER] ❌ No audio file provided - speaker diarization requires raw audio');
    throw new Error('Speaker diarization requires audio file - no fallback allowed');
  }
  
  // Import NeMo integration
  const { checkNeMoAvailability, enhancedSpeakerDetectionWithNeMo } = await import('./nemo-integration');
  
  // Strategy 1: Try NeMo Sortformer first (more accurate for conversations)
  console.log('[SPEAKER] 🔄 Attempting NeMo Sortformer diarization (primary method)...');
  
  try {
    const nemoAvailable = await checkNeMoAvailability();
    
    if (nemoAvailable) {
      console.log('[SPEAKER] ✅ NeMo available, using Sortformer for speaker detection');
      
      // Use NeMo with offline model for best accuracy (can configure for streaming if needed)
      const nemoResult = await enhancedSpeakerDetectionWithNeMo(
        transcriptionSegments, 
        audioFilePath,
        {
          useStreaming: process.env.NEMO_USE_STREAMING === 'true', // Environment flag to switch models
          forceDevice: process.env.NEMO_DEVICE as any // Allow forcing specific device
        }
      );
      
      console.log(`[SPEAKER] ✅ NeMo Sortformer completed successfully with ${nemoResult.length} segments`);
      return nemoResult;
      
    } else {
      console.log('[SPEAKER] ⚠️ NeMo not available, falling back to PyAnnote...');
    }
  } catch (nemoError) {
    console.error('[SPEAKER] ⚠️ NeMo failed:', nemoError);
    console.log('[SPEAKER] 🔄 Falling back to PyAnnote...');
  }
  
  // Strategy 2: Fallback to PyAnnote if NeMo fails or unavailable
  console.log('[SPEAKER] 🔄 Using PyAnnote as fallback method...');
  
  try {
    // Check availability first
    const isAvailable = await checkPyAnnoteAvailability();
    
    if (!isAvailable) {
      console.log('[SPEAKER] ❌ Neither NeMo nor PyAnnote available');
      throw new Error('No speaker diarization system available - install NeMo or PyAnnote');
    }
    
    // Run PyAnnote on raw audio
    console.log('[SPEAKER] 🎙️ Running PyAnnote diarization on raw audio...');
    const pyannoteResult = await runPyAnnoteDiarization(audioFilePath);
    
    if (pyannoteResult.success && pyannoteResult.speaker_segments) {
      console.log(`[SPEAKER] ✅ PyAnnote audio analysis succeeded with ${pyannoteResult.speaker_segments.length} speaker segments`);
      
      // Align PyAnnote speaker segments with Whisper transcription segments
      console.log('[SPEAKER] 🔄 Aligning PyAnnote speakers with Whisper transcription...');
      const alignedSegments = alignSpeakerWithTranscription(
        pyannoteResult.speaker_segments,
        transcriptionSegments
      );
      
      console.log(`[SPEAKER] ✅ PyAnnote alignment complete: ${alignedSegments.length} final segments`);
      return alignedSegments;
    } else {
      console.log(`[SPEAKER] ❌ PyAnnote failed: ${pyannoteResult.error}`);
      throw new Error(`PyAnnote failed: ${pyannoteResult.error}`);
    }
  } catch (error) {
    console.error('[SPEAKER] ❌ All speaker detection methods failed:', error);
    throw new Error(`Speaker detection failed: ${error}`);
  }
}

/**
 * Create natural conversation segments based on PyAnnote speaker boundaries
 */
function alignSpeakerWithTranscription(
  speakerSegments: SpeakerSegment[],
  transcriptionSegments: TranscriptionSegment[]
): SpeakerSegment[] {
  const conversationSegments: SpeakerSegment[] = [];
  
  for (const speakerBoundary of speakerSegments) {
    const transcriptionsInBoundary = transcriptionSegments.filter(trans => {
      const transMidpoint = (trans.start + trans.end) / 2;
      const hasOverlap = !(trans.end <= speakerBoundary.startTime || trans.start >= speakerBoundary.endTime);
      const midpointInBoundary = transMidpoint >= speakerBoundary.startTime && transMidpoint <= speakerBoundary.endTime;
      return hasOverlap || midpointInBoundary;
    });
    
    if (transcriptionsInBoundary.length === 0) {
      conversationSegments.push({
        speakerId: speakerBoundary.speakerId,
        startTime: speakerBoundary.startTime,
        endTime: speakerBoundary.endTime,
        text: '[No clear speech detected]',
        confidence: 0.3
      });
    } else {
      const combinedText = transcriptionsInBoundary
        .sort((a, b) => a.start - b.start)
        .map(trans => trans.text.trim())
        .filter(text => text.length > 0)
        .join(' ');
      
      const actualStart = Math.max(speakerBoundary.startTime, Math.min(...transcriptionsInBoundary.map(t => t.start)));
      const actualEnd = Math.min(speakerBoundary.endTime, Math.max(...transcriptionsInBoundary.map(t => t.end)));
      
      conversationSegments.push({
        speakerId: speakerBoundary.speakerId,
        startTime: actualStart,
        endTime: actualEnd,
        text: combinedText || '[Unclear speech]',
        confidence: speakerBoundary.confidence || 0.9
      });
    }
  }
  
  return conversationSegments.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Setup instructions for speaker diarization systems
 */
export function getSpeakerDiarizationSetupInstructions(): string {
  return `
Speaker Diarization Setup Options:

OPTION 1: NVIDIA NeMo Sortformer (RECOMMENDED)
1. Run automated setup:
   cd scripts && ./setup_nemo.sh

2. Or install manually:
   sudo apt-get install libsndfile1 ffmpeg  # Linux
   brew install libsndfile ffmpeg          # macOS
   pip3 install torch torchaudio Cython packaging
   pip3 install nemo_toolkit[asr]

3. Configure (optional):
   export NEMO_USE_STREAMING=true    # Use faster streaming model
   export NEMO_DEVICE=cuda           # Force specific device

OPTION 2: PyAnnote (FALLBACK)
1. Install dependencies:
   cd scripts && pip install -r requirements.txt

2. Configure:
   export PYANNOTE_PYTHON_PATH=/path/to/python3
   export HUGGING_FACE_ACCESS_TOKEN=your_token

The system will automatically try NeMo first (better accuracy), 
then fall back to PyAnnote if NeMo is unavailable.

Benefits of NeMo Sortformer:
- Better accuracy on conversation data
- Handles longer audio (>17 minutes)  
- Reduces duplicate segments
- More natural speaker boundaries
- Free and open source
  `.trim();
}

/**
 * Legacy function for backward compatibility
 */
export function getPyAnnoteSetupInstructions(): string {
  return getSpeakerDiarizationSetupInstructions();
}