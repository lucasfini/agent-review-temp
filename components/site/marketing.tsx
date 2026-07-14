"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CloudUpload,
  HeartHandshake,
  Megaphone,
  MessageSquareText,
  LayoutDashboard,
  Menu,
  Plug,
  Rocket,
  Sparkles,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { LogoLockup } from "@/components/site/AudioRepurposeLogo";
import SiteThemeToggle from "@/components/site/SiteThemeToggle";
import { cn } from "@/lib/utils";

export const SIGNUP_HREF = "/auth/signup";
export const LOGIN_HREF = "/auth/login";
export const CONTACT_HREF = "/contact";

export type ThemeName = "light" | "dark";
type ThemeVars = CSSProperties & Record<`--${string}`, string>;

export const PRODUCT_LINKS: Array<{
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    label: "Upload",
    href: "/product/upload",
    description: "Upload audio, import source files, and choose what to generate.",
    icon: CloudUpload,
  },
  {
    label: "Teams",
    href: "/product/teams",
    description: "Collaborate across roles, shared workspaces, and review flows.",
    icon: Users,
  },
  {
    label: "Studio",
    href: "/product/studio",
    description: "Manage profiles, voices, campaign plans, and reusable brand context.",
    icon: Sparkles,
  },
  {
    label: "Library",
    href: "/product/library",
    description: "Save drafts, collections, reusable assets, and approved content.",
    icon: BookOpenText,
  },
  {
    label: "Integrations",
    href: "/product/integrations",
    description: "Connect supported tools and bring external source material into the workflow.",
    icon: Plug,
  },
  {
    label: "Analysis",
    href: "/product/analysis",
    description: "Review transcripts, extract insights, coach content quality, and define goals.",
    icon: BarChart3,
  },
];

export const BUILT_FOR_LINKS: Array<{
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    label: "Marketing teams",
    href: "/built-for/marketing-teams",
    description: "Build campaigns from customer calls, webinars, and interviews.",
    icon: Megaphone,
  },
  {
    label: "Founders",
    href: "/built-for/founders",
    description: "Turn product thinking and customer learning into clear updates.",
    icon: Rocket,
  },
  {
    label: "Sales teams",
    href: "/built-for/sales-teams",
    description: "Capture objections, buyer language, and follow-up material.",
    icon: MessageSquareText,
  },
  {
    label: "Customer success",
    href: "/built-for/customer-success",
    description: "Turn customer conversations into feedback, education, and proof.",
    icon: HeartHandshake,
  },
  {
    label: "Product marketers",
    href: "/built-for/product-marketers",
    description: "Find positioning, launch angles, and customer language.",
    icon: Users,
  },
  {
    label: "Consultants",
    href: "/built-for/consultants",
    description: "Turn workshops and interviews into client-ready deliverables.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Creators",
    href: "/built-for/creators",
    description: "Repurpose podcasts, videos, interviews, and voice notes.",
    icon: Video,
  },
];

export const themeTokens: Record<ThemeName, ThemeVars> = {
  light: {
    "--bg-home": "#F5F8FF",
    "--bg-a": "#F6FAFF",
    "--bg-b": "#EEF5FF",
    "--bg-warm": "#EAF3FF",
    "--bg-card": "#FFFFFF",
    "--bg-card-soft": "#F0F5FF",
    "--card": "#FFFFFF",
    "--card-soft": "#F0F5FF",
    "--text-main": "#050B24",
    "--text-muted": "#40516F",
    "--border-soft": "#D4DFEE",
    "--warm": "#F59E0B",
    "--bg": "#F6FAFF",
    "--surface": "#FFFFFF",
    "--surface-soft": "#EEF4FF",
    "--text": "#050B24",
    "--muted": "#40516F",
    "--border": "#D4DFEE",
    "--blue": "#1463FF",
    "--purple": "#7C3AED",
    "--success": "#20B26B",
    "--warning": "#F59E0B",
    "--grid-line": "rgba(35, 64, 120, 0.055)",
    "--nav-bg": "rgba(255,255,255,0.9)",
    "--nav-h": "var(--nav-height)",
    "--container-max": "var(--container-width)",
    "--container-x": "var(--page-gutter)",
    "--section-y": "var(--section-padding-y)",
    "--shadow-card": "0 18px 46px rgba(15, 23, 42, 0.08), 0 1px 0 rgba(255,255,255,0.75) inset",
    "--shadow-card-hover": "0 26px 74px rgba(15, 23, 42, 0.13), 0 1px 0 rgba(255,255,255,0.85) inset",
  },
  dark: {
    "--bg-home": "#050814",
    "--bg-a": "#050814",
    "--bg-b": "#0A1022",
    "--bg-warm": "#071024",
    "--bg-card": "#0F172A",
    "--bg-card-soft": "#111C34",
    "--card": "#0F172A",
    "--card-soft": "#111C34",
    "--text-main": "#F8FBFF",
    "--text-muted": "#AAB5CC",
    "--border-soft": "rgba(255,255,255,0.12)",
    "--warm": "#FBBF24",
    "--bg": "#050814",
    "--surface": "#0B1020",
    "--surface-soft": "#10182D",
    "--text": "#F8FBFF",
    "--muted": "#AAB5CC",
    "--border": "rgba(255,255,255,0.12)",
    "--blue": "#4F8BFF",
    "--purple": "#A78BFA",
    "--success": "#34D399",
    "--warning": "#FBBF24",
    "--grid-line": "rgba(255,255,255,0.035)",
    "--nav-bg": "rgba(8,12,28,0.78)",
    "--nav-h": "var(--nav-height)",
    "--container-max": "var(--container-width)",
    "--container-x": "var(--page-gutter)",
    "--section-y": "var(--section-padding-y)",
    "--shadow-card": "0 18px 60px rgba(0, 0, 0, 0.22)",
    "--shadow-card-hover": "0 24px 78px rgba(0, 0, 0, 0.28)",
  },
};

export const gridStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
};

export const smoothEase = [0.16, 1, 0.3, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.58, ease: smoothEase },
  },
};

export const fadeDown = {
  hidden: { opacity: 0, y: -18, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.52, ease: smoothEase },
  },
};

export const visualReveal = {
  hidden: { opacity: 0, y: 28, scale: 0.97, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.76, ease: smoothEase },
  },
};

export const iconReveal = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.42, ease: smoothEase },
  },
};

export const revealViewport = { once: true, amount: 0.18 } as const;

export const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.04,
    },
  },
};

export const slowStagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
}) {
  const offset = {
    up: { x: 0, y: 24 },
    left: { x: -20, y: 0 },
    right: { x: 20, y: 0 },
    none: { x: 0, y: 0 },
  }[direction];

  return (
    <motion.div
      initial={{ opacity: 0, ...offset, filter: "blur(4px)" }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)" }}
      viewport={revealViewport}
      transition={{ duration: 0.58, delay, ease: smoothEase }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={revealViewport}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={slowStagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.14 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ParallaxVisual({
  children,
  className,
  distance = 34,
  rotate = 1.2,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  rotate?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const shouldReduce = !mounted || reducedMotion;
  const y = useTransform(scrollYProgress, [0, 1], shouldReduce ? [0, 0] : [distance, -distance]);
  const rotateZ = useTransform(scrollYProgress, [0, 1], shouldReduce ? [0, 0] : [rotate, -rotate]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <motion.div ref={ref} style={{ y, rotateZ }} className={cn("relative", className)}>
      {children}
    </motion.div>
  );
}

export function FloatingProductCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}

export function SectionHeadingReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.22 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function getDocumentTheme(): ThemeName {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeDocumentTheme(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
  });

  const frame = window.requestAnimationFrame(onStoreChange);
  const timeout = window.setTimeout(onStoreChange, 80);
  const interval = window.setInterval(onStoreChange, 250);

  return () => {
    observer.disconnect();
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
    window.clearInterval(interval);
  };
}

export function useMarketingTheme(): { theme: ThemeName } {
  const theme = useSyncExternalStore<ThemeName>(
    subscribeDocumentTheme,
    getDocumentTheme,
    () => "light",
  );

  return { theme };
}

export function useMarketingSectionFocus() {
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

export function MarketingShell({
  children,
  theme,
}: {
  children: ReactNode;
  theme: ThemeName;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <main
        data-theme={theme}
        style={themeTokens[theme]}
        className="landing-scroll-root relative bg-[var(--bg-home)] text-[var(--text-main)] transition-colors duration-300"
      >
        <div className="relative z-10">{children}</div>
      </main>
    </MotionConfig>
  );
}

export function MarketingSection({
  id,
  band = "a",
  grid = false,
  className,
  children,
}: {
  id?: string;
  band?: "home" | "a" | "b" | "warm";
  grid?: boolean;
  className?: string;
  children: ReactNode;
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
      className={cn("page-section", className)}
      style={sectionStyle}
    >
      <div className="section-container">
        <div className="section-inner">{children}</div>
      </div>
    </section>
  );
}

export function GradientText({ children }: { children: ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-[var(--blue)] via-[#4F6FFF] to-[var(--purple)] bg-clip-text text-transparent">
      {children}
    </span>
  );
}

export function PillBadge({
  children,
  icon: Icon,
  className,
}: {
  children: ReactNode;
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

export function PrimaryButton({
  href = SIGNUP_HREF,
  children,
  className,
}: {
  href?: string;
  children: ReactNode;
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

export function SecondaryButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
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

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fluid-card border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] ring-1 ring-black/[0.015] transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--blue)_20%,var(--border))] hover:shadow-[var(--shadow-card-hover)] dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function IconTile({
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

export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#AFC2E8] text-[var(--blue)]">
        <Check aria-hidden="true" className="h-3 w-3" />
      </span>
      {children}
    </span>
  );
}

export function Waveform({ className }: { className?: string }) {
  const bars = [10, 17, 12, 23, 14, 20, 9, 26, 15, 28, 11, 21, 13, 25, 16, 19, 10, 26, 14, 22, 10, 18, 12, 24];

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

export function MarketingNav({
  theme,
  activeSectionId,
}: {
  theme: ThemeName;
  activeSectionId?: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"product" | "builtFor" | null>(null);
  const [mobileSections, setMobileSections] = useState({
    product: false,
    builtFor: false,
  });
  const isProductRoute = pathname === "/product" || pathname?.startsWith("/product/");
  const isBuiltForRoute = pathname === "/built-for" || pathname?.startsWith("/built-for/");
  const isPricingRoute = pathname === "/pricing";
  const isWhatsNewRoute = pathname === "/whats-new";
  const isHome = pathname === "/";
  const isHomeActive = isHome && (!activeSectionId || activeSectionId === "home");

  useEffect(() => {
    setMobileSections({
      product: isProductRoute,
      builtFor: isBuiltForRoute,
    });
  }, [isProductRoute, isBuiltForRoute]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (navRef.current?.contains(event.target as Node)) return;
      setOpenDropdown(null);
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenDropdown(null);
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const closeMenus = () => {
    setOpen(false);
    setOpenDropdown(null);
  };

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const openDesktopDropdown = (dropdown: "product" | "builtFor") => {
    clearCloseTimer();
    setOpen(false);
    setOpenDropdown(dropdown);
  };

  const scheduleCloseDropdown = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenDropdown(null);
      closeTimerRef.current = null;
    }, 150);
  };

  const toggleMobileSection = (section: "product" | "builtFor") => {
    setMobileSections((current) => ({
      product: section === "product" ? !current.product : false,
      builtFor: section === "builtFor" ? !current.builtFor : false,
    }));
  };

  const navLinkClass = (active: boolean) =>
    cn(
      "nav-link relative inline-flex h-11 min-h-11 items-center justify-center rounded-full px-3 py-0 text-[15px] font-bold leading-none transition duration-200 hover:text-[var(--blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-home)]",
      active
        ? "text-[var(--blue)]"
        : "text-[color-mix(in_srgb,var(--text-main)_78%,var(--text-muted))]",
    );

  const activeBar = (active: boolean) =>
    active ? (
    <motion.span
      layoutId="marketing-nav-active-underline"
      aria-hidden="true"
      className="pointer-events-none absolute left-3 right-3 bottom-[5px] h-0.5 rounded-full bg-[linear-gradient(90deg,var(--blue),var(--purple))]"
      transition={{ duration: 0.24, ease: smoothEase }}
    />
  ) : null;

  const renderDesktopTrigger = (dropdown: "product" | "builtFor", label: string, active: boolean) => {
    const isOpen = openDropdown === dropdown;
    const controls = dropdown === "product" ? "product-mega-menu" : "built-for-mega-menu";

    return (
      <div className="relative">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-controls={controls}
          onPointerEnter={() => openDesktopDropdown(dropdown)}
          onPointerLeave={scheduleCloseDropdown}
          onFocus={() => openDesktopDropdown(dropdown)}
          onClick={() => {
            clearCloseTimer();
            setOpenDropdown((value) => (value === dropdown ? null : dropdown));
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openDesktopDropdown(dropdown);
              window.setTimeout(() => {
                const firstItem = document.querySelector<HTMLElement>(`#${controls} [role="menuitem"]`);
                firstItem?.focus();
              }, 0);
            }
          }}
          className={cn(navLinkClass(active), "gap-1.5")}
        >
          {label}
          <ChevronDown
            aria-hidden="true"
            className={cn("h-4 w-4 shrink-0 self-center transition-transform duration-200", isOpen && "rotate-180")}
          />
          {activeBar(active || isOpen)}
        </button>
      </div>
    );
  };

  const renderProductMegaMenu = () => (
    <motion.div
      id="product-mega-menu"
      role="menu"
      aria-label="Product navigation"
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.24, ease: smoothEase }}
      className="nav-mega-panel pointer-events-auto mx-auto w-[min(720px,calc(100vw-48px))] rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl"
      onPointerEnter={clearCloseTimer}
      onPointerLeave={scheduleCloseDropdown}
    >
      <div className="mb-2 flex items-start justify-between gap-4 rounded-[18px] bg-[color-mix(in_srgb,var(--surface-soft)_82%,transparent)] px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--blue)]">Product</p>
          <p className="mt-1 max-w-[460px] text-sm leading-6 text-[var(--muted)]">
            Explore the upload, collaboration, context, library, integration, and analysis layers of the platform.
          </p>
        </div>
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)] sm:inline-flex">
          <LayoutDashboard aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <div className="grid gap-1 md:grid-cols-2">
        {PRODUCT_LINKS.map((link) => {
          const Icon = link.icon;
          const activeLink = pathname === link.href;
          return (
          <Link
            key={link.href}
            href={link.href}
            role="menuitem"
            aria-current={activeLink ? "page" : undefined}
            onClick={closeMenus}
            className={cn(
              "group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-2xl px-3 py-3 text-left transition duration-200 hover:bg-[color-mix(in_srgb,var(--blue)_7%,var(--surface))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]",
              activeLink && "bg-[color-mix(in_srgb,var(--blue)_8%,var(--surface))]",
            )}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)] transition duration-200 group-hover:scale-[1.04]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-extrabold leading-5 text-[var(--text)]">{link.label}</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{link.description}</span>
            </span>
          </Link>
          );
        })}
      </div>
    </motion.div>
  );

  const renderBuiltForMegaMenu = () => (
    <motion.div
      id="built-for-mega-menu"
      role="menu"
      aria-label="Built For navigation"
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.24, ease: smoothEase }}
      className="nav-mega-panel pointer-events-auto mx-auto w-[min(1160px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] p-4 shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl"
      onPointerEnter={clearCloseTimer}
      onPointerLeave={scheduleCloseDropdown}
    >
      <div className="mb-3 flex items-start justify-between gap-6 rounded-[20px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_78%,transparent)] px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--blue)]">Built For</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Find the workflow that matches how your team turns recordings into campaigns, proof, education, sales follow-up, or client-ready content.
          </p>
        </div>
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)] sm:inline-flex">
          <Building2 aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {BUILT_FOR_LINKS.map((link) => {
          const Icon = link.icon;
          const activeLink = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              aria-current={activeLink ? "page" : undefined}
              onClick={closeMenus}
              className={cn(
                "group/card grid min-h-[122px] grid-cols-[2.75rem_minmax(0,1fr)_1.25rem] gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--blue)_26%,var(--border))] hover:bg-[color-mix(in_srgb,var(--blue)_5%,var(--surface))] hover:shadow-[0_20px_46px_rgba(15,23,42,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]",
                activeLink && "border-[color-mix(in_srgb,var(--blue)_42%,var(--border))] bg-[color-mix(in_srgb,var(--blue)_7%,var(--surface))]",
              )}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)] transition duration-200 group-hover/card:scale-[1.04]">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-extrabold leading-6 text-[var(--text)]">{link.label}</span>
                <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{link.description}</span>
              </span>
              <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 text-[var(--blue)] transition duration-200 group-hover/card:translate-x-1" />
            </Link>
          );
        })}
      </div>
    </motion.div>
  );

  const renderMobileAccordion = (
    section: "product" | "builtFor",
    label: string,
    links: typeof PRODUCT_LINKS,
  ) => {
    const expanded = mobileSections[section];
    const contentId = `mobile-${section}-links`;

    return (
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-soft)] p-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => toggleMobileSection(section)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-sm font-extrabold text-[var(--text)] transition hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]"
        >
          <span>{label}</span>
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              id={contentId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: smoothEase }}
              className="overflow-hidden"
            >
              <div className="grid gap-1 pt-1">
              {links.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={closeMenus}
                    className={cn(
                      "grid min-h-[58px] grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]",
                      active ? "text-[var(--blue)]" : "text-[var(--text)]",
                    )}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-[var(--blue)]">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold">{link.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{link.description}</span>
                    </span>
                  </Link>
                );
              })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const desktopDropdown = openDropdown === "product" ? renderProductMegaMenu() : openDropdown === "builtFor" ? renderBuiltForMegaMenu() : null;

  return (
    <motion.header
      ref={navRef}
      variants={fadeDown}
      initial="hidden"
      animate="show"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          scheduleCloseDropdown();
        }
      }}
      className="site-nav sticky top-0 z-[60] h-[var(--nav-h)] overflow-visible"
    >
      <nav aria-label="Primary" className="nav-inner">
        <Link
          href={isHome ? "#home" : "/"}
          className="brand-lockup shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-home)]"
          aria-label="AudioRepurpose home"
          onClick={closeMenus}
        >
          <LogoLockup size="sm" theme={theme} />
        </Link>

        <div className="nav-center hidden items-center justify-center gap-[clamp(12px,1.4vw,24px)] min-[1040px]:flex">
          <Link
            href={isHome ? "#home" : "/#home"}
            aria-current={isHomeActive ? "page" : undefined}
            className={navLinkClass(isHomeActive)}
            onPointerEnter={scheduleCloseDropdown}
          >
            Home
            {activeBar(isHomeActive)}
          </Link>
          {renderDesktopTrigger("product", "Product", isProductRoute)}
          <Link
            href="/pricing"
            aria-current={isPricingRoute ? "page" : undefined}
            className={navLinkClass(isPricingRoute)}
            onPointerEnter={scheduleCloseDropdown}
          >
            Pricing
            {activeBar(isPricingRoute)}
          </Link>
          {renderDesktopTrigger("builtFor", "Built For", isBuiltForRoute)}
          <Link
            href="/whats-new"
            aria-current={isWhatsNewRoute ? "page" : undefined}
            className={navLinkClass(isWhatsNewRoute)}
            onPointerEnter={scheduleCloseDropdown}
          >
            What&apos;s New
            {activeBar(isWhatsNewRoute)}
          </Link>
        </div>

        <div className="nav-right ml-auto hidden items-center justify-end gap-3 min-[1040px]:flex">
          <div className="nav-actions">
            <Link href={LOGIN_HREF} className="nav-login">
              Sign in
            </Link>
            <Link href={SIGNUP_HREF} className="nav-primary">
              Sign up for free
            </Link>
          </div>
          <SiteThemeToggle
            size="sm"
            className="rounded-full border-transparent bg-transparent text-[var(--text-main)] shadow-none hover:bg-[color-mix(in_srgb,var(--text-main)_7%,transparent)] hover:text-[var(--blue)] focus-visible:ring-[var(--blue)] focus-visible:ring-offset-[var(--bg-home)] dark:border-transparent dark:bg-transparent"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 min-[1040px]:hidden">
          <Link href={SIGNUP_HREF} className="nav-primary nav-primary-compact mobile-nav-quick-cta">
            Sign up
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value);
              setOpenDropdown(null);
            }}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="mobile-marketing-menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text)] transition hover:bg-[color-mix(in_srgb,var(--blue)_9%,transparent)] hover:text-[var(--blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
          <SiteThemeToggle
            size="sm"
            className="rounded-xl border-transparent bg-transparent text-[var(--text-main)] shadow-none hover:bg-[color-mix(in_srgb,var(--text-main)_7%,transparent)] hover:text-[var(--blue)] focus-visible:ring-[var(--blue)] focus-visible:ring-offset-[var(--bg-home)] dark:border-transparent dark:bg-transparent"
          />
        </div>
      </nav>

      <AnimatePresence>
        {desktopDropdown ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-[calc(var(--nav-h)-2px)] z-[70] hidden px-4 pt-3 min-[1040px]:block"
            onPointerEnter={clearCloseTimer}
            onPointerLeave={scheduleCloseDropdown}
          >
            <div aria-hidden="true" className="h-3" />
            {desktopDropdown}
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-marketing-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: smoothEase }}
            className="absolute inset-x-0 top-[var(--nav-h)] z-[70] px-[var(--container-x)] min-[1040px]:hidden"
          >
            <div className="mobile-nav-panel mx-auto grid max-h-[calc(100svh-var(--nav-h)-16px)] w-full max-w-[var(--container-max)] box-border gap-2 overflow-y-auto rounded-[20px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 shadow-[0_22px_65px_rgba(15,23,42,0.14)] backdrop-blur-xl">
              <div className="grid gap-1">
                {[
                  { label: "Home", href: isHome ? "#home" : "/#home", active: isHomeActive },
                  { label: "Pricing", href: "/pricing", active: isPricingRoute },
                  { label: "What's New", href: "/whats-new", active: isWhatsNewRoute },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    aria-current={link.active ? "page" : undefined}
                    onClick={closeMenus}
                    className={cn(
                      "nav-link relative flex min-h-11 items-center rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]",
                      link.active
                        ? "bg-[color-mix(in_srgb,var(--blue)_8%,var(--surface))] text-[var(--blue)]"
                        : "text-[var(--text)] hover:bg-[var(--surface-soft)]",
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {renderMobileAccordion("product", "Product", PRODUCT_LINKS)}
              {renderMobileAccordion("builtFor", "Built For", BUILT_FOR_LINKS)}

              <div className="mobile-nav-actions mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={LOGIN_HREF}
                  onClick={closeMenus}
                  className="nav-login"
                >
                  Sign in
                </Link>
                <Link
                  href={SIGNUP_HREF}
                  onClick={closeMenus}
                  className="nav-primary"
                >
                  Sign up for free
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
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
  children: ReactNode;
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

export function MarketingFooter({ theme }: { theme: ThemeName }) {
  return (
    <motion.footer
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.16 }}
    >
      <Surface className="overflow-hidden p-0">
        <div className="grid gap-[var(--card-gap)] p-[var(--card-padding)] xl:grid-cols-[1.25fr_0.9fr_0.9fr_0.8fr_0.85fr]">
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
            title="Launch"
            links={[
              ["Home", "/#home"],
              ["How it works", "/#how-it-works"],
              ["Features", "/#features"],
              ["Pricing", "/pricing"],
              ["Built for", "/built-for"],
              ["What's New", "/whats-new"],
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              ["About us", "/#about"],
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
                @
              </SocialIcon>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-[var(--card-padding)] py-3 text-sm text-[var(--muted)]">
          (c) 2026 AudioRepurpose. All rights reserved.
        </div>
      </Surface>
    </motion.footer>
  );
}
