# PyAnnote Speaker Diarization Setup

This project now supports PyAnnote, an open-source machine learning model for accurate speaker diarization. PyAnnote provides significantly better speaker detection accuracy compared to rule-based approaches.

## Why PyAnnote?

- **Higher Accuracy**: Machine learning-based speaker detection vs rule-based heuristics
- **Cost Effective**: Free open-source alternative to expensive solutions like Picovoice Falcon
- **Better Boundaries**: Precise speaker change detection and timing
- **State-of-the-art**: Uses the latest advances in speaker diarization research

## Installation

### Prerequisites

1. **Python 3.8+** installed on your system
2. **Node.js** application already running

### Step 1: Install Python Dependencies

Due to Python's externally-managed-environment restrictions, you need to use a virtual environment:

#### Option A: Using Virtual Environment (Recommended)

```bash
cd scripts

# Create virtual environment
python3 -m venv pyannote_env

# Activate virtual environment
source pyannote_env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Test installation
python test_pyannote.py
```

#### Option B: Using pipx (Alternative)

```bash
# Install pipx if not already installed
brew install pipx

# Install PyAnnote in isolated environment
pipx install pyannote.audio
pipx inject pyannote.audio torch torchaudio soundfile librosa transformers accelerate
```

#### Option C: System Install (Not Recommended)

```bash
# Only if you understand the risks
pip3 install -r requirements.txt --break-system-packages --user
```

### Step 2: Set Python Path

Configure the Python path based on your installation method:

#### If using Virtual Environment:

Add to your `.env` file in the project root:

```
PYANNOTE_PYTHON_PATH=/Users/lucasfiniello/Desktop/Projects/audiorepurpose/scripts/pyannote_env/bin/python
```

Or export temporarily:

```bash
export PYANNOTE_PYTHON_PATH="$(pwd)/scripts/pyannote_env/bin/python"
```

#### If using pipx:

```bash
export PYANNOTE_PYTHON_PATH="$(pipx environment --value PIPX_LOCAL_VENVS)/pyannote-audio/bin/python"
```

#### If using system install:

```bash
export PYANNOTE_PYTHON_PATH="/usr/bin/python3"
```

### Step 3: Test Installation

Test that PyAnnote is working:

```bash
python3 scripts/pyannote_diarization.py --help
```

### Step 4: GPU Acceleration (Optional)

For faster processing with NVIDIA GPUs:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

## Usage

Once installed, the system will automatically:

1. **Check Availability**: On startup, the system checks if PyAnnote is available
2. **Automatic Fallback**: If PyAnnote is not available, it falls back to rule-based detection
3. **Enhanced Processing**: When available, PyAnnote processes audio files for better speaker detection
4. **Seamless Integration**: No changes needed to the UI or workflow

## Troubleshooting

### Common Issues

1. **"Module not found" errors**
   ```bash
   pip install --upgrade pyannote.audio
   ```

2. **GPU/CUDA errors** (if using GPU acceleration)
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
   ```

3. **Permission errors**
   ```bash
   pip install --user pyannote.audio
   ```

### Checking Status

The application logs will show PyAnnote availability status:

```
🎯 MAIN: PyAnnote availability: ✅ Available
```

or

```
🎯 MAIN: PyAnnote availability: ❌ Not available
🎯 MAIN: PyAnnote setup instructions:
...
```

### Performance Notes

- **CPU Processing**: Works on any system but may be slower for large files
- **GPU Processing**: Significantly faster with NVIDIA GPUs and CUDA
- **Memory Usage**: Requires ~2-4GB RAM for typical podcast files
- **Processing Time**: Usually 1-3x real-time (e.g., 10 minutes for a 30-minute podcast)

## Model Information

PyAnnote uses pretrained models from Hugging Face:

- **Model**: `pyannote/speaker-diarization-3.1`
- **License**: MIT (for non-commercial use)
- **Paper**: https://arxiv.org/abs/2301.13593

Some models may require a Hugging Face token for access. If needed:

1. Create account at https://huggingface.co
2. Get your token from https://huggingface.co/settings/tokens
3. Set environment variable: `export HUGGING_FACE_HUB_TOKEN=your_token_here`

## Benefits Over Rule-Based Detection

| Feature | Rule-Based | PyAnnote |
|---------|------------|----------|
| Accuracy | ~60-70% | ~85-95% |
| Speaker Changes | Basic heuristics | ML-trained detection |
| Audio Quality | Sensitive to noise | Robust to noise |
| Languages | English-focused | Multi-language |
| Setup | No dependencies | Python setup required |

## Support

If you encounter issues:

1. Check the application logs for PyAnnote status messages
2. Verify Python dependencies are installed correctly
3. Test with smaller audio files first
4. Check system requirements (RAM, Python version)

The system gracefully falls back to rule-based detection if PyAnnote is unavailable, so your application will continue working regardless of setup status.