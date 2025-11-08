#!/usr/bin/env python3
"""
Test script to verify PyAnnote installation and basic functionality
"""

import sys
import json

def test_basic_imports():
    """Test if basic dependencies can be imported."""
    try:
        import torch
        print("✅ torch imported successfully")
        print(f"   PyTorch version: {torch.__version__}")
        
        import torchaudio
        print("✅ torchaudio imported successfully")
        print(f"   TorchAudio version: {torchaudio.__version__}")
        
        return True
    except ImportError as e:
        print(f"❌ Basic import failed: {e}")
        return False

def test_pyannote_import():
    """Test if PyAnnote can be imported."""
    try:
        from pyannote.audio import Pipeline
        print("✅ pyannote.audio imported successfully")
        return True
    except ImportError as e:
        print(f"❌ PyAnnote import failed: {e}")
        print("   Install with: pip install pyannote.audio")
        return False

def test_pipeline_creation():
    """Test if PyAnnote pipeline can be created."""
    try:
        from pyannote.audio import Pipeline
        
        print("🔄 Testing pipeline creation...")
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
        print("✅ PyAnnote pipeline created successfully")
        return True
        
    except Exception as e:
        print(f"⚠️ Pipeline creation failed: {e}")
        print("   This might require a Hugging Face token or internet connection")
        print("   The system will fall back to rule-based detection")
        return False

def main():
    print("PyAnnote Installation Test")
    print("=" * 50)
    
    success_count = 0
    total_tests = 3
    
    # Test 1: Basic imports
    print("\n1. Testing basic imports...")
    if test_basic_imports():
        success_count += 1
    
    # Test 2: PyAnnote import
    print("\n2. Testing PyAnnote import...")
    if test_pyannote_import():
        success_count += 1
    
    # Test 3: Pipeline creation
    print("\n3. Testing pipeline creation...")
    if test_pipeline_creation():
        success_count += 1
    
    # Results
    print("\n" + "=" * 50)
    print(f"Test Results: {success_count}/{total_tests} tests passed")
    
    if success_count == total_tests:
        print("🎉 All tests passed! PyAnnote is ready to use.")
        result = {"status": "success", "tests_passed": success_count, "total_tests": total_tests}
    elif success_count >= 2:
        print("⚠️ PyAnnote is partially working. Pipeline creation failed but imports work.")
        print("   The system will fall back to rule-based detection when needed.")
        result = {"status": "partial", "tests_passed": success_count, "total_tests": total_tests}
    else:
        print("❌ PyAnnote setup incomplete. Please install dependencies.")
        print("   Run: pip install -r requirements.txt")
        result = {"status": "failed", "tests_passed": success_count, "total_tests": total_tests}
    
    # Output JSON for Node.js consumption
    print("\nJSON Result:")
    print(json.dumps(result, indent=2))
    
    return 0 if success_count >= 2 else 1

if __name__ == "__main__":
    sys.exit(main())