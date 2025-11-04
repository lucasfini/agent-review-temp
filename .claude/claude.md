# AudioRepurpose Project Context

## Overview
AI-powered content repurposing platform that takes podcasts/audio and automatically generates 15+ pieces of optimized social content.

## Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Storage**: Cloudflare R2 (audio files, outputs)
- **AI Services**: 
  - OpenAI Whisper (transcription)
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

## Environment Variables Available
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

## Current Status
**Week 1, Day 1**: Just finished prerequisites setup. Ready to start building.

## Immediate Next Steps (Week 1 MVP)
1. **Landing Page** (TODAY)
   - Hero section with value proposition
   - Features showcase
   - Pricing preview (Creator $39, Professional $79, Agency $249)
   - Waitlist email signup (save to Supabase)
   - Responsive mobile-first design

2. **Database Schema** (Day 2)
   - Users table (extends Supabase auth)
   - Projects table (audio uploads, status tracking)
   - Outputs table (generated content)
   - Waitlist table

3. **Authentication** (Day 3-4)
   - Login/signup pages
   - Supabase Auth integration
   - Protected dashboard routes

4. **File Upload** (Day 5-6)
   - Audio file upload to Supabase Storage
   - File validation (format, size)
   - Progress indicator

5. **Dashboard** (Day 7)
   - Navigation layout
   - Project list view
   - Empty states

## Design Decisions
- **Audio-first approach**: Start with podcast repurposing to minimize storage costs (50-100MB vs 15GB for video)
- **Process-and-delete model**: Delete original files after 48 hours to save 97% on storage
- **Mobile-responsive web app**: No native apps initially
- **Three pricing tiers**: Creator ($39), Professional ($79), Agency ($249)

## Key Features (MVP - Month 1)
- Audio file upload (mp3, wav)
- Whisper transcription with timestamps
- AI-generated outputs:
  - 5-8 audiogram clips (social media)
  - Blog post (3000+ words, SEO optimized)
  - Social media posts (Twitter, LinkedIn, Instagram captions)
  - Quote graphics
  - Email newsletter
  - Show notes with chapters

## Business Model
- B2C SaaS subscription
- Target: Podcasters and content creators
- Pricing based on processing hours per month
- Market: $200M+ opportunity (3M+ active podcasters)

## Performance Targets
- MVP delivery: 4-6 weeks
- Processing time: <30 minutes per 1-hour podcast
- Target: 500 paid users by Month 6
- Unit economics: 93% gross margin, 18:1 LTV:CAC

## Code Style Preferences
- TypeScript strict mode
- Functional React components with hooks
- Tailwind CSS for all styling (no CSS modules)
- shadcn/ui components where applicable
- Clear comments for complex logic
- Error handling for all API calls

## Priority Order
1. Speed to market (ship fast, iterate)
2. User experience (simple, intuitive)
3. Code quality (maintainable, not perfect)
4. Scalability (plan for it, don't over-engineer)