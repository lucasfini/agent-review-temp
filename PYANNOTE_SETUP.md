# PyAnnote + NeMo Speaker Diarization Setup

This project supports **PyAnnote** (recommended for Apple Silicon) and **NeMo Sortformer** (for Linux + CUDA) for accurate, AI-powered speaker diarization.

## Why PyAnnote / NeMo?

- **Higher Accuracy**: Machine learning-based speaker detection vs rule-based heuristics
- **Cost Effective**: Free open-source alternative to expensive solutions
- **Better Boundaries**: Precise speaker change detection and timing
- **State-of-the-art**: Uses the latest advances in speaker diarization research

## Recommended Setup by Platform

### macOS (Apple Silicon: M1/M2/M3/M4) - RECOMMENDED

**Fast, reliable diarization using PyAnnote + MPS (Metal Performance Shaders):**

#### 1. Install PyAnnote with MPS support

```bash
cd scripts
./setup_pyannote.sh
```

The script will:
- Detect Apple Silicon and install **PyTorch 2.9.0** with MPS support
- Verify MPS is available (you'll see: `device: mps`)
- Exit with error if running under Rosetta (x86_64) - must use native arm64 Python
- Install PyAnnote.audio and all dependencies

#### 2. Configure environment variables

Add to your `.env` or `.env.local`:

```bash
PYANNOTE_PYTHON_PATH=/full/path/to/scripts/pyannote_env/bin/python
HUGGING_FACE_ACCESS_TOKEN=your_hf_token_here

# Performance tuning:
EXPECTED_SPEAKERS=2                # Lock to 2 speakers for podcasts/interviews
PYANNOTE_MERGE_GAP_S=1.2          # Merge speaker turns within 1.2s
PYANNOTE_WINDOWED=true            # Enable for >15min files (5min windows, 1s overlap)

# Word-level alignment (optional fine-tuning):
SPEAKER_WORD_COLLAR_S=0.15        # Word-to-speaker matching tolerance
SPEAKER_MIN_TURN_S=0.8            # Minimum speaker turn duration
SPEAKER_SANDWICH_MAX_S=0.6        # Max duration for sandwich smoothing
SAME_SPEAKER_GAP_S=1.2            # Merge same-speaker segments within gap
```

#### 3. Expected Performance

- **With MPS (GPU):** ~3x audio duration
  - Example: 18-minute audio → ~54 minutes processing
  - Logs show: `device: mps` and `Timeout calculation (mps): ...`
- **CPU fallback:** ~20x audio duration (much slower)

#### 4. NeMo Behavior on macOS

- NeMo requires Linux + CUDA, so it's **automatically skipped** on macOS
- You'll see: `[NEMO] Skipping NeMo: CUDA/Linux required on darwin`
- PyAnnote handles all diarization ✅ (this is the correct behavior!)

---

### Linux + NVIDIA GPU (NeMo Sortformer)

**Only for Linux machines with NVIDIA CUDA GPUs:**

#### Requirements

- Linux OS (Ubuntu/Debian recommended)
- NVIDIA GPU with CUDA drivers (`nvidia-smi` must work)
- Python 3.10 or 3.11 (**NOT 3.12+**, NeMo doesn't support it yet)

#### Installation

```bash
cd scripts
./setup_nemo.sh
```

The script will:
- **Exit immediately on macOS/Darwin** with message to use PyAnnote instead
- Check for NVIDIA GPU (`nvidia-smi`)
- Refuse Python 3.12+ (asks you to create Python 3.10/3.11 venv)
- Install CUDA-enabled PyTorch and NeMo toolkit

#### Behavior

- NeMo is **only attempted** on `process.platform === 'linux'` with CUDA
- If CUDA unavailable, automatically falls back to PyAnnote
- Generally faster and more accurate than PyAnnote on CUDA hardware

---

### Intel Macs (CPU-only)

> **Performance Warning:** PyTorch cannot use MPS on Intel Macs, so PyAnnote runs on CPU only (~20x slower).

**Recommendations:**
- Use `EXPECTED_SPEAKERS=2` to reduce search space
- Enable `PYANNOTE_WINDOWED=true` for incremental progress and logs
- Consider processing on a GPU machine (Apple Silicon or Linux+CUDA)

---

## Environment Variables Reference

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PYANNOTE_PYTHON_PATH` | `python3` | Path to Python with PyAnnote installed |
| `HUGGING_FACE_ACCESS_TOKEN` | (required) | HuggingFace token for model access |
| `EXPECTED_SPEAKERS` | auto | Lock speaker count (e.g., `2` for interviews) |

### Performance Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `PYANNOTE_MERGE_GAP_S` | `1.2` | Merge consecutive same-speaker segments within gap |
| `PYANNOTE_WINDOWED` | `false` | Enable windowed processing for long files |
| `PYANNOTE_WINDOW_DURATION_S` | `300` | Window size in seconds (5 minutes) |
| `PYANNOTE_WINDOW_OVERLAP_S` | `1` | Overlap between windows |

### Word-Level Alignment

| Variable | Default | Description |
|----------|---------|-------------|
| `SPEAKER_WORD_COLLAR_S` | `0.15` | Word-to-speaker timestamp tolerance |
| `SPEAKER_MIN_TURN_S` | `0.8` | Minimum speaker turn duration |
| `SPEAKER_SANDWICH_MAX_S` | `0.6` | Max duration for sandwich smoothing |
| `SAME_SPEAKER_GAP_S` | `1.2` | Merge same-speaker with gap ≤ this |

---

## Troubleshooting

### macOS: "MPS is unavailable on Apple Silicon"

**Cause:** You're running under Rosetta (x86_64) instead of native arm64.

**Solutions:**
1. Check Python architecture:
   ```bash
   python -c "import platform; print(platform.machine())"
   # Should print 'arm64', not 'x86_64'
   ```

2. Use arm64 Python:
   ```bash
   arch -arm64 python3.11 -m venv pyannote_env
   ```

3. Use pyenv with native Python:
   ```bash
   pyenv install 3.11.9
   pyenv local 3.11.9
   cd scripts && ./setup_pyannote.sh
   ```

### NeMo on macOS: "Skipping NeMo"

**This is expected!** NeMo requires Linux + CUDA. On macOS, the system:
1. Instantly returns `false` from `checkNeMoAvailability()` (no slow probe)
2. Logs: `[NEMO] Skipping NeMo: CUDA/Linux required on darwin`
3. Falls back to PyAnnote + MPS (which is fast and accurate!)

### Python 3.12 with NeMo

**NeMo doesn't support Python 3.12 yet.**

Create a Python 3.11 venv:
```bash
pyenv install 3.11.9
pyenv local 3.11.9
python3.11 -m venv nemo_env
source nemo_env/bin/activate
cd scripts && ./setup_nemo.sh
```

---

## Testing Your Setup

### Test PyAnnote

```bash
cd scripts
source pyannote_env/bin/activate
python pyannote_diarization.py --help
```

### Verify MPS (Apple Silicon)

```bash
python -c "import torch; print('torch', torch.__version__)"
python -c "import torch; print('mps:', torch.backends.mps.is_available())"
# Should print: mps: True
```

### Upload Test Audio

Upload a podcast through your app and check logs for:

```
[PYANNOTE] Checking availability...
[PYANNOTE] Availability check: ✅ Available
[PYANNOTE] 🎯 Using device: mps
[PYANNOTE] ⏱️ Timeout calculation (mps): 18.0min audio → 54.0min timeout (3x)
```

---

## Architecture

### Pipeline Flow

```
Audio Upload
    ↓
Whisper Transcription (with word-level timestamps)
    ↓
Speaker Diarization:
    • NeMo (Linux + CUDA) OR
    • PyAnnote (macOS MPS / CPU fallback)
    ↓
Word-Level Alignment (lib/speaker-align.ts)
    • Assign words to speakers via timestamp overlap
    • Group contiguous words per speaker
    • Smooth flip-flops (sandwich/min-turn rules)
    ↓
Final Transcript with Speaker Attribution
```

### Platform Detection Logic

**NeMo** (`lib/nemo-integration.ts:checkNeMoAvailability`):
- Instantly returns `false` if `process.platform !== 'linux'`
- Caches result to avoid repeated probes
- Only checks Python/CUDA on Linux

**PyAnnote** (`lib/pyannote-integration.ts`):
- Always available as fallback
- Device detection: `mps` > `cuda` > `cpu`
- MPS-aware timeout multipliers

---

## Support

For issues:
1. Check logs for `[PYANNOTE]` or `[NEMO]` messages
2. Verify `device: mps` appears for Apple Silicon
3. Confirm `HUGGING_FACE_ACCESS_TOKEN` is set
4. Test with smaller files first (<5 minutes)

The system gracefully falls back to PyAnnote if NeMo is unavailable, so your application continues working regardless of platform.
