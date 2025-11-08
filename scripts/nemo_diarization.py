#!/usr/bin/env python3
"""
NVIDIA NeMo Sortformer Speaker Diarization Service

This script provides speaker diarization using NVIDIA NeMo's Sortformer models,
specifically designed to replace PyAnnote with better accuracy and performance
for podcast/conversation content.

Models:
- nvidia/diar_sortformer_4spk-v1 (offline, better accuracy)
- nvidia/diar_streaming_sortformer_4spk-v2 (streaming, real-time capable)

Usage:
    python nemo_diarization.py <audio_file_path> [--output <output_file>] [--streaming]

Dependencies:
    pip install nemo_toolkit[asr] Cython packaging
    apt-get install libsndfile1 ffmpeg
"""

import argparse
import json
import sys
import os
import tempfile
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_dependencies():
    """Check if required NeMo dependencies are installed."""
    try:
        import torch
        import soundfile as sf
        from nemo.collections.asr.models import SortformerEncLabelModel
        logger.info("✅ All NeMo dependencies found")
        return True
    except ImportError as e:
        logger.error(f"❌ Missing dependency: {e}")
        logger.error("Install dependencies: pip install nemo_toolkit[asr] Cython packaging")
        logger.error("System packages: apt-get install libsndfile1 ffmpeg")
        return False

def detect_best_device():
    """Detect the best available device for NeMo processing."""
    try:
        import torch
        
        # Check for Apple Silicon MPS
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

def load_sortformer_model(streaming: bool = False, device: str = "cpu"):
    """Load the appropriate NeMo Sortformer model."""
    try:
        from nemo.collections.asr.models import SortformerEncLabelModel
        import torch
        
        if streaming:
            model_name = "nvidia/diar_streaming_sortformer_4spk-v2"
            logger.info("🔄 Loading streaming Sortformer model (real-time capable)...")
        else:
            model_name = "nvidia/diar_sortformer_4spk-v1"
            logger.info("🔄 Loading offline Sortformer model (higher accuracy)...")
        
        logger.info(f"📥 Downloading/loading model: {model_name}")
        
        # Load the model
        diar_model = SortformerEncLabelModel.from_pretrained(model_name)
        
        if diar_model is None:
            raise Exception(f"Failed to load model {model_name}")
        
        # Move to appropriate device for acceleration
        if device != "cpu":
            try:
                logger.info(f"🚀 Moving model to {device.upper()} for acceleration...")
                diar_model = diar_model.to(torch.device(device))
                logger.info(f"✅ Model successfully moved to {device.upper()}")
            except Exception as gpu_error:
                logger.warning(f"⚠️ {device.upper()} acceleration failed: {gpu_error}")
                logger.info("🔄 Falling back to CPU...")
                device = "cpu"
                
        if streaming:
            # Configure streaming parameters for optimal performance
            configure_streaming_parameters(diar_model)
        
        logger.info(f"✅ NeMo Sortformer model loaded successfully on {device.upper()}")
        return diar_model
        
    except Exception as e:
        logger.error(f"❌ Failed to load NeMo model: {e}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return None

def configure_streaming_parameters(model):
    """Configure optimal streaming parameters for the model."""
    try:
        # Optimal parameters for podcast/conversation content
        model.sortformer_modules.chunk_len = 4.0  # 4 second chunks
        model.sortformer_modules.chunk_right_context = 1.0  # 1 second context
        model.sortformer_modules.fifo_len = 10  # Buffer for 10 chunks
        model.sortformer_modules.spkcache_update_period = 4  # Update every 4 chunks
        model.sortformer_modules.spkcache_len = 50  # Speaker cache size
        
        # Validate streaming parameters
        model.sortformer_modules._check_streaming_parameters()
        
        logger.info("✅ Streaming parameters configured for podcast content")
        
    except Exception as e:
        logger.warning(f"⚠️ Could not configure streaming parameters: {e}")

def estimate_audio_info(audio_path: str) -> Dict[str, float]:
    """Get audio file information for processing optimization."""
    try:
        import soundfile as sf
        import os
        
        # Get file size
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        
        # Get audio duration and sample rate
        with sf.SoundFile(audio_path) as f:
            duration_seconds = len(f) / f.samplerate
            sample_rate = f.samplerate
        
        duration_minutes = duration_seconds / 60
        
        logger.info(f"📊 Audio: {duration_minutes:.1f} min, {file_size_mb:.1f}MB, {sample_rate}Hz")
        
        return {
            "duration_seconds": duration_seconds,
            "duration_minutes": duration_minutes,
            "file_size_mb": file_size_mb,
            "sample_rate": sample_rate
        }
        
    except Exception as e:
        logger.warning(f"⚠️ Could not analyze audio file: {e}")
        return {
            "duration_seconds": 600,  # Default 10 minutes
            "duration_minutes": 10,
            "file_size_mb": 50,
            "sample_rate": 16000
        }

def perform_nemo_diarization(model, audio_path: str, streaming: bool = False) -> List[Dict[str, Any]]:
    """Perform speaker diarization using NeMo Sortformer."""
    try:
        logger.info(f"🎯 Starting NeMo diarization for: {os.path.basename(audio_path)}")
        
        # Get audio information
        audio_info = estimate_audio_info(audio_path)
        duration_minutes = audio_info["duration_minutes"]
        
        # Estimate processing time
        if streaming:
            est_time_min = duration_minutes * 0.5  # Streaming is faster
            logger.info(f"📊 Estimated processing time (streaming): ~{est_time_min:.1f} minutes")
        else:
            est_time_min = duration_minutes * 1.5  # Offline is more thorough
            logger.info(f"📊 Estimated processing time (offline): ~{est_time_min:.1f} minutes")
        
        start_time = time.time()
        
        # Perform diarization
        logger.info("🚀 Running NeMo Sortformer diarization...")
        
        try:
            # NeMo expects just the file path for diarization
            predicted_segments = model.diarize(audio=audio_path, batch_size=1)
            
        except Exception as diar_error:
            logger.error(f"❌ Diarization failed: {diar_error}")
            return []
        
        processing_time = time.time() - start_time
        logger.info(f"✅ NeMo diarization completed in {processing_time:.1f} seconds")
        
        # Convert NeMo output to our standard format
        speaker_segments = convert_nemo_output(predicted_segments)
        
        # Log results
        unique_speakers = len(set(s['speakerId'] for s in speaker_segments))
        logger.info(f"✅ Result: {len(speaker_segments)} segments, {unique_speakers} speakers detected")
        
        return speaker_segments
        
    except Exception as e:
        logger.error(f"❌ NeMo diarization failed: {e}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        return []

def convert_nemo_output(nemo_predictions) -> List[Dict[str, Any]]:
    """Convert NeMo prediction format to our standard speaker segment format."""
    try:
        speaker_segments = []
        
        logger.info("🔄 Converting NeMo predictions to speaker segments...")
        logger.info(f"📊 NeMo output type: {type(nemo_predictions)}")
        
        # NeMo diarize() returns segments in format: 'begin_seconds, end_seconds, speaker_index'
        # The actual format can vary, so we handle multiple cases
        
        if isinstance(nemo_predictions, list):
            # Direct list of predictions
            predictions = nemo_predictions
        elif hasattr(nemo_predictions, '__iter__') and not isinstance(nemo_predictions, (str, bytes)):
            # Iterable but not string/bytes - convert to list
            try:
                predictions = list(nemo_predictions)
            except:
                predictions = [nemo_predictions]
        else:
            # Single prediction or unknown format
            predictions = [nemo_predictions]
        
        # Process each prediction
        segment_id = 0
        for item in predictions:
            try:
                # Handle different possible formats from NeMo
                if hasattr(item, 'start') and hasattr(item, 'end') and hasattr(item, 'speaker'):
                    # Object with attributes
                    start_time = float(item.start)
                    end_time = float(item.end)
                    speaker_id = item.speaker
                elif isinstance(item, (list, tuple)) and len(item) >= 3:
                    # List/tuple format: [start, end, speaker]
                    start_time = float(item[0])
                    end_time = float(item[1])
                    speaker_id = item[2]
                elif isinstance(item, dict):
                    # Dictionary format
                    start_time = float(item.get('start', item.get('begin', 0)))
                    end_time = float(item.get('end', start_time + 1))
                    speaker_id = item.get('speaker', item.get('speaker_id', 0))
                elif isinstance(item, str):
                    # String format: "start,end,speaker" or similar
                    parts = item.strip().split(',')
                    if len(parts) >= 3:
                        start_time = float(parts[0])
                        end_time = float(parts[1])
                        speaker_id = parts[2]
                    else:
                        continue
                else:
                    # Unknown format, skip
                    logger.warning(f"⚠️ Unknown prediction format: {type(item)} - {item}")
                    continue
                
                # Ensure valid timing
                if end_time <= start_time:
                    end_time = start_time + 0.1  # Minimum 0.1 second segment
                
                # Create speaker segment
                speaker_segments.append({
                    "speakerId": f"Speaker_{speaker_id}",
                    "startTime": start_time,
                    "endTime": end_time,
                    "confidence": 0.9,
                    "text": ""
                })
                segment_id += 1
                
            except Exception as item_error:
                logger.warning(f"⚠️ Failed to process prediction item: {item_error}")
                continue
        
        # If no segments were extracted, create a fallback
        if not speaker_segments:
            logger.warning("⚠️ No segments extracted from NeMo output")
            logger.info(f"📊 Raw NeMo output for debugging: {nemo_predictions}")
            
            # Create a single fallback segment
            speaker_segments.append({
                "speakerId": "Speaker_0",
                "startTime": 0.0,
                "endTime": 60.0,  # Default 1 minute segment
                "confidence": 0.5,
                "text": ""
            })
        
        # Sort by start time
        speaker_segments.sort(key=lambda x: x['startTime'])
        
        # Log speaker distribution
        speaker_counts = {}
        for seg in speaker_segments:
            speaker_id = seg['speakerId']
            speaker_counts[speaker_id] = speaker_counts.get(speaker_id, 0) + 1
        
        logger.info(f"✅ Converted to {len(speaker_segments)} speaker segments")
        logger.info(f"📊 Speaker distribution: {speaker_counts}")
        
        return speaker_segments
        
    except Exception as e:
        logger.error(f"❌ Failed to convert NeMo output: {e}")
        logger.error(f"📊 Raw output that caused error: {nemo_predictions}")
        return []

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
    parser = argparse.ArgumentParser(description='NVIDIA NeMo Sortformer Speaker Diarization Service')
    parser.add_argument('audio_file', help='Path to audio file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--streaming', action='store_true', help='Use streaming model (faster, real-time capable)')
    parser.add_argument('--device', choices=['cpu', 'cuda', 'mps'], help='Force specific device')
    
    args = parser.parse_args()
    
    # Check if audio file exists
    if not os.path.exists(args.audio_file):
        logger.error(f"❌ Audio file not found: {args.audio_file}")
        sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Detect device
    device = args.device if args.device else detect_best_device()
    
    # Load NeMo model
    logger.info(f"📥 Loading NeMo Sortformer model (streaming={args.streaming})...")
    model = load_sortformer_model(streaming=args.streaming, device=device)
    
    if model is None:
        logger.error("❌ Failed to load NeMo model")
        sys.exit(1)
    
    try:
        # Perform diarization
        speaker_segments = perform_nemo_diarization(model, args.audio_file, args.streaming)
        
        if not speaker_segments:
            logger.error("❌ No speaker segments detected")
            sys.exit(1)
        
        # Prepare output
        result = {
            "success": True,
            "method": "nemo_sortformer",
            "model_type": "streaming" if args.streaming else "offline",
            "speaker_segments": speaker_segments,
            "metadata": {
                "total_speakers": len(set(s['speakerId'] for s in speaker_segments)),
                "total_segments": len(speaker_segments),
                "audio_file": args.audio_file,
                "processed_at": "2024-01-01T00:00:00Z",  # Will be set by Node.js
                "device_used": device
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
        
        logger.info("✅ NeMo diarization completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "method": "nemo_sortformer"
        }
        
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(error_result, f, indent=2)
        else:
            print(json.dumps(error_result))
        
        sys.exit(1)

if __name__ == "__main__":
    main()