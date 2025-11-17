# AudioRepurpose

AI-powered content repurposing platform that transforms podcasts and audio into 15+ pieces of optimized social content.

## Overview

AudioRepurpose uses advanced AI to analyze podcast transcripts and automatically generate:
- Educational insights (concepts & people explained)
- Blog posts (2500-3000 words, SEO-optimized)
- Social media content (Twitter threads, LinkedIn posts, Instagram captions)
- Email newsletters
- Show notes with timestamps
- Quote graphics
- Narrative coverage analysis

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **AI Services**:
  - AssemblyAI (transcription)
  - PyAnnote (speaker diarization)
  - Anthropic Claude (content generation, insights)
  - OpenAI GPT-4 (name extraction, speaker classification)
  - Perplexity Sonar Pro (research links)
- **Payments**: Stripe
- **Deployment**: Vercel

## Project Structure

```
audiorepurpose/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main app pages
│   └── page.tsx           # Landing page
├── components/            # React components
│   ├── dashboard/         # Dashboard-specific components
│   └── *.tsx             # Shared components
├── lib/                   # Business logic & utilities
│   ├── ai-providers/      # AI service integrations
│   ├── auth/              # Authentication context
│   ├── content-generators/ # Content generation modules
│   ├── models/            # Model configuration
│   ├── prompts/           # AI prompt management
│   └── supabase/          # Supabase clients
├── config/                # Configuration files
│   └── prompts.json       # Centralized AI prompts
├── database/              # Database schemas & migrations
│   ├── schemas/           # Table definitions
│   └── migrations/        # Schema migrations
├── docs/                  # Documentation
│   ├── setup/             # Setup guides
│   ├── guides/            # Feature guides
│   └── reference/         # Technical reference
├── tests/                 # Test files
│   ├── e2e/              # End-to-end tests
│   └── fixtures/          # Test data
├── logs/                  # Runtime logs (gitignored)
└── scripts/               # Build & utility scripts
    └── pyannote_env/      # Python environment for speaker diarization
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm
- Supabase account
- API keys for:
  - Anthropic Claude
  - OpenAI
  - AssemblyAI
  - Perplexity (optional)
  - Hugging Face (for PyAnnote)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/lucasfini/audiorepurpose.git
   cd audiorepurpose
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Configure the following in `.env.local`:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # AI Services
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   ASSEMBLYAI_API_KEY=your_assemblyai_key
   PERPLEXITY_API_KEY=your_perplexity_key
   HUGGING_FACE_ACCESS_TOKEN=your_hf_token

   # Stripe (optional for MVP)
   STRIPE_SECRET_KEY=your_stripe_key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_publishable_key
   ```

4. **Set up database**
   ```bash
   # Run schema files in Supabase SQL editor
   # Start with database/schemas/*.sql
   ```

5. **Set up PyAnnote (for speaker diarization)**
   ```bash
   cd scripts
   source pyannote_env/bin/activate
   ```
   See [docs/setup/PYANNOTE_SETUP.md](docs/setup/PYANNOTE_SETUP.md) for details.

6. **Run development server**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Key Features

### 🎯 Automated Transcription & Diarization
- AssemblyAI for accurate speech-to-text
- PyAnnote for speaker identification
- Automatic speaker name extraction

### 🧠 Educational Insights
- AI-powered extraction of concepts and people mentioned
- Automatic definitions (simple + detailed)
- Research links from Perplexity
- Tier-based access control

### ✍️ Content Generation
- 7+ content types (blog, social, email, show notes)
- Configurable via JSON prompts
- Template variable substitution
- Cost tracking per generation

### 📊 Narrative Coverage Analysis
- Topic detection and sentiment
- Call-to-action tracking
- Coverage opportunities
- Manual trigger to control costs

## Documentation

- **Setup Guides**: [docs/setup/](docs/setup/)
- **Feature Guides**: [docs/guides/](docs/guides/)
- **Technical Reference**: [docs/reference/](docs/reference/)
- **Database Schema**: [database/README.md](database/README.md)

## Development

### Running Tests
```bash
npm test
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

## Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/lucasfini/audiorepurpose)

Or manually:
```bash
vercel --prod
```

## Cost Optimization

- Insights: ~$0.02 per podcast (Claude Haiku + Perplexity)
- Content generation: ~$0.015-$0.08 per piece (Claude Sonnet)
- Narrative coverage: ~$0.02-$0.04 per run (manual only)
- Transcription: ~$0.25 per hour (AssemblyAI)

See [docs/reference/COST_ANALYSIS.md](docs/reference/COST_ANALYSIS.md) for details.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: [Report a bug](https://github.com/lucasfini/audiorepurpose/issues)
- Email: support@audiorepurpose.com

---

**Built with** Next.js • Supabase • Claude • TypeScript
