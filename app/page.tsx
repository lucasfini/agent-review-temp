"use client";

import { useEffect, useRef, useState, type SVGProps } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion';
import {
  Mic, Sparkles, Zap, Users, ArrowRight, Check, BarChart3, Target, Lightbulb,
  Menu, X as CloseIcon, Clock, Play, Upload, Sun, Moon, Facebook, Instagram,
  Youtube, Mail, FileText, Quote, Newspaper,
} from 'lucide-react';
import BrandLogo from '@/components/site/BrandLogo';

const XIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M4 4h4l4 5 4-5h4l-6 7 6 9h-4l-4-5-4 5H4l6-9z" />
  </svg>
);

const LinkedinIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const TikTokIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.35h-3.2v12.4a2.89 2.89 0 1 1-2-2.75V8.72a6.13 6.13 0 1 0 5.2 6.02V8.45a8.06 8.06 0 0 0 4.77 1.57V6.69Z" />
  </svg>
);

const OUTPUT_ICONS = {
  x: XIcon,
  linkedin: LinkedinIcon,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: TikTokIcon,
  podcast: Mic,
  showNotes: FileText,
  blog: Newspaper,
  newsletter: Mail,
  quote: Quote,
} as const;

type OutputIconKey = keyof typeof OUTPUT_ICONS;

// ─── Constants ────────────────────────────────────────────────────────────────
const SOCIAL_TAGS = [
  'Podcasts',
  'Interviews',
  'Webinars',
  'Panels',
  'Founder Updates',
  'Customer Calls',
  'Creator Episodes',
  'Team Briefings',
];

const SECTION_VIEWPORT = { once: true, amount: 0.2 };
const sectionContainer = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: 'easeOut' as const,
      staggerChildren: 0.12,
    },
  },
};
const sectionItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

type OutputGroupItem = {
  icon: OutputIconKey;
  badgeBg: string;
  name: string;
  desc: string;
};

type FeaturedOutputCard = {
  eyebrow: string;
  platform: string;
  accent: string;
  surface: string;
  icon: OutputIconKey;
  badgeBg: string;
  preview: Array<{ label: string; text: string }>;
};

// ─── How It Works steps ───────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01',
    title: 'Upload Your Audio',
    description: 'Drag & drop your podcast, interview, or recording. MP3, WAV, M4A — all supported.',
    accent: 'bg-blue-500',
    ring: 'ring-blue-500/20',
    Icon: Upload,
  },
  {
    n: '02',
    title: 'Choose Processing Options',
    description: 'Start with transcription, then check named speakers, summary, insights, chapters, takeaways, or quotes only if you want them.',
    accent: 'bg-violet-500',
    ring: 'ring-violet-500/20',
    Icon: Sparkles,
  },
  {
    n: '03',
    title: 'Generate 11 Content Types',
    description: 'Create X threads, LinkedIn posts, YouTube descriptions, TikTok scripts, show notes, newsletters, blog posts, and more from one upload.',
    accent: 'bg-indigo-500',
    ring: 'ring-indigo-500/20',
    Icon: Zap,
  },
];

// ─── Output formats ───────────────────────────────────────────────────────────
const OUTPUT_GROUPS: Array<{ title: string; description: string; accent: string; items: OutputGroupItem[] }> = [
  {
    title: 'Social Distribution',
    description: 'Posts built to grab attention quickly and drive replies, saves, and shares.',
    accent: 'from-slate-900 via-slate-800 to-slate-900',
    items: [
      { icon: 'x', badgeBg: 'bg-slate-900', name: 'X Threads', desc: '6\u20138 posts per thread' },
      { icon: 'linkedin', badgeBg: 'bg-blue-700', name: 'LinkedIn Posts', desc: 'Professional posts with discussion prompts' },
      { icon: 'facebook', badgeBg: 'bg-blue-600', name: 'Facebook Post', desc: 'Conversational post with question-led engagement' },
      { icon: 'instagram', badgeBg: 'bg-gradient-to-br from-fuchsia-500 to-rose-500', name: 'Instagram Carousel', desc: 'Multi-slide carousel with hashtags' },
    ],
  },
  {
    title: 'Video + Episode Packaging',
    description: 'Assets that help an episode travel across video feeds and listening platforms.',
    accent: 'from-blue-950 via-indigo-950 to-slate-900',
    items: [
      { icon: 'youtube', badgeBg: 'bg-red-600', name: 'YouTube Description', desc: 'SEO-friendly summary with timestamps and hashtags' },
      { icon: 'tiktok', badgeBg: 'bg-cyan-600', name: 'TikTok / Reels Script', desc: '45–60 second short-form hook and CTA' },
      { icon: 'podcast', badgeBg: 'bg-amber-600', name: 'Podcast Episode Description', desc: 'Store-ready episode summary for podcast apps' },
      { icon: 'showNotes', badgeBg: 'bg-violet-600', name: 'Show Notes', desc: 'Episode summary with timestamps' },
    ],
  },
  {
    title: 'Long-Form + Pull Quotes',
    description: 'Deeper assets for search, email, and republishing once an episode has landed.',
    accent: 'from-emerald-950 via-slate-900 to-slate-900',
    items: [
      { icon: 'blog', badgeBg: 'bg-emerald-600', name: 'Blog Post', desc: 'SEO-optimized, 1,200–1,800 words' },
      { icon: 'newsletter', badgeBg: 'bg-orange-500', name: 'Email Newsletter', desc: '800–1,200 words with CTA' },
      { icon: 'quote', badgeBg: 'bg-rose-500', name: 'Quote Graphics', desc: 'Speaker-attributed quotable excerpts' },
    ],
  },
];

const FEATURED_OUTPUT_STACK: FeaturedOutputCard[] = [
  {
    eyebrow: 'Short-form video',
    platform: 'TikTok / Reels Script',
    accent: 'from-cyan-400 to-blue-500',
    surface: 'bg-slate-950/80 border-cyan-500/25',
    icon: 'tiktok', badgeBg: 'bg-cyan-600',
    preview: [
      { label: 'Hook', text: '"This moment from our podcast is about to reframe how you think about customer retention…"' },
      { label: 'Build', text: 'Guest breaks down the exact framework their team used to cut churn by 40% in 6 months.' },
      { label: 'CTA',  text: '"Drop a comment if you want the full episode link."' },
    ],
  },
  {
    eyebrow: 'Episode packaging',
    platform: 'YouTube Description',
    accent: 'from-rose-400 to-red-500',
    surface: 'bg-slate-950/80 border-rose-500/25',
    icon: 'youtube', badgeBg: 'bg-red-600',
    preview: [
      { label: 'Summary',  text: 'Sarah Chen explains what separates high-retention SaaS from the rest — and the metrics teams get wrong.' },
      { label: 'Chapters', text: '00:00 Intro  ·  04:22 Retention paradox  ·  18:45 Framework  ·  32:10 Q&A' },
      { label: 'Tags',     text: '#SaaS #CustomerRetention #ProductLed #StartupGrowth' },
    ],
  },
  {
    eyebrow: 'Long-form',
    platform: 'Email Newsletter',
    accent: 'from-amber-300 to-orange-500',
    surface: 'bg-slate-950/80 border-amber-500/25',
    icon: 'newsletter', badgeBg: 'bg-orange-500',
    preview: [
      { label: 'Opening', text: 'Most teams measure retention wrong. This week Sarah Chen joined us to explain why stickiness is a vanity metric.' },
      { label: 'Insight', text: "The teams that win aren't reducing churn — they're engineering indispensability at 30, 60, and 90 days." },
      { label: 'CTA',     text: 'Read the full breakdown → [Listen Now]' },
    ],
  },
];

const HERO_ROTATING_PHRASES = [
  'content.',
  'show notes.',
  'social posts.',
  'publish-ready assets.',
] as const;

const SIGNAL_LEVELS = [
  { base: 24, low: 10, high: 42 },
  { base: 68, low: 28, high: 88 },
  { base: 32, low: 14, high: 52 },
  { base: 84, low: 42, high: 100 },
  { base: 40, low: 18, high: 64 },
  { base: 58, low: 22, high: 78 },
  { base: 28, low: 12, high: 46 },
  { base: 92, low: 48, high: 100 },
  { base: 46, low: 20, high: 68 },
  { base: 74, low: 34, high: 92 },
  { base: 36, low: 16, high: 58 },
];

const ANALYSIS_METRICS = [
  { label: 'Coaching gaps', value: '2 gaps', note: 'High-priority issues to fix in this or the next episode' },
  { label: 'Missed opportunities', value: '3', note: 'Moments where the episode could have been clearer, deeper, or stronger' },
  { label: 'Strengths', value: '4', note: 'Choices worth repeating because they clearly worked for listeners' },
];

const ANALYSIS_OPPORTUNITIES = [
  {
    title: 'The opening takes too long to reveal the real tension',
    type: 'Hook',
    severity: 'High',
    action: 'Lead with the strongest question or disagreement in the first 30 seconds.',
  },
  {
    title: 'The guest hints at a stronger example that never gets explored',
    type: 'Follow-up',
    severity: 'Medium',
    action: 'Ask one more concrete follow-up so the audience gets the full story.',
  },
  {
    title: 'The personal story sections are the most memorable moments',
    type: 'Strength',
    severity: 'Low',
    action: 'Use more specific examples like this in future episodes and clips.',
  },
];

const ANALYSIS_CONTENT_BREAKDOWN = [
  { label: 'Short-form video', value: 28, color: '#38bdf8' },
  { label: 'Social posts', value: 24, color: '#818cf8' },
  { label: 'Long-form', value: 18, color: '#34d399' },
  { label: 'Episode assets', value: 16, color: '#f59e0b' },
  { label: 'Quote pulls', value: 14, color: '#f472b6' },
];

const CONSTELLATION_STARS = [
  { x: '10%', y: '16%', size: 3, delay: 0.1, duration: 2.8 },
  { x: '16%', y: '34%', size: 2, delay: 0.5, duration: 3.4 },
  { x: '22%', y: '58%', size: 2, delay: 0.2, duration: 2.6 },
  { x: '28%', y: '22%', size: 4, delay: 0.8, duration: 4.2 },
  { x: '34%', y: '48%', size: 2, delay: 0.3, duration: 3.1 },
  { x: '40%', y: '74%', size: 3, delay: 0.6, duration: 2.9 },
  { x: '48%', y: '14%', size: 2, delay: 0.4, duration: 3.8 },
  { x: '54%', y: '36%', size: 3, delay: 0.2, duration: 2.7 },
  { x: '60%', y: '62%', size: 2, delay: 0.9, duration: 3.5 },
  { x: '68%', y: '22%', size: 4, delay: 0.3, duration: 4.4 },
  { x: '74%', y: '46%', size: 2, delay: 0.7, duration: 2.5 },
  { x: '80%', y: '18%', size: 3, delay: 0.1, duration: 3.2 },
  { x: '86%', y: '64%', size: 2, delay: 0.6, duration: 3.7 },
  { x: '90%', y: '30%', size: 4, delay: 0.4, duration: 4.1 },
  { x: '94%', y: '54%', size: 2, delay: 0.2, duration: 2.8 },
];

const CONSTELLATION_LINES = [
  { left: '15%', top: '33%', width: '14%', rotate: '-20deg', delay: 0.2 },
  { left: '28%', top: '21%', width: '20%', rotate: '-12deg', delay: 0.5 },
  { left: '48%', top: '14%', width: '20%', rotate: '12deg', delay: 0.9 },
  { left: '34%', top: '48%', width: '22%', rotate: '-16deg', delay: 0.4 },
  { left: '54%', top: '35%', width: '21%', rotate: '12deg', delay: 0.7 },
  { left: '40%', top: '73%', width: '21%', rotate: '-10deg', delay: 0.6 },
  { left: '60%', top: '61%', width: '26%', rotate: '5deg', delay: 1.1 },
];

const SUBTLE_CONSTELLATION_GROUPS = [
  {
    id: 'cassiopeia',
    stars: [
      { x: '81%', y: '12%', size: 2.5 },
      { x: '84.5%', y: '17%', size: 2 },
      { x: '88%', y: '11.5%', size: 2.5 },
      { x: '91.5%', y: '17.5%', size: 2 },
      { x: '95%', y: '12.5%', size: 2.5 },
    ],
    lines: [
      { left: '81%', top: '12%', width: '4.4%', rotate: '55deg' },
      { left: '84.5%', top: '17%', width: '4.6%', rotate: '-54deg' },
      { left: '88%', top: '11.5%', width: '4.4%', rotate: '56deg' },
      { left: '91.5%', top: '17.5%', width: '4.3%', rotate: '-52deg' },
    ],
  },
  {
    id: 'delphinus',
    stars: [
      { x: '10%', y: '80%', size: 2 },
      { x: '14%', y: '74%', size: 2.5 },
      { x: '18%', y: '79%', size: 2 },
      { x: '14%', y: '84%', size: 1.75 },
      { x: '22%', y: '72%', size: 2.25 },
    ],
    lines: [
      { left: '10%', top: '80%', width: '5.2%', rotate: '-50deg' },
      { left: '14%', top: '74%', width: '5.1%', rotate: '50deg' },
      { left: '14%', top: '84%', width: '5.1%', rotate: '-50deg' },
      { left: '18%', top: '79%', width: '5.4%', rotate: '-34deg' },
    ],
  },
];

const AMBIENT_STARS = [
  { x: '4%', y: '12%', size: 1, opacity: 0.48, duration: 5.4, delay: 0.1 },
  { x: '7%', y: '44%', size: 1.5, opacity: 0.42, duration: 4.8, delay: 0.6 },
  { x: '12%', y: '72%', size: 1, opacity: 0.38, duration: 6.1, delay: 0.9 },
  { x: '18%', y: '9%', size: 1, opacity: 0.44, duration: 5.9, delay: 0.3 },
  { x: '24%', y: '42%', size: 1.5, opacity: 0.35, duration: 5.3, delay: 1.1 },
  { x: '31%', y: '9%', size: 1, opacity: 0.3, duration: 6.8, delay: 0.5 },
  { x: '38%', y: '28%', size: 1, opacity: 0.4, duration: 5.7, delay: 0.2 },
  { x: '43%', y: '86%', size: 1.5, opacity: 0.3, duration: 6.4, delay: 0.8 },
  { x: '50%', y: '8%', size: 1, opacity: 0.42, duration: 5.6, delay: 0.1 },
  { x: '58%', y: '28%', size: 1.5, opacity: 0.38, duration: 6.2, delay: 0.4 },
  { x: '63%', y: '82%', size: 1, opacity: 0.36, duration: 5.1, delay: 1.2 },
  { x: '71%', y: '8%', size: 1, opacity: 0.48, duration: 6.7, delay: 0.7 },
  { x: '78%', y: '40%', size: 1.5, opacity: 0.34, duration: 5.4, delay: 0.5 },
  { x: '83%', y: '78%', size: 1, opacity: 0.28, duration: 6.3, delay: 0.9 },
  { x: '97%', y: '22%', size: 1, opacity: 0.44, duration: 5.8, delay: 0.2 },
  { x: '95%', y: '70%', size: 1.5, opacity: 0.32, duration: 6.6, delay: 0.6 },
];

const SHOOTING_STARS = [
  { left: '-12%', top: '12%', width: '10rem', rotate: '16deg', duration: 1.55, repeatDelay: 12.5, delay: 0.8, tone: 'via-white' },
  { left: '58%', top: '6%', width: '8rem', rotate: '20deg', duration: 1.2, repeatDelay: 15.5, delay: 4.6, tone: 'via-sky-100' },
  { left: '-10%', top: '78%', width: '7rem', rotate: '10deg', duration: 1.25, repeatDelay: 16.8, delay: 7.2, tone: 'via-cyan-100' },
  { left: '82%', top: '70%', width: '7.5rem', rotate: '-18deg', duration: 1.35, repeatDelay: 18.2, delay: 10.5, tone: 'via-white' },
];

const PRICING_DARK_STARS = [
  { x: '8%', y: '14%', size: 7, opacity: 0.48, duration: 7.2, delay: 0.2 },
  { x: '16%', y: '28%', size: 6, opacity: 0.5, duration: 6.1, delay: 0.9 },
  { x: '24%', y: '70%', size: 7, opacity: 0.44, duration: 7.8, delay: 0.5 },
  { x: '32%', y: '21%', size: 6, opacity: 0.48, duration: 6.8, delay: 1.1 },
  { x: '40%', y: '49%', size: 7, opacity: 0.42, duration: 7.5, delay: 0.7 },
  { x: '48%', y: '35%', size: 6, opacity: 0.5, duration: 6.4, delay: 0.3 },
  { x: '56%', y: '77%', size: 7, opacity: 0.48, duration: 7.1, delay: 1.2 },
  { x: '64%', y: '14%', size: 6, opacity: 0.48, duration: 6.9, delay: 0.4 },
  { x: '72%', y: '42%', size: 7, opacity: 0.44, duration: 7.3, delay: 0.8 },
  { x: '80%', y: '28%', size: 6, opacity: 0.5, duration: 6.2, delay: 1.3 },
  { x: '88%', y: '56%', size: 7, opacity: 0.48, duration: 7.7, delay: 0.6 },
  { x: '96%', y: '35%', size: 6, opacity: 0.48, duration: 6.7, delay: 0.2 },
  { x: '96%', y: '77%', size: 7, opacity: 0.44, duration: 7.4, delay: 1.0 },
];

const SYNC_SIGNAL_PATTERNS = [
  {
    name: 'bell-curve',
    frames: [
      [14, 20, 30, 48, 72, 90, 72, 48, 30, 20, 14],
      [18, 30, 48, 72, 94, 100, 94, 72, 48, 30, 18],
      [22, 38, 58, 82, 100, 100, 100, 82, 58, 38, 22],
      [18, 30, 48, 72, 94, 100, 94, 72, 48, 30, 18],
      [14, 20, 30, 48, 72, 90, 72, 48, 30, 20, 14],
    ],
  },
  {
    name: 'split-peak',
    frames: [
      [20, 34, 62, 96, 54, 18, 54, 96, 62, 34, 20],
      [26, 48, 82, 100, 64, 22, 64, 100, 82, 48, 26],
      [18, 32, 58, 86, 46, 14, 46, 86, 58, 32, 18],
      [28, 50, 84, 100, 68, 24, 68, 100, 84, 50, 28],
    ],
  },
  {
    name: 'traveling-wave',
    frames: [
      [100, 86, 64, 38, 22, 14, 18, 28, 46, 70, 92],
      [68, 92, 100, 84, 58, 30, 16, 18, 26, 42, 66],
      [28, 48, 76, 100, 94, 68, 40, 20, 16, 24, 40],
      [18, 24, 38, 62, 88, 100, 90, 64, 36, 18, 16],
      [22, 18, 24, 42, 68, 92, 100, 86, 60, 34, 18],
    ],
  },
  {
    name: 'center-pulse',
    frames: [
      [12, 14, 18, 30, 58, 90, 58, 30, 18, 14, 12],
      [16, 22, 34, 58, 88, 100, 88, 58, 34, 22, 16],
      [20, 30, 48, 78, 100, 100, 100, 78, 48, 30, 20],
      [16, 22, 34, 58, 88, 100, 88, 58, 34, 22, 16],
      [12, 14, 18, 30, 58, 90, 58, 30, 18, 14, 12],
    ],
  },
  {
    name: 'stadium-rise',
    frames: [
      [14, 24, 36, 52, 68, 82, 68, 52, 36, 24, 14],
      [24, 38, 54, 74, 90, 100, 90, 74, 54, 38, 24],
      [34, 52, 72, 90, 100, 100, 100, 90, 72, 52, 34],
      [20, 34, 48, 66, 82, 92, 82, 66, 48, 34, 20],
      [14, 24, 36, 52, 68, 82, 68, 52, 36, 24, 14],
    ],
  },
];

function generateRandomSignal(prev: number[]): number[] {
  return prev.map((value, index) => {
    const drift = Math.round((Math.random() - 0.5) * 34);
    const neighborBias = index > 0 && index < prev.length - 1
      ? Math.round(((prev[index - 1] + prev[index + 1]) / 2 - value) * 0.18)
      : 0;
    return Math.max(12, Math.min(100, value + drift + neighborBias));
  });
}

// ─── Pricing — single pay-as-you-go model ────────────────────────────────────
const PAYG_SECTIONS = [
  {
    name: 'Base transcription',
    price: '$0.49/hr',
    description: 'Always-on transcript with numbered speaker labels and timestamps.',
    features: [
      'Clean transcript',
      'Speaker labels (numbered)',
      'Word-level timestamps',
      'Export to Markdown / Notion',
    ],
  },
  {
    name: 'Optional analysis add-ons',
    price: 'Per selection',
    description: 'Choose only the structure you want during processing.',
    features: [
      'Named speakers with roles',
      'Episode summary',
      'Insights',
      'Chapter breakdown',
      'Key takeaways',
      'Notable quotes',
    ],
  },
  {
    name: 'Content generation',
    price: 'Per output',
    description: 'Generate content later from the project page, one content type at a time.',
    features: [
      'X / Twitter thread',
      'LinkedIn post',
      'YouTube description',
      'TikTok / Reels script',
      'Podcast show notes',
      'Email newsletter',
      'Blog post',
    ],
  },
] as const;

// ─── Utilities ────────────────────────────────────────────────────────────────
function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.25 });
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] origin-left bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 z-[60]"
      style={{ scaleX }}
    />
  );
}

function CountUp({ to, suffix = '', duration = 1.1 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(ref, { once: true, amount: 0.85 });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (reduceMotion) { setValue(to); return; }
    const controls = animate(0, to, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [duration, isInView, reduceMotion, to]);

  return <span ref={ref}>{value}{suffix}</span>;
}

function AnalysisConstellationBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(148,163,184,0.16),transparent_24%),radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_88%_28%,rgba(125,211,252,0.12),transparent_24%),linear-gradient(180deg,#020617_0%,#040b18_42%,#020617_100%)]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_62%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />

      {AMBIENT_STARS.map((star, index) => (
        <motion.div
          key={`ambient-${star.x}-${star.y}`}
          className="absolute rounded-full bg-white"
          style={{
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
          }}
          animate={reduceMotion ? { opacity: star.opacity } : { opacity: [star.opacity * 0.55, star.opacity, star.opacity * 0.7] }}
          transition={{ duration: star.duration + (index % 4) * 0.35, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {CONSTELLATION_LINES.map((line, index) => (
        <motion.div
          key={`line-${line.left}-${line.top}`}
          className="absolute h-px origin-left bg-gradient-to-r from-transparent via-sky-100/85 to-transparent"
          style={{ left: line.left, top: line.top, width: line.width, rotate: line.rotate }}
          animate={reduceMotion ? { opacity: 0.24 } : { opacity: [0.1, 0.34, 0.16], scaleX: [0.98, 1.02, 1] }}
          transition={{ duration: 6.8, delay: line.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {SUBTLE_CONSTELLATION_GROUPS.map((group, groupIndex) => (
        <div key={group.id}>
          {group.lines.map((line, lineIndex) => (
            <motion.div
              key={`${group.id}-line-${lineIndex}`}
              className="absolute h-px origin-left bg-gradient-to-r from-transparent via-white/45 to-transparent"
              style={{ left: line.left, top: line.top, width: line.width, rotate: line.rotate }}
              animate={reduceMotion ? { opacity: 0.14 } : { opacity: [0.04, 0.16, 0.08], scaleX: [0.98, 1.01, 1] }}
              transition={{ duration: 7.4, delay: groupIndex * 0.9 + lineIndex * 0.22, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
          {group.stars.map((star, starIndex) => (
            <motion.div
              key={`${group.id}-star-${starIndex}`}
              className="absolute rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.4)]"
              style={{ left: star.x, top: star.y, width: star.size, height: star.size }}
              animate={reduceMotion ? { opacity: 0.42, scale: 1 } : { opacity: [0.16, 0.5, 0.24], scale: [1, 1.35, 1] }}
              transition={{ duration: 5.8 + starIndex * 0.35, delay: groupIndex * 0.8 + starIndex * 0.18, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>
      ))}

      {CONSTELLATION_STARS.map((star, index) => (
        <motion.div
          key={`${star.x}-${star.y}`}
          className="absolute rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.95)]"
          style={{ left: star.x, top: star.y, width: star.size, height: star.size }}
          animate={reduceMotion
            ? { opacity: 0.92, scale: 1 }
            : { opacity: [0.45, 1, 0.58], scale: [1, 1.85, 1] }}
          transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <motion.div
        className="absolute left-[6%] top-[20%] h-16 w-16 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f8fafc_0%,#cbd5e1_18%,#475569_54%,#0f172a_100%)] opacity-90 shadow-[0_0_42px_rgba(148,163,184,0.32)]"
        animate={reduceMotion ? { y: 0 } : { y: [0, -10, 0], x: [0, 7, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute right-[8%] bottom-[14%] h-24 w-24 rounded-full bg-[radial-gradient(circle_at_32%_28%,#fde68a_0%,#f59e0b_30%,#7c2d12_68%,#1f2937_100%)] opacity-95 shadow-[0_0_54px_rgba(245,158,11,0.24)]"
        animate={reduceMotion ? { y: 0 } : { y: [0, 10, 0], x: [0, -8, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute inset-[-9%] rounded-full border border-amber-200/20" />
        <div className="absolute -left-6 top-6 h-[1px] w-10 rotate-[-24deg] bg-white/15" />
      </motion.div>

      <motion.div
        className="absolute left-[70%] top-[18%] h-10 w-10"
        animate={reduceMotion ? { x: 0, y: 0, rotate: 0 } : { x: [0, 24, 0], y: [0, -12, 0], rotate: [0, 7, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200 shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
        <div className="absolute left-[10%] top-1/2 h-px w-[80%] -translate-y-1/2 bg-slate-300/80" />
        <div className="absolute left-1/2 top-[10%] h-[80%] w-px -translate-x-1/2 bg-slate-300/80" />
        <div className="absolute left-0 top-[24%] h-3 w-3 rounded-sm border border-slate-300/80 bg-slate-100/10" />
        <div className="absolute right-0 top-[24%] h-3 w-3 rounded-sm border border-slate-300/80 bg-slate-100/10" />
      </motion.div>

      {!reduceMotion && (
        <>
          {SHOOTING_STARS.map((star) => (
            <motion.div
              key={`${star.left}-${star.top}-${star.rotate}`}
              className={`absolute h-px bg-gradient-to-r from-transparent ${star.tone} to-transparent opacity-0`}
              style={{ left: star.left, top: star.top, width: star.width, rotate: star.rotate }}
              animate={{ x: ['0%', '145%'], opacity: [0, 0.95, 0] }}
              transition={{ duration: star.duration, repeat: Infinity, repeatDelay: star.repeatDelay, ease: 'easeOut', delay: star.delay }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function AnalysisContentPieChart() {
  const gradientStops = ANALYSIS_CONTENT_BREAKDOWN.reduce(
    (acc, slice, index) => {
      const start = acc.offset;
      const end = start + slice.value;
      acc.stops.push(`${slice.color} ${start}% ${end}%`);
      acc.offset = end;
      return acc;
    },
    { offset: 0, stops: [] as string[] },
  );

  return (
    <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
      <div className="relative mx-auto h-48 w-48">
        <div className="absolute inset-0 rounded-full border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_58%)]" />
        <div
          className="absolute inset-3 rounded-full border border-white/15 shadow-[0_0_40px_rgba(56,189,248,0.08)]"
          style={{ background: `conic-gradient(${gradientStops.stops.join(', ')})` }}
        />
        <div className="absolute inset-[28%] rounded-full border border-white/12 bg-slate-950/35 backdrop-blur-[1px]" />
        <div className="absolute inset-0 rounded-full border border-dashed border-white/8" />
        <div className="absolute left-1/2 top-4 h-[calc(50%-1rem)] w-px -translate-x-1/2 bg-white/10" />
        <div className="absolute left-4 top-1/2 h-px w-[calc(50%-1rem)] -translate-y-1/2 bg-white/10" />
      </div>

      <div className="space-y-3">
        {ANALYSIS_CONTENT_BREAKDOWN.map((slice, index) => (
          <motion.div
            key={slice.label}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.35, delay: 0.06 * index, ease: 'easeOut' }}
            className="flex items-center justify-between gap-4 border-b border-white/8 pb-2 last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.18)]" style={{ backgroundColor: slice.color }} />
              <span className="text-sm text-blue-50/78">{slice.label}</span>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/50">{slice.value}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PricingSubtleStars() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(59,130,246,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(59,130,246,0.06)_1px,transparent_1px)] bg-[size:28px_28px,28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:140px_140px,140px_140px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_38%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_32%)] dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_38%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.22),transparent_32%)]" />

      {PRICING_DARK_STARS.map((star) => (
        <motion.div
          key={`${star.x}-${star.y}`}
          className="absolute rounded-full bg-sky-500/85 shadow-[0_0_0_1px_rgba(37,99,235,0.28),0_0_20px_rgba(59,130,246,0.16)] dark:bg-slate-200/85 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.16),0_0_22px_rgba(96,165,250,0.12)]"
          animate={reduceMotion ? { opacity: star.opacity } : { opacity: [star.opacity * 0.5, star.opacity, star.opacity * 0.82] }}
          transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
          }}
        />
      ))}
    </div>
  );
}

function SocialProofStrip() {
  const reduceMotion = useReducedMotion();
  const [laneWidth, setLaneWidth] = useState(0);
  const laneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!laneRef.current) return;
    const laneEl = laneRef.current;
    const syncWidth = () => setLaneWidth(laneEl.offsetWidth);
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(laneEl);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-slate-950 py-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(148,163,184,0.14),transparent_24%),radial-gradient(circle_at_52%_0%,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_86%_28%,rgba(125,211,252,0.1),transparent_24%),linear-gradient(180deg,#020617_0%,#040b18_42%,#020617_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px,28px_28px] opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_62%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3 relative z-10">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/70">
          Built For Real-World Audio
        </p>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
      {reduceMotion ? (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-center gap-2 relative z-10">
          {SOCIAL_TAGS.map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)] backdrop-blur-sm">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <motion.div
          className="relative z-10 flex w-max"
          initial={{ x: 0 }}
          animate={laneWidth > 0 ? { x: [0, -laneWidth] } : undefined}
          transition={laneWidth > 0 ? { duration: Math.max(16, laneWidth / 42), ease: 'linear', repeat: Infinity, repeatType: 'loop' } : undefined}
        >
          <div ref={laneRef} className="flex items-center gap-3 pr-3">
            {SOCIAL_TAGS.map((tag) => (
              <span key={`a-${tag}`} className="whitespace-nowrap rounded-full border border-white/10 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)] backdrop-blur-sm">
                {tag}
              </span>
            ))}
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={`dup-${i}`} aria-hidden className="flex items-center gap-3 pr-3">
              {SOCIAL_TAGS.map((tag) => (
                <span key={`b-${i}-${tag}`} className="whitespace-nowrap rounded-full border border-white/10 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)] backdrop-blur-sm">
                  {tag}
                </span>
              ))}
            </div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

// ─── Video frame wrapper ──────────────────────────────────────────────────────
// Drop the video file into /public/videos/ and it activates automatically.
function VideoFrame({
  src,
  poster,
  urlLabel,
  statusLabel,
  className = '',
}: {
  src: string;
  poster?: string;
  urlLabel?: string;
  statusLabel?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 2.0;
    }
  }, [src]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-slate-900 ${className}`}>
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-5 py-3 dark:border-white/10 dark:bg-slate-950">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
        {urlLabel && (
          <div className="flex-1 min-w-0 mx-4">
            <div className="mx-auto max-w-xs truncate rounded-md bg-slate-200 px-3 py-1 text-center text-[11px] text-slate-500 dark:bg-white/5 dark:text-white/30">
              {urlLabel}
            </div>
          </div>
        )}
        {statusLabel && (
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-[11px] text-slate-500 dark:text-white/35">{statusLabel}</span>
          </div>
        )}
      </div>

      {/* Video — placeholder grid shows behind it until the file is present */}
      <div className="relative bg-slate-100 dark:bg-slate-900" style={{ aspectRatio: '16/9' }}>
        {/* Placeholder: visible only when no video file has loaded */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-slate-300 bg-white dark:border-white/15 dark:bg-white/8">
            <Play className="ml-0.5 h-5 w-5 text-slate-500 dark:text-white/30" />
          </div>
          <p className="text-xs tracking-wide text-slate-500 dark:text-white/20">Add {src.split('/').pop()} to /public/videos/</p>
        </div>

        {src.endsWith('.webp') ? (
          <img src={src} className="absolute inset-0 w-full h-full object-cover block" alt={urlLabel || "Demo video"} />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            poster={poster}
            className="absolute inset-0 w-full h-full object-cover block relative z-10"
          >
            <source src={src} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}

function LaunchThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-10 w-10 rounded-lg border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-900/50" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const links = [
    { label: 'Speaker AI', href: '#speaker-intelligence' },
    { label: 'How it Works', href: '#how-it-works' },
    { label: 'Outputs', href: '#outputs' },
    { label: 'Analysis', href: '#analysis' },
    { label: 'Pricing', href: '#pricing' },
  ];
  const logoTheme = mounted && resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="#top" className="flex items-center gap-2.5">
            <BrandLogo theme={logoTheme} />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {links.map(({ label, href }) => (
              <a key={label} href={href} className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-slate-300 dark:hover:text-white">
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <LaunchThemeToggle />
            <Link href="/auth/login" className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">
              Log In
            </Link>
            <Link href="/auth/signup" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              Get Started Free
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <LaunchThemeToggle />
            <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
              {open ? <CloseIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="space-y-1 border-t border-gray-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-950 md:hidden">
          {links.map(({ label, href }) => (
            <a key={label} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-900">
              {label}
            </a>
          ))}
          <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-white/10">
            <Link href="/auth/login" onClick={() => setOpen(false)} className="block rounded-xl border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
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

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const [activePhrase, setActivePhrase] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActivePhrase((current) => (current + 1) % HERO_ROTATING_PHRASES.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 pt-20 pb-12 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 md:pb-20">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
          Turn One Recording Into Everything
        </motion.div>

        <motion.h1
          className="mb-6 text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: 'easeOut' }}
        >
          <span className="whitespace-nowrap">
            Upload your episode.{' '}
          <span className="relative inline-flex min-w-[16ch] justify-start align-baseline whitespace-nowrap sm:min-w-[18ch] md:min-w-[20ch]">
            <AnimatePresence mode="wait">
              <motion.span
                key={HERO_ROTATING_PHRASES[activePhrase]}
                initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="whitespace-nowrap bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent"
              >
                Leave with {HERO_ROTATING_PHRASES[activePhrase]}
              </motion.span>
            </AnimatePresence>
          </span>
          </span>
          <br />For every platform.
        </motion.h1>

        <motion.p
          className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-blue-200/70 md:text-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16, ease: 'easeOut' }}
        >
          AudioRepurpose turns a single recording into a clean transcript, speaker-attributed show notes, chapters, a summary, and ready-to-publish posts for every platform.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
        >
          <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-900/50">
            Start Free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/auth/demo" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3.5 font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-white/70 dark:border-white/25 dark:text-white/80 dark:hover:border-white/50 dark:hover:bg-white/5 dark:hover:text-white">
            Try Demo →
          </Link>
        </motion.div>

        {/* Hero video
            ─────────────────────────────────────────────────────────────────
            Record: open a real project → scroll transcript → AI Summary →
            Key Takeaways → rename Speaker 2 → segments update → Generated
            Content tab showing LinkedIn post + X thread. ~30 seconds total.
            Drop the file at /public/videos/hero-demo.mp4 to activate.
        */}
        <motion.div
          className="relative max-w-7xl mx-auto px-4 sm:px-0"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-20 bg-blue-500/25 blur-2xl rounded-full pointer-events-none" />
          <VideoFrame
            src="/videos/hero-demo.webp"
            poster="/videos/hero-demo-poster.jpg"
            urlLabel="app.audiorepurpose.com/studio"
            statusLabel="Speaker attribution confirmed, all 11 outputs unlocked"
          />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Speaker Intelligence Section ────────────────────────────────────────────
function SpeakerIntelligenceSection() {
  const bullets = [
    { Icon: Users, text: 'Auto-detects names and roles directly from audio context' },
    { Icon: Sparkles, text: 'Surfaces uncertain segments for one-click review and correction' },
    { Icon: Check, text: 'Every output inherits clean speaker attribution automatically' },
  ];

  return (
    <section id="speaker-intelligence" className="py-24 bg-white overflow-hidden dark:bg-slate-950">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Speaker Intelligence</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">
            The feature no other tool ships
          </h2>
          <p className="text-gray-500 mt-4 max-w-2xl mx-auto text-base dark:text-slate-300">
            Most tools give you Speaker 1, Speaker 2, and a prayer. AudioRepurpose auto-detects names and roles from the audio itself — then gives you a clean review workflow to confirm or correct every segment.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Video loop
              ──────────────────────────────────────────────────────────────────
              Record: a Speaker 2 → rename to "Sarah Chen (Guest)" → confirm →
              watch transcript update in real time. Loop: ~10 seconds.
              File: /public/videos/speaker-loop.mp4
          */}
          <motion.div
            className="lg:col-span-7 xl:col-span-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <VideoFrame
              src="/videos/speaker-loop.webp"
              poster="/videos/speaker-loop-poster.jpg"
              urlLabel="Studio · Speaker Review"
              statusLabel="Rename confirmed"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="flex flex-col gap-8 lg:col-span-5 xl:col-span-4"
          >
            <ul className="space-y-6">
              {bullets.map(({ Icon, text }, i) => (
                <li key={i} className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center dark:bg-blue-500/15">
                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <p className="text-gray-700 leading-relaxed pt-1.5 dark:text-slate-300">{text}</p>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 leading-relaxed dark:text-slate-300">
                <span className="font-semibold text-gray-800 dark:text-white">Merge duplicate speakers</span> — real-world audio often fragments one voice into multiple clusters. AudioRepurpose lets you merge them in one click and propagate the correction across the entire transcript.
              </p>
            </div>

            <Link
              href="/auth/demo"
              className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition-colors text-sm dark:text-blue-300 dark:hover:text-blue-200"
            >
              See it live in the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-gray-50 py-24 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:28px_28px,28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.08)_1px,transparent_1px)] bg-[size:140px_140px,140px_140px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.04),transparent_38%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.03),transparent_32%)] dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_38%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.22),transparent_32%)]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">How it Works</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">From recording to content in minutes</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base dark:text-slate-300">
            Pick your processing level once, then generate whichever content types you need.
          </p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-8 relative"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px bg-gradient-to-r from-blue-200 via-violet-200 to-indigo-200 dark:from-blue-400/30 dark:via-violet-400/30 dark:to-indigo-400/30" />
          {STEPS.map(({ n, title, description, Icon, accent, ring }, idx) => (
            <motion.div
              key={n}
              variants={sectionItem}
              transition={{ delay: idx * 0.06 }}
              className="relative flex flex-col items-center text-center group"
            >
              <div className={`relative z-10 h-16 w-16 ${accent} rounded-2xl flex items-center justify-center mb-6 shadow-lg ring-4 ${ring} transition-transform duration-300 group-hover:-translate-y-1`}>
                <Icon className="h-7 w-7 text-white" />
                <span className="absolute -top-2 -right-2 h-5 w-5 bg-white rounded-full text-[10px] font-bold text-gray-700 flex items-center justify-center shadow-sm border border-gray-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                  {n[1]}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs dark:text-slate-300">{description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Content Outputs Section ──────────────────────────────────────────────────
function ContentOutputsSection() {
  const [activeCard, setActiveCard] = useState(0);
  const [signalHeights, setSignalHeights] = useState<number[]>(SIGNAL_LEVELS.map((signal) => signal.base));
  const [activeSignalPattern, setActiveSignalPattern] = useState<number | null>(null);
  const [signalLeadIn, setSignalLeadIn] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % FEATURED_OUTPUT_STACK.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSignalPattern !== null || signalLeadIn) return;

    const timer = setInterval(() => {
      setSignalHeights((prev) => generateRandomSignal(prev));
    }, 520);

    return () => clearInterval(timer);
  }, [activeSignalPattern, signalLeadIn]);

  useEffect(() => {
    let patternIndex = 0;
    let leadTimeout: ReturnType<typeof setTimeout> | null = null;
    let releaseTimeout: ReturnType<typeof setTimeout> | null = null;

    const runPattern = () => {
      const nextPattern = patternIndex % SYNC_SIGNAL_PATTERNS.length;
      patternIndex += 1;
      const gatherFrame = SYNC_SIGNAL_PATTERNS[nextPattern].frames[0];
      const finalFrame = SYNC_SIGNAL_PATTERNS[nextPattern].frames.at(-1);
      setSignalLeadIn(true);
      setSignalHeights(gatherFrame);

      leadTimeout = setTimeout(() => {
        setActiveSignalPattern(nextPattern);
        setSignalLeadIn(false);
      }, 1000);

      releaseTimeout = setTimeout(() => {
        setSignalHeights(finalFrame || SIGNAL_LEVELS.map((signal) => signal.base));
        setActiveSignalPattern(null);
      }, 7000);
    };

    const interval = setInterval(() => {
      runPattern();
    }, 30000);

    runPattern();

    return () => {
      clearInterval(interval);
      if (leadTimeout) clearTimeout(leadTimeout);
      if (releaseTimeout) clearTimeout(releaseTimeout);
    };
  }, []);

  const card = FEATURED_OUTPUT_STACK[activeCard];
  const ActiveCardIcon = OUTPUT_ICONS[card.icon];
  const activePattern = activeSignalPattern !== null ? SYNC_SIGNAL_PATTERNS[activeSignalPattern] : null;

  return (
    <section id="outputs" className="py-24 bg-white overflow-hidden dark:bg-slate-950">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Content Generation</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">
            One recording, shaped for every channel.
          </h2>
        </motion.div>

        <div className="grid gap-8 xl:grid-cols-5 xl:items-start">
          {/* Left column — Content Menu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="xl:col-span-3"
          >
            {/* Stat chips */}
            <div className="mb-8 flex items-center justify-center gap-2">
              {[
                ['11', 'content types'],
                ['Pay', 'as you go'],
              ].map(([value, label]) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                  <span className="font-bold text-slate-950 dark:text-white">{value}</span>
                  <span>{label}</span>
                </span>
              ))}
            </div>

            {/* Content groups — clean vertical sections */}
            <div className="space-y-0">
              {OUTPUT_GROUPS.map(({ title, description, items }, index) => (
                <div key={title}>
                  {index > 0 && <div className="border-t border-slate-200 my-7 dark:border-white/10" />}
                  <div className="flex items-baseline justify-between gap-4 mb-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Editorial Group</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h3>
                      <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-300">{description}</p>
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {items.map(({ icon, badgeBg, name, desc }) => {
                      const Icon = OUTPUT_ICONS[icon];
                      return (
                      <div key={name} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05]">
                        <div className={`h-9 w-9 ${badgeBg} rounded-xl flex items-center justify-center text-white flex-shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-950 dark:text-white">{name}</div>
                          <div className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">{desc}</div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Generate your first batch here <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Right column — Cycling Output Preview */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 }}
            className="xl:col-span-2 xl:sticky xl:top-24"
          >
            <div className="relative pt-4">
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/15" />
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Editorial Rotation</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                    Three live examples, all eleven outputs available.
                  </h3>
                </div>
              </div>

              <div className="relative min-h-[19rem] border-y border-slate-200 py-6 dark:border-white/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeCard}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="grid gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`h-11 w-11 rounded-2xl ${card.badgeBg} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}>
                        <ActiveCardIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{card.eyebrow}</p>
                        <h4 className="mt-1 text-xl font-bold tracking-tight text-slate-950 dark:text-white">{card.platform}</h4>
                      </div>
                      <div className={`ml-auto h-8 w-8 rounded-xl bg-gradient-to-br ${card.accent} shadow-md flex-shrink-0`} />
                    </div>

                    <div className="space-y-3">
                      {card.preview.map(({ label, text }, index) => (
                        <div key={label} className="grid grid-cols-[4.75rem_1fr] gap-3 border-b border-slate-200/80 pb-3 last:border-b-0 last:pb-0 dark:border-white/10">
                          <span className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {String(index + 1).padStart(2, '0')} {label}
                          </span>
                          <span className="text-sm leading-7 text-slate-700 dark:text-slate-300">{text}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2">
                {FEATURED_OUTPUT_STACK.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCard(i)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all
                      ${i === activeCard
                        ? 'bg-slate-900 text-white border border-slate-900 dark:border-white/10 dark:bg-white/10'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    {c.eyebrow}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <div className="mb-4 flex items-center justify-center gap-1.5 whitespace-nowrap">
                  {['Transcript', 'Optional analysis', 'On-demand content'].map((pill) => (
                    <span key={pill} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                      {pill}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <span>Pipeline signal</span>
                  <span>Source transcript</span>
                </div>
                <div className="mt-4 grid grid-cols-11 gap-2 items-end" style={{ height: 104 }}>
                  {OUTPUT_GROUPS.flatMap((group) => group.items).map(({ icon, badgeBg, name }, index) => {
                    const Icon = OUTPUT_ICONS[icon];
                    const liveHeight = signalHeights[index];
                    const iconTravel = Math.max(3, Math.round(liveHeight / 10));
                    const patternFrames = activePattern?.frames.map((frame) => frame[index]);
                    const patternTimes = patternFrames?.map((_, frameIndex, arr) => (
                      arr.length === 1 ? 1 : frameIndex / (arr.length - 1)
                    ));
                    const iconFrames = activePattern
                      ? [0, ...(patternFrames || []).map((height) => -Math.max(3, Math.round(height / 10))), 0]
                      : signalLeadIn
                        ? [-Math.max(3, Math.round(liveHeight / 10))]
                      : [-iconTravel];
                    const iconTimes = activePattern
                      ? iconFrames.map((_, frameIndex, arr) => (
                        arr.length === 1 ? 1 : frameIndex / (arr.length - 1)
                      ))
                      : undefined;
                    return (
                      <div key={name} className="flex h-full flex-col items-center justify-end">
                        <motion.div
                          className={`mb-1 flex h-8 w-8 items-center justify-center rounded-lg ${badgeBg} text-white shadow-sm`}
                          animate={{ y: iconFrames }}
                          style={{ willChange: 'transform' }}
                          transition={activePattern
                            ? { duration: 6, times: iconTimes, ease: 'easeInOut' }
                            : signalLeadIn
                              ? { duration: 1, ease: 'easeInOut' }
                              : { duration: 0.42, ease: 'easeOut' }}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.div>
                        <motion.div
                          className="w-full rounded-[5px] bg-gradient-to-t from-blue-500 via-sky-400 to-cyan-200"
                          animate={activePattern
                            ? { height: (patternFrames || [liveHeight]).map((height) => `${height}%`) }
                            : { height: `${liveHeight}%` }}
                          transition={activePattern
                            ? { duration: 6, times: patternTimes, ease: 'easeInOut' }
                            : signalLeadIn
                              ? { duration: 1, ease: 'easeInOut' }
                              : { duration: 0.42, ease: 'easeOut' }}
                          style={{ height: `${liveHeight}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function AnalysisSection() {
  return (
    <section id="analysis" className="relative overflow-hidden bg-slate-100 py-20 dark:bg-slate-950">
      <AnalysisConstellationBackground />
      <div className="relative max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold uppercase tracking-widest text-blue-300">Analysis</span>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-4xl">
            See what to improve before the next recording.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-blue-100/65">
            AudioRepurpose turns each transcript into creator coaching: what worked, what felt weak, what was missing, and what to do better next time.
          </p>
        </motion.div>

        <motion.div
          className="grid gap-8 xl:grid-cols-5 xl:items-stretch"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <motion.div
            variants={sectionItem}
            className="xl:col-span-2 h-full"
          >
            <div className="flex h-full flex-col">
              <motion.div variants={sectionItem} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/55">
                <BarChart3 className="h-4 w-4 text-blue-300" />
                Creator coaching
              </motion.div>
              <motion.h3 variants={sectionItem} className="mt-4 text-4xl font-bold tracking-tight text-white">
                Analytics that show what made the episode strong, weak, or worth fixing.
              </motion.h3>
              <motion.p variants={sectionItem} className="mt-5 max-w-xl text-sm leading-7 text-blue-100/70">
                Instead of just counting outputs, AudioRepurpose reviews the conversation itself: the weak hook, the missed follow-up, the rushed transition, the strong moment worth repeating.
              </motion.p>

              <motion.div variants={sectionItem} className="mt-8 xl:mt-8">
                <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-transparent p-5">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px,24px_24px] opacity-60" />
                  <div className="relative">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">Content mix</p>
                    <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">What this upload produced across formats</h4>
                    <div className="mt-6">
                      <AnalysisContentPieChart />
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={sectionItem} className="mt-6 space-y-4">
                {[
                  { Icon: Target, text: 'Catch weak openings, soft CTAs, and missed audience payoff before you publish.' },
                  { Icon: Lightbulb, text: 'Spot where the host should have gone deeper, clarified, or followed up.' },
                  { Icon: BarChart3, text: 'See which moments actually landed so you can repeat what works next episode.' },
                ].map(({ Icon, text }) => (
                  <motion.div key={text} variants={sectionItem} className="flex items-start gap-3 border-l border-slate-200 pl-4 dark:border-white/10">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-white/8 dark:text-blue-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-blue-100/72">{text}</p>
                  </motion.div>
                ))}
              </motion.div>

            </div>
          </motion.div>

          <motion.div
            variants={sectionItem}
            className="xl:col-span-3 h-full"
          >
            <div className="relative h-full rounded-[2rem] border border-white/10 bg-white/9 px-5 py-6 shadow-[0_30px_90px_-55px_rgba(15,23,42,0.85)] backdrop-blur-md sm:px-7">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_30%),linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />
              <div className="relative">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/50">Coaching snapshot</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
                      What to fix, keep, or improve next
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Gaps', 'Strengths', 'Next actions'].map((pill) => (
                      <span key={pill} className="rounded-md border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-50/75">
                        {pill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {ANALYSIS_METRICS.map((metric, index) => (
                    <motion.div
                      key={metric.label}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={SECTION_VIEWPORT}
                      transition={{ duration: 0.45, delay: 0.06 * index, ease: 'easeOut' }}
                      className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">{metric.label}</div>
                      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{metric.value}</div>
                      <p className="mt-2 text-sm leading-6 text-blue-100/65">{metric.note}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">Topic intensity</p>
                        <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">Where the conversation spends its energy</h4>
                      </div>
                    </div>
                    <div className="mt-6 space-y-4">
                      {[
                        { name: 'AI safety', width: '84%', tone: 'from-blue-600 to-cyan-400' },
                        { name: 'Future of work', width: '68%', tone: 'from-violet-600 to-indigo-400' },
                        { name: 'Sponsor CTA', width: '38%', tone: 'from-amber-500 to-orange-400' },
                        { name: 'Founder story', width: '56%', tone: 'from-emerald-500 to-lime-400' },
                      ].map((item, index) => (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={SECTION_VIEWPORT}
                          transition={{ duration: 0.4, delay: 0.08 * index, ease: 'easeOut' }}
                        >
                          <div className="flex items-center justify-between text-sm text-blue-100/78">
                            <span>{item.name}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/45">{item.width}</span>
                          </div>
                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <motion.div
                              className={`h-full rounded-full bg-gradient-to-r ${item.tone}`}
                              initial={{ width: 0 }}
                              whileInView={{ width: item.width }}
                              viewport={SECTION_VIEWPORT}
                              transition={{ duration: 0.8, delay: 0.12 + index * 0.08, ease: 'easeOut' }}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">Creator coaching</p>
                      <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">What to fix or lean into next</h4>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    {ANALYSIS_OPPORTUNITIES.map((item, index) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={SECTION_VIEWPORT}
                        transition={{ duration: 0.4, delay: 0.08 * index, ease: 'easeOut' }}
                        className="rounded-2xl border border-white/10 bg-white/8 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/48">{item.type}</span>
                          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            item.severity === 'High'
                              ? 'bg-rose-500/10 text-rose-200'
                              : item.severity === 'Medium'
                                ? 'bg-amber-500/10 text-amber-200'
                                : 'bg-emerald-500/10 text-emerald-200'
                          }`}>
                            {item.severity}
                          </span>
                        </div>
                        <h5 className="mt-2 text-sm font-semibold leading-6 text-white">{item.title}</h5>
                        <p className="mt-2 text-sm leading-6 text-blue-100/65">{item.action}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden py-24 bg-gray-50 dark:bg-slate-950">
      <PricingSubtleStars />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">Pricing</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2 dark:text-white">Pay only for what you process</h2>
          <p className="text-slate-600 mt-4 max-w-xl mx-auto text-base dark:text-slate-300">
            One pay-as-you-go workflow. Upload audio, choose analysis options, and generate content later only when you need it.
          </p>
        </div>

        <div className="max-w-5xl mx-auto mb-10 rounded-xl border border-slate-200 bg-transparent px-5 py-3.5 flex items-start gap-3 dark:border-white/10 dark:bg-white/[0.03]">
          <Clock className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5 dark:text-slate-400" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold">Manual by default</span> — You choose which analysis runs during upload, then generate content later from the project page so credits only go toward outputs you actually want.
          </p>
        </div>

        <div className="max-w-6xl mx-auto rounded-[2rem] border-2 border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
          <div className="grid gap-6 lg:grid-cols-3">
            {PAYG_SECTIONS.map(({ name, price, description, features }, idx) => (
              <div
                key={name}
                className={`rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/50 motion-safe:animate-fade-up${idx === 1 ? '-200' : idx === 2 ? '-400' : ''}`}
              >
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{name}</h3>
                  <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{price}</div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">{description}</p>
                </div>
                <ul className="space-y-2.5">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      <span className="text-sm text-gray-700 dark:text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            <Link
              href="/auth/signup"
              className="inline-flex min-w-[220px] items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Start pay as you go
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No subscriptions. Buy credits, upload when you need to, and trigger analysis or content generation only when it adds value.
        </p>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  const stats = [
    { value: 11, suffix: '', label: 'Content types' },
    { value: 5, suffix: ' min', label: 'Per episode' },
    { value: 0, suffix: '', label: 'Subscriptions required' },
  ] as const;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 py-24 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 motion-safe:animate-fade-up dark:border-blue-400/30 dark:bg-blue-500/20">
          <Mic className="h-6 w-6 text-blue-600 dark:text-blue-300" />
        </div>
        <h2 className="mb-4 text-3xl font-bold leading-tight text-slate-900 motion-safe:animate-fade-up-200 dark:text-white md:text-4xl">
          Start Repurposing Today
        </h2>
        <p className="mb-10 text-lg leading-relaxed text-slate-600 motion-safe:animate-fade-up-400 dark:text-blue-200/70">
          Turn one recording into transcripts, insights, and 11 publish-ready content types.
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
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-white/70 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white"
          >
            Already have an account? Log in
          </Link>
        </div>

        <div className="mt-12 flex items-center justify-center gap-6 sm:gap-10 text-sm">
          {stats.map((stat, idx) => (
            <div key={stat.label} className={`text-center motion-safe:animate-fade-in${idx === 1 ? '-200' : idx === 2 ? '-400' : ''}`}>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                <CountUp to={stat.value} suffix={stat.suffix} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-blue-300/60">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const logoTheme = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <footer className="border-t border-slate-200 bg-slate-100 py-14 text-slate-500 motion-safe:animate-fade-in dark:border-gray-900 dark:bg-gray-950 dark:text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <a href="#top" className="inline-flex">
              <BrandLogo theme={logoTheme} />
            </a>
            <p className="mt-4 max-w-md text-sm text-slate-500 dark:text-gray-500">
              Turn one recording into a full content suite with accurate speakers, clean summaries, and platform-ready outputs.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">Product</p>
            <div className="mt-4 space-y-2 text-sm">
              <a href="#speaker-intelligence" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Speaker Intelligence</a>
              <a href="#how-it-works" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">How it works</a>
              <a href="#outputs" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Content outputs</a>
              <a href="#analysis" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Analysis</a>
              <a href="#pricing" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Pricing</a>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">Account</p>
            <div className="mt-4 space-y-2 text-sm">
              <Link href="/auth/login" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Log In</Link>
              <Link href="/auth/signup" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Get Started Free</Link>
              <Link href="/auth/demo" className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200">Try Demo</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 text-xs text-slate-500 dark:text-gray-600 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} AudioRepurpose. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="transition-colors hover:text-slate-700 dark:hover:text-gray-300">Pricing</a>
            <Link href="/privacy" className="transition-colors hover:text-slate-700 dark:hover:text-gray-300">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-slate-700 dark:hover:text-gray-300">Terms</Link>
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
    <MotionConfig reducedMotion="user">
      <ScrollProgressBar />
      <div id="top" className="min-h-screen bg-white">
        <Navbar open={mobileOpen} setOpen={setMobileOpen} />
        <main>
          <Hero />
          <SocialProofStrip />
          <SpeakerIntelligenceSection />
          <HowItWorks />
          <ContentOutputsSection />
          <AnalysisSection />
          <Pricing />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
