// NVIDIA NeMo Sortformer Speaker Diarization Integration
// This module provides a bridge between Node.js and the Python NeMo Sortformer service
// Designed to replace PyAnnote with more accurate transformer-based diarization

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TranscriptionSegment, SpeakerSegment } from './speaker-detection';
// import { alignByWords } from './speaker-align';

export interface NeMoResult {
  success: boolean;
  method: string;
  model_type?: 'streaming' | 'offline';
  speaker_segments?: SpeakerSegment[];
  metadata?: {
    total_speakers: number;
    total_segments: number;
    audio_file: string;
    processed_at: string;
    device_used: string;
  };
  error?: string;
}

export interface NeMoConfig {
  pythonPath?: string;
  scriptPath?: string;
  timeout?: number;
  tempDir?: string;
  useStreaming?: boolean; // Use streaming model for faster processing
  forceDevice?: 'cpu' | 'cuda' | 'mps'; // Force specific device
}

/**
 * Check if NeMo dependencies are available
 */
export async function checkNeMoAvailability(): Promise<boolean> {
  try {
    console.log('[NEMO] Checking availability...');
    
    const scriptPath = path.join(process.cwd(), 'scripts', 'nemo_diarization.py');
    const scriptExists = await fs.access(scriptPath).then(() => true).catch(() => false);
    
    if (!scriptExists) {
      console.log('[NEMO] ❌ Python script not found at:', scriptPath);
      return false;
    }
    
    // Test Python and dependencies
    const pythonPath = process.env.NEMO_PYTHON_PATH || process.env.PYANNOTE_PYTHON_PATH || 'python3';
    
    return new Promise((resolve) => {
      const testProcess = spawn(pythonPath, ['-c', 'from nemo.collections.asr.models import SortformerEncLabelModel; import torch; print("OK")'], {
        stdio: 'pipe'
      });
      
      let output = '';
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      testProcess.on('close', (code) => {
        const available = code === 0 && output.includes('OK');
        console.log(`[NEMO] Availability check: ${available ? '✅ Available' : '❌ Not available'}`);
        if (!available) {
          console.log('[NEMO] Install dependencies: cd scripts && ./setup_nemo.sh');
        }
        resolve(available);
      });
      
      testProcess.on('error', (error) => {
        console.log('[NEMO] ❌ Python execution error:', error.message);
        resolve(false);
      });
      
      // Timeout after 30 seconds (NeMo imports can be slow)
      setTimeout(() => {
        testProcess.kill();
        console.log('[NEMO] ❌ Availability check timeout');
        resolve(false);
      }, 30000);
    });
    
  } catch (error) {
    console.log('[NEMO] ❌ Availability check failed:', error);
    return false;
  }
}

/**
 * Calculate optimal timeout based on audio characteristics and model type
 */
function calculateNeMoTimeout(durationMinutes: number, fileSizeMB: number, streaming: boolean = false): number {
  // NeMo Sortformer is generally faster than PyAnnote
  // Streaming model is significantly faster than offline model
  
  if (streaming) {
    // Streaming model: roughly real-time processing on GPU, 2-3x on CPU
    const gpuTimeoutMinutes = Math.max(2, durationMinutes * 1.5); // 1.5x audio duration
    const cpuTimeoutMinutes = Math.max(5, durationMinutes * 3); // 3x audio duration
    const timeoutMinutes = cpuTimeoutMinutes; // Plan for worst case
    
    console.log(`[NEMO] ⏱️ Streaming timeout: ${durationMinutes.toFixed(1)}min audio → ${timeoutMinutes.toFixed(1)}min timeout`);
    return timeoutMinutes * 60 * 1000;
  } else {
    // Offline model: higher accuracy but slower processing
    const gpuTimeoutMinutes = Math.max(3, durationMinutes * 2); // 2x audio duration
    const cpuTimeoutMinutes = Math.max(8, durationMinutes * 10); // 10x audio duration
    const timeoutMinutes = cpuTimeoutMinutes; // Plan for worst case
    
    console.log(`[NEMO] ⏱️ Offline timeout: ${durationMinutes.toFixed(1)}min audio → ${timeoutMinutes.toFixed(1)}min timeout`);
    return timeoutMinutes * 60 * 1000;
  }
}

/**
 * Run NeMo Sortformer speaker diarization on an audio file
 */
export async function runNeMoDiarization(
  audioFilePath: string,
  transcriptionSegments?: TranscriptionSegment[],
  config: NeMoConfig = {}
): Promise<NeMoResult> {
  const startTime = Date.now();
  console.log(`[NEMO] 🚀 Starting Sortformer diarization for: ${path.basename(audioFilePath)}`);
  
  // Calculate intelligent timeout based on model type and audio characteristics
  const audioStats = await fs.stat(audioFilePath);
  const audioSizeGB = audioStats.size / (1024 * 1024 * 1024);
  const audioSizeMB = audioSizeGB * 1024;
  
  // Estimate audio duration from file size (rough approximation: 1MB ≈ 1 minute for typical quality)
  const estimatedDurationMinutes = Math.max(1, audioSizeMB / 1024 * 60);
  
  const {
    pythonPath = process.env.NEMO_PYTHON_PATH || process.env.PYANNOTE_PYTHON_PATH || 'python3',
    scriptPath = path.join(process.cwd(), 'scripts', 'nemo_diarization.py'),
    useStreaming = process.env.NEMO_USE_STREAMING === 'true' || false, // Check env var
    forceDevice = process.env.NEMO_DEVICE as 'cpu' | 'cuda' | 'mps' | undefined,
    tempDir = os.tmpdir()
  } = config;
  
  // Fallback to Sortformer script if NeMo script doesn't exist
  const sortformerScriptPath = path.join(process.cwd(), 'scripts', 'sortformer_diarization.py');
  const actualScriptPath = await fs.access(scriptPath).then(() => scriptPath).catch(() => sortformerScriptPath);
  
  // Calculate timeout based on model type
  const dynamicTimeout = config.timeout || calculateNeMoTimeout(estimatedDurationMinutes, audioSizeMB, useStreaming);
  
  console.log(`[NEMO] 📊 Model: ${useStreaming ? 'Streaming (faster)' : 'Offline (more accurate)'}`);
  console.log(`[NEMO] 📊 Audio size: ${audioSizeGB.toFixed(2)}GB, estimated timeout: ${(dynamicTimeout/60000).toFixed(1)} minutes`);
  
  // Check if script exists
  try {
    await fs.access(actualScriptPath);
  } catch (error) {
    console.error('[NEMO] ❌ Script not found:', actualScriptPath);
    return {
      success: false,
      method: 'nemo_sortformer',
      error: 'NeMo/Sortformer script not found'
    };
  }
  
  // Check if audio file exists
  try {
    await fs.access(audioFilePath);
  } catch (error) {
    console.error('[NEMO] ❌ Audio file not found:', audioFilePath);
    return {
      success: false,
      method: 'nemo_sortformer',
      error: 'Audio file not found'
    };
  }
  
  let tempOutputFile: string | null = null;
  
  try {
    // Create temporary files for output
    tempOutputFile = path.join(tempDir, `nemo_output_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    
    const args = [actualScriptPath, audioFilePath, '--output', tempOutputFile];
    
    // Only add NeMo-specific flags if using the full NeMo script
    if (actualScriptPath.includes('nemo_diarization.py')) {
      // Add streaming flag if requested
      if (useStreaming) {
        args.push('--streaming');
      }
      
      // Add device selection if specified
      if (forceDevice) {
        args.push('--device', forceDevice);
      }
    }
    
    console.log(`[NEMO] 🐍 Executing: ${pythonPath} ${args.join(' ')}`);
    
    // Run NeMo/Sortformer script
    const result = await new Promise<NeMoResult>((resolve, reject) => {
      const nemoProcess = spawn(pythonPath, args, {
        stdio: 'pipe',
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          // NeMo uses HuggingFace models, so pass through the token if available
          HF_TOKEN: process.env.HUGGING_FACE_ACCESS_TOKEN,
          HUGGINGFACE_HUB_TOKEN: process.env.HUGGING_FACE_ACCESS_TOKEN
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      nemoProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      nemoProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log Python script output in real-time
        console.log('[NEMO]', data.toString().trim());
      });
      
      nemoProcess.on('close', async (code) => {
        try {
          if (code === 0) {
            // Read result from output file
            const resultData = await fs.readFile(tempOutputFile!, 'utf-8');
            const nemoResult: NeMoResult = JSON.parse(resultData);
            
            // Add processing time metadata
            if (nemoResult.metadata) {
              nemoResult.metadata.processed_at = new Date().toISOString();
            }
            
            console.log(`[NEMO] ✅ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            console.log(`[NEMO] Result: ${nemoResult.metadata?.total_speakers || 0} speakers, ${nemoResult.metadata?.total_segments || 0} segments`);
            
            resolve(nemoResult);
          } else {
            console.error(`[NEMO] ❌ Process failed with code ${code}`);
            console.error(`[NEMO] stderr:`, stderr);
            resolve({
              success: false,
              method: 'nemo_sortformer',
              error: `NeMo process failed with code ${code}: ${stderr}`
            });
          }
        } catch (error) {
          console.error('[NEMO] ❌ Failed to read result:', error);
          resolve({
            success: false,
            method: 'nemo_sortformer',
            error: `Failed to read NeMo result: ${error}`
          });
        }
      });
      
      nemoProcess.on('error', (error) => {
        console.error('[NEMO] ❌ Process error:', error);
        resolve({
          success: false,
          method: 'nemo_sortformer',
          error: `NeMo process error: ${error.message}`
        });
      });
      
      // Set timeout with periodic progress logging
      let progressInterval: NodeJS.Timeout;
      const timeoutId = setTimeout(() => {
        console.log(`[NEMO] ⏰ Timeout reached after ${(dynamicTimeout/60000).toFixed(1)} minutes, killing process`);
        clearInterval(progressInterval);
        try {
          nemoProcess.kill('SIGTERM');
          setTimeout(() => {
            if (!nemoProcess.killed) {
              console.log('[NEMO] 💥 Force killing with SIGKILL');
              nemoProcess.kill('SIGKILL');
            }
          }, 5000);
        } catch (killError) {
          console.log('[NEMO] ❌ Error killing process:', killError);
        }
        resolve({
          success: false,
          method: 'nemo_sortformer',
          error: `NeMo process timeout after ${(dynamicTimeout/60000).toFixed(1)} minutes`
        });
      }, dynamicTimeout);
      
      // Progress logging every 30 seconds
      progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[NEMO] 🔄 Still processing... elapsed: ${elapsed.toFixed(0)}s / ${(dynamicTimeout/1000).toFixed(0)}s`);
      }, 30000);
      
      nemoProcess.on('close', () => {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
      });
    });
    
    return result;
    
  } catch (error) {
    console.error('[NEMO] ❌ Unexpected error:', error);
    return {
      success: false,
      method: 'nemo_sortformer',
      error: `Unexpected error: ${error}`
    };
  } finally {
    // Cleanup temporary files
    try {
      if (tempOutputFile) {
        await fs.unlink(tempOutputFile);
        console.log('[NEMO] 🧹 Cleaned up output temp file');
      }
    } catch (cleanupError) {
      console.warn('[NEMO] ⚠️ Cleanup warning:', cleanupError);
    }
  }
}

/**
 * Convert NeMo result to our SpeakerSegment format
 */
export function convertNeMoResult(nemoResult: NeMoResult): SpeakerSegment[] {
  if (!nemoResult.success || !nemoResult.speaker_segments) {
    console.warn('[NEMO] ⚠️ Invalid result, returning empty segments');
    return [];
  }
  
  return nemoResult.speaker_segments.map(segment => ({
    speakerId: segment.speakerId,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text || '',
    confidence: segment.confidence || 0.9
  }));
}

/**
 * Enhanced speaker detection using NeMo Sortformer
 * This is a direct replacement for PyAnnote with better accuracy
 */
export async function enhancedSpeakerDetectionWithNeMo(
  transcriptionSegments: TranscriptionSegment[],
  audioFilePath?: string,
  config: NeMoConfig = {}
): Promise<SpeakerSegment[]> {
  console.log(`[NEMO] 🎯 Enhanced speaker detection with NeMo Sortformer starting...`);
  console.log(`[NEMO] Input: ${transcriptionSegments.length} transcription segments`);
  console.log(`[NEMO] Audio file: ${audioFilePath ? 'provided' : 'not provided'}`);
  
  // NeMo REQUIRES audio file for voice analysis (same as PyAnnote)
  if (!audioFilePath) {
    console.log('[NEMO] ❌ No audio file provided - NeMo requires raw audio for voice analysis');
    throw new Error('NeMo requires audio file - no fallback allowed');
  }
  
  console.log('[NEMO] 🔄 Attempting NeMo Sortformer audio-based diarization...');
  
  try {
    // Check availability first
    const isAvailable = await checkNeMoAvailability();
    
    if (!isAvailable) {
      console.log('[NEMO] ❌ NeMo not available');
      throw new Error('NeMo is required but not available - run setup_nemo.sh');
    }
    
    // Run NeMo on raw audio
    console.log('[NEMO] 🎙️ Running NeMo Sortformer diarization on raw audio...');
    const nemoResult = await runNeMoDiarization(audioFilePath, transcriptionSegments, config);
    
    if (nemoResult.success && nemoResult.speaker_segments) {
      console.log(`[NEMO] ✅ NeMo audio analysis succeeded with ${nemoResult.speaker_segments.length} speaker segments`);
      
      // Align NeMo speaker segments with Whisper transcription segments using word-level alignment
      console.log('[NEMO] 🔄 Aligning NeMo speakers with Whisper transcription...');
      const { alignedSegments, stats } = alignByWords(
        nemoResult.speaker_segments,
        transcriptionSegments,
        'nemo'
      );
      
      console.log(`[NEMO] ✅ Word-level alignment complete: ${alignedSegments.length} final segments`);
      console.log('[NEMO] Alignment stats:', {
        totalWords: stats.totalWords,
        assignedWords: stats.assignedWords,
        unassignedPercentage: ((stats.unassignedWords / Math.max(stats.totalWords, 1)) * 100).toFixed(1) + '%',
        speakerDistribution: stats.speakerDistribution,
        mergingApplied: stats.mergingApplied
      });
      
      return alignedSegments;
    } else {
      console.log(`[NEMO] ❌ NeMo failed: ${nemoResult.error}`);
      throw new Error(`NeMo failed: ${nemoResult.error}`);
    }
  } catch (error) {
    console.error('[NEMO] ❌ NeMo error:', error);
    throw new Error(`NeMo processing failed: ${error}`);
  }
}


/**
 * Setup instructions for NeMo installation
 */
export function getNeMoSetupInstructions(): string {
  return `
To enable NVIDIA NeMo Sortformer speaker diarization:

1. Run the automated setup script:
   cd scripts && ./setup_nemo.sh

2. Or install manually:
   # Install system dependencies
   sudo apt-get install libsndfile1 ffmpeg  # Linux
   brew install libsndfile ffmpeg          # macOS
   
   # Install Python dependencies
   pip3 install torch torchaudio Cython packaging
   pip3 install nemo_toolkit[asr]

3. Set Python path (optional):
   export NEMO_PYTHON_PATH=/path/to/python3

4. For optimal performance:
   - GPU: CUDA or Apple Silicon MPS automatically detected
   - Choose streaming vs offline model based on needs

Available models:
- nvidia/diar_sortformer_4spk-v1 (offline, best accuracy)
- nvidia/diar_streaming_sortformer_4spk-v2 (streaming, faster)

Once installed, NeMo will provide more accurate speaker detection than PyAnnote.
  `.trim();
}