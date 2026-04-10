# Transcription Setup

> This is the current high-level setup guide. For launch infrastructure and env setup, pair it with the deployment docs.

This project uses **AssemblyAI** for cloud-based transcription + speaker diarization, providing professional-grade accuracy with fast processing times.

**Optional**: Sortformer can be used for local speaker diarization if preferred.

## Performance Comparison

| Method | Processing Time (1hr audio) | Cost | Accuracy |
|--------|----------------------------|------|----------|
| **AssemblyAI (Cloud)** | ~2-3 minutes | ~$0.37 | 97%+ |
| **Sortformer (Local)** | ~15-30 minutes | $0 | 90-95% |

## Quick Setup

### 1. Get AssemblyAI API Key

1. Sign up at https://www.assemblyai.com
2. Get your API key from the dashboard
3. Add to `.env.local`:

```bash
ASSEMBLYAI_API_KEY=your_key_here
```

### 2. Configure Tier Settings (Optional)

The system supports 3 processing tiers:

```bash
# Basic tier (default): Transcription + numbered speakers
# Pro tier: + AI name extraction + summary
# Premium tier: + Role classification + chapters + takeaways + quotes

# Set default tier (optional)
DEFAULT_PROCESSING_TIER=pro
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key (required) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_PROCESSING_TIER` | `basic` | Default processing tier (basic/pro/premium) |
| `ANTHROPIC_API_KEY` | - | Required for Pro/Premium AI features |

### Optional Sortformer Configuration

Only needed if using local Sortformer diarization:

| Variable | Default | Description |
|----------|---------|-------------|
| `SORTFORMER_PYTHON_PATH` | `python3` | Path to Python with Sortformer dependencies |
| `SORTFORMER_DEVICE` | auto | Device for processing (cpu/cuda/mps) |

## Processing Flow

```
Audio Upload
    ↓
AssemblyAI Processing (Transcription + Diarization)
    ↓
Speaker Grouping
    ↓
Tier-Based AI Enhancement
    ↓
Caching (for cost optimization)
    ↓
Final Output
```

## Tier Features

### Basic Tier
- AssemblyAI transcription
- Speaker diarization
- Numbered speakers (Speaker 1, Speaker 2, etc.)
- **Cost**: ~$0.37/hour

### Pro Tier
- Everything in Basic
- AI name extraction
- Podcast summary
- **Cost**: ~$0.40-0.45/hour

### Premium Tier
- Everything in Pro
- Speaker role classification (host, guest, etc.)
- Chapter detection
- Key takeaways extraction
- Social media quotes
- **Cost**: ~$0.50-0.60/hour

## Caching System

The system automatically caches base transcriptions to reduce costs:

- **First processing**: Full AssemblyAI cost
- **Subsequent processing**: $0 transcription cost (cache hit)
- Only pay for tier-specific AI enhancements

Example:
- First processing (Premium): $0.55
- Re-processing with different tier (Pro): $0.05 (only AI enhancement)
- **Savings**: ~90% on repeat processing

## Usage in Code

```typescript
// In your upload/transcription flow
const result = await transcribeAudio({
  projectId: 'project-123',
  fileName: 'audio.mp3',
  performanceLevel: 'premium', // basic, pro, or premium
});

// Result includes:
// - transcription text
// - speaker segments
// - AI-generated content (based on tier)
// - cost breakdown
```

## API Response Format

```json
{
  "success": true,
  "tier": "premium",
  "transcription": "Full transcript text...",
  "speakers": 2,
  "duration": 3600,
  "cost": 0.55,
  "costBreakdown": {
    "transcription": 0.37,
    "aiProcessing": 0.18,
    "total": 0.55
  },
  "features": {
    "summary": true,
    "chapters": true,
    "takeaways": true,
    "quotes": true,
    "roles": true
  }
}
```

## Troubleshooting

### Missing API Key
**Error**: "AssemblyAI not configured"

**Solution**: Add `ASSEMBLYAI_API_KEY` to `.env.local`

### Insufficient Credits
**Error**: "Insufficient credits"

**Solution**: Add credits via the billing dashboard or Stripe integration

### Slow Processing
**Issue**: Processing takes longer than expected

**Check**:
- AssemblyAI status: https://status.assemblyai.com
- Your internet connection
- File size (larger files take longer)

### Poor Speaker Detection
**Issue**: Wrong number of speakers detected

**Solutions**:
- Check audio quality (clear recording, minimal background noise)
- Use speaker roster feature to pre-define expected speakers
- Post-processing settings can help (see SPEAKER_DIARIZATION_CONFIG.md)

## Cost Optimization Tips

1. **Use caching**: Process same audio multiple times with different tiers
2. **Choose appropriate tier**: Don't use Premium if you only need transcription
3. **Batch processing**: Process multiple files in sequence
4. **Monitor usage**: Track costs via billing dashboard

## Additional Resources

- **AssemblyAI Docs**: https://www.assemblyai.com/docs
- **AssemblyAI Pricing**: https://www.assemblyai.com/pricing
- **Speaker Diarization Config**: See `SPEAKER_DIARIZATION_CONFIG.md`
- **Tier Configuration**: See project documentation

## Migration Notes

If you previously used older local diarization/transcription experiments:
- All processing now uses AssemblyAI by default
- Older PyAnnote-specific configuration is no longer the default path
- HuggingFace tokens no longer required
- Python environment setup no longer needed (unless using Sortformer)
- Expect significant speed improvements (60x faster)
