# Speaker Diarization Configuration

This document describes the configuration options for speaker diarization in the audio repurpose application.

## Overview

The system uses **AssemblyAI** as the primary transcription and speaker diarization service. AssemblyAI handles both transcription and speaker detection in a single API call, providing professional-grade accuracy without local processing requirements.

**Optional**: Sortformer can be used for advanced speaker diarization if local processing is preferred.

## Environment Variables

### AssemblyAI Configuration

- **`ASSEMBLYAI_API_KEY`** (required)
  - Your AssemblyAI API key
  - Required for all transcription and diarization operations
  - Get your key at: https://www.assemblyai.com

### Sortformer Configuration (Optional)

Only needed if using local Sortformer diarization instead of AssemblyAI:

- **`SORTFORMER_PYTHON_PATH`** (optional)
  - Path to Python executable with Sortformer dependencies
  - Falls back to system `python3` if not specified

- **`SORTFORMER_DEVICE`** (optional)
  - Force specific device for Sortformer processing
  - Values: `cpu`, `cuda`, `mps`
  - Auto-detected if not specified

### Post-Processing Configuration

These settings control how speaker segments are refined after diarization:

- **`SPEAKER_MIN_TURN_S`** (default: `0.8`)
  - Minimum duration for a speaker turn in seconds
  - Turns shorter than this will be merged with adjacent segments
  - Helps eliminate brief spurious speaker changes

- **`SAME_SPEAKER_GAP_S`** (default: `1.2`)
  - Maximum gap between same-speaker segments for merging
  - Adjacent segments from same speaker with gaps ≤ this will be merged
  - Reduces over-segmentation of single speaker's turns

## Usage Examples

### Interview/Podcast (2 speakers)
```bash
ASSEMBLYAI_API_KEY=your_key_here
SPEAKER_MIN_TURN_S=1.0
SAME_SPEAKER_GAP_S=2.0
```

### Panel Discussion (3-4 speakers, rapid exchanges)
```bash
ASSEMBLYAI_API_KEY=your_key_here
SPEAKER_MIN_TURN_S=0.5
SAME_SPEAKER_GAP_S=0.8
```

### Lecture/Presentation (mostly 1 speaker)
```bash
ASSEMBLYAI_API_KEY=your_key_here
SPEAKER_MIN_TURN_S=2.0
SAME_SPEAKER_GAP_S=5.0
```

## Algorithm Flow (AssemblyAI)

1. **Upload**: Audio file sent to AssemblyAI
2. **Processing**: AssemblyAI performs transcription + speaker diarization simultaneously
3. **Grouping**: Segments grouped by speaker ID
4. **Post-Processing** (optional):
   - Merge same-speaker segments within gap threshold
   - Filter ultra-short turns
5. **Output**: Conversation turns with accurate speaker attribution

## Troubleshooting

### Over-segmentation (too many speaker changes)
- Increase `SAME_SPEAKER_GAP_S`
- Increase `SPEAKER_MIN_TURN_S`

### Under-segmentation (speaker changes missed)
- Decrease `SAME_SPEAKER_GAP_S`
- This is rare with AssemblyAI - check audio quality

### Performance optimization
- Use caching: The system automatically caches base transcriptions
- Cache hits reuse transcription, only paying for AI enhancement
- ~75% cost reduction on repeated processing of same audio

## Logging

The system logs processing information including:
- Transcription duration and cost
- Number of speakers detected
- Speaker segment counts
- Cache hit/miss status

Check server logs for detailed processing information.

## Cost Information

**AssemblyAI Pricing**:
- ~$0.37 per audio hour
- Includes both transcription and speaker diarization
- No additional cost for speaker detection

**Caching Benefits**:
- First processing: Full AssemblyAI cost
- Subsequent processing: $0 transcription cost (cache hit)
- Only pay for tier-specific AI enhancements (names, roles, etc.)
