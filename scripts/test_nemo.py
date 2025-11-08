#!/usr/bin/env python3
"""
Test script for NVIDIA NeMo Sortformer installation and basic functionality.
This script verifies that NeMo is properly installed and can load the Sortformer models.
"""

import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_dependencies():
    """Test if all required dependencies are available."""
    logger.info("🧪 Testing NeMo dependencies...")
    
    try:
        import torch
        logger.info(f"✅ PyTorch {torch.__version__}")
        
        # Test device availability
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            logger.info(f"✅ CUDA available: {device_name}")
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            logger.info("✅ Apple Silicon MPS available")
        else:
            logger.info("ℹ️ CPU-only mode (no GPU acceleration)")
            
    except ImportError as e:
        logger.error(f"❌ PyTorch not found: {e}")
        return False
    
    try:
        import soundfile
        logger.info(f"✅ SoundFile available")
    except ImportError as e:
        logger.error(f"❌ SoundFile not found: {e}")
        return False
    
    try:
        from nemo.collections.asr.models import SortformerEncLabelModel
        logger.info("✅ NeMo ASR models available")
    except ImportError as e:
        logger.error(f"❌ NeMo not found: {e}")
        logger.error("Install with: pip install nemo_toolkit[asr]")
        return False
    
    logger.info("✅ All dependencies available!")
    return True

def test_model_loading():
    """Test loading of Sortformer models."""
    logger.info("🧪 Testing NeMo model loading...")
    
    try:
        from nemo.collections.asr.models import SortformerEncLabelModel
        
        # Test offline model loading
        logger.info("📥 Testing offline model loading (this may take a while for first download)...")
        try:
            offline_model = SortformerEncLabelModel.from_pretrained("nvidia/diar_sortformer_4spk-v1")
            logger.info("✅ Offline Sortformer model loaded successfully")
            
            # Clean up
            del offline_model
            
        except Exception as e:
            logger.error(f"❌ Failed to load offline model: {e}")
            return False
        
        # Test streaming model loading
        logger.info("📥 Testing streaming model loading...")
        try:
            streaming_model = SortformerEncLabelModel.from_pretrained("nvidia/diar_streaming_sortformer_4spk-v2")
            logger.info("✅ Streaming Sortformer model loaded successfully")
            
            # Clean up
            del streaming_model
            
        except Exception as e:
            logger.error(f"❌ Failed to load streaming model: {e}")
            return False
            
        logger.info("✅ All models loaded successfully!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Model loading test failed: {e}")
        return False

def test_nemo_script():
    """Test the NeMo diarization script."""
    logger.info("🧪 Testing NeMo diarization script...")
    
    script_path = Path(__file__).parent / "nemo_diarization.py"
    
    if not script_path.exists():
        logger.error(f"❌ NeMo script not found: {script_path}")
        return False
    
    logger.info(f"✅ NeMo script found: {script_path}")
    
    # Test script can be imported
    try:
        import subprocess
        result = subprocess.run([
            sys.executable, str(script_path), "--help"
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            logger.info("✅ NeMo script runs successfully")
            return True
        else:
            logger.error(f"❌ NeMo script failed: {result.stderr}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to test NeMo script: {e}")
        return False

def main():
    """Run all tests."""
    logger.info("🚀 Starting NeMo installation tests...")
    
    tests = [
        ("Dependencies", test_dependencies),
        ("Model Loading", test_model_loading), 
        ("Script Functionality", test_nemo_script)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n📋 Running test: {test_name}")
        try:
            if test_func():
                logger.info(f"✅ {test_name}: PASSED")
                passed += 1
            else:
                logger.error(f"❌ {test_name}: FAILED")
        except Exception as e:
            logger.error(f"❌ {test_name}: ERROR - {e}")
    
    logger.info(f"\n📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("🎉 All tests passed! NeMo is ready for use.")
        logger.info("\n🔧 Usage:")
        logger.info("  python nemo_diarization.py /path/to/audio.mp3")
        logger.info("  python nemo_diarization.py /path/to/audio.mp3 --streaming")
        return True
    else:
        logger.error("💥 Some tests failed. Please check the installation.")
        logger.error("\n🔧 Troubleshooting:")
        logger.error("  1. Run: cd scripts && ./setup_nemo.sh")
        logger.error("  2. Check Python version (need 3.8+)")
        logger.error("  3. Ensure sufficient memory for model downloads")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)