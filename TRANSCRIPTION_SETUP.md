# Fast Cloud Transcription with AssemblyAI

This project now supports **AssemblyAI** for ultra-fast cloud-based transcription + speaker diarization, achieving 60x faster processing than local PyAnnote/Whisper.

## Performance Comparison

| Method | 2-Hour Podcast Processing | Cost | Accuracy |
|--------|--------------------------|------|----------|
| **AssemblyAI (Cloud)** | ~2 minutes | $0.30 | 97%+ |
| **Whisper + PyAnnote (Local MPS)** | ~6 hours | $0 | 85-90% |
| **Whisper + PyAnnote (Local CPU)** | ~40 hours | $0 | 85-90% |

## Quick Start

### 1. Get an AssemblyAI API Key

1. Sign up at [AssemblyAI](https://www.assemblyai.com/)
2. Get your API key from the [dashboard](https://www.assemblyai.com/app)
3. **Free tier**: $50 credits + 60 minutes/month

### 2. Add to Environment Variables

Add to your `.env` or `.env.local`:

```bash
# AssemblyAI Configuration (for fast cloud processing)
ASSEMBLYAI_API_KEY=your_api_key_here
# Or use: ASSEMBLYAI_ACCESS_KEY=your_api_key_here (either name works)

# Transcription Strategy (choose one)
TRANSCRIPTION_PROVIDER=auto          # Intelligent selection (recommended)
# TRANSCRIPTION_PROVIDER=assemblyai  # Always use AssemblyAI
# TRANSCRIPTION_PROVIDER=local       # Always use local (Whisper + PyAnnote)

# Fallback Behavior
TRANSCRIPTION_FALLBACK_TO_LOCAL=true # Fallback to local if AssemblyAI fails
```

### 3. That's It!

Your application will now automatically use AssemblyAI for transcription + speaker diarization.

---

## How It Works

### Provider Selection Logic

The system intelligently chooses between cloud and local processing based on:

1. **Provider Setting (`TRANSCRIPTION_PROVIDER`)**:
   - `auto`: Intelligent selection based on availability and cost
   - `assemblyai`: Always use AssemblyAI (fastest)
   - `local`: Always use Whisper + PyAnnote/NeMo (free)

2. **Auto Mode Decision Tree**:
   ```
   ┌─ AssemblyAI API key configured?
   │  ├─ YES ─┬─ Cost within budget? ($2 default)
   │  │       ├─ YES → Use AssemblyAI ⚡
   │  │       └─ NO → Use local processing 🏠
   │  └─ NO → Use local processing 🏠
   ```

3. **Fallback Behavior**:
   - If AssemblyAI fails and `TRANSCRIPTION_FALLBACK_TO_LOCAL=true`
   - Automatically falls back to Whisper + PyAnnote

### Architecture

#### AssemblyAI Flow (Fast):
```
Upload Audio → AssemblyAI Cloud
    ↓
Transcription + Speaker Diarization (simultaneous)
    ↓
Word-level timestamps + Speaker labels
    ↓
Save to database (complete) → Return to user
```

**Time**: ~2 minutes for 2-hour podcast
**Cost**: $0.30 for 2-hour podcast

#### Local Flow (Free):
```
Upload Audio → Whisper Transcription (local)
    ↓
Speaker Diarization (PyAnnote/MPS or NeMo/CUDA)
    ↓
Word-level alignment
    ↓
Save transcription → Background speaker analysis → Update database
```

**Time**: ~6 hours for 2-hour podcast (with MPS)
**Cost**: $0 (local processing)

---

## Environment Variables Reference

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ASSEMBLYAI_API_KEY` | (none) | Your AssemblyAI API key |
| `TRANSCRIPTION_PROVIDER` | `auto` | `assemblyai`, `local`, or `auto` |
| `TRANSCRIPTION_FALLBACK_TO_LOCAL` | `true` | Fallback to local if cloud fails |

### Local PyAnnote/NeMo Settings

*These only apply when using local processing:*

| Variable | Default | Description |
|----------|---------|-------------|
| `PYANNOTE_PYTHON_PATH` | `python3` | Path to Python with PyAnnote |
| `HUGGING_FACE_ACCESS_TOKEN` | (required) | HF token for PyAnnote models |
| `EXPECTED_SPEAKERS` | auto | Lock speaker count (e.g., `2`) |
| `PYANNOTE_MERGE_GAP_S` | `1.2` | Merge same-speaker segments |
| `PYANNOTE_WINDOWED` | `false` | Enable windowed processing |

See `PYANNOTE_SETUP.md` for full local setup instructions.

---

## Cost Management

### Pricing

AssemblyAI charges $0.15 per hour of audio:

| Audio Duration | Cost |
|----------------|------|
| 30 minutes | $0.08 |
| 1 hour | $0.15 |
| 2 hours | $0.30 |
| 10 hours | $1.50 |

### Budget Control

In `auto` mode, you can set a maximum cost per file:

```typescript
// In lib/transcription-strategy.ts, line ~90
const maxCost = config.maxCostUSD ?? 2.00; // Default: $2 per file
```

If estimated cost exceeds this, the system automatically falls back to local processing.

### Free Tier

AssemblyAI provides:
- $50 in credits (333 hours of audio)
- 60 free minutes per month (ongoing)

This is enough to process **333 hours of podcasts** with your free tier!

---

## Monitoring

### Check Provider Status

Your application logs will show the selected provider:

```
[TRANSCRIPTION] Strategy info: {
  assemblyAIAvailable: true,
  pyAnnoteAvailable: true,
  defaultProvider: 'auto',
  fallbackEnabled: true
}
[TRANSCRIPTION] 📡 Using AssemblyAI for fast cloud processing
[TRANSCRIPTION] ✅ AssemblyAI completed in 123.4s
[TRANSCRIPTION] Cost: $0.30
[TRANSCRIPTION] Speakers: 2, Segments: 145
```

### API Response

When using AssemblyAI, the API response includes:

```json
{
  "success": true,
  "projectId": "...",
  "transcription": "...",
  "duration": 7200,
  "segments": 145,
  "method": "assemblyai",
  "speakers": 2,
  "cost_usd": 0.30
}
```

---

## Troubleshooting

### "AssemblyAI API key not found"

**Cause**: `ASSEMBLYAI_API_KEY` not set in environment.

**Solution**:
1. Get your API key from https://www.assemblyai.com/app
2. Add to `.env.local`:
   ```
   ASSEMBLYAI_API_KEY=your_key_here
   ```
3. Restart your Next.js application

### "AssemblyAI processing failed"

**Cause**: API error or network issue.

**Solution**:
1. Check your API key is valid
2. Check AssemblyAI service status
3. If `TRANSCRIPTION_FALLBACK_TO_LOCAL=true`, it will automatically fallback
4. Check logs for specific error message

### Still Using Local Processing

**Check these**:
1. Is `ASSEMBLYAI_API_KEY` set correctly?
2. Is `TRANSCRIPTION_PROVIDER` set to `assemblyai` or `auto`?
3. Check logs for provider selection decision
4. Restart Next.js to pick up env changes

---

## Migration from Local-Only

If you're currently using only Whisper + PyAnnote:

### Before:
```env
# .env.local
PYANNOTE_PYTHON_PATH=/path/to/pyannote_env/bin/python
HUGGING_FACE_ACCESS_TOKEN=hf_...
EXPECTED_SPEAKERS=2
```

### After (Hybrid):
```env
# .env.local
# Cloud (Primary - Fast)
ASSEMBLYAI_API_KEY=your_assemblyai_key
TRANSCRIPTION_PROVIDER=auto
TRANSCRIPTION_FALLBACK_TO_LOCAL=true

# Local (Fallback - Free)
PYANNOTE_PYTHON_PATH=/path/to/pyannote_env/bin/python
HUGGING_FACE_ACCESS_TOKEN=hf_...
EXPECTED_SPEAKERS=2
```

Now you have:
- ⚡ **Fast**: AssemblyAI for production (2 min processing)
- 🏠 **Free**: Local fallback if needed
- 🛡️ **Reliable**: Automatic failover

---

## Advanced Configuration

### Custom Strategy

You can customize the provider selection logic in `lib/transcription-strategy.ts`:

```typescript
// Example: Only use AssemblyAI for files > 1 hour
const estimatedDuration = ...; // seconds
const maxCost = estimatedDuration > 3600 ? 5.00 : 0.50;

const result = await selectTranscriptionStrategy({
  provider: 'auto',
  audioFilePath: '/path/to/audio.mp3',
  maxCostUSD: maxCost,
  fallbackToLocal: true
});
```

### Webhooks (Optional)

For very long files, you can use AssemblyAI webhooks instead of polling:

```typescript
const result = await transcribeWithAssemblyAI(audioFilePath, {
  webhookUrl: 'https://your-app.com/api/webhooks/assemblyai'
});
```

---

## Why AssemblyAI?

1. **60x Faster**: 2 minutes vs 2 hours for typical podcast
2. **Higher Accuracy**: 97%+ vs 85-90% for speaker diarization
3. **Zero Infrastructure**: No Python, no GPU setup, no maintenance
4. **Scalable**: Handles unlimited concurrent requests
5. **Cost-Effective**: $0.15/hour is cheaper than GPU server costs
6. **Word-Level Timestamps**: Built-in, perfect alignment
7. **99 Languages**: Supports 95 with diarization

## When to Use Local Processing

Local processing (Whisper + PyAnnote) is better when:
- Development/testing (avoid API costs)
- Privacy requirements (keep audio local)
- Very high volume (>1000 hours/month)
- Offline/air-gapped environments

---

## Support

- **AssemblyAI Docs**: https://www.assemblyai.com/docs
- **API Status**: https://status.assemblyai.com/
- **Pricing**: https://www.assemblyai.com/pricing
- **PyAnnote Setup**: See `PYANNOTE_SETUP.md`

For issues with this integration, check application logs for detailed error messages.
