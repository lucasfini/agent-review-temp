#!/bin/bash

# NVIDIA NeMo Sortformer Setup Script
# This script installs NVIDIA NeMo for speaker diarization
# Replaces PyAnnote with more accurate Sortformer models

echo "🚀 Setting up NVIDIA NeMo Sortformer for Speaker Diarization..."

# Check if we're in the scripts directory
if [[ ! -f "requirements.txt" ]]; then
    echo "❌ Please run this script from the scripts/ directory"
    exit 1
fi

# Update system packages (Ubuntu/Debian)
if command -v apt-get > /dev/null; then
    echo "📦 Installing system dependencies..."
    sudo apt-get update
    sudo apt-get install -y libsndfile1 ffmpeg build-essential
fi

# Update system packages (macOS)
if command -v brew > /dev/null; then
    echo "📦 Installing system dependencies for macOS..."
    brew install libsndfile ffmpeg
fi

# Check Python version
python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "🐍 Python version: $python_version"

# Convert version to comparable format (e.g., "3.12" -> 312)
version_num=$(echo $python_version | sed 's/\.//')
if [[ $version_num -lt 38 ]]; then
    echo "❌ Python 3.8+ required for NeMo (found $python_version)"
    exit 1
fi

echo "✅ Python version $python_version is compatible with NeMo"

# Install PyTorch first (required for NeMo)
echo "🔥 Installing PyTorch (required for NeMo)..."

# Detect platform for PyTorch installation
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - install with MPS support for Apple Silicon
    pip3 install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
else
    # Linux - check for CUDA
    if command -v nvidia-smi > /dev/null; then
        echo "🎮 CUDA detected, installing PyTorch with CUDA support..."
        pip3 install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    else
        echo "💻 Installing CPU-only PyTorch..."
        pip3 install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi
fi

# Install core dependencies
echo "📦 Installing core dependencies..."
pip3 install Cython packaging

# Install NeMo toolkit
echo "🤖 Installing NVIDIA NeMo with ASR support..."
pip3 install git+https://github.com/NVIDIA/NeMo.git@main#egg=nemo_toolkit[asr]

# Install remaining requirements
echo "📦 Installing additional requirements..."
pip3 install -r requirements.txt

# Test installation
echo "🧪 Testing NeMo installation..."
python3 -c "
import torch
print(f'✅ PyTorch {torch.__version__}')

try:
    from nemo.collections.asr.models import SortformerEncLabelModel
    print('✅ NeMo ASR models available')
except ImportError as e:
    print(f'❌ NeMo import failed: {e}')
    exit(1)

# Test device availability
if torch.cuda.is_available():
    print(f'✅ CUDA available: {torch.cuda.get_device_name(0)}')
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print('✅ Apple Silicon MPS available')
else:
    print('ℹ️ CPU-only mode (no GPU acceleration)')

print('✅ NeMo setup completed successfully!')
"

if [[ $? -eq 0 ]]; then
    echo ""
    echo "✅ NVIDIA NeMo setup completed successfully!"
    echo ""
    echo "🔧 Usage:"
    echo "  # Test with offline model (higher accuracy)"
    echo "  python3 nemo_diarization.py /path/to/audio.mp3"
    echo ""
    echo "  # Test with streaming model (faster)"
    echo "  python3 nemo_diarization.py /path/to/audio.mp3 --streaming"
    echo ""
    echo "📊 Available models:"
    echo "  - nvidia/diar_sortformer_4spk-v1 (offline, best accuracy)"
    echo "  - nvidia/diar_streaming_sortformer_4spk-v2 (streaming, real-time)"
    echo ""
    echo "🚀 Ready to replace PyAnnote with more accurate NeMo Sortformer!"
else
    echo ""
    echo "❌ NeMo setup failed. Check the error messages above."
    echo "💡 Common issues:"
    echo "  - Python version too old (need 3.8+)"
    echo "  - Missing system dependencies (libsndfile1, ffmpeg)"
    echo "  - Insufficient memory during installation"
    exit 1
fi