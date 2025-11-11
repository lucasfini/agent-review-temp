# Complete Cost Analysis - AudioRepurpose

## API Usage Audit (Verified 2025 Pricing)

### 🎯 Complete Pipeline Per Tier

---

## BASIC TIER

### 1. Transcription
- **Service**: OpenAI Whisper API (`whisper-1`)
- **Cost**: **$0.006/minute** ($0.36/hour)
- **Billing**: Per-second, rounded up
- **Data source**: `duration` field in API response

### 2. Speaker Diarization
- **Service**: PyAnnote (Local)
- **Cost**: **$0.00** (free - local processing)

### 3. Name Extraction
- **Service**: OpenAI GPT-4o-mini
- **Cost**:
  - Input: **$0.15 per 1M tokens**
  - Output: **$0.60 per 1M tokens**
- **Usage**: ~3 passes × ~3000 tokens = ~9,000 tokens total
- **Estimated cost per upload**: **~$0.002** (negligible)
- **Data source**: `usage.prompt_tokens` and `usage.completion_tokens` in API response

### 4. Role Classification
- **Service**: OpenAI GPT-4o-mini
- **Cost**:
  - Input: **$0.15 per 1M tokens**
  - Output: **$0.60 per 1M tokens**
- **Usage**: ~2000 tokens input + ~500 tokens output
- **Estimated cost per upload**: **~$0.001** (negligible)
- **Data source**: `usage.prompt_tokens` and `usage.completion_tokens` in API response

### **BASIC TIER TOTAL (1 hour audio)**
```
Transcription:        $0.360
Diarization:          $0.000
Name Extraction:      $0.002
Role Classification:  $0.001
─────────────────────────────
TOTAL COST:           $0.363
```

**With 35% markup: $0.49**

---

## PREMIUM TIER

### 1. Transcription + Diarization
- **Service**: AssemblyAI Universal
- **Cost**: **$0.27/hour** (includes diarization for 95 languages)
- **Note**: Speaker diarization is INCLUDED (not extra)
- **Data source**: Calculate from `audio_duration` in response

### 2. Name Extraction
- **Service**: OpenAI GPT-4o-mini
- **Cost**: Same as BASIC (~$0.002)

### 3. Role Classification
- **Service**: OpenAI GPT-4o-mini
- **Cost**: Same as BASIC (~$0.001)

### 4. Content Generation (when user generates content)
- **Service**: Claude Sonnet 4.5
- **Cost**:
  - Input: **$3.00 per 1M tokens**
  - Output: **$15.00 per 1M tokens**
- **Usage varies by content types selected**:
  - Blog post: ~15K input + ~5K output = $0.12
  - Social posts: ~5K input + ~2K output = $0.05
  - Email newsletter: ~8K input + ~3K output = $0.09
- **Estimated for full suite**: **~$0.25**
- **Data source**: `usage.input_tokens` and `usage.output_tokens` from Anthropic API

### **PREMIUM TIER TOTAL (1 hour audio)**

**Just transcription:**
```
Transcription:        $0.270
Diarization:          $0.000 (included)
Name Extraction:      $0.002
Role Classification:  $0.001
─────────────────────────────
TOTAL COST:           $0.273
```

**With full content generation:**
```
Transcription:        $0.270
Diarization:          $0.000
Name Extraction:      $0.002
Role Classification:  $0.001
Content Generation:   $0.250
─────────────────────────────
TOTAL COST:           $0.523
```

**With 35% markup:**
- Transcription only: $0.37
- With full content: $0.71

---

## Current Pricing Sources (as of 2025)

### OpenAI
- **Whisper-1**: $0.006/minute
  - Source: https://openai.com/api/pricing/
- **GPT-4o-mini**: $0.15/$0.60 per 1M tokens
  - Source: https://openai.com/api/pricing/

### AssemblyAI
- **Universal Model**: $0.27/hour ($0.0045/minute)
  - Includes speaker diarization for 95 languages
  - Source: https://www.assemblyai.com/pricing
- **Note**: Old $0.15/hour pricing in code is outdated

### Anthropic
- **Claude Sonnet 4.5**: $3/$15 per 1M tokens
  - Source: https://docs.anthropic.com/en/docs/about-claude/pricing
  - Batch API: 50% discount ($1.50/$7.50)

---

## Recommendations

### 1. **Use 35% markup** across all tiers
- Covers overhead (Supabase, Vercel, Stripe fees)
- Competitive pricing vs. competitors
- Healthy profit margin

### 2. **Track actual costs from API responses**
- OpenAI Whisper: `response.duration` (in seconds)
- OpenAI Chat: `response.usage.prompt_tokens` + `completion_tokens`
- AssemblyAI: `transcript.audio_duration` (in seconds)
- Anthropic: `response.usage.input_tokens` + `output_tokens`

### 3. **Display breakdown to users**
```
Upload cost: $0.49
├─ Transcription: $0.36
├─ AI Processing: $0.003
└─ Provider: OpenAI Whisper
```

### 4. **Optimize costs (future)**
- Use OpenAI Batch API for name extraction (50% savings)
- Use Claude Batch API for content generation (50% savings)
- Potential savings: ~$0.05 per upload

---

## Competitive Analysis

| Service | 1-hour transcription | Features |
|---------|---------------------|----------|
| **Otter.ai** | ~$0.34 (subscription) | Transcription only |
| **Descript** | ~$0.50 (subscription) | Transcription + basic editing |
| **Rev.ai** | $1.50/hour | Human-level accuracy |
| **AudioRepurpose BASIC** | **$0.49** | Transcription + AI speakers + content |
| **AudioRepurpose PREMIUM** | **$0.37** | Best transcription + AI speakers |

**Your pricing is competitive and provides more value!**

---

## Implementation Priority

1. ✅ Capture `duration` from Whisper API responses
2. ✅ Capture `usage` from GPT-4o-mini responses
3. ✅ Calculate real-time costs based on actual usage
4. ✅ Store detailed cost breakdown in database
5. ✅ Display costs to users in dashboard
6. 🔄 Add Claude token tracking (when content generation implemented)
7. 🔄 Implement batch processing for cost optimization
