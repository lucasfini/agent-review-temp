"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpenText,
  Check,
  CheckCircle2,
  CircleCheck,
  Clock,
  CloudUpload,
  Eye,
  FileText,
  Lock,
  Mail,
  Mic,
  Monitor,
  Phone,
  PlayCircle,
  Plug,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LogoLockup } from "@/components/site/AudioRepurposeLogo";
import {
  MarketingNav,
  ParallaxVisual,
  gridStyle,
  themeTokens,
  useMarketingTheme,
  type ThemeName,
} from "@/components/site/marketing";
import { cn } from "@/lib/utils";

const SIGNUP_HREF = "/auth/signup";
const CONTACT_HREF = "/contact";
const SHOW_LEGACY_ONE_SOURCE_SECTION = false;
const SHOW_STANDALONE_SPEAKER_SECTION = false;

const NAV_LINKS = [
  { label: "Home", href: "#home", id: "home" },
  { label: "About Us", href: "#about", id: "about" },
  { label: "How it works", href: "#how-it-works", id: "how-it-works" },
  { label: "Features", href: "#features", id: "features" },
] as const;

const smoothEase = [0.16, 1, 0.3, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.58, ease: smoothEase },
  },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.04,
    },
  },
};

const slowStagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

const outputRows = [
  { label: "LinkedIn post", icon: "in", tone: "blue", checked: true },
  { label: "X thread", icon: "X", tone: "black", checked: true },
  { label: "Newsletter draft", icon: Mail, tone: "purple", checked: true },
  { label: "Blog outline", icon: FileText, tone: "green", checked: false },
  { label: "Show notes", icon: Mic, tone: "amber", checked: false },
  { label: "Short-form script", icon: PlayCircle, tone: "pink", checked: false },
  { label: "Quote captions", icon: "“”", tone: "blue", checked: false },
] as const;

function useActiveSection() {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const targets = NAV_LINKS.map((link) => link.id)
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (!targets.length) return undefined;

    const updateActiveSection = () => {
      if (window.scrollY < 120) {
        setActiveId("");
        return;
      }

      const marker = window.innerHeight * 0.38;
      const current = targets.find((target) => {
        const rect = target.getBoundingClientRect();
        return rect.top <= marker && rect.bottom >= marker;
      });

      setActiveId(current?.id ?? "");
    };

    const observer = new IntersectionObserver(
      () => updateActiveSection(),
      {
        rootMargin: "-35% 0px -55% 0px",
        threshold: 0,
      },
    );

    targets.forEach((target) => observer.observe(target));
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    updateActiveSection();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  return activeId;
}

function useSectionFocus() {
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-focus-section]"),
    );

    if (!sections.length) return undefined;

    document.documentElement.classList.add("landing-scroll-page");
    sections[0]?.classList.add("is-active");

    const ratios = new Map<HTMLElement, number>();
    const activateSection = (activeSection: HTMLElement) => {
      sections.forEach((section) => {
        section.classList.toggle("is-active", section === activeSection);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(entry.target as HTMLElement, entry.isIntersecting ? entry.intersectionRatio : 0);
        });

        const activeSection = sections.reduce<HTMLElement | null>((best, section) => {
          if (!best) return section;

          const ratio = ratios.get(section) ?? 0;
          const bestRatio = ratios.get(best) ?? 0;

          if (ratio === bestRatio) {
            const sectionDistance = Math.abs(
              section.getBoundingClientRect().top - window.innerHeight * 0.18,
            );
            const bestDistance = Math.abs(
              best.getBoundingClientRect().top - window.innerHeight * 0.18,
            );

            return sectionDistance < bestDistance ? section : best;
          }

          return ratio > bestRatio ? section : best;
        }, null);

        if (activeSection) activateSection(activeSection);
      },
      {
        rootMargin: "-18% 0px -28% 0px",
        threshold: [0, 0.25, 0.4, 0.55, 0.7],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("landing-scroll-page");
      sections.forEach((section) => section.classList.remove("is-active"));
    };
  }, []);
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-[var(--blue)] via-[#4F6FFF] to-[var(--purple)] bg-clip-text text-transparent">
      {children}
    </span>
  );
}

function PageShell({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: ThemeName;
}) {
  return (
    <main
      data-theme={theme}
      style={themeTokens[theme]}
      className="landing-scroll-root relative bg-[var(--bg-home)] text-[var(--text-main)] transition-colors duration-300"
    >
      <div className="relative z-10">{children}</div>
    </main>
  );
}

function SectionFrame({
  id,
  compact = false,
  band = "a",
  grid = false,
  hero = false,
  className,
  children,
}: {
  id?: string;
  compact?: boolean;
  band?: "home" | "a" | "b" | "warm";
  grid?: boolean;
  hero?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const background = {
    home: "var(--bg-home)",
    a: "var(--bg-a)",
    b: "var(--bg-b)",
    warm: "var(--bg-warm)",
  }[band];

  const sectionStyle: CSSProperties = {
    ...(grid ? gridStyle : {}),
    backgroundColor: background,
  };

  return (
    <section
      id={id}
      data-focus-section={id ?? undefined}
      className={cn(
        "page-section",
        hero && "hero-section",
        compact ? "" : "",
        className,
      )}
      style={sectionStyle}
    >
      {hero ? (
        <div className="hero-media" aria-hidden="true">
          <Image
            src="/images/audio-repurpose-hero-bg.webp"
            alt=""
            fill
            priority
            quality={95}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="section-container">
        <div className="section-inner">{children}</div>
      </div>
    </section>
  );
}

function PillBadge({
  children,
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--blue)] shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur",
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

function PrimaryButton({
  href = SIGNUP_HREF,
  children,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2.5 rounded-[12px] bg-[linear-gradient(135deg,var(--blue),var(--purple))] px-5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(20,99,255,0.22)] transition duration-200 hover:-translate-y-px hover:shadow-[0_18px_42px_rgba(20,99,255,0.28)] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRight
        aria-hidden="true"
        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function SecondaryButton({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--text)] shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-px hover:bg-[var(--surface-soft)] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fluid-card border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] ring-1 ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function IconTile({
  Icon,
  tone = "blue",
  className,
}: {
  Icon: LucideIcon;
  tone?: "blue" | "purple" | "green" | "amber";
  className?: string;
}) {
  const toneClass = {
    blue: "bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)]",
    purple: "bg-[color-mix(in_srgb,var(--purple)_12%,var(--surface))] text-[var(--purple)]",
    green: "bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)]",
    amber: "bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-[var(--warning)]",
  }[tone];

  return (
    <span
      className={cn(
        "card-icon inline-flex shrink-0 items-center justify-center rounded-xl",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </span>
  );
}

function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#AFC2E8] text-[var(--blue)]">
        <Check aria-hidden="true" className="h-3 w-3" />
      </span>
      {children}
    </span>
  );
}

function NumberBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="step-badge inline-flex shrink-0 items-center justify-center rounded-full bg-[#F2F6FF] text-sm font-bold text-[var(--blue)] shadow-inner">
      {children}
    </span>
  );
}

function Waveform({ className }: { className?: string }) {
  const bars = [10, 17, 12, 23, 14, 20, 9, 26, 15, 28, 11, 21, 13, 25, 16, 19, 10, 26, 14, 22, 10, 18, 12, 24, 14, 20, 9, 17];

  return (
    <div className={cn("flex h-7 items-center gap-1", className)} aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="w-1 rounded-full bg-[linear-gradient(180deg,#1463FF,#8B5CF6)]"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function OutputIcon({
  icon,
  tone,
}: {
  icon: string | LucideIcon;
  tone: "blue" | "black" | "purple" | "green" | "amber" | "pink";
}) {
  const toneClass = {
    blue: "bg-[#0A66C2] text-white",
    black: "bg-black text-white",
    purple: "bg-[#7C3AED] text-white",
    green: "bg-[#20B26B] text-white",
    amber: "bg-[#F59E0B] text-white",
    pink: "bg-[#EC4899] text-white",
  }[tone];

  const Icon = typeof icon === "string" ? null : icon;

  return (
    <span
      className={cn(
        "output-icon inline-flex shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        toneClass,
      )}
      aria-hidden="true"
    >
      {Icon ? <Icon className="h-4 w-4" /> : typeof icon === "string" ? icon : null}
    </span>
  );
}

function ConnectorPath({
  d,
  className,
}: {
  d: string;
  className?: string;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeDasharray="4 7"
      strokeLinecap="round"
      strokeWidth="2"
      className={cn("text-[#B8C7EA] opacity-80", className)}
    />
  );
}

function HeroSection() {
  return (
    <SectionFrame id="home" compact band="home" hero>
      <div className="hero-layout">
        <motion.div variants={stagger} initial="hidden" animate="show" className="hero-content min-w-0">
          <motion.h1
            variants={fadeUp}
            className="hero-title font-serif text-[var(--text)]"
          >
            <span className="hero-title-main">Make every recording</span>
            <span className="hero-title-accent">publish-ready.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="hero-subtitle"
          >
            Turn calls, demos, webinars, and updates into transcripts, summaries, insights, quotes, and publish-ready drafts.
          </motion.p>
          <motion.div variants={fadeUp} className="hero-actions">
            <PrimaryButton href={SIGNUP_HREF} className="hero-primary">
              Sign up for free
            </PrimaryButton>
            <p className="text-sm font-medium text-[var(--muted)]">
              No credit card required
            </p>
          </motion.div>
        </motion.div>
      </div>
    </SectionFrame>
  );
}

function OneSourceSection() {
  return (
    <SectionFrame id="legacy-product-preview" compact band="b" grid>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.22 }}
        className="text-center"
      >
        <motion.div variants={fadeUp}>
          <PillBadge icon={Sparkles}>ONE SOURCE. ENDLESS POSSIBILITIES.</PillBadge>
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="section-title mx-auto mt-3 font-serif font-semibold"
        >
          One source. Many <GradientText>review-ready assets.</GradientText>
        </motion.h2>
        <motion.p variants={fadeUp} className="section-copy mx-auto mt-3 max-w-2xl text-[var(--muted)]">
          Upload once. We turn your conversations into polished drafts{" "}
          <br className="hidden sm:block" />
          across every channel. You choose only the outputs you need.
        </motion.p>
      </motion.div>

      <motion.div
        variants={slowStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.18 }}
        className="mt-7 grid items-start gap-[var(--card-gap)] xl:grid-cols-[0.9fr_1.35fr_0.95fr]"
      >
        <motion.div variants={fadeUp} className="relative order-1">
          <Surface className="p-[var(--card-padding)]">
            <h3 className="text-lg font-bold">Source</h3>
            <div className="mt-3 rounded-2xl border border-[#9EB7EA] bg-[var(--surface-soft)] p-[calc(var(--card-padding)*0.72)] shadow-[0_10px_30px_rgba(20,99,255,0.08)]">
              <div className="flex items-center gap-4">
                <IconTile Icon={AudioLines} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Customer interview</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">ACME Inc.</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                    <Clock aria-hidden="true" className="h-4 w-4" />
                    45:21 · MP4
                  </p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#BBD0F3] bg-[var(--surface)] text-[var(--blue)]">
                  <Check aria-hidden="true" className="h-4 w-4" />
                </span>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-[var(--muted)]">Recent sources</p>
              <div className="mt-2.5 overflow-hidden rounded-2xl border border-[var(--border)]">
                {[
                  ["Founder update", "32:18 · MP3"],
                  ["Webinar: Q2 roadmap", "58:42 · MP4"],
                  ["Podcast episode", "47:10 · MP3"],
                ].map(([title, meta]) => (
                  <div key={title} className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 last:border-b-0">
                    <AudioLines aria-hidden="true" className="h-5 w-5 text-[var(--blue)]" />
                    <div>
                      <p className="text-sm font-bold">{title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <SecondaryButton href={SIGNUP_HREF} className="mt-3 h-10 w-full gap-2">
              <CloudUpload aria-hidden="true" className="h-4 w-4" />
              Upload new source
            </SecondaryButton>
          </Surface>

          <svg
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="absolute -right-24 top-28 hidden h-32 w-32 overflow-visible xl:block"
          >
            <ConnectorPath d="M5 10 C70 10 52 98 112 70" />
            <circle cx="112" cy="70" r="16" fill="white" stroke="#E3E8F3" />
            <path d="M106 70h11m-4-4 4 4-4 4" stroke="#1463FF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        <motion.div variants={fadeUp} className="relative z-10 order-3 xl:order-2">
          <Surface className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-4">
                <OutputIcon icon="in" tone="blue" />
                <h3 className="text-lg font-bold">LinkedIn post</h3>
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-[#F1F6FF] px-3 py-2 text-sm font-semibold text-[var(--blue)]">
                <Eye aria-hidden="true" className="h-4 w-4" />
                Preview
              </span>
            </div>
            <article className="space-y-2 p-4 text-sm leading-[1.55] text-[var(--text)]">
              <p>We asked 50 enterprise teams what slows them down.</p>
              <p>The answer wasn’t more tools—it was context.</p>
              <div>
                <p>Here are 3 patterns that stood out:</p>
                <ul className="mt-1.5 space-y-1 pl-5">
                  <li className="list-disc marker:text-[var(--blue)]">Knowledge lives in calls, not docs</li>
                  <li className="list-disc marker:text-[var(--blue)]">Teams repeat the same questions</li>
                  <li className="list-disc marker:text-[var(--blue)]">Great insights never make it public</li>
                </ul>
              </div>
              <p>The fix isn’t more content.</p>
              <p>It’s making the right content repeatable.</p>
              <p>(Full breakdown in the comments 👇)</p>
            </article>
            <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-soft)] p-[calc(var(--card-padding)*0.72)] sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[var(--success)]" />
                220 words · Ready to review
              </span>
              <SecondaryButton href={SIGNUP_HREF} className="h-10 px-4 text-sm">
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                Open full preview
              </SecondaryButton>
            </div>
          </Surface>
        </motion.div>

        <motion.div variants={fadeUp} className="relative z-10 order-2 xl:order-3">
          <Surface className="p-[var(--card-padding)]">
            <h3 className="text-lg font-bold">Choose outputs</h3>
            <div className="mt-3 space-y-1.5">
              {outputRows.map((row) => (
                <div
                  key={row.label}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left"
                >
                  <OutputIcon icon={row.icon} tone={row.tone} />
                  <span className="min-w-0 flex-1 text-sm font-bold">{row.label}</span>
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md border",
                      row.checked
                        ? "border-[#1463FF] bg-[#1463FF] text-white"
                        : "border-[#D8E0EF] bg-[var(--surface)]",
                    )}
                    aria-hidden="true"
                  >
                    {row.checked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </div>
              ))}
            </div>
            <PrimaryButton href={SIGNUP_HREF} className="mt-3 h-10 w-full">
              Preview selected outputs
            </PrimaryButton>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-[var(--muted)]">
              <Lock aria-hidden="true" className="h-4 w-4" />
              You’re in control. Choose only what you need.
            </p>
          </Surface>
        </motion.div>
      </motion.div>
    </SectionFrame>
  );
}

function AboutSection() {
  const aboutOutputs = [
    ["Speaker transcript", "Attribution captured", "blue", AudioLines],
    ["Key decisions", "Pulled from source", "purple", CheckCircle2],
    ["Customer language", "Quotes preserved", "green", "“”"],
    ["Objections", "Tagged for follow-up", "amber", FileText],
    ["Topic themes", "Clustered by signal", "blue", Sparkles],
    ["Open questions", "Ready for review", "pink", CircleCheck],
  ] as const;

  const benefits = [
    ["Capture context before it disappears", Clock],
    ["Keep evidence tied to the source", FileText],
    ["Share the same story across the team", CheckCircle2],
  ] as const;

  return (
    <SectionFrame id="about" compact band="warm" className="about-section">
      <div className="section-grid items-center xl:grid-cols-[0.95fr_1.05fr]">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.18 }}
          className="max-w-[660px]"
        >
          <motion.div variants={fadeUp}>
            <PillBadge icon={Sparkles} className="normal-case tracking-normal">
              About AudioRepurpose
            </PillBadge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="section-title mt-3 font-serif font-semibold"
          >
            Your conversations are full of <GradientText>usable signal.</GradientText>
          </motion.h2>
          <motion.p variants={fadeUp} className="section-copy mt-4 max-w-[620px] text-[var(--muted)]">
            Product feedback, sales objections, founder points of view, and customer language usually stay trapped in recordings. AudioRepurpose turns those moments into a source of record your team can trust before anyone starts drafting.
          </motion.p>
          <motion.p variants={fadeUp} className="section-copy mt-3 max-w-[580px] font-semibold text-[var(--text)]">
            Start with the conversation, keep the context attached, and decide what is worth using.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryButton>Start free</PrimaryButton>
            <span className="text-sm font-medium text-[var(--muted)]">
              Built for teams that want useful content without losing the proof behind it.
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          variants={slowStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.16 }}
          className="grid gap-[var(--card-gap)]"
        >
          <motion.div variants={fadeUp}>
            <Surface className="p-[var(--card-padding)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--blue)]">
                    Source intelligence
                  </p>
                  <h3 className="mt-2 text-2xl font-bold">Customer call · 45:21</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">Product feedback with ACME Inc.</p>
                </div>
                <IconTile Icon={AudioLines} tone="blue" className="h-12 w-12" />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {aboutOutputs.map(([label, status, tone, icon]) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <OutputIcon icon={icon} tone={tone} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{label}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{status}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--blue)_18%,var(--border))] bg-[color-mix(in_srgb,var(--blue)_7%,var(--surface))] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                The recording becomes a shared reference, not another forgotten file.
              </div>
            </Surface>
          </motion.div>

          <motion.div variants={fadeUp} className="grid gap-[var(--card-gap)] md:grid-cols-3">
            {benefits.map(([label, Icon]) => (
              <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-[calc(var(--card-padding)*0.6)] shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
                <Icon aria-hidden="true" className="h-4 w-4 text-[var(--blue)]" />
                <p className="mt-2 text-sm font-bold">{label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </SectionFrame>
  );
}

function SpeakerSection() {
  const speakerFeatures = [
    { title: "Detect speakers from context", icon: AudioLines, tone: "blue" },
    { title: "Infer names and roles", icon: User, tone: "purple" },
    { title: "Flag uncertain moments", icon: CheckCircle2, tone: "amber" },
    { title: "Carry corrections everywhere", icon: Sparkles, tone: "green" },
  ] as const;

  const suggestedMatches = [
    ["Mark", "Head of Sales", "72%", "M"],
    ["Sarah", "Customer Success", "18%", "S"],
    ["Unknown speaker", "", "10%", "?"],
  ] as const;

  return (
    <SectionFrame id="speaker-intelligence" compact band="a" className="speaker-section">
      <div className="speaker-grid section-grid items-center xl:grid-cols-[minmax(0,1.04fr)_minmax(380px,0.78fr)]">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.18 }}
          className="speaker-copy"
        >
          <motion.div variants={fadeUp}>
            <PillBadge icon={AudioLines} className="normal-case tracking-normal">
              Speaker Intelligence
            </PillBadge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="section-title mt-4 max-w-3xl font-serif font-semibold text-[var(--text)]"
          >
            <span className="block">Speaker accuracy</span>
            <span className="block">that protects every</span>
            <span className="block"><GradientText>downstream draft.</GradientText></span>
          </motion.h2>
          <motion.p variants={fadeUp} className="section-copy mt-4 max-w-xl text-[var(--muted)]">
            AudioRepurpose keeps every quote, summary, and post tied to the right speaker, so teams can publish with confidence instead of cleaning up attribution mistakes later.
          </motion.p>
          <motion.div variants={slowStagger} className="mt-6 grid gap-[var(--card-gap)] sm:grid-cols-2">
            {speakerFeatures.map((feature) => (
              <motion.div key={feature.title} variants={fadeUp}>
                <div className="flex h-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-[calc(var(--card-padding)*0.72)] shadow-[0_12px_32px_rgba(15,23,42,0.045)]">
                  <IconTile Icon={feature.icon} tone={feature.tone} className="h-9 w-9 rounded-xl" />
                  <p className="text-sm font-bold leading-5 text-[var(--text)]">{feature.title}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.28 }}
          className="speaker-card-wrap"
        >
          <Surface className="ml-auto w-full max-w-[460px] p-[var(--card-padding)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <IconTile Icon={AudioLines} className="h-10 w-10" />
                <h3 className="text-lg font-bold text-[var(--text)]">Review speaker match</h3>
              </div>
              <span className="rounded-full bg-[color-mix(in_srgb,var(--warning)_16%,var(--surface))] px-3 py-1 text-[11px] font-bold text-[#B7791F]">
                Low confidence
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">00:47</p>
                <p className="text-sm font-bold text-[var(--text)]">Speaker unclear</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text)]">
                “I think the biggest lift is getting this into the hands of more reps, faster.”
              </p>
            </div>

            <div className="mt-4">
              <p className="text-sm font-bold text-[var(--text)]">Suggested matches</p>
              <div className="mt-3 grid gap-2">
                {suggestedMatches.map(([name, role, percent, avatar], index) => (
                  <div
                    key={name}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
                      index === 0
                        ? "border-[color-mix(in_srgb,var(--blue)_42%,var(--border))] bg-[color-mix(in_srgb,var(--blue)_8%,var(--surface))]"
                        : "border-[var(--border)] bg-[var(--surface)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                        index === 0 ? "bg-[var(--blue)]" : "bg-[color-mix(in_srgb,var(--muted)_55%,var(--surface))]",
                      )}
                    >
                      {avatar}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[var(--text)]">{name}</span>
                      {role ? <span className="block text-xs text-[var(--muted)]">{role}</span> : null}
                    </span>
                    <span className="text-sm font-bold text-[var(--muted)]">{percent}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--blue),var(--purple))] text-sm font-bold text-white shadow-[0_14px_32px_rgba(20,99,255,0.22)]"
            >
              Speaker confirmed
            </div>
          </Surface>
        </motion.div>
      </div>
    </SectionFrame>
  );
}

function FeaturesSection() {
  const featureOutputs = [
    ["Transcript brief", FileText, "blue", true],
    ["Insight digest", Sparkles, "purple", true],
    ["Quote bank", "“”", "green", true],
    ["LinkedIn draft", "in", "blue", true],
    ["Newsletter draft", Mail, "purple", true],
    ["Show notes", Mic, "amber", false],
    ["Blog outline", FileText, "green", false],
    ["Short-form script", PlayCircle, "pink", false],
  ] as const;

  const featureModules = [
    {
      title: "Source-backed transcripts",
      body: "Speaker labels, timestamps, and source context stay attached to generated assets.",
      icon: AudioLines,
      tone: "blue",
    },
    {
      title: "Analysis brief",
      body: "Summaries, topics, decisions, objections, and opportunities are pulled into one review surface.",
      icon: FileText,
      tone: "purple",
    },
    {
      title: "Reusable angles",
      body: "Find the ideas, customer language, and proof points that can support stronger campaigns.",
      icon: Sparkles,
      tone: "blue",
    },
    {
      title: "Output controls",
      body: "Choose the formats that match the source instead of generating every possible draft.",
      icon: CheckCircle2,
      tone: "green",
    },
    {
      title: "Voice and tone controls",
      body: "Generate with a consistent voice, then tune the draft for the channel and audience.",
      icon: SlidersHorizontal,
      tone: "purple",
    },
    {
      title: "Approval-ready drafts",
      body: "Keep review, edits, and final decisions in the workflow before anything leaves the workspace.",
      icon: CircleCheck,
      tone: "green",
    },
  ] as const;

  return (
    <SectionFrame id="features" compact band="a" className="features-section">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="text-center"
      >
        <motion.div variants={fadeUp}>
          <PillBadge icon={Sparkles}>FEATURES</PillBadge>
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="section-title mx-auto mt-3 font-serif font-semibold"
        >
          Control what gets generated,
          <br className="hidden sm:block" /> reviewed, and <GradientText>used.</GradientText>
        </motion.h2>
        <motion.p variants={fadeUp} className="section-copy mx-auto mt-2.5 max-w-2xl text-[var(--muted)]">
          Features are organized around the editing loop: understand the source, select the right outputs, tune the voice, and approve the drafts that are worth shipping.
        </motion.p>
      </motion.div>

      <motion.div
        variants={slowStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.14 }}
        className="features-layout mt-8 grid items-start gap-[var(--section-gap)]"
      >
        <motion.div variants={fadeUp}>
          <Surface className="p-[var(--card-padding)]">
            <h3 className="text-lg font-bold">Configure the content kit</h3>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {featureOutputs.map(([label, icon, tone, checked]) => (
                <div
                  key={label}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left"
                >
                  <OutputIcon icon={icon} tone={tone} />
                  <span className="min-w-0 flex-1 text-sm font-bold">{label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md border",
                      checked
                        ? "border-[#1463FF] bg-[#1463FF] text-white"
                        : "border-[#D8E0EF] bg-[var(--surface)]",
                    )}
                  >
                    {checked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </div>
              ))}
            </div>
            <PrimaryButton href={SIGNUP_HREF} className="mt-3 h-10 w-full">
              Generate selected kit
            </PrimaryButton>
          </Surface>
        </motion.div>

        <motion.div variants={fadeUp} className="grid gap-[var(--card-gap)] sm:grid-cols-2 xl:grid-cols-3">
          {featureModules.map(({ title, body, icon, tone }) => (
            <Surface key={title} className="p-[var(--card-padding)]">
              <IconTile Icon={icon} tone={tone} />
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1.5 text-[var(--muted)]">{body}</p>
            </Surface>
          ))}
        </motion.div>
      </motion.div>
    </SectionFrame>
  );
}

function HowItWorksSection() {
  return (
    <SectionFrame id="how-it-works" compact band="b" className="how-section">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.22 }}
        className="section-header"
      >
        <motion.div variants={fadeUp}>
          <PillBadge>HOW IT WORKS</PillBadge>
        </motion.div>
        <motion.h2
          variants={fadeUp}
          className="section-title mx-auto mt-3 font-serif font-semibold"
        >
          From raw source to
          <br />
          reviewed drafts in <GradientText>3 steps.</GradientText>
        </motion.h2>
        <motion.p variants={fadeUp} className="section-subtitle">
          A focused path from recording to reviewed assets.
        </motion.p>
      </motion.div>

      <motion.div
        variants={slowStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="workflow-showcase"
      >
        <motion.div variants={fadeUp} className="workflow-step">
          <ProcessAddSource />
        </motion.div>
        <ProcessArrow />
        <motion.div variants={fadeUp} className="workflow-step">
          <ProcessRunSystem />
        </motion.div>
        <ProcessArrow />
        <motion.div variants={fadeUp} className="workflow-step">
          <ProcessPublishOutputs />
        </motion.div>
      </motion.div>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="workflow-proof-line"
      >
        <Sparkles aria-hidden="true" className="h-5 w-5 text-[var(--blue)]" />
        Source captured. Context extracted. Drafts ready for review.
      </motion.div>
    </SectionFrame>
  );
}

function ProductExpansionSection() {
  const productAreas = [
    {
      title: "Upload",
      body: "Upload audio, import source files, choose modules, and keep source context attached.",
      href: "/product/upload",
      icon: CloudUpload,
      tone: "amber" as const,
    },
    {
      title: "Teams",
      body: "Collaborate across roles, workspaces, shared assets, and review flows.",
      href: "/product/teams",
      icon: Users,
      tone: "green" as const,
    },
    {
      title: "Studio",
      body: "Manage profiles, voices, campaign plans, and reusable brand context.",
      href: "/product/studio",
      icon: Sparkles,
      tone: "purple" as const,
    },
    {
      title: "Library",
      body: "Save drafts, collections, reusable assets, and approved content.",
      href: "/product/library",
      icon: BookOpenText,
      tone: "blue" as const,
    },
    {
      title: "Integrations",
      body: "Connect supported tools and bring external source material into the workflow.",
      href: "/product/integrations",
      icon: Plug,
      tone: "purple" as const,
    },
    {
      title: "Analysis",
      body: "Review transcripts, extract insights, coach quality, and define goals.",
      href: "/product/analysis",
      icon: TrendingUp,
      tone: "green" as const,
    },
  ];

  return (
    <SectionFrame id="product-overview" compact band="b" grid className="features-section">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="text-center"
      >
        <motion.div variants={fadeUp}>
          <PillBadge icon={Sparkles}>EXPLORE THE PRODUCT</PillBadge>
        </motion.div>
        <motion.h2 variants={fadeUp} className="section-title mx-auto mt-3 font-serif font-semibold">
          Explore each <GradientText>product layer.</GradientText>
        </motion.h2>
        <motion.p variants={fadeUp} className="section-copy mx-auto mt-2.5 max-w-2xl text-[var(--muted)]">
          Each page focuses on a different part of the workspace, from upload and team review to reusable context, storage, integrations, and analysis.
        </motion.p>
      </motion.div>

      <ParallaxVisual distance={18} rotate={0} className="mt-8">
        <motion.div
          variants={slowStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.14 }}
          className="grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3"
        >
          {productAreas.map(({ title, body, href, icon, tone }) => (
            <motion.div key={title} variants={fadeUp}>
              <Link
                href={href}
                className="group block h-full rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                <Surface className="flex h-full flex-col p-[var(--card-padding)]">
                  <IconTile Icon={icon} tone={tone} />
                  <h3 className="mt-4 text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-[var(--blue)] transition group-hover:translate-x-0.5">
                    View page
                    <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Surface>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </ParallaxVisual>

      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} className="mt-6 flex justify-center">
        <SecondaryButton href="/product/upload" className="h-11 rounded-full px-6">
          Start with Upload
        </SecondaryButton>
      </motion.div>
    </SectionFrame>
  );
}

function ProcessArrow() {
  return (
    <div className="workflow-arrow" aria-hidden="true">
      <ArrowRight />
    </div>
  );
}

function ProcessAddSource() {
  const sourceInputs = [
    { label: "Customer call", mark: Phone, tone: "blue" },
    { label: "Webinar", mark: Video, tone: "blue" },
    { label: "Demo", mark: Monitor, tone: "blue" },
    { label: "Slack note", mark: Zap, tone: "amber" },
  ] as const;

  return (
    <div className="workflow-card workflow-card-source">
      <div className="workflow-card-header">
        <NumberBadge>1</NumberBadge>
        <h3 className="workflow-card-title">Add the source</h3>
      </div>
      <p className="workflow-card-copy">
        Upload a recording or bring in source material from connected tools.
      </p>

      <div className="source-picker">
        <p className="source-label">Start from the source your team already has</p>
        <div className="source-grid">
          {sourceInputs.map(({ label, mark, tone }) => {
            const Mark = mark;
            const toneClass = {
              blue: "source-chip-icon-blue",
              purple: "source-chip-icon-purple",
              red: "source-chip-icon-red",
              green: "source-chip-icon-green",
              amber: "source-chip-icon-amber",
            }[tone];

            return (
              <div key={label} className="source-chip">
                <span className={cn("source-chip-icon", toneClass)}>
                  {typeof Mark === "string" ? (
                    <span className="font-bold">{Mark}</span>
                  ) : (
                    <Mark aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>
                <span className="source-chip-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="upload-dropzone">
        <CloudUpload aria-hidden="true" className="h-5 w-5 text-[var(--blue)]" />
        <div>
          <p>Drag &amp; drop a file</p>
          <span>MP4, MOV, MP3, WAV, M4A</span>
        </div>
      </div>
    </div>
  );
}

function WorkflowTranscriptEntry({
  time,
  speaker,
  children,
}: {
  time: string;
  speaker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="transcript-entry">
      <p>
        <span className="transcript-time">{time}</span>
        <span className="transcript-speaker">{speaker}</span>
      </p>
      <p className="transcript-copy">{children}</p>
    </div>
  );
}

function ProcessRunSystem() {
  const insights = [
    "Speaker attribution",
    "Decision summary",
    "Customer language",
  ] as const;

  const topics = [
    "Pricing feedback",
    "Buying objections",
    "Expansion signals",
  ] as const;

  return (
    <div className="workflow-card workflow-card-system workflow-card--center">
      <div className="workflow-card-header">
        <NumberBadge>2</NumberBadge>
        <h3 className="workflow-card-title">Extract the signal</h3>
      </div>

      <div className="content-system-panel">
        <div className="product-panel transcript-panel">
          <div className="product-panel-header">
            <p>Transcript</p>
            <span>AI</span>
          </div>
          <WorkflowTranscriptEntry time="00:12" speaker="Speaker 1">
            Thanks for joining today. What slowed the rollout down?
          </WorkflowTranscriptEntry>
          <WorkflowTranscriptEntry time="00:28" speaker="Speaker 2">
            The team understood the value, but the handoff between sales and success was unclear.
          </WorkflowTranscriptEntry>

          <div className="workflow-waveform-row">
            <span className="workflow-play-button">
              <PlayCircle aria-hidden="true" className="h-4 w-4" />
            </span>
            <Waveform className="workflow-waveform" />
            <span className="workflow-time">12:05</span>
          </div>
        </div>

        <div className="product-panel summary-panel">
          <div className="product-panel-header">
            <p>Summary</p>
          </div>
          <p className="summary-copy">
            A customer rollout stalled because the team lacked a clear post-sale handoff.
          </p>
          <div className="summary-divider" />
          <p className="insights-title">Key insights</p>
          <div className="insight-list">
            {insights.map((insight) => (
              <p key={insight}>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--blue)]" />
                {insight}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="detected-topics">
        <p>
          <Sparkles aria-hidden="true" className="h-4 w-4 text-[#7C3AED]" />
          Detected topics
        </p>
        <div>
          {topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkflowOutputTile({
  label,
  icon,
  tone,
  tileColor,
}: {
  label: string;
  icon: string | LucideIcon;
  tone: "blue" | "black" | "purple" | "green" | "amber" | "pink";
  tileColor: string;
}) {
  return (
    <div
      className="output-tile"
      style={{ "--tile-color": tileColor } as CSSProperties}
    >
      <OutputIcon icon={icon} tone={tone} />
      <p className="output-tile-label">{label}</p>
      <span className="output-status">Ready</span>
    </div>
  );
}

function ProcessPublishOutputs() {
  const outputs = [
    { label: "LinkedIn post", icon: "in", tone: "blue", tileColor: "#0A66C2" },
    { label: "X thread", icon: "X", tone: "black", tileColor: "#050505" },
    { label: "Newsletter draft", icon: Mail, tone: "purple", tileColor: "#7C3AED" },
    { label: "Blog draft", icon: FileText, tone: "green", tileColor: "#22B573" },
  ] as const;

  return (
    <div className="workflow-card workflow-card-outputs workflow-card--outputs">
      <div className="workflow-card-header">
        <NumberBadge>3</NumberBadge>
        <h3 className="workflow-card-title">Review the drafts</h3>
      </div>
      <p className="workflow-card-copy">
        Edit, approve, and move the strongest assets into your content workflow.
      </p>
      <div className="output-grid">
        {outputs.map((output) => (
          <WorkflowOutputTile
            key={output.label}
            label={output.label}
            icon={output.icon}
            tone={output.tone}
            tileColor={output.tileColor}
          />
        ))}
      </div>
    </div>
  );
}

function FinalConversionSection({ theme }: { theme: ThemeName }) {
  return (
    <SectionFrame id="final-cta" compact band="b" grid className="final-cta-section">
      <div className="grid gap-[var(--card-gap)]">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.16 }}
        >
          <motion.div variants={fadeUp}>
            <Surface className="grid overflow-hidden p-0 xl:grid-cols-[0.48fr_0.52fr]">
              <div className="p-[var(--card-padding)]">
                <h2 className="section-title font-serif font-semibold">
                  Put the next
                  <br />
                  useful conversation
                  <br />
                  <GradientText>to work.</GradientText>
                </h2>
                <p className="section-copy mt-4 max-w-[480px] text-[var(--muted)]">
                  Start with one recording, verify the source, and move the strongest ideas into review-ready assets your team can actually use.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <PrimaryButton>Start free</PrimaryButton>
                  <SecondaryButton href={CONTACT_HREF}>Book a demo</SecondaryButton>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2.5">
                  <CheckLine>No credit card required</CheckLine>
                  <CheckLine>Cancel anytime</CheckLine>
                </div>
              </div>
              <div className="relative min-h-[260px] overflow-hidden xl:min-h-[360px]">
                <Image
                  src="/launch/final-team-photo.jpg"
                  alt="A professional team reviewing content on a laptop in a bright office."
                  fill
                  loading="eager"
                  quality={95}
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover object-[center_42%]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 hidden w-1/3 bg-gradient-to-r from-[var(--surface)] to-transparent xl:block"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/35 to-transparent dark:from-black/25"
                />
              </div>
            </Surface>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-4">
            <Surface className="grid gap-0 overflow-hidden p-0 md:grid-cols-3">
              <FeatureStripItem
                Icon={CloudUpload}
                title="Upload or import"
                body="Start from meetings, calls, webinars, or supported sources."
              />
              <FeatureStripItem
                Icon={Sparkles}
                title="Find the signal"
                body="Surface ideas, quotes, decisions, and useful angles."
                tone="purple"
              />
              <FeatureStripItem
                Icon={CircleCheck}
                title="Approve the assets"
                body="Edit and ship only the drafts that fit the source."
                tone="purple"
                last
              />
            </Surface>
          </motion.div>
        </motion.div>

        <motion.footer
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.16 }}
        >
          <Surface className="overflow-hidden p-0">
            <div className="grid gap-[var(--card-gap)] p-[var(--card-padding)] xl:grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr_0.85fr]">
              <div className="xl:border-r xl:border-[var(--border)] xl:pr-10">
                <LogoLockup size="sm" theme={theme} />
                <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--muted)]">
                  AI-powered content repurposing for teams
                  <br />
                  that turn conversations into impact.
                </p>
                <Link
                  href="https://www.linkedin.com"
                  className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text)] transition hover:-translate-y-0.5 hover:text-[var(--blue)]"
                  aria-label="LinkedIn"
                >
                  in
                </Link>
              </div>
              <FooterColumn
                title="Product"
                links={[
                  ["Upload", "/product/upload"],
                  ["Teams", "/product/teams"],
                  ["Studio", "/product/studio"],
                  ["Library", "/product/library"],
                  ["Integrations", "/product/integrations"],
                  ["Analysis", "/product/analysis"],
                ]}
              />
              <FooterColumn
                title="Resources"
                links={[
                  ["Blog", CONTACT_HREF],
                  ["Webinars", CONTACT_HREF],
                  ["Help center", CONTACT_HREF],
                ]}
              />
              <FooterColumn
                title="Company"
                links={[
                  ["About us", "#about"],
                  ["Privacy policy", "/privacy"],
                  ["Terms of service", "/terms"],
                ]}
              />
              <div className="xl:border-l xl:border-[var(--border)] xl:pl-10">
                <h3 className="text-sm font-bold">Connect</h3>
                <div className="mt-4 flex gap-3">
                  <SocialIcon href="https://www.linkedin.com" label="LinkedIn" className="bg-[#0A66C2] text-white">
                    in
                  </SocialIcon>
                  <SocialIcon href="https://x.com" label="X" className="bg-black text-white">
                    X
                  </SocialIcon>
                  <SocialIcon href="mailto:support@audiorepurpose.com" label="Email" className="bg-[#7C3AED] text-white">
                    <Mail aria-hidden="true" className="h-4 w-4" />
                  </SocialIcon>
                </div>
              </div>
            </div>
            <div className="border-t border-[var(--border)] px-[var(--card-padding)] py-3 text-sm text-[var(--muted)]">
              © 2025 AudioRepurpose. All rights reserved.
            </div>
          </Surface>
        </motion.footer>
      </div>
    </SectionFrame>
  );
}

function FeatureStripItem({
  Icon,
  title,
  body,
  tone = "blue",
  last,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  tone?: "blue" | "purple";
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 p-[var(--card-padding)]",
        !last && "border-b border-[var(--border)] md:border-b-0 md:border-r",
      )}
    >
      <IconTile Icon={Icon} tone={tone} />
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-3 grid gap-2.5">
        {links.map(([label, href]) => (
          <Link key={label} href={href} className="text-sm text-[var(--muted)] transition hover:text-[var(--blue)]">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SocialIcon({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition hover:-translate-y-0.5 hover:brightness-110",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export default function AudioRepurposeLandingPage() {
  const { theme } = useMarketingTheme();
  const activeId = useActiveSection();
  useSectionFocus();

  return (
    <MotionConfig reducedMotion="user">
      <PageShell theme={theme}>
        <MarketingNav theme={theme} activeSectionId={activeId} />
        <HeroSection />
        <AboutSection />
        <HowItWorksSection />
        <ProductExpansionSection />
        {SHOW_LEGACY_ONE_SOURCE_SECTION ? <OneSourceSection /> : null}
        <FeaturesSection />
        {SHOW_STANDALONE_SPEAKER_SECTION ? <SpeakerSection /> : null}
        <FinalConversionSection theme={theme} />
      </PageShell>
    </MotionConfig>
  );
}
