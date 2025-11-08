# Speaker Diarization Configuration

This document describes the configuration options for speaker diarization in the audio repurpose application.

## Environment Variables

### Word-Level Alignment Configuration

- **`SPEAKER_WORD_COLLAR_S`** (default: `0.15`)
  - Temporal tolerance in seconds for word-to-speaker assignment
  - Words within this buffer around speaker turns are considered for assignment
  - Lower values = stricter alignment, higher values = more flexible assignment

- **`SPEAKER_MIN_TURN_S`** (default: `0.8`) 
  - Minimum duration for a speaker turn in seconds
  - Turns shorter than this will be merged with adjacent segments
  - Helps eliminate brief spurious speaker changes

- **`SPEAKER_SANDWICH_MAX_S`** (default: `0.6`)
  - Maximum duration for sandwich pattern smoothing (A-B-A → A)
  - When a brief speaker B appears between two segments of speaker A, merge into A
  - Reduces false speaker changes in rapid exchanges

- **`SAME_SPEAKER_GAP_S`** (default: `1.2`)
  - Maximum gap between same-speaker segments for merging
  - Adjacent segments from same speaker with gaps ≤ this will be merged
  - Reduces over-segmentation of single speaker's turns

### PyAnnote Configuration

- **`PYANNOTE_NUM_SPEAKERS`** or **`EXPECTED_SPEAKERS`** (optional)
  - Explicit number of expected speakers (integer)
  - When set, constrains PyAnnote to exactly this many speakers
  - Overrides automatic speaker count estimation
  - Useful for known speaker counts (e.g., interviews, debates)

- **`PYANNOTE_MERGE_GAP_S`** (default: `1.2`)
  - Gap threshold for merging consecutive same-speaker segments in PyAnnote
  - Reduced from default 3.0s to 1.2s for tighter speaker boundaries
  - Works at the PyAnnote level before word-level alignment

- **`PYANNOTE_PYTHON_PATH`** (optional)
  - Path to Python executable with PyAnnote dependencies
  - Falls back to system `python3` if not specified

- **`HUGGING_FACE_ACCESS_TOKEN`** (required for PyAnnote)
  - HuggingFace access token for downloading PyAnnote models
  - Required for `pyannote/speaker-diarization-3.1` model

### NeMo Configuration  

- **`NEMO_USE_STREAMING`** (default: `false`)
  - Use NeMo streaming model (faster) vs offline model (more accurate)
  - `true` = streaming model (real-time processing)
  - `false` = offline model (higher accuracy, slower)

- **`NEMO_DEVICE`** (optional)
  - Force specific device for NeMo processing
  - Values: `cpu`, `cuda`, `mps`
  - Auto-detected if not specified

- **`NEMO_PYTHON_PATH`** (optional)
  - Path to Python executable with NeMo dependencies
  - Falls back to `PYANNOTE_PYTHON_PATH` or system `python3`

## Usage Examples

### Interview/Podcast (2 speakers)
```bash
EXPECTED_SPEAKERS=2
SPEAKER_MIN_TURN_S=1.0
SAME_SPEAKER_GAP_S=2.0
PYANNOTE_MERGE_GAP_S=2.0
```

### Panel Discussion (3-4 speakers, rapid exchanges)
```bash
EXPECTED_SPEAKERS=4
SPEAKER_WORD_COLLAR_S=0.2
SPEAKER_MIN_TURN_S=0.5
SPEAKER_SANDWICH_MAX_S=0.3
SAME_SPEAKER_GAP_S=0.8
```

### Lecture/Presentation (mostly 1 speaker)
```bash
EXPECTED_SPEAKERS=1
SPEAKER_MIN_TURN_S=2.0
SAME_SPEAKER_GAP_S=5.0
PYANNOTE_MERGE_GAP_S=5.0
```

### High Accuracy Processing
```bash
NEMO_USE_STREAMING=false
NEMO_DEVICE=cuda  # or mps for Apple Silicon
SPEAKER_WORD_COLLAR_S=0.1
SPEAKER_MIN_TURN_S=1.0
```

## Algorithm Flow

1. **Transcription**: Whisper generates segments with word-level timestamps
2. **Diarization**: NeMo/PyAnnote identifies speaker boundaries from audio
3. **Word-Level Alignment**: Maps words to speakers using temporal overlap with collar
4. **Post-Processing**: 
   - Merge same-speaker segments within gap threshold
   - Apply sandwich smoothing (A-B-A patterns)
   - Merge/reassign ultra-short turns
5. **Output**: Natural conversation turns with accurate speaker attribution

## Troubleshooting

### Over-segmentation (too many speaker changes)
- Increase `SAME_SPEAKER_GAP_S` 
- Increase `PYANNOTE_MERGE_GAP_S`
- Set `EXPECTED_SPEAKERS` if known
- Increase `SPEAKER_MIN_TURN_S`

### Under-segmentation (speaker changes missed)  
- Decrease `SAME_SPEAKER_GAP_S`
- Decrease `SPEAKER_WORD_COLLAR_S` 
- Decrease `SPEAKER_SANDWICH_MAX_S`
- Use `NEMO_USE_STREAMING=false` for higher accuracy

### Poor word assignment (high unassigned percentage)
- Increase `SPEAKER_WORD_COLLAR_S`
- Check audio quality and transcription accuracy
- Verify speaker boundaries are reasonable

### Performance optimization
- Use `NEMO_USE_STREAMING=true` for faster processing
- Set `NEMO_DEVICE=cuda` or `NEMO_DEVICE=mps` for GPU acceleration
- Increase `SPEAKER_MIN_TURN_S` to reduce segment count

## Logging

The system logs alignment statistics including:
- Total words processed and assignment rate
- Speaker distribution and turn counts  
- Post-processing merges applied
- Unassigned word percentage (should be <2% for good results)

Check server logs for detailed alignment information during processing.