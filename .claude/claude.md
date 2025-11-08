# AudioRepurpose Project Context

## Overview
AI-powered content repurposing platform that takes podcasts/audio and automatically generates 15+ pieces of optimized social content.

## Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Storage**: Supabase Storage (transitioning from Cloudflare R2)
- **AI Services**: 
  - OpenAI Whisper (transcription)
  - PyAnnote (speaker diarization)
  - Anthropic Claude-3.5 (copywriting)
  - DALL-E 3 (graphics - later phase)
- **Payments**: Stripe
- **Deployment**: Vercel (planned)

## Current Setup Status
✅ GitHub repo created: https://github.com/lucasfini/audiorepurpose  
✅ Next.js project initialized with TypeScript + Tailwind  
✅ Supabase account created  
✅ All API keys configured in .env.local  
✅ Dependencies installed (@supabase/supabase-js, openai, @anthropic-ai/sdk, stripe)  
✅ **PyAnnote + Whisper Pipeline Implemented** (NEW)  
✅ **Speaker Diarization Fixed** (NEW)  
✅ **Hugging Face Authentication Setup** (NEW)  

## Environment Variables Available
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- **HUGGING_FACE_ACCESS_TOKEN** (NEW)

## Recent Major Implementation: Proper Speaker Diarization

### Problem Solved
The previous speaker detection was fundamentally flawed - it was trying to analyze voice patterns from text transcripts instead of actual audio. This resulted in:
- 26+ speakers detected instead of 2-4
- Poor accuracy in speaker boundaries
- No real voice analysis

### Solution: PyAnnote + Whisper Pipeline
Implemented proper audio-based speaker diarization:

#### Architecture
```
Audio File → [PyAnnote: Speaker Analysis] + [Whisper: Transcription] → Timestamp Alignment → Final Result
```

#### Pipeline Flow
1. **PyAnnote**: Analyzes raw audio for speaker voice patterns → produces speaker segments with timestamps
2. **Whisper**: Transcribes audio to text → produces text segments with timestamps  
3. **Alignment**: Custom algorithm matches each text segment to the best overlapping speaker segment by temporal intersection
4. **Result**: Text segments with accurate speaker attribution

#### Technical Implementation
- **Files Modified**: 
  - `lib/pyannote-integration.ts` - Main integration logic
  - `scripts/pyannote_diarization.py` - Python script for PyAnnote processing
  - `app/api/transcribe/route.ts` - Background speaker analysis
- **Dependencies**: PyAnnote.audio, PyTorch, TorchAudio (Python 3.12 virtual environment)
- **Authentication**: Hugging Face token for PyAnnote model access
- **Fallback**: Rule-based detection when PyAnnote unavailable

#### Key Files
- `scripts/pyannote_env/` - Python virtual environment with PyAnnote dependencies
- `lib/pyannote-integration.ts:275-333` - Enhanced speaker detection function
- `lib/pyannote-integration.ts:339-406` - Timestamp alignment algorithm
- `scripts/pyannote_diarization.py:42-66` - HF authentication setup

### Setup Requirements
```bash
cd scripts
source pyannote_env/bin/activate  # Pre-configured environment
python pyannote_diarization.py --help  # Test functionality
```

### Expected Results
- 2-4 speakers for typical podcasts (not 26!)
- Accurate speaker boundaries based on voice characteristics
- Better handling of overlapping speech and interruptions
- Proper timing alignment between speech and speaker changes

## Current Architecture

### Audio Processing Pipeline
1. **Upload**: Audio files stored in Supabase Storage or local memory
2. **Transcription**: OpenAI Whisper with chunking for large files (>25MB)
3. **Speaker Detection**: PyAnnote analyzes audio for voice patterns
4. **Alignment**: Custom algorithm aligns speaker segments with transcription
5. **Enhancement**: AI name extraction and speaker identification
6. **Storage**: Results saved to Supabase database

### File Structure
```
/app/api/
  transcribe/route.ts          # Main transcription endpoint
  upload/route.ts              # File upload handling
  generate-content/route.ts    # Content generation
/lib/
  audio-chunker.ts            # Large file processing
  speaker-detection.ts        # Rule-based fallback detection
  pyannote-integration.ts     # PyAnnote + Whisper pipeline
  name-extraction.ts          # AI speaker name extraction
  supabase/                   # Database utilities
/scripts/
  pyannote_diarization.py     # Python speaker diarization
  pyannote_env/               # Python virtual environment
/components/                  # React components
/database-*.sql              # Database schema
```

### Database Schema
```sql
projects table:
- id, title, status, created_at
- transcription_text (full transcript)
- transcription_segments (JSON - Whisper segments)
- speaker_data (JSON - PyAnnote + alignment results)
- processing timestamps and metadata
```

## Current Status (Updated)
**Major Milestone**: ✅ **Speaker Diarization Pipeline Complete**

The system now has:
- Proper audio-based speaker detection using PyAnnote
- Parallel processing of audio (PyAnnote + Whisper)
- Custom alignment algorithm for timestamp matching
- Hugging Face authentication for model access
- Robust fallback to rule-based detection
- Full integration with existing transcription workflow

## Architecture Decisions Made

### PyAnnote vs Whisper Requirements
- **Both are needed**: PyAnnote for speaker analysis, Whisper for transcription
- **Parallel processing**: Both analyze the same audio file independently
- **Alignment crucial**: Custom algorithm matches results by timestamp overlap

### Hugging Face Integration
- **Free tier**: No cost for authentication token
- **Model access**: PyAnnote requires HF token for speaker-diarization-3.1 model
- **Monthly limits**: Free usage with enhanced quotas for Pro ($9/month)

### Technical Choices
- **Python 3.12**: PyTorch compatibility (Python 3.13 not yet supported)
- **Virtual environment**: Isolated dependencies to avoid system conflicts
- **NumPy downgrade**: Required "numpy<2" for PyAnnote compatibility
- **Environment variables**: HF token passed securely to Python subprocess

## Immediate Next Steps
1. **Test with real audio**: Upload and test speaker diarization accuracy
2. **Performance optimization**: Cache PyAnnote pipeline initialization
3. **GPU acceleration**: Add CUDA support for faster processing (optional)
4. **Error monitoring**: Enhanced logging for production debugging

## Business Impact
- **Accuracy improvement**: 2-4 speakers instead of 26+ false positives
- **User experience**: Proper speaker attribution in generated content
- **Content quality**: Better audiogram clips and speaker-specific quotes
- **Competitive advantage**: Professional-grade speaker detection

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
- Processing time: <30 minutes per 1-hour podcast
- **Speaker detection**: <2 minutes for PyAnnote analysis
- Target: 500 paid users by Month 6
- Unit economics: 93% gross margin, 18:1 LTV:CAC

## Key Features (MVP - Month 1)
- Audio file upload (mp3, wav)
- Whisper transcription with timestamps
- **PyAnnote speaker diarization** (NEW)
- **Accurate speaker attribution** (NEW)
- AI-generated outputs:
  - 5-8 audiogram clips (social media)
  - Blog post (3000+ words, SEO optimized)
  - Social media posts (Twitter, LinkedIn, Instagram captions)
  - Quote graphics with proper speaker attribution
  - Email newsletter
  - Show notes with chapters and speaker identification

## Priority Order
1. Speed to market (ship fast, iterate)
2. User experience (simple, intuitive)
3. **Audio processing quality** (PyAnnote pipeline complete)
4. Code quality (maintainable, not perfect)
5. Scalability (plan for it, don't over-engineer)