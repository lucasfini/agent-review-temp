"use client";

import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type SVGProps,
} from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import {
  Mic,
  Sparkles,
  Zap,
  ArrowRight,
  Check,
  BarChart3,
  Target,
  Lightbulb,
  Menu,
  X as CloseIcon,
  Clock,
  Upload,
  Sun,
  Moon,
  Facebook,
  Instagram,
  Youtube,
  Mail,
  FileText,
  Quote,
  Newspaper,
} from "lucide-react";
import BrandLogo from "@/components/site/BrandLogo";
import { PAYG_SECTIONS, PRICING_MODEL_SUMMARY } from "@/lib/pricing-config";

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

// Constants
const SOCIAL_TAGS = [
  "Podcasts",
  "Interviews",
  "Webinars",
  "Panels",
  "Founder Updates",
  "Customer Calls",
  "Creator Episodes",
  "Team Briefings",
];

const SECTION_VIEWPORT = { once: true, amount: 0.2 };
const sectionContainer = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: "easeOut" as const,
      staggerChildren: 0.12,
    },
  },
};
const sectionItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const },
  },
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

type HowItWorksStep = {
  id: string;
  n: string;
  title: string;
  description: string;
  eyebrow: string;
  accent: string;
  ring: string;
  Icon: ElementType;
};

// How It Works steps
const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    id: "upload",
    n: "01",
    title: "Upload Your Audio",
    eyebrow: "Start with the source",
    description:
      "Drop in the episode, pick the import source, and start from a polished upload surface that feels lightweight instead of technical.",
    accent: "bg-blue-500",
    ring: "ring-blue-500/20",
    Icon: Upload,
  },
  {
    id: "process",
    n: "02",
    title: "Choose What Runs",
    eyebrow: "Switch on the right workflow",
    description:
      "Turn on speaker detection, summaries, insights, chapters, and takeaways only when you need them, without cluttering the flow.",
    accent: "bg-violet-500",
    ring: "ring-violet-500/20",
    Icon: Sparkles,
  },
  {
    id: "outputs",
    n: "03",
    title: "Publish From One Workspace",
    eyebrow: "Everything is ready downstream",
    description:
      "Move from transcript and speaker cleanup into finished content assets without leaving the same project workspace.",
    accent: "bg-indigo-500",
    ring: "ring-indigo-500/20",
    Icon: Zap,
  },
];

// Output formats
const OUTPUT_GROUPS: Array<{
  title: string;
  description: string;
  accent: string;
  items: OutputGroupItem[];
}> = [
    {
      title: "Social Distribution",
      description:
        "Posts built to grab attention quickly and drive replies, saves, and shares.",
      accent: "from-slate-900 via-slate-800 to-slate-900",
      items: [
        {
          icon: "x",
          badgeBg: "bg-slate-900",
          name: "X Threads",
          desc: "6-8 posts per thread",
        },
        {
          icon: "linkedin",
          badgeBg: "bg-blue-700",
          name: "LinkedIn Posts",
          desc: "Professional posts with discussion prompts",
        },
        {
          icon: "facebook",
          badgeBg: "bg-blue-600",
          name: "Facebook Post",
          desc: "Conversational post with question-led engagement",
        },
        {
          icon: "instagram",
          badgeBg: "bg-gradient-to-br from-fuchsia-500 to-rose-500",
          name: "Instagram Carousel",
          desc: "Multi-slide carousel with hashtags",
        },
      ],
    },
    {
      title: "Video + Episode Packaging",
      description:
        "Assets that help an episode travel across video feeds and listening platforms.",
      accent: "from-blue-950 via-indigo-950 to-slate-900",
      items: [
        {
          icon: "youtube",
          badgeBg: "bg-red-600",
          name: "YouTube Description",
          desc: "SEO-friendly summary with timestamps and hashtags",
        },
        {
          icon: "tiktok",
          badgeBg: "bg-cyan-600",
          name: "TikTok / Reels Script",
          desc: "45-60 second short-form hook and CTA",
        },
        {
          icon: "podcast",
          badgeBg: "bg-amber-600",
          name: "Podcast Episode Description",
          desc: "Store-ready episode summary for podcast apps",
        },
        {
          icon: "showNotes",
          badgeBg: "bg-violet-600",
          name: "Show Notes",
          desc: "Episode summary with timestamps",
        },
      ],
    },
    {
      title: "Long-Form + Pull Quotes",
      description:
        "Deeper assets for search, email, and republishing once an episode has landed.",
      accent: "from-emerald-950 via-slate-900 to-slate-900",
      items: [
        {
          icon: "blog",
          badgeBg: "bg-emerald-600",
          name: "Blog Post",
          desc: "SEO-optimized, 1,200-1,800 words",
        },
        {
          icon: "newsletter",
          badgeBg: "bg-orange-500",
          name: "Email Newsletter",
          desc: "800-1,200 words with CTA",
        },
        {
          icon: "quote",
          badgeBg: "bg-rose-500",
          name: "Quote Graphics",
          desc: "Speaker-attributed quotable excerpts",
        },
      ],
    },
  ];

const FEATURED_OUTPUT_STACK: FeaturedOutputCard[] = [
  {
    eyebrow: "Short-form video",
    platform: "TikTok / Reels Script",
    accent: "from-cyan-400 to-blue-500",
    surface: "bg-slate-950/80 border-cyan-500/25",
    icon: "tiktok",
    badgeBg: "bg-cyan-600",
    preview: [
      {
        label: "Hook",
        text: '"This moment from our podcast is about to reframe how you think about customer retention..."',
      },
      {
        label: "Build",
        text: "Guest breaks down the exact framework their team used to cut churn by 40% in 6 months.",
      },
      {
        label: "CTA",
        text: '"Drop a comment if you want the full episode link."',
      },
    ],
  },
  {
    eyebrow: "Episode packaging",
    platform: "YouTube Description",
    accent: "from-rose-400 to-red-500",
    surface: "bg-slate-950/80 border-rose-500/25",
    icon: "youtube",
    badgeBg: "bg-red-600",
    preview: [
      {
        label: "Summary",
        text: "Sarah Chen explains what separates high-retention SaaS from the rest - and the metrics teams get wrong.",
      },
      {
        label: "Chapters",
        text: "00:00 Intro | 04:22 Retention paradox | 18:45 Framework | 32:10 Q&A",
      },
      {
        label: "Tags",
        text: "#SaaS #CustomerRetention #ProductLed #StartupGrowth",
      },
    ],
  },
  {
    eyebrow: "Long-form",
    platform: "Email Newsletter",
    accent: "from-amber-300 to-orange-500",
    surface: "bg-slate-950/80 border-amber-500/25",
    icon: "newsletter",
    badgeBg: "bg-orange-500",
    preview: [
      {
        label: "Opening",
        text: "Most teams measure retention wrong. This week Sarah Chen joined us to explain why stickiness is a vanity metric.",
      },
      {
        label: "Insight",
        text: "The teams that win aren't reducing churn - they're engineering indispensability at 30, 60, and 90 days.",
      },
      { label: "CTA", text: "Read the full breakdown -> [Listen Now]" },
    ],
  },
];

const HERO_ROTATING_PHRASES = [
  "transcripts",
  "speaker briefs",
  "content kits",
  "publish-ready drafts",
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
  {
    label: "Coaching gaps",
    value: "2 gaps",
    note: "High-priority issues to fix in this or the next episode",
  },
  {
    label: "Missed opportunities",
    value: "3",
    note: "Moments where the episode could have been clearer, deeper, or stronger",
  },
  {
    label: "Strengths",
    value: "4",
    note: "Choices worth repeating because they clearly worked for listeners",
  },
];

const ANALYSIS_OPPORTUNITIES = [
  {
    title: "The opening takes too long to reveal the real tension",
    type: "Hook",
    severity: "High",
    action:
      "Lead with the strongest question or disagreement in the first 30 seconds.",
  },
  {
    title: "The guest hints at a stronger example that never gets explored",
    type: "Follow-up",
    severity: "Medium",
    action:
      "Ask one more concrete follow-up so the audience gets the full story.",
  },
  {
    title: "The personal story sections are the most memorable moments",
    type: "Strength",
    severity: "Low",
    action:
      "Use more specific examples like this in future episodes and clips.",
  },
];

const ANALYSIS_CONTENT_BREAKDOWN = [
  { label: "Short-form video", value: 28, color: "#38bdf8" },
  { label: "Social posts", value: 24, color: "#818cf8" },
  { label: "Long-form", value: 18, color: "#34d399" },
  { label: "Episode assets", value: 16, color: "#f59e0b" },
  { label: "Quote pulls", value: 14, color: "#f472b6" },
];

const CONSTELLATION_STARS = [
  { x: "10%", y: "16%", size: 3, delay: 0.1, duration: 2.8 },
  { x: "16%", y: "34%", size: 2, delay: 0.5, duration: 3.4 },
  { x: "22%", y: "58%", size: 2, delay: 0.2, duration: 2.6 },
  { x: "28%", y: "22%", size: 4, delay: 0.8, duration: 4.2 },
  { x: "34%", y: "48%", size: 2, delay: 0.3, duration: 3.1 },
  { x: "40%", y: "74%", size: 3, delay: 0.6, duration: 2.9 },
  { x: "48%", y: "14%", size: 2, delay: 0.4, duration: 3.8 },
  { x: "54%", y: "36%", size: 3, delay: 0.2, duration: 2.7 },
  { x: "60%", y: "62%", size: 2, delay: 0.9, duration: 3.5 },
  { x: "68%", y: "22%", size: 4, delay: 0.3, duration: 4.4 },
  { x: "74%", y: "46%", size: 2, delay: 0.7, duration: 2.5 },
  { x: "80%", y: "18%", size: 3, delay: 0.1, duration: 3.2 },
  { x: "86%", y: "64%", size: 2, delay: 0.6, duration: 3.7 },
  { x: "90%", y: "30%", size: 4, delay: 0.4, duration: 4.1 },
  { x: "94%", y: "54%", size: 2, delay: 0.2, duration: 2.8 },
];

const CONSTELLATION_LINES = [
  { left: "15%", top: "33%", width: "14%", rotate: "-20deg", delay: 0.2 },
  { left: "28%", top: "21%", width: "20%", rotate: "-12deg", delay: 0.5 },
  { left: "48%", top: "14%", width: "20%", rotate: "12deg", delay: 0.9 },
  { left: "34%", top: "48%", width: "22%", rotate: "-16deg", delay: 0.4 },
  { left: "54%", top: "35%", width: "21%", rotate: "12deg", delay: 0.7 },
  { left: "40%", top: "73%", width: "21%", rotate: "-10deg", delay: 0.6 },
  { left: "60%", top: "61%", width: "26%", rotate: "5deg", delay: 1.1 },
];

const SUBTLE_CONSTELLATION_GROUPS = [
  {
    id: "cassiopeia",
    stars: [
      { x: "81%", y: "12%", size: 2.5 },
      { x: "84.5%", y: "17%", size: 2 },
      { x: "88%", y: "11.5%", size: 2.5 },
      { x: "91.5%", y: "17.5%", size: 2 },
      { x: "95%", y: "12.5%", size: 2.5 },
    ],
    lines: [
      { left: "81%", top: "12%", width: "4.4%", rotate: "55deg" },
      { left: "84.5%", top: "17%", width: "4.6%", rotate: "-54deg" },
      { left: "88%", top: "11.5%", width: "4.4%", rotate: "56deg" },
      { left: "91.5%", top: "17.5%", width: "4.3%", rotate: "-52deg" },
    ],
  },
  {
    id: "delphinus",
    stars: [
      { x: "10%", y: "80%", size: 2 },
      { x: "14%", y: "74%", size: 2.5 },
      { x: "18%", y: "79%", size: 2 },
      { x: "14%", y: "84%", size: 1.75 },
      { x: "22%", y: "72%", size: 2.25 },
    ],
    lines: [
      { left: "10%", top: "80%", width: "5.2%", rotate: "-50deg" },
      { left: "14%", top: "74%", width: "5.1%", rotate: "50deg" },
      { left: "14%", top: "84%", width: "5.1%", rotate: "-50deg" },
      { left: "18%", top: "79%", width: "5.4%", rotate: "-34deg" },
    ],
  },
];

const AMBIENT_STARS = [
  { x: "4%", y: "12%", size: 1, opacity: 0.48, duration: 5.4, delay: 0.1 },
  { x: "7%", y: "44%", size: 1.5, opacity: 0.42, duration: 4.8, delay: 0.6 },
  { x: "12%", y: "72%", size: 1, opacity: 0.38, duration: 6.1, delay: 0.9 },
  { x: "18%", y: "9%", size: 1, opacity: 0.44, duration: 5.9, delay: 0.3 },
  { x: "24%", y: "42%", size: 1.5, opacity: 0.35, duration: 5.3, delay: 1.1 },
  { x: "31%", y: "9%", size: 1, opacity: 0.3, duration: 6.8, delay: 0.5 },
  { x: "38%", y: "28%", size: 1, opacity: 0.4, duration: 5.7, delay: 0.2 },
  { x: "43%", y: "86%", size: 1.5, opacity: 0.3, duration: 6.4, delay: 0.8 },
  { x: "50%", y: "8%", size: 1, opacity: 0.42, duration: 5.6, delay: 0.1 },
  { x: "58%", y: "28%", size: 1.5, opacity: 0.38, duration: 6.2, delay: 0.4 },
  { x: "63%", y: "82%", size: 1, opacity: 0.36, duration: 5.1, delay: 1.2 },
  { x: "71%", y: "8%", size: 1, opacity: 0.48, duration: 6.7, delay: 0.7 },
  { x: "78%", y: "40%", size: 1.5, opacity: 0.34, duration: 5.4, delay: 0.5 },
  { x: "83%", y: "78%", size: 1, opacity: 0.28, duration: 6.3, delay: 0.9 },
  { x: "97%", y: "22%", size: 1, opacity: 0.44, duration: 5.8, delay: 0.2 },
  { x: "95%", y: "70%", size: 1.5, opacity: 0.32, duration: 6.6, delay: 0.6 },
];

const SHOOTING_STARS = [
  {
    left: "-12%",
    top: "12%",
    width: "10rem",
    rotate: "16deg",
    duration: 1.55,
    repeatDelay: 12.5,
    delay: 0.8,
    tone: "via-white",
  },
  {
    left: "58%",
    top: "6%",
    width: "8rem",
    rotate: "20deg",
    duration: 1.2,
    repeatDelay: 15.5,
    delay: 4.6,
    tone: "via-sky-100",
  },
  {
    left: "-10%",
    top: "78%",
    width: "7rem",
    rotate: "10deg",
    duration: 1.25,
    repeatDelay: 16.8,
    delay: 7.2,
    tone: "via-cyan-100",
  },
  {
    left: "82%",
    top: "70%",
    width: "7.5rem",
    rotate: "-18deg",
    duration: 1.35,
    repeatDelay: 18.2,
    delay: 10.5,
    tone: "via-white",
  },
];

const PRICING_DARK_STARS = [
  { x: "8%", y: "14%", size: 7, opacity: 0.48, duration: 7.2, delay: 0.2 },
  { x: "16%", y: "28%", size: 6, opacity: 0.5, duration: 6.1, delay: 0.9 },
  { x: "24%", y: "70%", size: 7, opacity: 0.44, duration: 7.8, delay: 0.5 },
  { x: "32%", y: "21%", size: 6, opacity: 0.48, duration: 6.8, delay: 1.1 },
  { x: "40%", y: "49%", size: 7, opacity: 0.42, duration: 7.5, delay: 0.7 },
  { x: "48%", y: "35%", size: 6, opacity: 0.5, duration: 6.4, delay: 0.3 },
  { x: "56%", y: "77%", size: 7, opacity: 0.48, duration: 7.1, delay: 1.2 },
  { x: "64%", y: "14%", size: 6, opacity: 0.48, duration: 6.9, delay: 0.4 },
  { x: "72%", y: "42%", size: 7, opacity: 0.44, duration: 7.3, delay: 0.8 },
  { x: "80%", y: "28%", size: 6, opacity: 0.5, duration: 6.2, delay: 1.3 },
  { x: "88%", y: "56%", size: 7, opacity: 0.48, duration: 7.7, delay: 0.6 },
  { x: "96%", y: "35%", size: 6, opacity: 0.48, duration: 6.7, delay: 0.2 },
  { x: "96%", y: "77%", size: 7, opacity: 0.44, duration: 7.4, delay: 1.0 },
];

const SYNC_SIGNAL_PATTERNS = [
  {
    name: "bell-curve",
    frames: [
      [14, 20, 30, 48, 72, 90, 72, 48, 30, 20, 14],
      [18, 30, 48, 72, 94, 100, 94, 72, 48, 30, 18],
      [22, 38, 58, 82, 100, 100, 100, 82, 58, 38, 22],
      [18, 30, 48, 72, 94, 100, 94, 72, 48, 30, 18],
      [14, 20, 30, 48, 72, 90, 72, 48, 30, 20, 14],
    ],
  },
  {
    name: "split-peak",
    frames: [
      [20, 34, 62, 96, 54, 18, 54, 96, 62, 34, 20],
      [26, 48, 82, 100, 64, 22, 64, 100, 82, 48, 26],
      [18, 32, 58, 86, 46, 14, 46, 86, 58, 32, 18],
      [28, 50, 84, 100, 68, 24, 68, 100, 84, 50, 28],
    ],
  },
  {
    name: "traveling-wave",
    frames: [
      [100, 86, 64, 38, 22, 14, 18, 28, 46, 70, 92],
      [68, 92, 100, 84, 58, 30, 16, 18, 26, 42, 66],
      [28, 48, 76, 100, 94, 68, 40, 20, 16, 24, 40],
      [18, 24, 38, 62, 88, 100, 90, 64, 36, 18, 16],
      [22, 18, 24, 42, 68, 92, 100, 86, 60, 34, 18],
    ],
  },
  {
    name: "center-pulse",
    frames: [
      [12, 14, 18, 30, 58, 90, 58, 30, 18, 14, 12],
      [16, 22, 34, 58, 88, 100, 88, 58, 34, 22, 16],
      [20, 30, 48, 78, 100, 100, 100, 78, 48, 30, 20],
      [16, 22, 34, 58, 88, 100, 88, 58, 34, 22, 16],
      [12, 14, 18, 30, 58, 90, 58, 30, 18, 14, 12],
    ],
  },
  {
    name: "stadium-rise",
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
    const neighborBias =
      index > 0 && index < prev.length - 1
        ? Math.round(((prev[index - 1] + prev[index + 1]) / 2 - value) * 0.18)
        : 0;
    return Math.max(12, Math.min(100, value + drift + neighborBias));
  });
}

// Utilities
function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    mass: 0.25,
  });
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] origin-left bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 z-[60]"
      style={{ scaleX }}
    />
  );
}

function CountUp({
  to,
  suffix = "",
  duration = 1.1,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(ref, { once: true, amount: 0.85 });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (reduceMotion) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [duration, isInView, reduceMotion, to]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

function AnalysisConstellationBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(148,163,184,0.16),transparent_24%),radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_88%_28%,rgba(125,211,252,0.12),transparent_24%),linear-gradient(180deg,#020617_0%,#040b18_42%,#020617_100%)]" />
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
          animate={
            reduceMotion
              ? { opacity: star.opacity }
              : {
                opacity: [
                  star.opacity * 0.55,
                  star.opacity,
                  star.opacity * 0.7,
                ],
              }
          }
          transition={{
            duration: star.duration + (index % 4) * 0.35,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {CONSTELLATION_LINES.map((line) => (
        <motion.div
          key={`line-${line.left}-${line.top}`}
          className="absolute h-px origin-left bg-gradient-to-r from-transparent via-sky-100/85 to-transparent"
          style={{
            left: line.left,
            top: line.top,
            width: line.width,
            rotate: line.rotate,
          }}
          animate={
            reduceMotion
              ? { opacity: 0.24 }
              : { opacity: [0.1, 0.34, 0.16], scaleX: [0.98, 1.02, 1] }
          }
          transition={{
            duration: 6.8,
            delay: line.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {SUBTLE_CONSTELLATION_GROUPS.map((group, groupIndex) => (
        <div key={group.id}>
          {group.lines.map((line, lineIndex) => (
            <motion.div
              key={`${group.id}-line-${lineIndex}`}
              className="absolute h-px origin-left bg-gradient-to-r from-transparent via-white/45 to-transparent"
              style={{
                left: line.left,
                top: line.top,
                width: line.width,
                rotate: line.rotate,
              }}
              animate={
                reduceMotion
                  ? { opacity: 0.14 }
                  : { opacity: [0.04, 0.16, 0.08], scaleX: [0.98, 1.01, 1] }
              }
              transition={{
                duration: 7.4,
                delay: groupIndex * 0.9 + lineIndex * 0.22,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
          {group.stars.map((star, starIndex) => (
            <motion.div
              key={`${group.id}-star-${starIndex}`}
              className="absolute rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.4)]"
              style={{
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
              }}
              animate={
                reduceMotion
                  ? { opacity: 0.42, scale: 1 }
                  : { opacity: [0.16, 0.5, 0.24], scale: [1, 1.35, 1] }
              }
              transition={{
                duration: 5.8 + starIndex * 0.35,
                delay: groupIndex * 0.8 + starIndex * 0.18,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      ))}

      {CONSTELLATION_STARS.map((star) => (
        <motion.div
          key={`${star.x}-${star.y}`}
          className="absolute rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.95)]"
          style={{
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
          }}
          animate={
            reduceMotion
              ? { opacity: 0.92, scale: 1 }
              : { opacity: [0.45, 1, 0.58], scale: [1, 1.85, 1] }
          }
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      <motion.div
        className="absolute left-[6%] top-[20%] h-16 w-16 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f8fafc_0%,#cbd5e1_18%,#475569_54%,#0f172a_100%)] opacity-90 shadow-[0_0_42px_rgba(148,163,184,0.32)]"
        animate={reduceMotion ? { y: 0 } : { y: [0, -10, 0], x: [0, 7, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute right-[8%] bottom-[14%] h-24 w-24 rounded-full bg-[radial-gradient(circle_at_32%_28%,#fde68a_0%,#f59e0b_30%,#7c2d12_68%,#1f2937_100%)] opacity-95 shadow-[0_0_54px_rgba(245,158,11,0.24)]"
        animate={reduceMotion ? { y: 0 } : { y: [0, 10, 0], x: [0, -8, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-[-9%] rounded-full border border-amber-200/20" />
        <div className="absolute -left-6 top-6 h-[1px] w-10 rotate-[-24deg] bg-white/15" />
      </motion.div>

      <motion.div
        className="absolute left-[70%] top-[18%] h-10 w-10"
        animate={
          reduceMotion
            ? { x: 0, y: 0, rotate: 0 }
            : { x: [0, 24, 0], y: [0, -12, 0], rotate: [0, 7, 0] }
        }
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
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
              style={{
                left: star.left,
                top: star.top,
                width: star.width,
                rotate: star.rotate,
              }}
              animate={{ x: ["0%", "145%"], opacity: [0, 0.95, 0] }}
              transition={{
                duration: star.duration,
                repeat: Infinity,
                repeatDelay: star.repeatDelay,
                ease: "easeOut",
                delay: star.delay,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function AnalysisContentPieChart() {
  const gradientStops = ANALYSIS_CONTENT_BREAKDOWN.reduce(
    (acc, slice) => {
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
          style={{
            background: `conic-gradient(${gradientStops.stops.join(", ")})`,
          }}
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
            transition={{
              duration: 0.35,
              delay: 0.06 * index,
              ease: "easeOut",
            }}
            className="flex items-center justify-between gap-4 border-b border-white/8 pb-2 last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.18)]"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-sm text-blue-50/78">{slice.label}</span>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/50">
              {slice.value}%
            </span>
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
          animate={
            reduceMotion
              ? { opacity: star.opacity }
              : {
                opacity: [
                  star.opacity * 0.5,
                  star.opacity,
                  star.opacity * 0.82,
                ],
              }
          }
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
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

function SocialProofStrip({ className = "" }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [laneWidth, setLaneWidth] = useState(0);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const isLight = mounted && resolvedTheme === "light";

  useEffect(() => {
    setMounted(true);
  }, []);

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
    <div
      className={`relative overflow-hidden py-5 ${isLight ? "border-y border-slate-200/80 bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_45%,#f8fafc_100%)]" : "border-y border-white/10 bg-slate-950"} ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${isLight
            ? "bg-[radial-gradient(circle_at_16%_18%,rgba(148,163,184,0.10),transparent_24%),radial-gradient(circle_at_52%_0%,rgba(59,130,246,0.10),transparent_34%),radial-gradient(circle_at_86%_28%,rgba(125,211,252,0.08),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#edf4ff_42%,#f8fafc_100%)]"
            : "bg-[radial-gradient(circle_at_16%_18%,rgba(148,163,184,0.14),transparent_24%),radial-gradient(circle_at_52%_0%,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_86%_28%,rgba(125,211,252,0.1),transparent_24%),linear-gradient(180deg,#020617_0%,#040b18_42%,#020617_100%)]"
          }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px,28px_28px] ${isLight ? "opacity-30" : "opacity-40"}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 ${isLight ? "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),transparent_62%)]" : "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_62%)]"}`}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3 relative z-10">
        <p
          className={`text-center text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? "text-blue-700/75" : "text-blue-100/70"}`}
        >
          Built For Real-World Audio
        </p>
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-24 ${isLight ? "bg-gradient-to-r from-[#f8fbff] to-transparent" : "bg-gradient-to-r from-slate-950 to-transparent"}`}
      />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-24 ${isLight ? "bg-gradient-to-l from-[#f8fafc] to-transparent" : "bg-gradient-to-l from-slate-950 to-transparent"}`}
      />
      {reduceMotion ? (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-center gap-2 relative z-10">
          {SOCIAL_TAGS.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur-sm ${isLight ? "border border-slate-200/90 bg-white/88 text-slate-700 shadow-[0_10px_30px_-18px_rgba(37,99,235,0.18)]" : "border border-white/10 bg-white/8 text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)]"}`}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <motion.div
          className="relative z-10 flex w-max"
          initial={{ x: 0 }}
          animate={laneWidth > 0 ? { x: [0, -laneWidth] } : undefined}
          transition={
            laneWidth > 0
              ? {
                duration: Math.max(16, laneWidth / 42),
                ease: "linear",
                repeat: Infinity,
                repeatType: "loop",
              }
              : undefined
          }
        >
          <div ref={laneRef} className="flex items-center gap-3 pr-3">
            {SOCIAL_TAGS.map((tag) => (
              <span
                key={`a-${tag}`}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur-sm ${isLight ? "border border-slate-200/90 bg-white/88 text-slate-700 shadow-[0_10px_30px_-18px_rgba(37,99,235,0.18)]" : "border border-white/10 bg-white/8 text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)]"}`}
              >
                {tag}
              </span>
            ))}
          </div>
          {[...Array(8)].map((_, i) => (
            <div
              key={`dup-${i}`}
              aria-hidden
              className="flex items-center gap-3 pr-3"
            >
              {SOCIAL_TAGS.map((tag) => (
                <span
                  key={`b-${i}-${tag}`}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur-sm ${isLight ? "border border-slate-200/90 bg-white/88 text-slate-700 shadow-[0_10px_30px_-18px_rgba(37,99,235,0.18)]" : "border border-white/10 bg-white/8 text-blue-50/90 shadow-[0_10px_30px_-18px_rgba(59,130,246,0.55)]"}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function LaunchThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-10 w-10 rounded-lg" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 fill-transparent transition-[fill,color] duration-200 group-hover:fill-current" />
      ) : (
        <Moon className="h-4 w-4 fill-transparent transition-[fill,color] duration-200 group-hover:fill-current" />
      )}
    </button>
  );
}

function HeroWordPill({ phrase }: { phrase: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <span className="relative inline-flex items-center justify-center overflow-hidden font-bold tracking-[-0.02em]">
      <AnimatePresence mode="wait">
        <motion.span
          key={phrase}
          initial={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 0, y: 16, filter: "blur(6px)", scale: 0.985 }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }
          }
          exit={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 0, y: -16, filter: "blur(6px)", scale: 1.01 }
          }
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-blue-500"
        >
          Leave with {phrase}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function HowItWorksGraphic({ step }: { step: HowItWorksStep }) {
  const baseSurface =
    "rounded-[1.9rem] border border-white/55 bg-white/75 shadow-[0_35px_90px_-50px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60";

  if (step.id === "upload") {
    return (
      <div className="relative h-[26rem] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-[linear-gradient(135deg,#eff6ff_0%,#eef2ff_52%,#f8fafc_100%)] p-5 shadow-[0_40px_120px_-60px_rgba(37,99,235,0.45)] dark:border-white/10 dark:bg-[linear-gradient(140deg,#020617_0%,#0f172a_45%,#172554_100%)]">
        <div className="absolute -left-8 top-12 h-36 w-36 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/20" />
        <div className="absolute bottom-6 right-2 h-44 w-44 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/20" />
        <div
          className={`${baseSurface} relative flex h-full flex-col gap-4 p-5`}
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-rose-400/70" />
            <div className="h-3 w-3 rounded-full bg-amber-400/70" />
            <div className="h-3 w-3 rounded-full bg-emerald-400/70" />
            <div className="ml-3 flex h-9 flex-1 items-center rounded-xl border border-slate-200/80 bg-white/80 px-4 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              audiorepurpose.com/dashboard/upload
            </div>
          </div>
          <div className="grid flex-1 grid-cols-[1.25fr_0.68fr] gap-4">
            <div className="rounded-[1.5rem] border border-dashed border-blue-300/70 bg-white/82 p-6 dark:border-blue-300/20 dark:bg-slate-900/75">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700 dark:bg-blue-500/12 dark:text-blue-300">
                  Local upload
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  MP3, WAV, M4A
                </span>
              </div>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                <Upload className="h-7 w-7" />
              </div>
              <div className="space-y-3 text-center">
                <div className="text-base font-semibold text-slate-900 dark:text-white">
                  Drop audio or video here
                </div>
                <div className="mx-auto h-2.5 w-2/3 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="mx-auto h-2.5 w-1/2 rounded-full bg-slate-200/80 dark:bg-white/10" />
                <div className="mx-auto mt-5 flex h-10 w-44 items-center justify-center rounded-2xl bg-blue-600/90 text-sm font-semibold text-white shadow-lg shadow-blue-600/30">
                  Start processing
                </div>
              </div>
              <div className="mt-5 rounded-[1rem] border border-slate-200/80 bg-slate-50/90 p-3 dark:border-white/10 dark:bg-slate-900/70">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  <span>Episode file</span>
                  <span>42 min</span>
                </div>
                <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-500/15">
                  <div className="h-2 w-[68%] rounded-full bg-blue-500" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {[
                ["Speaker Count", "Auto-detect host and guests"],
                ["Naming", "Use conversation context for names"],
                ["Audio Quality", "Flag noisy or overlapping sections"],
              ].map(([label, note], index) => (
                <div
                  key={label}
                  className="rounded-[1.3rem] border border-slate-200/80 bg-white/78 p-4 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className={`h-9 w-9 rounded-xl ${index === 0 ? "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" : index === 1 ? "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {label}
                      </div>
                      <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-300">
                        {note}
                      </div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80 dark:bg-white/10" />
                  <div className="mt-2 h-2 w-5/6 rounded-full bg-slate-200/70 dark:bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step.id === "process") {
    return (
      <div className="relative h-[26rem] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-[linear-gradient(145deg,#f8fafc_0%,#eef2ff_55%,#ecfeff_100%)] p-5 shadow-[0_40px_120px_-60px_rgba(99,102,241,0.42)] dark:border-white/10 dark:bg-[linear-gradient(145deg,#020617_0%,#111827_48%,#1e1b4b_100%)]">
        <div className="absolute left-10 top-8 h-36 w-36 rounded-full bg-violet-400/18 blur-3xl dark:bg-violet-500/18" />
        <div className="absolute bottom-4 right-10 h-40 w-40 rounded-full bg-cyan-400/16 blur-3xl dark:bg-cyan-500/18" />
        <div
          className={`${baseSurface} relative flex h-full flex-col gap-5 p-5`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Choose what runs
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                Turn on only the analysis you want on this upload.
              </div>
            </div>
            <div className="flex h-9 items-center rounded-full bg-violet-600/90 px-4 text-xs font-semibold text-white shadow-lg shadow-violet-600/30">
              Content Kit
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-4">
            {[
              {
                label: "Named speakers",
                tone: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
                note: "Classify host, guest, and speaker turns.",
                active: true,
              },
              {
                label: "Summary",
                tone: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
                note: "Generate an episode summary.",
                active: true,
              },
              {
                label: "Insights",
                tone: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
                note: "Extract concepts and talking points.",
                active: false,
              },
              {
                label: "Chapters",
                tone: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
                note: "Break the episode into timed sections.",
                active: true,
              },
            ].map(({ label, tone, note, active }) => (
              <div
                key={label}
                className={`rounded-[1.35rem] border p-4 dark:border-white/10 ${active ? "border-blue-200/80 bg-white/90 shadow-[0_18px_45px_-35px_rgba(37,99,235,0.35)] dark:bg-white/[0.06]" : "border-slate-200/80 bg-white/80 dark:bg-white/[0.04]"}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
                  >
                    {label}
                  </div>
                  <div
                    className={`h-5 w-9 rounded-full ${active ? "bg-blue-500/20" : "bg-slate-200 dark:bg-white/10"}`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full ${active ? "translate-x-4 bg-blue-500" : "translate-x-0.5 bg-slate-400"} transition-transform`}
                    />
                  </div>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 dark:text-slate-300">
                  {note}
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="mt-3 h-2 w-4/5 rounded-full bg-slate-200/80 dark:bg-white/10" />
                <div className="mt-6 flex h-10 items-center rounded-2xl bg-slate-100 px-4 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-300">
                  {active
                    ? "Will run during processing"
                    : "Leave off for transcript-only"}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.2fr_0.8fr] gap-4">
            <div className="rounded-[1.3rem] border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Processing plan
              </div>
              <div className="mb-3 text-[11px] text-slate-500 dark:text-slate-300">
                Transcription first, then selected modules in sequence.
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />{" "}
                  Transcribe audio
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-sky-500" /> Named
                  speakers
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />{" "}
                  Summary + chapters
                </div>
              </div>
            </div>
            <div className="rounded-[1.3rem] border border-violet-300/40 bg-violet-500/10 p-4 dark:border-violet-400/15 dark:bg-violet-500/12">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                <div className="text-sm font-semibold text-violet-700 dark:text-violet-200">
                  Recommended for interviews
                </div>
              </div>
              <div className="text-[11px] leading-5 text-violet-700/80 dark:text-violet-200/80">
                Run named speakers, summary, and chapters together when you want
                publish-ready assets without extra manual setup.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[26rem] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-[linear-gradient(145deg,#eef2ff_0%,#f8fafc_52%,#ecfeff_100%)] p-5 shadow-[0_40px_120px_-60px_rgba(79,70,229,0.4)] dark:border-white/10 dark:bg-[linear-gradient(145deg,#020617_0%,#0f172a_45%,#172554_100%)]">
      <div className="absolute -left-4 top-10 h-40 w-40 rounded-full bg-indigo-400/18 blur-3xl dark:bg-indigo-500/20" />
      <div className="absolute bottom-8 right-8 h-44 w-44 rounded-full bg-cyan-400/16 blur-3xl dark:bg-cyan-500/18" />
      <div className={`${baseSurface} relative flex h-full flex-col gap-5 p-5`}>
        <div className="grid grid-cols-[0.78fr_1.22fr] gap-4">
          <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/82 p-4 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Project workspace
            </div>
            <div className="space-y-3">
              {["Transcript", "Speakers", "Outputs", "Insights"].map(
                (item, index) => (
                  <div
                    key={item}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 ${index === 2 ? "bg-indigo-50 dark:bg-indigo-500/12" : "bg-slate-50 dark:bg-slate-900/65"}`}
                  >
                    <div
                      className={`h-8 w-8 rounded-lg ${index === 2 ? "bg-indigo-500/18" : "bg-slate-200 dark:bg-white/10"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        {item}
                      </div>
                      <div className="mt-1 h-1.5 w-4/5 rounded-full bg-slate-200 dark:bg-white/10" />
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/84 p-4 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Generated outputs
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Built from the same cleaned project.
                </div>
              </div>
              <div className="flex h-8 items-center rounded-full bg-emerald-500/85 px-3 text-[11px] font-semibold text-white shadow-lg shadow-emerald-500/25">
                Ready to publish
              </div>
            </div>
            <div className="grid gap-3">
              {["Show notes", "LinkedIn post", "X thread"].map(
                (label, index) => (
                  <div
                    key={label}
                    className="rounded-[1.15rem] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-900/72"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${index === 0 ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" : index === 1 ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}
                      >
                        {label}
                      </div>
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10" />
                    <div className="mt-2 h-2 w-5/6 rounded-full bg-slate-200/80 dark:bg-white/10" />
                    <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-300">
                      {index === 0
                        ? "Speaker-attributed summary with timestamps."
                        : index === 1
                          ? "Post draft based on the episode's core insight."
                          : "Thread built from key discussion points."}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {["TikTok script", "Newsletter", "Blog post"].map((label) => (
            <div
              key={label}
              className="rounded-[1.15rem] border border-slate-200/80 bg-white/82 p-3 dark:border-white/10 dark:bg-white/[0.05]"
            >
              <div className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {label}
              </div>
              <div className="h-2 rounded-full bg-slate-200/90 dark:bg-white/10" />
              <div className="mt-2 h-2 w-3/4 rounded-full bg-slate-200/80 dark:bg-white/10" />
              <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-300">
                Generated from the same transcript.
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SPEAKER_SPOTLIGHT_STATES = [
  {
    id: "detect",
    label: "Speaker detection",
    title: "Detect speakers from context",
    description: "Names and roles are inferred from the real conversation.",
    proof: "Names + roles matched",
  },
  {
    id: "review",
    label: "Review workflow",
    title: "Review the uncertain moments",
    description: "Only the messy segments need your attention.",
    proof: "Focused review queue",
  },
  {
    id: "propagate",
    label: "Clean outputs",
    title: "Push clean names into outputs",
    description:
      "Corrections flow into summaries, quotes, and posts automatically.",
    proof: "Outputs stay accurate",
  },
] as const;

function SpeakerWorkflowSpotlight({
  activeState = 1,
}: {
  activeState?: number;
}) {
  const speakerRows = [
    {
      id: "r1",
      name: "Jordan Mills",
      role: "Host",
      line: "Welcome back. Today Kevin and Marcus are joining me to unpack how distributed teams actually collaborate.",
      status: activeState === 0 ? "Analyzing" : "Matched",
      flagged: false,
    },
    {
      id: "r2",
      name: "Dr. Kevin Park",
      role: activeState === 0 ? "Unknown" : "Guest",
      line: "The biggest mistake is assuming output alone tells you how well a team is working together.",
      status: activeState === 0 ? "Analyzing" : "Stable",
      flagged: false,
    },
    {
      id: "r3",
      name: activeState < 2 ? "Speaker 3" : "Marcus Webb",
      role: activeState < 2 ? "Unknown" : "Guest",
      line: "That is where identity cleanup matters, because one wrong speaker label breaks every downstream asset.",
      status:
        activeState === 0
          ? "Analyzing"
          : activeState === 1
            ? "Needs review"
            : "Resolved",
      flagged: activeState === 1,
    },
  ];

  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-950/70 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Transcript mockup
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Speaker mapping & review
          </p>
        </div>
        <div
          className={`inline-flex transition-colors items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${activeState === 1
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
            }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${activeState === 1 ? "bg-amber-400" : "bg-green-500"}`}
          />
          {activeState === 1 ? "1 review" : "All clear"}
        </div>
      </div>

      <div className="space-y-3">
        {speakerRows.map((row) => {
          return (
            <div
              key={row.id}
              className={`rounded-[1rem] border px-4 py-3.5 transition-colors duration-500 ${row.flagged
                  ? "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-500/10"
                  : "border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-slate-950/40"
                }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={row.name}
                        initial={{ opacity: 0, filter: "blur(4px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{ duration: 0.3 }}
                        className="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        {row.name}
                      </motion.span>
                    </AnimatePresence>
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={row.role}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-white/10 dark:text-slate-300"
                      >
                        {row.role}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-300">
                    {row.line}
                  </p>
                </div>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={row.status}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${row.status === "Needs review"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : row.status === "Resolved" || row.status === "Matched"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                          : row.status === "Analyzing"
                            ? "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300 animate-pulse"
                            : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
                      }`}
                  >
                    {row.status}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Navbar
function Navbar({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const links = [
    { label: "Speaker AI", href: "#speaker-intelligence" },
    { label: "How it Works", href: "#how-it-works" },
    { label: "Outputs", href: "#outputs" },
    { label: "Analysis", href: "#analysis" },
    { label: "Pricing", href: "#pricing" },
  ];
  const logoTheme = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid h-16 grid-cols-[1fr_auto] items-center md:grid-cols-[164px_1fr_220px]">
          <a
            href="#top"
            className="hidden h-12 items-center justify-center md:flex md:justify-start md:pl-6"
          >
            <BrandLogo
              showText={false}
              size="md"
              theme={logoTheme}
              className="-translate-y-px"
            />
          </a>

          <nav className="hidden md:flex items-center justify-center gap-7">
            {links.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <Link
              href="/auth/login"
              className="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Log In
            </Link>
            <Link
              href="/auth/signup"
              className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Get Started Free
            </Link>
            <LaunchThemeToggle />
          </div>

          <a
            href="#top"
            className="flex h-11 items-center justify-start md:hidden"
          >
            <BrandLogo
              showText={false}
              size="sm"
              theme={logoTheme}
              className="-translate-y-px"
            />
          </a>

          <div className="flex items-center justify-end gap-2 md:hidden">
            <LaunchThemeToggle />
            <button
              onClick={() => setOpen(!open)}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {open ? (
                <CloseIcon className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="space-y-1 border-t border-gray-100 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-950 md:hidden">
          {links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {label}
            </a>
          ))}
          <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-white/10">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="block rounded-xl border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Log In
            </Link>
            <Link
              href="/auth/signup"
              onClick={() => setOpen(false)}
              className="block text-center py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// Hero
function Hero() {
  const [activePhrase, setActivePhrase] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActivePhrase(
        (current) => (current + 1) % HERO_ROTATING_PHRASES.length,
      );
    }, 2800);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_42%,#f7f9fc_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0b1120_48%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:32px_32px,32px_32px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-56 w-[38rem] -translate-x-1/2 rounded-full bg-blue-500/18 blur-3xl dark:bg-blue-500/22" />
      <div className="pointer-events-none absolute left-[18%] top-12 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl dark:bg-cyan-500/14" />
      <div className="pointer-events-none absolute bottom-10 right-[15%] h-64 w-64 rounded-full bg-indigo-400/12 blur-3xl dark:bg-indigo-500/16" />

      <div className="relative z-10 flex min-h-[calc(100svh-4rem)] flex-col justify-between">
        <div className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="w-full">
            <motion.div
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 shadow-[0_20px_60px_-40px_rgba(37,99,235,0.5)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] dark:text-blue-200"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-cyan-300" />
              One workflow for transcript, analysis, and content
            </motion.div>
            <motion.h1
              className="mb-6 text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
            >
              <div className="flex flex-col items-center justify-center gap-y-1 sm:gap-y-2">
                <span>Upload once.</span>
                <HeroWordPill phrase={HERO_ROTATING_PHRASES[activePhrase]} />
              </div>
              <div className="mt-2 sm:mt-3 text-[0.8em]">
                Analyze clearly. Publish faster.
              </div>
            </motion.h1>

            <motion.p
              className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-blue-100/72 md:text-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16, ease: "easeOut" }}
            >
              AudioRepurpose gives you one workspace to transcribe the
              recording, review speakers, pull insights, and generate
              publish-ready drafts without bouncing between separate tools.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
            >
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-900/50"
              >
                Start Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/demo"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3.5 font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-white/70 dark:border-white/25 dark:text-white/80 dark:hover:border-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              >
                Try Demo {"->"}
              </Link>
            </motion.div>

            <motion.div
              className="mx-auto flex w-full max-w-5xl items-center justify-center overflow-x-auto pb-1"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.32, ease: "easeOut" }}
            >
              <div className="flex flex-nowrap items-center justify-center gap-2 px-1">
                {[
                  "Speaker-attributed transcript",
                  "Insights + chapters",
                  "Show notes",
                  "LinkedIn draft",
                  "Quote pulls",
                ].map((tag, index) => (
                  <motion.span
                    key={tag}
                    className="whitespace-nowrap rounded-full border border-white/70 bg-white/80 px-2.5 py-1.5 text-[13px] font-medium text-slate-600 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.4)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.42 + index * 0.05,
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    {tag}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <SocialProofStrip className="mt-auto border-b-0" />
      </div>
    </section>
  );
}

// Speaker Intelligence Section
function SpeakerIntelligenceSection() {
  const [activeStep, setActiveStep] = useState(1);

  return (
    <section
      id="speaker-intelligence"
      className="overflow-hidden bg-white py-24 dark:bg-slate-950"
    >
      <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mb-16 text-center"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">
            Speaker Intelligence
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">
            The feature no other tool ships
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base dark:text-slate-300">
            Detect speakers, review the uncertain moments, and keep every output
            correctly attributed.
          </p>
        </motion.div>

        <div className="grid items-center gap-10 lg:mx-auto lg:max-w-[78rem] lg:grid-cols-[minmax(0,32rem)_minmax(0,40rem)] lg:justify-center lg:gap-8">
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 max-w-xl lg:order-1 lg:justify-self-end"
          >
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Most of the transcript is already clean.
              </h3>
              <p className="mt-3 max-w-lg text-base leading-7 text-slate-500 dark:text-slate-300">
                The product identifies speakers automatically, isolates the few
                uncertain lines, and carries your correction into every
                downstream asset.
              </p>
            </div>
            <div className="mt-6 space-y-3">
              {SPEAKER_SPOTLIGHT_STATES.map((item, index) => {
                const active = index === activeStep;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition-all ${active
                        ? "border-blue-300 bg-white shadow-[0_26px_70px_-42px_rgba(37,99,235,0.42)] dark:border-blue-400/30 dark:bg-white/[0.04]"
                        : "border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.02]"
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300"}`}
                      >
                        <span>{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p
                            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${active ? "text-blue-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-500"}`}
                          >
                            {item.label}
                          </p>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            className="order-1 w-full lg:order-2 lg:max-w-[40rem] lg:justify-self-start"
          >
            <SpeakerWorkflowSpotlight activeState={activeStep} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// How It Works
function HowItWorks() {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    const interval = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % HOW_IT_WORKS_STEPS.length);
    }, 3600);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  const step = HOW_IT_WORKS_STEPS[activeStep] ?? HOW_IT_WORKS_STEPS[0];

  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-gray-50 py-24 dark:bg-slate-950"
    >
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
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">
            How it Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">
            From recording to content in minutes
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-base dark:text-slate-300">
            Pick your processing level once, then generate whichever content
            types you need.
          </p>
        </motion.div>

        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="space-y-4"
          >
            {HOW_IT_WORKS_STEPS.map((item, index) => {
              const active = index === activeStep;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`group w-full rounded-[1.6rem] border p-5 text-left transition-all ${active
                      ? "border-blue-300 bg-white shadow-[0_28px_70px_-38px_rgba(37,99,235,0.42)] dark:border-blue-400/30 dark:bg-white/[0.04]"
                      : "border-slate-200/80 bg-white/60 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${item.accent} shadow-lg ring-4 ${item.ring}`}
                    >
                      <item.Icon className="h-6 w-6 text-white" />
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-100 bg-white text-[10px] font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                        {item.n}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${active ? "text-blue-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-500"}`}
                      >
                        {item.eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.08 }}
            className="relative"
          >
            <div className="pointer-events-none absolute inset-x-8 bottom-5 h-20 rounded-full bg-blue-500/18 blur-3xl dark:bg-blue-500/22" />
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 24, scale: 0.985 }
                }
                animate={
                  reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: -20, scale: 1.015 }
                }
                transition={{
                  duration: reduceMotion ? 0 : 0.52,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <HowItWorksGraphic step={step} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Content Outputs Section
function ContentOutputsSection() {
  const [activeCard, setActiveCard] = useState(0);
  const [signalHeights, setSignalHeights] = useState<number[]>(
    SIGNAL_LEVELS.map((signal) => signal.base),
  );
  const [activeSignalPattern, setActiveSignalPattern] = useState<number | null>(
    null,
  );
  const [signalLeadIn, setSignalLeadIn] = useState(false);

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
        setSignalHeights(
          finalFrame || SIGNAL_LEVELS.map((signal) => signal.base),
        );
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
  const activePattern =
    activeSignalPattern !== null
      ? SYNC_SIGNAL_PATTERNS[activeSignalPattern]
      : null;

  return (
    <section
      id="outputs"
      className="py-24 bg-white overflow-hidden dark:bg-slate-950"
    >
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">
            Content Generation
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 dark:text-white">
            One recording, shaped for every channel.
          </h2>
        </motion.div>

        <div className="grid gap-8 xl:grid-cols-5 xl:items-start">
          {/* Left column - Content Menu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="xl:col-span-3"
          >
            <div className="space-y-0">
              {OUTPUT_GROUPS.map(({ title, description, items }, index) => (
                <div key={title}>
                  {index > 0 && (
                    <div className="my-5 border-t border-slate-200 dark:border-white/10" />
                  )}
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">
                        {title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {description}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map(({ icon, badgeBg, name, desc }) => {
                      const Icon = OUTPUT_ICONS[icon];
                      return (
                        <div
                          key={name}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
                        >
                          <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${badgeBg} text-white`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-950 dark:text-white">
                              {name}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                              {desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Generate your first batch here{" "}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Right column - Cycling Output Preview */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.08 }}
            className="xl:col-span-2 xl:sticky xl:top-24"
          >
            <div className="relative pt-4">
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/15" />
              <div className="relative min-h-[19rem] border-y border-slate-200 py-6 dark:border-white/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeCard}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="grid gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`h-11 w-11 rounded-2xl ${card.badgeBg} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}
                      >
                        <ActiveCardIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {card.eyebrow}
                        </p>
                        <h4 className="mt-1 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                          {card.platform}
                        </h4>
                      </div>
                      <div
                        className={`ml-auto h-8 w-8 rounded-xl bg-gradient-to-br ${card.accent} shadow-md flex-shrink-0`}
                      />
                    </div>

                    <div className="space-y-3">
                      {card.preview.map(({ label, text }, index) => (
                        <div
                          key={label}
                          className="grid grid-cols-[4.75rem_1fr] gap-3 border-b border-slate-200/80 pb-3 last:border-b-0 last:pb-0 dark:border-white/10"
                        >
                          <span className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {String(index + 1).padStart(2, "0")} {label}
                          </span>
                          <span className="text-sm leading-7 text-slate-700 dark:text-slate-300">
                            {text}
                          </span>
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
                        ? "bg-slate-900 text-white border border-slate-900 dark:border-white/10 dark:bg-white/10"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                  >
                    {c.eyebrow}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <span>Pipeline signal</span>
                  <span>Source transcript</span>
                </div>
                <div
                  className="mt-4 grid grid-cols-11 gap-2 items-end"
                  style={{ height: 104 }}
                >
                  {OUTPUT_GROUPS.flatMap((group) => group.items).map(
                    ({ icon, badgeBg, name }, index) => {
                      const Icon = OUTPUT_ICONS[icon];
                      const liveHeight = signalHeights[index];
                      const iconTravel = Math.max(
                        3,
                        Math.round(liveHeight / 10),
                      );
                      const patternFrames = activePattern?.frames.map(
                        (frame) => frame[index],
                      );
                      const patternTimes = patternFrames?.map(
                        (_, frameIndex, arr) =>
                          arr.length === 1 ? 1 : frameIndex / (arr.length - 1),
                      );
                      const iconFrames = activePattern
                        ? [
                          0,
                          ...(patternFrames || []).map(
                            (height) => -Math.max(3, Math.round(height / 10)),
                          ),
                          0,
                        ]
                        : signalLeadIn
                          ? [-Math.max(3, Math.round(liveHeight / 10))]
                          : [-iconTravel];
                      const iconTimes = activePattern
                        ? iconFrames.map((_, frameIndex, arr) =>
                          arr.length === 1
                            ? 1
                            : frameIndex / (arr.length - 1),
                        )
                        : undefined;
                      return (
                        <div
                          key={name}
                          className="flex h-full flex-col items-center justify-end"
                        >
                          <motion.div
                            className={`mb-1 flex h-8 w-8 items-center justify-center rounded-lg ${badgeBg} text-white shadow-sm`}
                            animate={{ y: iconFrames }}
                            style={{ willChange: "transform" }}
                            transition={
                              activePattern
                                ? {
                                  duration: 6,
                                  times: iconTimes,
                                  ease: "easeInOut",
                                }
                                : signalLeadIn
                                  ? { duration: 1, ease: "easeInOut" }
                                  : { duration: 0.42, ease: "easeOut" }
                            }
                          >
                            <Icon className="h-4 w-4" />
                          </motion.div>
                          <motion.div
                            className="w-full rounded-[5px] bg-gradient-to-t from-blue-500 via-sky-400 to-cyan-200"
                            animate={
                              activePattern
                                ? {
                                  height: (patternFrames || [liveHeight]).map(
                                    (height) => `${height}%`,
                                  ),
                                }
                                : { height: `${liveHeight}%` }
                            }
                            transition={
                              activePattern
                                ? {
                                  duration: 6,
                                  times: patternTimes,
                                  ease: "easeInOut",
                                }
                                : signalLeadIn
                                  ? { duration: 1, ease: "easeInOut" }
                                  : { duration: 0.42, ease: "easeOut" }
                            }
                            style={{ height: `${liveHeight}%` }}
                          />
                        </div>
                      );
                    },
                  )}
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
    <section
      id="analysis"
      className="relative overflow-hidden bg-slate-100 py-20 dark:bg-slate-950"
    >
      <AnalysisConstellationBackground />
      <div className="relative max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <span className="text-sm font-semibold uppercase tracking-widest text-blue-300">
            Analysis
          </span>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-4xl">
            Review the conversation before you turn it into more content.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-blue-100/65">
            AudioRepurpose reads the transcript like an editor would: where the
            hook landed, where the follow-up missed, and which moments deserve
            to become assets.
          </p>
        </motion.div>

        <motion.div
          className="grid gap-8 xl:grid-cols-5 xl:items-stretch"
          initial="hidden"
          whileInView="show"
          viewport={SECTION_VIEWPORT}
          variants={sectionContainer}
        >
          <motion.div variants={sectionItem} className="xl:col-span-2 h-full">
            <div className="flex h-full flex-col">
              <motion.div
                variants={sectionItem}
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200/55"
              >
                <BarChart3 className="h-4 w-4 text-blue-300" />
                Creator coaching
              </motion.div>
              <motion.h3
                variants={sectionItem}
                className="mt-4 text-4xl font-bold tracking-tight text-white"
              >
                Analytics that connect transcript quality to what you publish
                next.
              </motion.h3>
              <motion.p
                variants={sectionItem}
                className="mt-5 max-w-xl text-sm leading-7 text-blue-100/70"
              >
                Instead of just counting outputs, AudioRepurpose shows where the
                conversation created usable material, where it lost momentum,
                and what to tighten before the next draft or recording.
              </motion.p>

              <motion.div variants={sectionItem} className="mt-8 xl:mt-8">
                <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-transparent p-5">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px,24px_24px] opacity-60" />
                  <div className="relative">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">
                      Content mix
                    </p>
                    <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">
                      What this upload produced across formats
                    </h4>
                    <div className="mt-6">
                      <AnalysisContentPieChart />
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={sectionItem} className="mt-6 space-y-4">
                {[
                  {
                    Icon: Target,
                    text: "Catch weak openings, soft CTAs, and missed audience payoff before you publish.",
                  },
                  {
                    Icon: Lightbulb,
                    text: "Spot where the host should have gone deeper, clarified, or followed up.",
                  },
                  {
                    Icon: BarChart3,
                    text: "See which moments actually landed so you can repeat what works next episode.",
                  },
                ].map(({ Icon, text }) => (
                  <motion.div
                    key={text}
                    variants={sectionItem}
                    className="flex items-start gap-3 border-l border-slate-200 pl-4 dark:border-white/10"
                  >
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-white/8 dark:text-blue-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-blue-100/72">{text}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>

          <motion.div variants={sectionItem} className="xl:col-span-3 h-full">
            <div className="relative h-full rounded-[2rem] border border-white/10 bg-white/9 px-5 py-6 shadow-[0_30px_90px_-55px_rgba(15,23,42,0.85)] backdrop-blur-md sm:px-7">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_30%),linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />
              <div className="relative">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/50">
                      Coaching snapshot
                    </p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
                      What to fix, keep, or improve next
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Gaps", "Strengths", "Next actions"].map((pill) => (
                      <span
                        key={pill}
                        className="rounded-md border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-50/75"
                      >
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
                      transition={{
                        duration: 0.45,
                        delay: 0.06 * index,
                        ease: "easeOut",
                      }}
                      className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">
                        {metric.label}
                      </div>
                      <div className="mt-3 text-3xl font-bold tracking-tight text-white">
                        {metric.value}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-blue-100/65">
                        {metric.note}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">
                          Topic intensity
                        </p>
                        <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">
                          Where the conversation spends its energy
                        </h4>
                      </div>
                    </div>
                    <div className="mt-6 space-y-4">
                      {[
                        {
                          name: "AI safety",
                          width: "84%",
                          tone: "from-blue-600 to-cyan-400",
                        },
                        {
                          name: "Future of work",
                          width: "68%",
                          tone: "from-violet-600 to-indigo-400",
                        },
                        {
                          name: "Sponsor CTA",
                          width: "38%",
                          tone: "from-amber-500 to-orange-400",
                        },
                        {
                          name: "Founder story",
                          width: "56%",
                          tone: "from-emerald-500 to-lime-400",
                        },
                      ].map((item, index) => (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={SECTION_VIEWPORT}
                          transition={{
                            duration: 0.4,
                            delay: 0.08 * index,
                            ease: "easeOut",
                          }}
                        >
                          <div className="flex items-center justify-between text-sm text-blue-100/78">
                            <span>{item.name}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/45">
                              {item.width}
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <motion.div
                              className={`h-full rounded-full bg-gradient-to-r ${item.tone}`}
                              initial={{ width: 0 }}
                              whileInView={{ width: item.width }}
                              viewport={SECTION_VIEWPORT}
                              transition={{
                                duration: 0.8,
                                delay: 0.12 + index * 0.08,
                                ease: "easeOut",
                              }}
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/50">
                        Creator coaching
                      </p>
                      <h4 className="mt-1 text-lg font-semibold tracking-tight text-white">
                        What to fix or lean into next
                      </h4>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    {ANALYSIS_OPPORTUNITIES.map((item, index) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={SECTION_VIEWPORT}
                        transition={{
                          duration: 0.4,
                          delay: 0.08 * index,
                          ease: "easeOut",
                        }}
                        className="rounded-2xl border border-white/10 bg-white/8 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/48">
                            {item.type}
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.severity === "High"
                                ? "bg-rose-500/10 text-rose-200"
                                : item.severity === "Medium"
                                  ? "bg-amber-500/10 text-amber-200"
                                  : "bg-emerald-500/10 text-emerald-200"
                              }`}
                          >
                            {item.severity}
                          </span>
                        </div>
                        <h5 className="mt-2 text-sm font-semibold leading-6 text-white">
                          {item.title}
                        </h5>
                        <p className="mt-2 text-sm leading-6 text-blue-100/65">
                          {item.action}
                        </p>
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

// Pricing
function Pricing() {
  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-24 bg-gray-50 dark:bg-slate-950"
    >
      <PricingSubtleStars />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-widest">
            Pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2 dark:text-white">
            Pay only for what you process
          </h2>
          <p className="text-slate-600 mt-4 max-w-xl mx-auto text-base dark:text-slate-300">
            One pay-as-you-go workflow. Upload audio, choose analysis options,
            and generate content later only when you need it.
          </p>
        </div>

        <div className="max-w-5xl mx-auto mb-10 rounded-xl border border-slate-200 bg-transparent px-5 py-3.5 flex items-start gap-3 dark:border-white/10 dark:bg-white/[0.03]">
          <Clock className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5 dark:text-slate-400" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold">Manual by default</span> - You
            choose which analysis runs during upload, then generate content
            later from the project page so credits only go toward outputs you
            actually want.
          </p>
        </div>

        <div className="max-w-6xl mx-auto rounded-[2rem] border-2 border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
          <div className="grid gap-6 lg:grid-cols-3">
            {PAYG_SECTIONS.map(
              ({ name, price, description, features }, idx) => (
                <div
                  key={name}
                  className={`rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/50 motion-safe:animate-fade-up${idx === 1 ? "-200" : idx === 2 ? "-400" : ""}`}
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {name}
                    </h3>
                    <div className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                      {price}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
                      {description}
                    </p>
                  </div>
                  <ul className="space-y-2.5">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
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
          No subscriptions. Buy credits, upload when you need to, and trigger
          analysis or content generation only when it adds value.
        </p>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          {PRICING_MODEL_SUMMARY}
        </p>
      </div>
    </section>
  );
}

// Final CTA
function FinalCTA() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const stats = [
    { value: 11, suffix: "", label: "Content types" },
    { value: 5, suffix: " min", label: "Per episode" },
    { value: 0, suffix: "", label: "Subscriptions required" },
  ] as const;
  const logoTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 py-24 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <BrandLogo
          showText={false}
          size="lg"
          theme={logoTheme}
          className="mb-6 motion-safe:animate-fade-up"
        />
        <h2 className="mb-4 text-3xl font-bold leading-tight text-slate-900 motion-safe:animate-fade-up-200 dark:text-white md:text-4xl">
          Start Repurposing Today
        </h2>
        <p className="mb-10 text-lg leading-relaxed text-slate-600 motion-safe:animate-fade-up-400 dark:text-blue-200/70">
          Turn one recording into transcripts, insights, and 11 publish-ready
          content types.
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
            <div
              key={stat.label}
              className={`text-center motion-safe:animate-fade-in${idx === 1 ? "-200" : idx === 2 ? "-400" : ""}`}
            >
              <div className="text-base font-bold text-slate-900 dark:text-white">
                <CountUp to={stat.value} suffix={stat.suffix} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-blue-300/60">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const logoTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <footer className="border-t border-slate-200 bg-slate-100 py-14 text-slate-500 motion-safe:animate-fade-in dark:border-gray-900 dark:bg-gray-950 dark:text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <a href="#top" className="inline-flex">
              <BrandLogo theme={logoTheme} />
            </a>
            <p className="mt-4 max-w-md text-sm text-slate-500 dark:text-gray-500">
              Turn one recording into a full content suite with accurate
              speakers, clean summaries, and platform-ready outputs.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
              Product
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <a
                href="#speaker-intelligence"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Speaker Intelligence
              </a>
              <a
                href="#how-it-works"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                How it works
              </a>
              <a
                href="#outputs"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Content outputs
              </a>
              <a
                href="#analysis"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Analysis
              </a>
              <a
                href="#pricing"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Pricing
              </a>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
              Account
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <Link
                href="/auth/login"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Log In
              </Link>
              <Link
                href="/auth/signup"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Get Started Free
              </Link>
              <Link
                href="/auth/demo"
                className="block transition-colors hover:text-slate-900 dark:hover:text-gray-200"
              >
                Try Demo
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 text-xs text-slate-500 dark:text-gray-600 sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} AudioRepurpose. All rights
            reserved.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="#pricing"
              className="transition-colors hover:text-slate-700 dark:hover:text-gray-300"
            >
              Pricing
            </a>
            <Link
              href="/privacy"
              className="transition-colors hover:text-slate-700 dark:hover:text-gray-300"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-slate-700 dark:hover:text-gray-300"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Page
export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgressBar />
      <div id="top" className="min-h-screen bg-white">
        <Navbar open={mobileOpen} setOpen={setMobileOpen} />
        <main>
          <Hero />
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
