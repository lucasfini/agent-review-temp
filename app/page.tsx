"use client";

import { useState } from 'react';
import Link from 'next/link';
import {
  Mic, Sparkles, Zap, Users, MessageSquare, ListChecks,
  Upload, ArrowRight, Check, Menu, X as CloseIcon,
  FileText, Clock, Mail, Layers,
} from 'lucide-react';

// ─── Mini waveform for the transcript header ──────────────────────────────────
const MINI_WAVE = [8, 13, 10, 18, 12, 16, 9, 15, 11, 17];

// ─── How it Works ─────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01',
    title: 'Upload Your Audio',
    description: 'Drag & drop your podcast, interview, or recording. MP3, WAV, M4A — all supported.',
    Icon: Upload,
    accent: 'bg-blue-500',
    ring: 'ring-blue-500/20',
  },
  {
    n: '02',
    title: 'AI Identifies & Refines',
    description: 'Our AI automatically detects speakers, extracts their names and roles, and surfaces the key insights from the conversation.',
    Icon: Sparkles,
    accent: 'bg-violet-500',
    ring: 'ring-violet-500/20',
  },
  {
    n: '03',
    title: 'Generate Your Content Suite',
    description: 'Instantly generate 8 content formats — X threads, LinkedIn posts, newsletters, show notes, and more — each optimized for its platform.',
    Icon: Zap,
    accent: 'bg-indigo-500',
    ring: 'ring-indigo-500/20',
  },
];

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    title: 'Smart Speaker ID',
    description: 'Automated name and role detection. Know exactly who said what — Host, Guest, or Expert — without manual tagging.',
    Icon: Users,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    border: 'hover:border-blue-200',
  },
  {
    title: 'Interactive Transcript',
    description: 'Teams-style conversation view with speaker-attributed segments. Searchable, editable, and export-ready.',
    Icon: MessageSquare,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    border: 'hover:border-violet-200',
  },
  {
    title: 'Deep Insight Extraction',
    description: 'Automated entity tracking across people, products, and key concepts. Surface what matters from every recording.',
    Icon: Sparkles,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    border: 'hover:border-indigo-200',
  },
  {
    title: 'Content Multiplexer',
    description: 'Native generation for X, LinkedIn, Instagram, Blog, and Email. Every piece is formatted for its platform from the start.',
    Icon: Zap,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    border: 'hover:border-amber-200',
  },
];

// ─── Pain Points ─────────────────────────────────────────────────────────────
const PAIN_POINTS = [
  {
    title: 'Speaker attribution breaks down',
    problem: 'Speaker identification often fails unless everyone is enrolled, licensed, and within strict meeting limits.',
    fix: 'AudioRepurpose auto-detects speakers, extracts names/roles, and gives you clean review tools.',
  },
  {
    title: 'Real-world audio confuses speaker ID',
    problem: 'Overlapping speech and mic sharing commonly lead to misattribution and generic “Speaker 1” labels.',
    fix: 'We surface speaker clusters and let you correct labels fast, then reuse them across outputs.',
  },
  {
    title: 'Manual cleanup becomes the bottleneck',
    problem: 'Reliable attribution often depends on manual tagging and corrections to train the system.',
    fix: 'AudioRepurpose centralizes speaker rosters + AI correction so you don’t babysit transcripts.',
  },
];

// ─── Output showcase — matches lib/content-types.ts exactly ─────────────────
const OUTPUTS = [
  { badge: '𝕏',   badgeBg: 'bg-slate-900',                                   name: 'X Threads',           desc: 'Thread-format posts, 6–8 per thread',   tier: 'Basic',   count: '4 per recording' },
  { badge: 'in',  badgeBg: 'bg-blue-700',                                     name: 'LinkedIn Posts',      desc: 'Professional posts with discussion prompts', tier: 'Basic', count: '3 per recording' },
  { badge: '◉',   badgeBg: 'bg-gradient-to-br from-purple-500 to-pink-500',   name: 'Instagram Carousel',  desc: 'Multi-slide carousel with hashtags',     tier: 'Basic',   count: '1 per recording' },
  { badge: 'B',   badgeBg: 'bg-emerald-600',                                  name: 'Blog Post',           desc: 'SEO-optimized article, 1,200–1,800 words', tier: 'Pro',  count: '1 per recording' },
  { badge: 'NL',  badgeBg: 'bg-orange-500',                                   name: 'Email Newsletter',    desc: 'Newsletter with CTA, 800–1,200 words',  tier: 'Pro',     count: '1 per recording' },
  { badge: '"',   badgeBg: 'bg-rose-500',                                     name: 'Quote Graphics',      desc: 'Speaker-attributed quotable excerpts',   tier: 'Pro',     count: '2 per recording' },
  { badge: 'SN',  badgeBg: 'bg-violet-600',                                   name: 'Show Notes',          desc: 'Episode summary with timestamps & links', tier: 'Premium', count: '1 per recording' },
];

// ─── Pricing — matches lib/tier-config.ts exactly ────────────────────────────
const TIERS = [
  {
    name: 'Basic',
    price: '$0.37',
    unit: '/hr of audio',
    badge: null,
    description: 'Accurate transcription with speaker separation for every recording.',
    highlight: false,
    borderClass: 'border-gray-200',
    ctaClass: 'bg-gray-900 hover:bg-gray-800 text-white',
    features: [
      'AssemblyAI transcription',
      'Speaker diarization',
      'Word-level timestamps',
      'Generic speaker labels (Speaker 1, 2)',
      'X Threads, LinkedIn & Instagram outputs',
    ],
  },
  {
    name: 'Pro',
    price: '$0.44',
    unit: '/hr of audio',
    badge: 'Most Popular',
    description: 'AI-powered name extraction and episode summaries for professional creators.',
    highlight: true,
    borderClass: 'border-blue-500',
    ctaClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200',
    features: [
      'Everything in Basic',
      'AI speaker name extraction',
      'AI episode summary',
      'Named speaker labels',
      'Blog Post & Email Newsletter outputs',
      'Quote Graphics',
    ],
  },
  {
    name: 'Premium',
    price: '$0.52',
    unit: '/hr of audio',
    badge: 'Best Value',
    description: 'Full AI suite — chapters, takeaways, role classification, and insights.',
    highlight: false,
    borderClass: 'border-violet-400',
    ctaClass: 'bg-violet-600 hover:bg-violet-700 text-white',
    features: [
      'Everything in Pro',
      'Speaker role classification (Host / Guest)',
      'Chapter detection',
      'Key takeaways extraction',
      'Social quote extraction',
      'Show Notes output',
    ],
  },
];

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const links = [
    { label: 'Problems',     href: '#pain-points' },
    { label: 'How it Works', href: '#how-it-works' },
    { label: 'Features',     href: '#features' },
    { label: 'Pricing',      href: '#pricing' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mic className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-[15px]">AudioRepurpose</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {links.map(({ label, href }) => (
              <a key={label} href={href} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Log In
            </Link>
            <Link href="/auth/signup" className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors shadow-sm">
              Get Started
            </Link>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            {open ? <CloseIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-4 space-y-1 bg-white">
          {links.map(({ label, href }) => (
            <a key={label} href={href} onClick={() => setOpen(false)} className="block py-2.5 px-3 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50">
              {label}
            </a>
          ))}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <Link href="/auth/login" onClick={() => setOpen(false)} className="block text-center py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50">
              Log In
            </Link>
            <Link href="/auth/signup" onClick={() => setOpen(false)} className="block text-center py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700">
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Hero Mockup ──────────────────────────────────────────────────────────────
function AppMockup() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-20 bg-blue-500/25 blur-2xl rounded-full pointer-events-none" />

      <div className="relative rounded-t-2xl border border-white/15 bg-slate-800/70 backdrop-blur-xl overflow-hidden shadow-2xl">
        {/* Window chrome */}
        <div className="bg-slate-900/90 border-b border-white/10 px-5 py-3 flex items-center gap-3">
          <div className="flex gap-1.5 flex-shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
          </div>
          <div className="flex-1 min-w-0 mx-4">
            <div className="bg-white/5 rounded-md px-3 py-1 text-[11px] text-white/30 text-center max-w-xs mx-auto truncate">
              app.audiorepurpose.com/project/tech-forward-ep-127
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-[11px] text-white/30">Processing complete</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Transcript panel */}
          <div className="p-6 md:border-r border-b md:border-b-0 border-white/10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="flex items-end gap-[2px] h-4">
                  {MINI_WAVE.map((h, i) => (
                    <div key={i} className="w-[2px] rounded-full bg-blue-400/60" style={{ height: `${h}px` }} />
                  ))}
                </div>
                <span className="text-xs font-semibold text-white/80">Transcript</span>
              </div>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/20 px-2 py-0.5 rounded-full">AI Enhanced</span>
            </div>

            <div className="space-y-4">
              {[
                { init: 'R', name: 'Ryan W.', role: 'Host',  color: 'bg-blue-500',   text: '"Welcome to Tech Forward. Today we explore how AI is reshaping content creation for creators everywhere…"' },
                { init: 'S', name: 'Sarah C.',role: 'Guest', color: 'bg-violet-500', text: '"Thanks Ryan. The shift we\'re seeing is unprecedented — what used to take a full writing team now takes minutes…"' },
                { init: 'R', name: 'Ryan W.', role: 'Host',  color: 'bg-blue-500',   text: '"So for our listeners, what\'s the single biggest change they should make today?"' },
              ].map(({ init, name, role, color, text }, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`flex-shrink-0 h-7 w-7 ${color} rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-0.5`}>
                    {init}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-white/90">{name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{role}</span>
                    </div>
                    <p className="text-[11px] text-white/45 leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-4 text-[10px] text-white/30">
              <span>2 speakers detected</span>
              <span>42 min · 98.3% accuracy</span>
            </div>
          </div>

          {/* Outputs panel */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-semibold text-white/80">Generated Content</span>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full">8 formats ready</span>
            </div>

            <div className="space-y-3">
              {[
                { badge: '𝕏',  bg: 'bg-slate-900', name: 'X Thread',      meta: '6 posts · 280 chars each', preview: '"AI is changing content creation forever. Here\'s what 10 years of podcasting taught me about staying relevant…"' },
                { badge: 'in', bg: 'bg-blue-700',   name: 'LinkedIn Post', meta: '1,420 characters',          preview: '"Had an incredible conversation with Sarah Chen on Tech Forward. 3 insights that will change how you approach your content strategy…"' },
              ].map(({ badge, bg, name, meta, preview }) => (
                <div key={name} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 ${bg} rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0`}>{badge}</div>
                      <div>
                        <span className="text-xs font-semibold text-white/85">{name}</span>
                        <div className="text-[9px] text-white/35">{meta}</div>
                      </div>
                    </div>
                    <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full border border-emerald-400/20 flex-shrink-0">Ready</span>
                  </div>
                  <p className="text-[11px] text-white/45 leading-relaxed line-clamp-2">{preview}</p>
                </div>
              ))}

              <div className="flex items-center gap-2.5 px-1 pt-1">
                <div className="flex -space-x-1.5">
                  {['bg-emerald-600', 'bg-orange-500', 'bg-violet-600', 'bg-rose-500'].map((c, i) => (
                    <div key={i} className={`w-5 h-5 ${c} rounded-full border-2 border-slate-800`} />
                  ))}
                </div>
                <span className="text-[11px] text-white/35">all 8 formats</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 pt-20 pb-0">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-400/25 text-blue-300 px-4 py-1.5 rounded-full text-sm font-medium mb-8 motion-safe:animate-fade-up">
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
          AI-Powered Speaker Intelligence
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-6 tracking-tight motion-safe:animate-fade-up-200">
          One Recording.{' '}
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            A Month of Content.
          </span>
          <br />Instantly.
        </h1>

        <p className="text-base md:text-lg text-blue-200/70 max-w-2xl mx-auto mb-10 leading-relaxed motion-safe:animate-fade-up-400">
          Transform your podcasts and interviews into LinkedIn posts, X threads, newsletters,
          and show notes with AI speaker intelligence — plus summaries, chapters, key takeaways, and quotes.
          No editing. No manual work.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 motion-safe:animate-fade-up-600">
          <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-900/50">
            Start Repurposing Free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/auth/demo" className="inline-flex items-center gap-2 text-white/80 hover:text-white font-medium px-6 py-3.5 rounded-xl border border-white/25 hover:border-white/50 hover:bg-white/5 transition-colors">
            Try Demo →
          </Link>
        </div>

        <div className="motion-safe:animate-fade-up-600 motion-safe:animate-float-slow">
          <AppMockup />
        </div>
      </div>
    </section>
  );
}

// ─── Pain Points ─────────────────────────────────────────────────────────────
function PainPoints() {
  return (
    <section id="pain-points" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Why creators choose us</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">
            The common transcript problems we fix
          </h2>
          <p className="text-gray-500 mt-4 max-w-2xl mx-auto text-base">
            Most tools work in perfect conditions. Real meetings aren’t perfect. AudioRepurpose is built for the messy reality.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {PAIN_POINTS.map(({ title, problem, fix }, idx) => (
            <div
              key={title}
              className={`rounded-2xl border border-gray-100 bg-gray-50 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 motion-safe:animate-fade-up${
                idx === 1 ? '-200' : idx === 2 ? '-400' : ''
              }`}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{problem}</p>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-900 font-medium">Fix:</p>
                <p className="text-sm text-gray-600 mt-1">{fix}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">How it Works</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">From recording to content in minutes</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base">
            Three steps. Zero manual work. A full month of content ready to publish.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px bg-gradient-to-r from-blue-200 via-violet-200 to-indigo-200" />

          {STEPS.map(({ n, title, description, Icon, accent, ring }, idx) => (
            <div
              key={n}
              className={`relative flex flex-col items-center text-center group motion-safe:animate-fade-up${
                idx === 1 ? '-200' : idx === 2 ? '-400' : ''
              }`}
            >
              <div className={`relative z-10 h-16 w-16 ${accent} rounded-2xl flex items-center justify-center mb-6 shadow-lg ring-4 ${ring} transition-transform duration-300 group-hover:-translate-y-1`}>
                <Icon className="h-7 w-7 text-white" />
                <span className="absolute -top-2 -right-2 h-5 w-5 bg-white rounded-full text-[10px] font-bold text-gray-700 flex items-center justify-center shadow-sm border border-gray-100">
                  {n[1]}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Core Features</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">Everything you need to repurpose at scale</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base">
            Built for serious creators who want maximum output from every recording.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ title, description, Icon, iconColor, iconBg, border }, idx) => (
            <div
              key={title}
              className={`rounded-2xl border border-gray-100 ${border} bg-white p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-default motion-safe:animate-fade-up${
                idx === 1 ? '-200' : idx === 2 ? '-400' : idx === 3 ? '-600' : ''
              }`}
            >
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} mb-4`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Output Showcase ──────────────────────────────────────────────────────────
function OutputShowcase() {
  const tierColor = (tier: string) =>
    tier === 'Basic'   ? 'bg-gray-100 text-gray-600' :
    tier === 'Pro'     ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                         'bg-violet-50 text-violet-600 border border-violet-100';

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Output Showcase</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">Every format your audience expects</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base">
            From X threads to SEO blogs — every piece is natively formatted and ready to publish.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {OUTPUTS.map(({ badge, badgeBg, name, desc, tier, count }, idx) => (
            <div
              key={name}
              className={`bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group hover:scale-[1.01] motion-safe:animate-fade-up${
                idx % 4 === 1 ? '-200' : idx % 4 === 2 ? '-400' : idx % 4 === 3 ? '-600' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 ${badgeBg} rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}>
                  {badge}
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tierColor(tier)}`}>
                  {tier}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{name}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{desc}</p>
              <div className="text-xs font-medium text-gray-400">{count}</div>
            </div>
          ))}

          {/* Total callout card */}
          <div className="bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl p-5 flex flex-col justify-center motion-safe:animate-fade-up-400 hover:scale-[1.01] transition-transform">
            <div className="text-4xl font-bold text-white mb-1">8</div>
            <div className="text-blue-100 font-semibold text-sm mb-2">Content formats</div>
            <div className="text-blue-200/70 text-xs leading-relaxed">
              Generated from a single recording, formatted for every platform.
            </div>
            <Link href="/auth/signup" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white hover:text-blue-100 transition-colors">
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Pricing</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">Pay only for what you process</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base">
            Credit-based pricing. Choose the processing level that fits your workflow — upgrade anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TIERS.map(({ name, price, unit, badge, description, highlight, borderClass, ctaClass, features }, idx) => (
            <div
              key={name}
              className={`relative rounded-2xl border-2 ${borderClass} p-8 flex flex-col ${highlight ? 'shadow-xl shadow-blue-100' : ''} motion-safe:animate-fade-up${
                idx === 1 ? '-200' : idx === 2 ? '-400' : ''
              }`}
            >
              {badge && (
                <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold motion-safe:animate-breathe ${highlight ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white'}`}>
                  {badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">{price}</span>
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
                <p className="text-sm text-gray-500 mt-3 leading-relaxed">{description}</p>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/signup"
                className={`block text-center py-3 rounded-xl text-sm font-semibold transition-colors ${ctaClass}`}
              >
                Get started with {name}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          All prices include a 35% service markup. No subscriptions — buy credits and process on demand.
        </p>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 py-24">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-400/30 mb-6 motion-safe:animate-fade-up">
          <Mic className="h-6 w-6 text-blue-300" />
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight motion-safe:animate-fade-up-200">
          Start Repurposing Today
        </h2>
        <p className="text-blue-200/70 text-lg mb-10 leading-relaxed motion-safe:animate-fade-up-400">
          "Transform one recording into a month of content. Instantly."
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 motion-safe:animate-fade-up-600">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-white text-blue-900 hover:bg-blue-50 font-bold px-8 py-4 rounded-xl transition-colors shadow-xl text-base"
          >
            Get Started Free
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white font-medium px-6 py-4 rounded-xl border border-white/15 hover:border-white/30 transition-colors text-sm"
          >
            Already have an account? Log in
          </Link>
        </div>

        <div className="mt-12 flex items-center justify-center gap-10 text-sm">
          {[['8', 'Content formats'], ['5 min', 'Per episode'], ['No subscription', 'Pay as you go']].map(([stat, label], idx) => (
            <div key={stat} className={`text-center motion-safe:animate-fade-in${idx === 1 ? '-200' : idx === 2 ? '-400' : ''}`}>
              <div className="font-bold text-white text-base">{stat}</div>
              <div className="text-blue-300/60 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-14 border-t border-gray-900 motion-safe:animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mic className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold text-gray-200">AudioRepurpose</span>
            </div>
            <p className="mt-4 text-sm text-gray-500 max-w-md">
              Turn one recording into a full content suite with accurate speakers, clear summaries,
              and platform-ready outputs.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Product</p>
            <div className="mt-4 space-y-2 text-sm">
              <a href="#pain-points" className="block hover:text-gray-200 transition-colors">Problems we fix</a>
              <a href="#features" className="block hover:text-gray-200 transition-colors">Features</a>
              <a href="#how-it-works" className="block hover:text-gray-200 transition-colors">How it works</a>
              <a href="#pricing" className="block hover:text-gray-200 transition-colors">Pricing</a>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Account</p>
            <div className="mt-4 space-y-2 text-sm">
              <Link href="/auth/login" className="block hover:text-gray-200 transition-colors">Log In</Link>
              <Link href="/auth/signup" className="block hover:text-gray-200 transition-colors">Get Started</Link>
              <Link href="/auth/signup" className="block hover:text-gray-200 transition-colors">Start Free</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <p>&copy; {new Date().getFullYear()} AudioRepurpose. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</a>
            <a href="#features" className="hover:text-gray-300 transition-colors">Features</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Navbar open={mobileOpen} setOpen={setMobileOpen} />
      <main>
        <Hero />
        <PainPoints />
        <HowItWorks />
        <Features />
        <OutputShowcase />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
