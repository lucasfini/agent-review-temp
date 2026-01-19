# AudioRepurpose Project Context

## Overview
AI-powered content repurposing platform that takes podcasts/audio and automatically generates 15+ pieces of optimized social content.

## Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Storage**: Supabase Storage (transitioning from Cloudflare R2)
- **AI Services**:
  - AssemblyAI (transcription + speaker diarization)
  - Sortformer (advanced speaker diarization - optional)
  - Anthropic Claude-3.5 (copywriting)
  - DALL-E 3 (graphics - later phase)
- **Payments**: Stripe
- **Deployment**: Vercel (planned)

## Current Setup Status
✅ GitHub repo created: https://github.com/lucasfini/audiorepurpose
✅ Next.js project initialized with TypeScript + Tailwind
✅ Supabase account created
✅ All API keys configured in .env.local
✅ Dependencies installed (@supabase/supabase-js, @anthropic-ai/sdk, stripe)
✅ **AssemblyAI Integration Complete** - Transcription + Speaker Diarization
✅ **Sortformer Diarization** - Optional advanced speaker detection
✅ **3-Tier Processing System** - Basic, Pro, Premium  

## Environment Variables Available
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ASSEMBLYAI_API_KEY
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

## Current Implementation: AssemblyAI-Powered Processing

### Architecture
The system uses **AssemblyAI** as the primary transcription and speaker diarization service:

```
Audio File → [AssemblyAI: Transcription + Diarization] → Speaker Grouping → AI Enhancement → Final Result
```

### Pipeline Flow
1. **Upload**: Audio files stored in memory or Supabase Storage
2. **AssemblyAI Processing**: Simultaneous transcription + speaker diarization
3. **Speaker Grouping**: Segments grouped by speaker ID
4. **AI Enhancement** (tier-based):
   - **Basic**: Numbered speakers (Speaker 1, Speaker 2)
   - **Pro**: AI name extraction + summary
   - **Premium**: + Role classification + chapters + takeaways + quotes
5. **Caching**: Base transcription cached for cost efficiency

### Key Files
- `app/api/transcribe/route.ts` - Main transcription endpoint with tier-based processing
- `lib/assemblyai-integration.ts` - AssemblyAI API integration
- `scripts/sortformer_diarization.py` - Optional Sortformer model for advanced diarization
- `lib/name-extraction.ts` - AI speaker name extraction
- `lib/speaker-role-classifier.ts` - Premium tier role classification
- `lib/transcription-cache.ts` - Caching system for cost optimization

### Features
- **Accurate speaker detection**: 2-4 speakers for typical podcasts
- **Tiered processing**: Basic, Pro, Premium with progressive AI features
- **Cost optimization**: Base transcription cached and reused
- **Credit system**: Usage tracking with pre-flight balance checks
- **Speaker roster matching**: Pre-defined speaker names can be matched automatically

## Current Architecture

### Audio Processing Pipeline
1. **Upload**: Audio files stored in memory (or Supabase Storage for large files)
2. **Transcription**: AssemblyAI processes audio for transcription + speaker diarization
3. **Speaker Grouping**: Segments organized by speaker ID
4. **Enhancement**: Tier-based AI processing (names, roles, summary, chapters, etc.)
5. **Caching**: Base transcription cached for cost efficiency
6. **Storage**: Results saved to Supabase database

### File Structure
```
/app/api/
  transcribe/route.ts          # Main transcription endpoint (AssemblyAI + AI enhancement)
  upload/route.ts              # File upload handling
  generate-content/route.ts    # Content generation
/lib/
  assemblyai-integration.ts    # AssemblyAI API integration
  transcription-cache.ts       # Caching system for cost optimization
  name-extraction.ts           # AI speaker name extraction
  speaker-role-classifier.ts   # Speaker role classification (Premium)
  tier-config.ts               # Tier-based feature configuration
  billing/                     # Credit tracking and usage
  supabase/                    # Database utilities
/scripts/
  sortformer_diarization.py    # Optional advanced diarization
/components/                   # React components
```

### Database Schema
```sql
projects table:
- id, title, status, created_at
- transcription_text (full transcript)
- transcription_segments (JSON - AssemblyAI segments)
- speaker_data (JSON - speaker info + segments)
- ai_summary, chapters, key_takeaways, social_quotes (tier-based)
- performance_level (basic/pro/premium)
- cost tracking and metadata
```

## Current Status
**Major Milestone**: ✅ **Production-Ready AssemblyAI Integration**

The system features:
- **AssemblyAI integration**: Professional transcription + speaker diarization
- **3-tier processing system**: Basic, Pro, Premium with progressive AI features
- **Transcription caching**: Cost optimization through smart caching
- **Credit system**: Pre-flight balance checks and usage tracking
- **Speaker roster matching**: AI-powered matching of pre-defined speakers
- **Full AI enhancement pipeline**: Names, roles, summaries, chapters, takeaways, quotes

## Architecture Decisions Made

### AssemblyAI as Primary Service
- **All-in-one solution**: Single API for transcription + diarization
- **Production quality**: Professional-grade accuracy and reliability
- **Cost effective**: ~$0.37/hour with included speaker detection
- **Minimal complexity**: No local GPU requirements or Python dependencies

### Tiered Processing System
- **Basic**: AssemblyAI transcription + numbered speakers ($0.37/hr base)
- **Pro**: + AI name extraction + summary (~$0.40-0.45/hr)
- **Premium**: + Roles + chapters + takeaways + quotes (~$0.50-0.60/hr)

### Caching Strategy
- **Fingerprint-based**: Audio content hashed for deduplication
- **Cache hits**: Reuse base transcription, only pay for AI enhancement
- **Cost savings**: ~75% reduction on repeated processing of same audio

### Technical Choices
- **TypeScript-first**: Minimal Python usage (Sortformer only, optional)
- **Memory storage**: In-memory file handling for fast processing
- **Supabase storage**: Fallback for large files or persistence needs
- **Credit system**: Pre-flight balance checks prevent failed jobs

## Immediate Next Steps
1. **User testing**: Get feedback on speaker detection and AI-generated content
2. **Cost monitoring**: Track actual costs vs. estimates across tiers
3. **Cache optimization**: Monitor cache hit rates and savings
4. **Content quality**: Refine AI prompts based on user feedback

## Business Impact
- **Tiered pricing**: Multiple price points to maximize conversions
- **Cost efficiency**: Caching reduces processing costs by ~75%
- **User experience**: Professional speaker attribution and content quality
- **Competitive advantage**: Fast, accurate processing with AI enhancement

## Code Style Preferences
- TypeScript strict mode
- Functional React components with hooks
- Tailwind CSS for all styling (no CSS modules)
- shadcn/ui components where applicable
- Clear comments for complex logic
- Error handling for all API calls
- Comprehensive logging for AI processing pipelines

## Development Notes
- **Memory management**: Audio files processed in chunks when needed
- **Cleanup**: Temporary files automatically removed after processing
- **Timeouts**: 4-minute limits for individual processing steps
- **Background processing**: Speaker analysis runs asynchronously after transcription
- **Progress tracking**: Detailed logging for debugging production issues

## Performance Targets
- MVP delivery: 4-6 weeks
- Processing time: <5 minutes per 1-hour podcast (AssemblyAI)
- **Speaker detection**: Included in transcription time
- Target: 500 paid users by Month 6
- Unit economics: 90-93% gross margin, 18:1 LTV:CAC

## Key Features (MVP - Month 1)
- Audio file upload (mp3, wav)
- **AssemblyAI transcription + speaker diarization**
- **3-tier processing system** (Basic, Pro, Premium)
- **Speaker roster matching** (optional pre-defined speakers)
- **Transcription caching** for cost optimization
- AI-generated outputs (tier-based):
  - AI summary (Pro+)
  - Speaker name extraction (Pro+)
  - Speaker role classification (Premium)
  - Chapter detection (Premium)
  - Key takeaways (Premium)
  - Social media quotes (Premium)
  - Inline insights and entity detection

## Priority Order
1. Speed to market (ship fast, iterate)
2. User experience (simple, intuitive)
3. **Audio processing quality** (AssemblyAI + AI enhancement)
4. Cost efficiency (caching + tiered pricing)
5. Code quality (maintainable, not perfect)
6. Scalability (plan for it, don't over-engineer)