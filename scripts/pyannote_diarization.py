#!/usr/bin/env python3
"""
PyAnnote Speaker Diarization Service

This script provides speaker diarization using PyAnnote, an open-source
machine learning model for speaker detection. It's designed to replace
the rule-based speaker detection with ML-based accuracy.

Usage:
    python pyannote_diarization.py <audio_file_path> [--output <output_file>]

Dependencies:
    pip install pyannote.audio torch torchaudio
"""

import argparse
import json
import sys
import os
import tempfile
import logging
from pathlib import Path
from typing import List, Dict, Any

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_dependencies():
    """Check if required dependencies are installed."""
    try:
        import torch
        import torchaudio
        from pyannote.audio import Pipeline
        logger.info("✅ All dependencies found")
        return True
    except ImportError as e:
        logger.error(f"❌ Missing dependency: {e}")
        logger.error("Please install required packages: pip install pyannote.audio torch torchaudio")
        return False

def detect_best_device():
    """Detect the best available device for PyAnnote processing."""
    try:
        import torch
        
        # Check for Apple Silicon MPS (Metal Performance Shaders)
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            logger.info("🍎 Apple Silicon MPS detected - using GPU acceleration")
            return "mps"
        
        # Check for NVIDIA CUDA
        elif torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else "Unknown"
            logger.info(f"🎮 NVIDIA CUDA detected - using GPU: {gpu_name}")
            return "cuda"
        
        # Fallback to CPU
        else:
            logger.info("💻 No GPU acceleration available - using CPU")
            return "cpu"
            
    except Exception as e:
        logger.warning(f"⚠️ Device detection failed: {e} - defaulting to CPU")
        return "cpu"

def initialize_pipeline():
    """Initialize PyAnnote using the simpler Pipeline approach (3.1) with GPU acceleration."""
    try:
        from pyannote.audio import Pipeline
        import os
        import torch
        
        # Get Hugging Face token from environment
        hf_token = os.getenv('HUGGING_FACE_ACCESS_TOKEN')
        if not hf_token:
            logger.error("❌ HUGGING_FACE_ACCESS_TOKEN environment variable not set")
            logger.error("Please set your Hugging Face token in .env.local")
            return None
        
        logger.info(f"✅ HF token found: {hf_token[:8]}...{hf_token[-4:]}")
        
        # Set HF environment variables
        os.environ['HF_TOKEN'] = hf_token
        os.environ['HUGGINGFACE_HUB_TOKEN'] = hf_token
        
        # Detect best available device for acceleration
        device = detect_best_device()
        logger.info(f"🎯 Using device: {device}")
        
        # Use the simpler Pipeline approach (PyAnnote 3.1)
        logger.info("🔄 Loading PyAnnote speaker diarization pipeline 3.1...")
        
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        
        if pipeline is None:
            raise Exception("Pipeline.from_pretrained returned None")
        
        # Enable GPU/MPS acceleration for massive performance boost
        if device != "cpu":
            try:
                logger.info(f"🚀 Enabling {device.upper()} acceleration...")
                pipeline.to(torch.device(device))
                logger.info(f"✅ Pipeline moved to {device.upper()} - expect 10-15x performance improvement")
            except Exception as gpu_error:
                logger.warning(f"⚠️ GPU acceleration failed: {gpu_error}")
                logger.info("🔄 Falling back to CPU processing...")
                device = "cpu"
        
        if device == "cpu":
            logger.info("⚠️ Using CPU - performance will be slower but reliable")
            
        logger.info(f"✅ PyAnnote Pipeline 3.1 initialized successfully on {device.upper()}")
        logger.info(f"📊 HuggingFace authentication should now be recorded in your usage dashboard")
        return pipeline
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize PyAnnote: {e}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return None

def convert_audio_format(input_path: str, output_path: str = None) -> str:
    """Convert audio to a format compatible with PyAnnote."""
    try:
        import torch
        import torchaudio
        
        # Load audio file
        waveform, sample_rate = torchaudio.load(input_path)
        
        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
            logger.info("Converted stereo to mono")
        
        # Resample to 16kHz if needed (PyAnnote works best with 16kHz)
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            waveform = resampler(waveform)
            sample_rate = 16000
            logger.info(f"Resampled to 16kHz from {sample_rate}Hz")
        
        # Save converted audio if output path is provided
        if output_path:
            torchaudio.save(output_path, waveform, sample_rate)
            return output_path
        else:
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                torchaudio.save(tmp_file.name, waveform, sample_rate)
                return tmp_file.name
                
    except Exception as e:
        logger.error(f"❌ Audio conversion failed: {e}")
        return input_path  # Return original path as fallback

def estimate_speaker_count(duration_minutes: float, file_size_mb: float, explicit_count: int = None) -> Dict[str, int]:
    """Estimate optimal speaker count range based on audio characteristics."""
    try:
        # Check for explicit speaker count first
        if explicit_count is not None:
            logger.info(f"📊 Using explicit speaker count: {explicit_count}")
            return {
                "min_speakers": explicit_count,
                "max_speakers": explicit_count
            }
        
        # Check environment variable for expected speakers
        env_speakers = os.getenv('PYANNOTE_NUM_SPEAKERS') or os.getenv('EXPECTED_SPEAKERS')
        if env_speakers:
            try:
                env_count = int(env_speakers)
                logger.info(f"📊 Using environment speaker count: {env_count}")
                return {
                    "min_speakers": env_count,
                    "max_speakers": env_count
                }
            except ValueError:
                logger.warning(f"⚠️ Invalid environment speaker count: {env_speakers}")
        
        # Default constraints for typical podcast/interview scenarios
        min_speakers = 1
        max_speakers = 6
        
        # Adjust based on duration - longer content tends to have more speakers
        if duration_minutes < 5:
            # Short clips - likely 1-2 speakers
            max_speakers = 2
        elif duration_minutes < 15:
            # Medium clips - likely 2-3 speakers  
            max_speakers = 3
        elif duration_minutes < 60:
            # Long content - could be 2-4 speakers
            max_speakers = 4
        else:
            # Very long content - could be panel/conference with more speakers
            max_speakers = 6
        
        # Additional heuristics based on file characteristics
        # Higher quality/larger files might indicate professional content with more speakers
        if file_size_mb > 50:  # High quality, might be professional content
            max_speakers = min(max_speakers + 1, 6)
        
        speaker_hints = {
            "min_speakers": min_speakers,
            "max_speakers": max_speakers
        }
        
        logger.info(f"📊 Duration-based speaker estimation: {min_speakers}-{max_speakers} speakers for {duration_minutes:.1f} minute audio")
        return speaker_hints
        
    except Exception as e:
        logger.warning(f"⚠️ Speaker estimation failed: {e} - using default range")
        return {"min_speakers": 1, "max_speakers": 4}

def perform_diarization(pipeline, audio_path: str, explicit_speaker_count: int = None) -> List[Dict[str, Any]]:
    """Perform speaker diarization using PyAnnote Pipeline (3.1 approach) with optimizations."""
    try:
        logger.info(f"🎯 Starting optimized diarization for: {audio_path}")
        
        # Get audio file info and load efficiently
        import os
        import time
        import torchaudio
        
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        logger.info(f"📊 Audio file size: {file_size_mb:.1f}MB")
        
        # Load audio efficiently for analysis
        waveform, sample_rate = torchaudio.load(audio_path)
        duration_seconds = waveform.shape[1] / sample_rate
        duration_minutes = duration_seconds / 60
        logger.info(f"📊 Audio duration: {duration_seconds:.1f} seconds ({duration_minutes:.1f} minutes)")
        
        # Smart speaker count estimation based on duration and type
        speaker_hints = estimate_speaker_count(duration_minutes, file_size_mb, explicit_speaker_count)
        logger.info(f"🎯 Speaker estimation: {speaker_hints}")
        
        start_time = time.time()
        
        # Use optimized Pipeline processing with speaker hints
        logger.info("🚀 Starting optimized PyAnnote pipeline diarization...")
        logger.info(f"📊 This should generate HuggingFace API usage for diarization")
        
        # Try direct memory processing first (faster), fallback to file if needed
        try:
            # Direct memory processing - more efficient
            logger.info("🔄 Using direct memory processing...")
            logger.info(f"📊 Expected processing time with GPU: ~{duration_minutes * 2:.1f} minutes, with CPU: ~{duration_minutes * 15:.1f} minutes")
            
            audio_input = {"waveform": waveform, "sample_rate": sample_rate}
            diarization = pipeline(audio_input, **speaker_hints)
            logger.info("✅ Direct memory processing successful")
        except Exception as memory_error:
            logger.warning(f"⚠️ Memory processing failed: {memory_error}")
            logger.info("🔄 Falling back to file processing...")
            logger.info(f"📊 Expected processing time with GPU: ~{duration_minutes * 2:.1f} minutes, with CPU: ~{duration_minutes * 15:.1f} minutes")
            
            diarization = pipeline(audio_path, **speaker_hints)
            
        processing_time = time.time() - start_time
        logger.info(f"✅ PyAnnote diarization completed in {processing_time:.1f} seconds")
        
        # Convert PyAnnote diarization to speaker segments
        logger.info("🔄 Converting PyAnnote diarization to speaker segments...")
        speaker_segments = []
        
        # PyAnnote Pipeline returns an Annotation object with natural speaker boundaries
        for turn, track, speaker in diarization.itertracks(yield_label=True):
            speaker_segments.append({
                "speakerId": f"Speaker_{speaker}",
                "startTime": float(turn.start),
                "endTime": float(turn.end),
                "confidence": 0.9,
                "text": ""
            })
        
        # Sort segments by start time
        speaker_segments.sort(key=lambda x: x['startTime'])
        
        unique_speakers = len(set(s['speakerId'] for s in speaker_segments))
        logger.info(f"✅ Natural diarization: {len(speaker_segments)} speaker turns, {unique_speakers} unique speakers")
        
        # Only merge consecutive segments from same speaker with small gaps
        logger.info("🔄 Merging consecutive segments from same speaker...")
        merged_segments = merge_consecutive_speaker_segments(speaker_segments)
        
        final_speakers = len(set(s['speakerId'] for s in merged_segments))
        logger.info(f"✅ Final result: {len(merged_segments)} natural segments, {final_speakers} speakers")
        
        return merged_segments
        
    except Exception as e:
        logger.error(f"❌ Segmentation failed: {e}")
        logger.error(f"❌ Error type: {type(e).__name__}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return []


def merge_consecutive_speaker_segments(segments: List[Dict]) -> List[Dict]:
    """Merge consecutive segments from the same speaker to avoid over-segmentation."""
    if not segments:
        return segments
    
    # Get merge gap from environment variable or use default
    merge_gap_s = float(os.getenv('PYANNOTE_MERGE_GAP_S', '1.2'))
    logger.info(f"📊 Using merge gap: {merge_gap_s}s")
    
    # Sort segments by start time
    sorted_segments = sorted(segments, key=lambda x: x['startTime'])
    merged = []
    current_segment = sorted_segments[0].copy()
    
    for next_segment in sorted_segments[1:]:
        # Check if this segment should be merged with the current one
        same_speaker = current_segment['speakerId'] == next_segment['speakerId']
        time_gap = next_segment['startTime'] - current_segment['endTime']
        small_gap = time_gap <= merge_gap_s  # Use configurable merge gap
        
        if same_speaker and small_gap:
            # Merge: extend the current segment to include the next one
            current_segment['endTime'] = next_segment['endTime']
            # Average confidence
            current_segment['confidence'] = (current_segment['confidence'] + next_segment['confidence']) / 2
        else:
            # Different speaker or large gap: finalize current segment and start new one
            merged.append(current_segment)
            current_segment = next_segment.copy()
    
    # Don't forget the last segment
    merged.append(current_segment)
    
    logger.info(f"📊 Merged {len(segments)} segments into {len(merged)} segments")
    return merged



def cleanup_temp_files(*file_paths):
    """Clean up temporary files."""
    for file_path in file_paths:
        try:
            if file_path and os.path.exists(file_path) and '/tmp' in file_path:
                os.unlink(file_path)
                logger.info(f"🧹 Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.warning(f"⚠️ Could not clean up {file_path}: {e}")

def main():
    parser = argparse.ArgumentParser(description='PyAnnote Speaker Diarization Service')
    parser.add_argument('audio_file', help='Path to audio file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--temp-dir', help='Temporary directory for processing')
    parser.add_argument('--num-speakers', type=int, help='Expected number of speakers (overrides automatic estimation)')
    
    args = parser.parse_args()
    
    # Check if audio file exists
    if not os.path.exists(args.audio_file):
        logger.error(f"❌ Audio file not found: {args.audio_file}")
        sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Initialize pipeline
    pipeline = initialize_pipeline()
    if pipeline is None:
        logger.error("❌ Failed to initialize PyAnnote pipeline")
        sys.exit(1)
    
    temp_audio_path = None
    
    try:
        # Use audio file directly - no conversion needed for optimized processing
        logger.info("🔄 Using audio file directly for optimized processing...")
        temp_audio_path = args.audio_file
        
        # Perform diarization
        speaker_segments = perform_diarization(pipeline, temp_audio_path, args.num_speakers)
        
        if not speaker_segments:
            logger.error("❌ No speaker segments detected")
            sys.exit(1)
        
        # Prepare output (alignment will be done in TypeScript)
        result = {
            "success": True,
            "method": "pyannote",
            "speaker_segments": speaker_segments,
            "metadata": {
                "total_speakers": len(set(s['speakerId'] for s in speaker_segments)),
                "total_segments": len(speaker_segments),
                "audio_file": args.audio_file,
                "processed_at": "2024-01-01T00:00:00Z"  # Will be set by Node.js
            }
        }
        
        # Output results
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(result, f, indent=2)
            logger.info(f"✅ Results saved to: {args.output}")
        else:
            # Output to stdout for Node.js to capture
            print(json.dumps(result))
        
        logger.info("✅ PyAnnote diarization completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "method": "pyannote"
        }
        
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(error_result, f, indent=2)
        else:
            print(json.dumps(error_result))
        
        sys.exit(1)
    
    finally:
        # Cleanup
        cleanup_temp_files(temp_audio_path)

if __name__ == "__main__":
    main()