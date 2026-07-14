"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Archive,
  BarChart3,
  BookOpenText,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  CloudUpload,
  Download,
  FileText,
  FolderKanban,
  FolderOpen,
  Lightbulb,
  Link2,
  ListChecks,
  MessageSquareText,
  Mic,
  Palette,
  PenLine,
  Plug,
  Plus,
  Quote,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserPlus,
  Users,
  Video,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import {
  CONTACT_HREF,
  GradientText,
  IconTile,
  MarketingFooter,
  MarketingNav,
  MarketingSection,
  MarketingShell,
  ParallaxVisual,
  PillBadge,
  PrimaryButton,
  SecondaryButton,
  SIGNUP_HREF,
  Surface,
  fadeUp,
  slowStagger,
  stagger,
  useMarketingSectionFocus,
  useMarketingTheme,
  type ThemeName,
} from "@/components/site/marketing";
import { LogoIcon } from "@/components/site/AudioRepurposeLogo";
import {
  getProductPage,
  productPages,
  type ProductIconKey,
  type ProductPageContent,
  type ProductPageKey,
  type ProductPreviewTone,
} from "@/components/site/productContent";

const iconMap: Record<ProductIconKey, LucideIcon> = {
  analysis: BarChart3,
  calendar: CalendarDays,
  check: CheckCircle2,
  clock: Clock,
  file: FileText,
  folder: FolderKanban,
  goal: Target,
  library: BookOpenText,
  link: Link2,
  message: MessageSquareText,
  palette: Palette,
  plug: Plug,
  quote: Quote,
  search: Search,
  shield: ShieldCheck,
  sparkles: Sparkles,
  upload: CloudUpload,
  users: Users,
  workflow: ArrowRight,
};

const productSectionClass = "product-page-section";
const productSectionTightClass = "product-page-section product-page-section-tight";
const productSectionCtaClass = "product-page-section product-page-section-cta";

const previewToneClasses: Record<
  ProductPreviewTone,
  {
    icon: string;
    panel: string;
    pill: string;
    accent: string;
  }
> = {
  amber: {
    icon: "bg-amber-50 text-amber-600",
    panel: "border-amber-100 bg-amber-50/70",
    pill: "bg-amber-50 text-amber-700",
    accent: "from-[#F59E0B] to-[#FCD34D]",
  },
  blue: {
    icon: "bg-blue-50 text-blue-600",
    panel: "border-blue-100 bg-blue-50/70",
    pill: "bg-blue-50 text-blue-700",
    accent: "from-[#4F8BFF] to-[#8DB3FF]",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-600",
    panel: "border-cyan-100 bg-cyan-50/70",
    pill: "bg-cyan-50 text-cyan-700",
    accent: "from-[#22D3EE] to-[#67E8F9]",
  },
  green: {
    icon: "bg-emerald-50 text-emerald-600",
    panel: "border-emerald-100 bg-emerald-50/70",
    pill: "bg-emerald-50 text-emerald-700",
    accent: "from-[#34D399] to-[#86EFAC]",
  },
  purple: {
    icon: "bg-violet-50 text-violet-600",
    panel: "border-violet-100 bg-violet-50/70",
    pill: "bg-violet-50 text-violet-700",
    accent: "from-[#8B5CF6] to-[#C4B5FD]",
  },
  slate: {
    icon: "bg-slate-100 text-slate-600",
    panel: "border-slate-200 bg-slate-50",
    pill: "bg-slate-100 text-slate-700",
    accent: "from-[#64748B] to-[#CBD5E1]",
  },
};

function getPreviewTone(tone?: ProductPreviewTone) {
  return previewToneClasses[tone ?? "blue"];
}

export default function ProductMarketingPage({ page }: { page: ProductPageKey }) {
  const { theme } = useMarketingTheme();
  useMarketingSectionFocus();
  const data = getProductPage(page);

  return (
    <MarketingShell theme={theme}>
      <MarketingNav theme={theme} />
      <ProductPageLayout data={data} theme={theme} />
    </MarketingShell>
  );
}

function ProductPageLayout({
  data,
  theme,
}: {
  data: ProductPageContent;
  theme: ThemeName;
}) {
  return (
    <>
      <ProductHero data={data} />
      <ProductQuickBenefits data={data} />
      <ProductFeatureGrid data={data} />
      <ProductWorkflow data={data} />
      <ProductUseCases data={data} />
      <ProductPlatformConnections data={data} />
      <ProductCTA data={data} theme={theme} />
    </>
  );
}

function ProductHero({ data }: { data: ProductPageContent }) {
  const Icon = iconMap[data.icon];

  return (
    <section
      id={`${data.slug}-hero`}
      data-focus-section={`${data.slug}-hero`}
      className="relative overflow-hidden bg-[#050814] text-white"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="section-container relative z-10">
        <div className="section-inner py-[clamp(58px,8svh,122px)]">
          <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-5xl text-center">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.08] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#9DBBFF] backdrop-blur">
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {data.eyebrow}
              </span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="mx-auto mt-5 max-w-5xl text-balance font-serif text-[clamp(42px,6vw,104px)] font-semibold leading-[0.98] tracking-normal text-white">
              {data.title} <GradientText>{data.highlight}</GradientText>
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-3xl text-balance text-[clamp(17px,1.05vw,22px)] leading-8 text-[#B8C4DA]">
              {data.description}
            </motion.p>
            <motion.div variants={fadeUp} className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryButton href={SIGNUP_HREF} className="h-12 rounded-full px-7">
                {data.primaryCta}
              </PrimaryButton>
              <SecondaryButton href={`#${data.slug}-workflow`} className="h-12 rounded-full border-white/[0.15] bg-white/[0.08] px-7 text-white shadow-none hover:bg-white/[0.12]">
                {data.secondaryCta}
              </SecondaryButton>
            </motion.div>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mx-auto mt-10 w-full max-w-6xl sm:mt-12 lg:mt-14">
            <ParallaxVisual distance={24} rotate={0.8}>
              <ProductHeroPreview data={data} />
            </ParallaxVisual>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

type PreviewAction = {
  label: string;
  icon?: LucideIcon;
  primary?: boolean;
};

function ProductHeroPreview({ data }: { data: ProductPageContent }) {
  if (data.slug === "upload") return <UploadHeroPreview data={data} />;
  if (data.slug === "teams") return <TeamsHeroPreview data={data} />;
  if (data.slug === "studio") return <StudioHeroPreview data={data} />;
  if (data.slug === "library") return <LibraryHeroPreview data={data} />;
  if (data.slug === "integrations") return <IntegrationsHeroPreview data={data} />;
  return <AnalysisHeroPreview data={data} />;
}

function PreviewAppFrame({
  data,
  children,
}: {
  data: ProductPageContent;
  children: ReactNode;
}) {
  const railItems = [data, ...data.connectedProducts.slice(0, 5).map((slug) => productPages[slug])];

  return (
    <div className="relative mx-auto w-full">
      <div className="relative overflow-hidden rounded-[30px] border border-white/15 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.36)] ring-1 ring-slate-950/5">
        <div className="grid bg-slate-50 text-slate-950 lg:grid-cols-[76px_minmax(0,1fr)]">
          <div className="hidden border-r border-slate-200 bg-white px-3 py-5 lg:block">
            <div className="mx-auto flex h-full flex-col items-center gap-4">
              <span className="flex h-9 w-9 items-center justify-center">
                <LogoIcon size="sm" decorative className="h-8 w-10" />
              </span>
              <div className="flex flex-col gap-3">
                {railItems.map((item) => {
                  const RailIcon = iconMap[item.icon];
                  const active = item.slug === data.slug;
                  return (
                    <span
                      key={item.slug}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border ${
                        active
                          ? "border-[#4F8BFF]/35 bg-[#2F7DFF] text-white shadow-[0_12px_30px_rgba(47,125,255,0.32)]"
                          : "border-transparent text-slate-400"
                      }`}
                    >
                      <RailIcon aria-hidden="true" className="h-4 w-4" />
                    </span>
                  );
                })}
              </div>
              <span className="mt-auto h-9 w-9 rounded-full border border-slate-200 bg-slate-100" />
            </div>
          </div>

          <div className="p-4 sm:p-5 lg:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PreviewHeader({
  icon: Icon,
  title,
  subtitle,
  actions = [],
  controls,
  children,
  mode = "light",
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: PreviewAction[];
  controls?: ReactNode;
  children?: ReactNode;
  mode?: "dark" | "light";
}) {
  const light = mode === "light";

  return (
    <div
      className={`rounded-[22px] border p-4 ${
        light
          ? "border-transparent bg-transparent text-slate-950 shadow-none"
          : "border-white/10 bg-[#0D172B] text-white"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {!light ? (
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4F8BFF]/25 bg-[#4F8BFF]/15 text-[#AFCBFF]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className={`text-2xl font-extrabold leading-tight ${light ? "text-slate-950" : "text-white"}`}>{title}</p>
            <p className={`mt-1 max-w-2xl text-sm leading-5 ${light ? "text-slate-600" : "text-[#9AA8C2]"}`}>{subtitle}</p>
          </div>
        </div>
        {controls ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{controls}</div> : actions.length ? <PreviewActions actions={actions} /> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function PreviewActions({ actions }: { actions: PreviewAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => <PreviewHeaderButton key={action.label} action={action} />)}
    </div>
  );
}

function PreviewTabs({ tabs, activeIndex = 0, mode = "light" }: { tabs: string[]; activeIndex?: number; mode?: "dark" | "light" }) {
  const light = mode === "light";

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab, index) => (
        <span
          key={tab}
          className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-bold ${
            index === activeIndex
              ? "bg-[#2F7DFF] text-white"
              : light
                ? "border border-slate-200 bg-white text-slate-600"
                : "border border-white/10 bg-white/[0.045] text-[#AAB8D0]"
          }`}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}

function PreviewSegmentedControl({
  tabs,
  activeIndex = 0,
  mode = "light",
}: {
  tabs: string[];
  activeIndex?: number;
  mode?: "dark" | "light";
}) {
  const light = mode === "light";

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 rounded-xl border p-1.5 ${light ? "border-slate-200 bg-slate-50 shadow-sm" : "border-white/10 bg-white/[0.055]"}`}>
      {tabs.map((tab, index) => (
        <span
          key={tab}
          className={`inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-xs font-extrabold ${
            index === activeIndex
              ? "bg-[#2F7DFF] text-white shadow-[0_10px_22px_rgba(47,125,255,0.26)]"
              : light
                ? "text-slate-600"
                : "text-[#AAB8D0]"
          }`}
        >
          {tab}
        </span>
      ))}
    </span>
  );
}

function PreviewHeaderSelect({
  label,
  value,
  icon: Icon,
  mode = "light",
}: {
  label?: string;
  value: string;
  icon?: LucideIcon;
  mode?: "dark" | "light";
}) {
  const light = mode === "light";

  return (
    <span className={`inline-flex h-11 max-w-[15rem] items-center gap-2 rounded-xl border px-3.5 text-sm font-bold shadow-sm ${light ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-white/[0.055] text-[#DDE7FF]"}`}>
      {Icon ? <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${light ? "text-slate-500" : "text-[#8EA0C2]"}`} /> : null}
      <span className="min-w-0 truncate">
        {label ? <span className={`mr-1 text-xs font-bold uppercase tracking-[0.12em] ${light ? "text-slate-500" : "text-[#8EA0C2]"}`}>{label}</span> : null}
        {value}
      </span>
      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${light ? "text-slate-500" : "text-[#8EA0C2]"}`} />
    </span>
  );
}

function PreviewHeaderButton({ action, mode = "light" }: { action: PreviewAction; mode?: "dark" | "light" }) {
  const Icon = action.icon;
  const light = mode === "light";

  return (
    <span
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold ${
        action.primary
          ? "bg-[#2F7DFF] text-white shadow-[0_12px_28px_rgba(47,125,255,0.32)]"
          : light
            ? "border border-slate-200 bg-white text-slate-700 shadow-sm"
            : "border border-white/10 bg-white/[0.06] text-[#DDE7FF]"
      }`}
    >
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
      {action.label}
    </span>
  );
}

function PreviewPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function PreviewPanelHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p> : null}
        <p className="mt-1 text-lg font-extrabold leading-tight text-slate-950">{title}</p>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function PreviewIcon({ Icon, tone = "blue" }: { Icon: LucideIcon; tone?: ProductPreviewTone }) {
  const toneClass = getPreviewTone(tone);
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass.icon}`}>
      <Icon aria-hidden="true" className="h-4 w-4" />
    </span>
  );
}

function PreviewStatus({ children, tone = "blue" }: { children: ReactNode; tone?: ProductPreviewTone }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${getPreviewTone(tone).pill}`}>
      {children}
    </span>
  );
}

function PreviewStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: ProductPreviewTone;
}) {
  const toneClass = getPreviewTone(tone);
  return (
    <div className={`rounded-[20px] border p-4 ${toneClass.panel}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass.icon}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className={`mt-1 h-px w-14 bg-gradient-to-r ${toneClass.accent}`} />
      </div>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function PreviewField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm">
        {value}
      </div>
    </div>
  );
}

function PreviewTable({
  title,
  rows,
  columns = ["Name", "Detail", "Status"],
}: {
  title: string;
  rows: Array<{ name: string; detail: string; status: string; tone?: ProductPreviewTone }>;
  columns?: [string, string, string];
}) {
  return (
    <div className="hidden overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm sm:block">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-extrabold text-slate-950">{title}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span>{columns[0]}</span>
        <span>{columns[1]}</span>
        <span>{columns[2]}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.name} className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
            <span className="font-bold text-slate-950">{row.name}</span>
            <span className="text-xs leading-5 text-slate-500">{row.detail}</span>
            <PreviewStatus tone={row.tone}>{row.status}</PreviewStatus>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadHeroPreview({ data }: { data: ProductPageContent }) {
  const modules = [
    { title: "Named speakers", detail: "Extract host and guest roles.", Icon: Users },
    { title: "Summary", detail: "Generate a concise source brief.", Icon: FileText },
    { title: "Insights", detail: "Extract useful concepts.", Icon: Lightbulb },
    { title: "Chapters", detail: "Break into timestamped sections.", Icon: ListChecks },
    { title: "Takeaways", detail: "Pull the strongest ideas.", Icon: Sparkles },
    { title: "Quotes", detail: "Find reusable pull quotes.", Icon: Quote },
  ];

  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={Upload}
        title="Upload"
        subtitle="Upload audio, video, or source links to start a workflow."
        mode="light"
        controls={<PreviewSegmentedControl tabs={["Local upload", "Integrations", "URL import"]} mode="light" />}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          <PreviewPanel>
            <PreviewPanelHeader
              title="Upload audio or video"
              description="Drag and drop a file here, or browse from your device."
              action={<PreviewStatus tone="blue">Transcript only</PreviewStatus>}
            />
            <div className="mt-4 rounded-[22px] border-2 border-dashed border-[#4F8BFF]/45 bg-[#2F7DFF]/[0.08] px-5 py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Upload aria-hidden="true" className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base font-extrabold text-slate-950">Drop audio or video here</p>
              <p className="mt-1 text-sm text-slate-500">MP3, WAV, M4A, MP4, MOV · up to 500 MB</p>
            </div>
          </PreviewPanel>

          <PreviewPanel className="p-0">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <PreviewPanelHeader
                title="Analysis modules"
                description="Pick what to generate before the source enters processing."
                action={<span className="text-xs font-bold text-[#8DB3FF]">Select all</span>}
              />
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map(({ title, detail, Icon }) => (
                <div key={title} className="grid grid-cols-[1rem_2.4rem_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <span className="mt-1 h-4 w-4 rounded border border-slate-300" />
                  <PreviewIcon Icon={Icon} tone="blue" />
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-slate-950">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </PreviewPanel>
        </div>

        <div className="hidden gap-4 xl:grid">
          <PreviewPanel>
            <PreviewPanelHeader title="Helpful tips" description="Small setup reminders before the upload starts." />
            <div className="mt-4 grid gap-3">
              {[
                { title: "Speaker count", detail: "Set or auto-detect the number of speakers.", Icon: Users },
                { title: "Naming", detail: "Use clear labels like Host or Guest.", Icon: PenLine },
                { title: "Audio quality", detail: "Keep speakers close to microphones.", Icon: Mic },
                { title: "File size", detail: "Longer recordings may take more time.", Icon: Clock },
              ].map(({ title, detail, Icon }) => (
                <div key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <PreviewIcon Icon={Icon} tone="blue" />
                  <span>
                    <span className="block text-sm font-bold text-slate-950">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </PreviewPanel>

          <PreviewPanel>
            <PreviewPanelHeader title="Advanced options" description="Speaker roster and processing details." />
            <div className="mt-4 grid gap-3">
              <PreviewField label="Speakers" value="Auto-detect" />
              <PreviewField label="Roster" value="Joe Smith, Maya Chen" />
            </div>
          </PreviewPanel>
        </div>
      </div>

      <div className="mt-4">
        <PreviewTable
          title="Upload history"
          columns={["File", "Source", "Status"]}
          rows={[
            { name: "Customer Interview.mp3", detail: "Local upload", status: "Completed", tone: "green" },
            { name: "Launch Webinar.mp4", detail: "Google Drive", status: "Ready", tone: "blue" },
            { name: "Founder Interview.wav", detail: "URL import", status: "Queued", tone: "amber" },
          ]}
        />
      </div>
    </PreviewAppFrame>
  );
}

function TeamsHeroPreview({ data }: { data: ProductPageContent }) {
  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={Users}
        title="Team"
        subtitle="Invite members, manage roles, and control access."
        mode="light"
        controls={(
          <>
            <PreviewHeaderButton action={{ label: "Roles", icon: ShieldCheck }} mode="light" />
            <PreviewHeaderButton action={{ label: "Invite Member", icon: UserPlus, primary: true }} mode="light" />
          </>
        )}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <PreviewStat label="Active seats" value="4" detail="Joined workspace members" icon={Users} tone="blue" />
        <PreviewStat label="Pending invites" value="1" detail="Counts toward the seat limit" icon={Send} tone="amber" />
        <PreviewStat label="Plan seat limit" value="8" detail="3 seats available" icon={ShieldCheck} tone="green" />
        <PreviewStat label="Team size" value="Growth" detail="Captured during setup" icon={Building2} tone="purple" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.74fr]">
        <PreviewPanel>
          <PreviewPanelHeader title="Workspace Identity" description="Account-level details for the team container." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PreviewField label="Workspace name" value="Growth Team" />
            <PreviewField label="Owner/job title" value="Marketing lead" />
            <PreviewField label="Website" value="bcb.example" />
            <PreviewField label="Team size" value="6-10" />
            <PreviewField label="Short description" value="B2B launch content team" wide />
          </div>
        </PreviewPanel>

        <PreviewPanel>
          <PreviewPanelHeader title="Invite Teammate" description="Invite admins, editors, or readers." />
          <div className="mt-4 grid gap-3">
            <PreviewField label="Email" value="teammate@example.com" />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <PreviewField label="Role" value="Editor" />
              <span className="mt-[1.55rem] inline-flex h-10 items-center rounded-xl bg-[#2F7DFF] px-4 text-xs font-extrabold text-white">Invite</span>
            </div>
            {[
              ["Owner", "Full control and billing"],
              ["Admin", "Workspace management"],
              ["Editor", "Create and organize"],
              ["Reader", "View shared context"],
            ].map(([role, detail]) => (
              <div key={role} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-bold text-slate-950">{role}: </span>{detail}
              </div>
            ))}
          </div>
        </PreviewPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.72fr]">
        <PreviewTable
          title="Members"
          columns={["Member", "Role", "Status"]}
          rows={[
            { name: "Joe Smith", detail: "Owner · Marketing lead", status: "Active", tone: "green" },
            { name: "Maya Chen", detail: "Editor · Content ops", status: "Active", tone: "blue" },
            { name: "Alex Rivera", detail: "Admin · Growth", status: "Active", tone: "purple" },
            { name: "Sam Taylor", detail: "Reader · Pending invite", status: "Pending", tone: "amber" },
          ]}
        />
        <PreviewPanel className="hidden xl:block">
          <PreviewPanelHeader title="Audit Log" description="Recent workspace permission and sharing events." />
          <div className="mt-4 grid gap-3">
            {[
              ["Collection shared", "Maya Chen · Library"],
              ["Plan shared", "Joe Smith · Campaign plan"],
              ["Invite accepted", "teammate@example.com"],
            ].map(([title, detail]) => (
              <div key={title} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-bold text-slate-950">{title}</span>
                  <span className="text-xs text-slate-500">{detail}</span>
                </span>
                <span className="text-xs text-slate-500">Today</span>
              </div>
            ))}
          </div>
        </PreviewPanel>
      </div>
    </PreviewAppFrame>
  );
}

function StudioHeroPreview({ data }: { data: ProductPageContent }) {
  const studioCards = [
    { title: "Profile", detail: "Brand, audience, and workspace context.", Icon: Building2, tone: "blue" as ProductPreviewTone },
    { title: "Voice", detail: "Reusable voice and tone settings.", Icon: Palette, tone: "purple" as ProductPreviewTone },
    { title: "Plans", detail: "Reusable campaign and content plans.", Icon: FolderKanban, tone: "green" as ProductPreviewTone },
  ];

  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={Sparkles}
        title="Studio"
        subtitle="Reusable profiles, voices, and plans for content generation."
        controls={(
          <>
            <PreviewHeaderSelect value="Acme B2B Profile" icon={Building2} />
            <PreviewHeaderSelect value="Acme Editorial Voice" icon={Palette} />
            <PreviewHeaderSelect value="Q3 Pipeline Content Plan" icon={FolderKanban} />
            <PreviewHeaderButton action={{ label: "New plan", icon: Plus, primary: true }} />
          </>
        )}
      >
        <PreviewTabs tabs={["Profile", "Voice", "Plans"]} />
      </PreviewHeader>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {studioCards.map(({ title, detail, Icon, tone }) => (
          <PreviewPanel key={title} className="min-h-[150px]">
            <PreviewIcon Icon={Icon} tone={tone} />
            <p className="mt-4 text-lg font-extrabold text-slate-950">{title}</p>
            <p className="mt-2 text-sm leading-5 text-slate-600">{detail}</p>
          </PreviewPanel>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <PreviewPanel>
          <PreviewPanelHeader title="Reusable context" description="Saved direction that travels into each draft." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PreviewField label="Company" value="BCB Inc." />
            <PreviewField label="Audience" value="B2B founders and marketing teams" />
            <PreviewField label="Offer" value="Source-backed content workflow" wide />
          </div>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Brand guidance</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Keep claims specific, preserve source context, and write for teams reviewing recorded conversations.
            </p>
          </div>
        </PreviewPanel>

        <div className="grid gap-4">
          <PreviewPanel>
            <PreviewPanelHeader title="Voice rules" description="Tone, words, and style constraints for generated drafts." />
            <div className="mt-4 flex flex-wrap gap-2">
              {["Clear", "Specific", "Operator-led", "No hype", "Source-backed"].map((chip) => (
                <PreviewStatus key={chip} tone={chip === "No hype" ? "amber" : "blue"}>{chip}</PreviewStatus>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {[
                ["Directness", "82%"],
                ["Technical depth", "64%"],
                ["Proof orientation", "91%"],
              ].map(([label, width]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                    <span>{label}</span>
                    <span>{width}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#2F7DFF] to-[#8B5CF6]" style={{ width }} />
                  </div>
                </div>
              ))}
            </div>
          </PreviewPanel>

          <PreviewPanel>
            <PreviewPanelHeader title="Campaign plans" description="Reusable plans for launch and nurture content." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Q3 Pipeline Content Plan", "LinkedIn · Newsletter · Blog", "Active"],
                ["Customer Proof", "Quote bank · case study notes", "Draft"],
              ].map(([title, detail, status]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-extrabold text-slate-950">{title}</p>
                    <PreviewStatus tone={status === "Active" ? "green" : "blue"}>{status}</PreviewStatus>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
          </PreviewPanel>
        </div>
      </div>
    </PreviewAppFrame>
  );
}

function LibraryHeroPreview({ data }: { data: ProductPageContent }) {
  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={BookOpenText}
        title="Library"
        subtitle="Browse saved outputs, collections, and reusable content assets."
        mode="light"
        controls={(
          <>
            <PreviewHeaderSelect value="All saved drafts" icon={FileText} mode="light" />
            <PreviewHeaderButton action={{ label: "New Collection", icon: Plus, primary: true }} mode="light" />
          </>
        )}
      />

      <div className="mt-4 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PreviewTabs tabs={["All saved", "Unfiled", "Ready", "Needs review"]} />
          <PreviewHeaderButton action={{ label: "New draft", icon: Plus, primary: true }} mode="light" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <PreviewStat label="Collections" value="4" detail="Reusable saved groups" icon={BookOpenText} tone="blue" />
        <PreviewStat label="Saved drafts" value="16" detail="Shown in this view" icon={FileText} tone="purple" />
        <PreviewStat label="Ready" value="7" detail="Approved or published" icon={Archive} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PreviewPanel>
          <PreviewPanelHeader title="All saved drafts" description="Generated content saves here when a content piece uses Save to Library." />
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400 shadow-sm">Search saved drafts</div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm">
              All statuses <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {[
              ["Customer proof LinkedIn post", "LinkedIn · Customer Proof · Source attached", "Approved", "green"],
              ["Webinar recap email", "Newsletter · Launch Webinar · Draft", "Needs review", "amber"],
              ["Product demo summary", "Summary · Product Demo · Ready", "Ready", "blue"],
              ["Founder POV post", "LinkedIn · Founder Interview · Draft", "Draft", "purple"],
            ].map(([title, detail, status, tone]) => (
              <div key={title} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <PreviewIcon Icon={FileText} tone={tone as ProductPreviewTone} />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-950">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
                </span>
                <PreviewStatus tone={tone as ProductPreviewTone}>{status}</PreviewStatus>
              </div>
            ))}
          </div>
        </PreviewPanel>

        <PreviewPanel>
          <PreviewPanelHeader title="Create saved draft" description="Saved drafts can belong to a Library, Plan, source project, or all three." />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <PreviewField label="Title" value="New draft" wide />
            <PreviewField label="Type" value="LinkedIn post" />
            <PreviewField label="Platform" value="LinkedIn" />
            <PreviewField label="Status" value="Draft" />
            <PreviewField label="Library" value="Customer Proof" />
            <PreviewField label="Plan" value="Launch Webinar" />
            <PreviewField label="Tags" value="launch, founder POV, proof" wide />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Excerpt</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Source-backed draft with saved context, tags, approval status, and campaign metadata preserved.
            </p>
          </div>
        </PreviewPanel>
      </div>
    </PreviewAppFrame>
  );
}

function IntegrationsHeroPreview({ data }: { data: ProductPageContent }) {
  const providers = [
    ["Zoom", "Meeting recordings", Video, "blue", "Connected"],
    ["Microsoft Teams", "Call recordings", Users, "purple", "Connected"],
    ["YouTube", "Channel uploads", Youtube, "amber", "Connected"],
    ["Notion", "Pages and notes", FileText, "slate", "Connected"],
    ["OneDrive", "Cloud recording imports", FolderOpen, "cyan", "Connected"],
    ["Google Drive", "Drive files and folders", CloudUpload, "green", "Connected"],
    ["Granola AI", "Paste notes or transcripts", Sparkles, "amber", "Manual import"],
    ["Slack", "Huddles and clips", MessageSquareText, "green", "Connected"],
  ] as const;

  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={Plug}
        title="Integrations"
        subtitle="Connect external tools and data sources to your workflow."
        mode="light"
        controls={<PreviewHeaderButton action={{ label: "Manage", icon: Settings2, primary: true }} mode="light" />}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.38fr]">
        <PreviewPanel>
          <PreviewPanelHeader
            title="Connected platforms"
            description="Connect recording sources, storage, and note systems for workspace imports and context."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map(([name, detail, Icon, tone, status]) => (
              <div key={name} className={`rounded-2xl border p-3 ${getPreviewTone(tone).panel}`}>
                <div className="flex items-start justify-between gap-3">
                  <PreviewIcon Icon={Icon} tone={tone} />
                  <PreviewStatus tone={status === "Manual import" ? "amber" : "green"}>{status}</PreviewStatus>
                </div>
                <p className="mt-3 text-sm font-extrabold text-slate-950">{name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
                <span className="mt-3 inline-flex rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">
                  {status === "Manual import" ? "Import notes" : "Disconnect"}
                </span>
              </div>
            ))}
          </div>
        </PreviewPanel>

        <div className="grid gap-4">
          <PreviewPanel>
            <PreviewPanelHeader title="Import queue" description="External source material staged for Upload." />
            <div className="mt-4 grid gap-3">
              {[
                ["Product Demo", "Zoom · 34 min", "Ready", "green"],
                ["Sales call notes", "Granola AI", "Shared", "blue"],
                ["Launch recording", "OneDrive · MP4", "Importable", "cyan"],
                ["Customer clip", "Slack · MOV", "Queued", "amber"],
              ].map(([title, detail, status, tone]) => (
                <div key={title} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <PreviewIcon Icon={FolderOpen} tone={tone as ProductPreviewTone} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-950">{title}</span>
                    <span className="block truncate text-xs text-slate-500">{detail}</span>
                  </span>
                  <PreviewStatus tone={tone as ProductPreviewTone}>{status}</PreviewStatus>
                </div>
              ))}
            </div>
          </PreviewPanel>

          <PreviewPanel className="hidden xl:block">
            <PreviewPanelHeader title="Sync status" description="Workspace-scoped provider activity." />
            <div className="mt-4 grid gap-3">
              <PreviewStat label="Connected" value="8" detail="Supported providers" icon={Plug} tone="blue" />
              <PreviewStat label="Ready" value="14" detail="Importable source files" icon={CheckCircle2} tone="green" />
            </div>
          </PreviewPanel>
        </div>
      </div>
    </PreviewAppFrame>
  );
}

function AnalysisHeroPreview({ data }: { data: ProductPageContent }) {
  return (
    <PreviewAppFrame data={data}>
      <PreviewHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="Track performance, usage trends, and content activity."
        controls={(
          <>
            <PreviewSegmentedControl tabs={["7D", "30D", "90D"]} activeIndex={1} />
            <PreviewHeaderButton action={{ label: "Export Report", icon: Download, primary: true }} />
          </>
        )}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm">
          Customer Proof Call
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
        </span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm">
          <BarChart3 aria-hidden="true" className="h-4 w-4" />
          Rerun Analysis
        </span>
        <PreviewStatus tone="green">Analyzed</PreviewStatus>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <PreviewStat label="Topic coverage" value="84%" detail="Recurring themes mapped" icon={FileText} tone="cyan" />
        <PreviewStat label="Coaching gaps" value="3" detail="High-priority fixes" icon={Target} tone="amber" />
        <PreviewStat label="Opportunities" value="12" detail="Useful content moments" icon={Lightbulb} tone="purple" />
        <PreviewStat label="Reusable quotes" value="18" detail="Saved from transcript" icon={Quote} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <PreviewPanel>
          <PreviewPanelHeader eyebrow="Content mix" title="What this project produced across formats" />
          <div className="mt-5 grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <span
              aria-hidden="true"
              className="mx-auto block h-36 w-36 rounded-full border border-slate-200"
              style={{
                background: "conic-gradient(#38BDF8 0 34%, #818CF8 34% 67%, #34D399 67% 100%)",
                boxShadow: "inset 0 0 0 34px #F8FAFC",
              }}
            />
            <div className="grid gap-3">
              {[
                ["LinkedIn posts", "34%", "bg-sky-400"],
                ["Newsletter sections", "33%", "bg-indigo-400"],
                ["Quote captions", "33%", "bg-emerald-400"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    {label}
                  </span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              ["LinkedIn posts", "42%"],
              ["Newsletter sections", "28%"],
              ["Quote captions", "18%"],
              ["Show notes", "12%"],
            ].map(([label, width]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                  <span>{label}</span>
                  <span>{width}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#22D3EE] via-[#4F8BFF] to-[#8B5CF6]" style={{ width }} />
                </div>
              </div>
            ))}
          </div>
        </PreviewPanel>

        <PreviewPanel>
          <PreviewPanelHeader eyebrow="Topic intensity" title="Where the conversation spends its energy" />
          <div className="mt-5 grid gap-4">
            {[
              ["Customer objections", "31%"],
              ["Proof points", "24%"],
              ["Workflow friction", "19%"],
              ["Audience language", "15%"],
              ["CTA clarity", "11%"],
            ].map(([topic, width]) => (
              <div key={topic}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                  <span>{topic}</span>
                  <span>{width}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width }} />
                </div>
              </div>
            ))}
          </div>
        </PreviewPanel>
      </div>

      <div className="mt-4">
        <PreviewPanel>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
            <PreviewStatus tone="purple">Creator Coaching</PreviewStatus>
            <PreviewStatus tone="slate">Goals</PreviewStatus>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Clarify the offer", "Tie the strongest claim to one source-backed example.", "amber"],
              ["Reuse customer language", "Save exact objections for Studio voice guidance.", "blue"],
              ["Move moments forward", "Send quotes and takeaways to Library review.", "green"],
            ].map(([title, detail, tone]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <PreviewIcon Icon={Target} tone={tone as ProductPreviewTone} />
                <p className="mt-3 text-sm font-extrabold text-slate-950">{title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </PreviewPanel>
      </div>
    </PreviewAppFrame>
  );
}


function ProductQuickBenefits({ data }: { data: ProductPageContent }) {
  return (
    <MarketingSection id={`${data.slug}-benefits`} band="a" grid className={productSectionTightClass}>
      <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.16 }} className="grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
        {data.quickBenefits.map((benefit, index) => (
          <motion.div key={benefit.title} variants={fadeUp}>
            <Surface className="h-full p-[var(--card-padding)]">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--blue)]">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 text-xl font-bold leading-tight text-[var(--text)]">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{benefit.description}</p>
            </Surface>
          </motion.div>
        ))}
      </motion.div>
    </MarketingSection>
  );
}

function ProductFeatureGrid({ data }: { data: ProductPageContent }) {
  return (
    <MarketingSection id={`${data.slug}-features`} band="b" grid className={productSectionClass}>
      <SectionHeader icon={iconMap[data.icon]} eyebrow={`${data.navLabel} features`} title={data.sections.featuresTitle} body={data.sections.featuresDescription} />
      <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.12 }} className="mt-8 grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
        {data.features.map((feature) => {
          const Icon = iconMap[feature.icon];
          return (
            <motion.div key={feature.title} variants={fadeUp}>
              <Surface className="flex h-full flex-col p-[var(--card-padding)]">
                <IconTile Icon={Icon} />
                <h3 className="mt-4 text-lg font-bold leading-tight text-[var(--text)]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{feature.description}</p>
              </Surface>
            </motion.div>
          );
        })}
      </motion.div>
    </MarketingSection>
  );
}

function ProductWorkflow({ data }: { data: ProductPageContent }) {
  return (
    <MarketingSection id={`${data.slug}-workflow`} band="a" className={productSectionClass}>
      <div className="grid items-start gap-[var(--section-gap)] xl:grid-cols-[0.85fr_1.15fr]">
        <SectionIntro eyebrow={`${data.navLabel} workflow`} title={data.sections.workflowTitle} body={data.sections.workflowDescription} icon={ArrowRight} />
        <motion.ol variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="grid gap-3">
          {data.workflow.map((step, index) => (
            <motion.li key={step.title} variants={fadeUp} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-sm font-extrabold text-[var(--blue)]">{index + 1}</span>
              <span>
                <span className="block text-lg font-bold leading-tight text-[var(--text)]">{step.title}</span>
                <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{step.description}</span>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </MarketingSection>
  );
}

function ProductUseCases({ data }: { data: ProductPageContent }) {
  return (
    <MarketingSection id={`${data.slug}-use-cases`} band="b" grid className={productSectionClass}>
      <SectionHeader icon={Target} eyebrow={`${data.navLabel} use cases`} title={data.sections.useCasesTitle} body={data.sections.useCasesDescription} />
      <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.14 }} className="mt-8 grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
        {data.useCases.map((useCase) => (
          <motion.div key={useCase.title} variants={fadeUp}>
            <Surface className="h-full p-[var(--card-padding)]">
              <h3 className="text-xl font-bold leading-tight text-[var(--text)]">{useCase.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{useCase.description}</p>
            </Surface>
          </motion.div>
        ))}
      </motion.div>
    </MarketingSection>
  );
}

function ProductPlatformConnections({ data }: { data: ProductPageContent }) {
  return (
    <MarketingSection id={`${data.slug}-connections`} band="a" className={productSectionClass}>
      <div className="grid items-start gap-[var(--section-gap)] xl:grid-cols-[0.8fr_1.2fr]">
        <SectionIntro eyebrow="Works with the platform" title={`${data.navLabel} is stronger with the rest of AudioRepurpose.`} body={data.connectionSummary} icon={Sparkles} />
        <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="grid gap-[var(--card-gap)] md:grid-cols-2">
          {data.connectedProducts.map((slug) => {
            const product = productPages[slug];
            const Icon = iconMap[product.icon];
            return (
              <motion.div key={slug} variants={fadeUp}>
                <Link href={`/product/${slug}`} className="group block h-full rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]">
                  <Surface className="flex h-full flex-col p-[var(--card-padding)]">
                    <IconTile Icon={Icon} />
                    <h3 className="mt-4 text-xl font-bold leading-tight text-[var(--text)]">{product.navLabel}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{product.navDescription}</p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-[var(--blue)] transition group-hover:translate-x-0.5">
                      Explore {product.navLabel}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </span>
                  </Surface>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </MarketingSection>
  );
}

function ProductCTA({ data, theme }: { data: ProductPageContent; theme: ThemeName }) {
  return (
    <MarketingSection id={`${data.slug}-cta`} band="b" grid className={productSectionCtaClass}>
      <div className="grid gap-[var(--card-gap)]">
        <Surface className="grid overflow-hidden p-0 xl:grid-cols-[0.58fr_0.42fr]">
          <div className="p-[var(--card-padding)]">
            <PillBadge icon={iconMap[data.icon]}>{data.finalCta.eyebrow}</PillBadge>
            <h2 className="section-title mt-4 font-serif font-semibold">{data.finalCta.title}</h2>
            <p className="section-copy mt-4 text-[var(--muted)]">{data.finalCta.description}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href={SIGNUP_HREF}>{data.primaryCta}</PrimaryButton>
              <SecondaryButton href={CONTACT_HREF}>Book a demo</SecondaryButton>
            </div>
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] p-[var(--card-padding)] xl:border-l xl:border-t-0">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--blue)]">Platform handoff</p>
            <div className="mt-4 grid gap-3">
              {data.workflow.slice(0, 4).map((step, index) => (
                <div key={step.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-xs font-bold text-[var(--blue)]">{index + 1}</span>
                  <span>
                    <span className="block text-sm font-bold text-[var(--text)]">{step.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{step.description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Surface>
        <MarketingFooter theme={theme} />
      </div>
    </MarketingSection>
  );
}

function SectionHeader({ icon, eyebrow, title, body }: { icon: LucideIcon; eyebrow: string; title: string; body: string }) {
  return (
    <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="mx-auto max-w-4xl text-center">
      <motion.div variants={fadeUp}>
        <PillBadge icon={icon}>{eyebrow}</PillBadge>
      </motion.div>
      <motion.h2 variants={fadeUp} className="section-title mx-auto mt-3 font-serif font-semibold">{title}</motion.h2>
      <motion.p variants={fadeUp} className="section-copy mx-auto mt-3 text-[var(--muted)]">{body}</motion.p>
    </motion.div>
  );
}

function SectionIntro({ eyebrow, title, body, icon }: { eyebrow: string; title: string; body: string; icon: LucideIcon }) {
  return (
    <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }} className="max-w-[680px]">
      <motion.div variants={fadeUp}>
        <PillBadge icon={icon}>{eyebrow}</PillBadge>
      </motion.div>
      <motion.h2 variants={fadeUp} className="section-title mt-3 font-serif font-semibold">{title}</motion.h2>
      <motion.p variants={fadeUp} className="section-copy mt-4 text-[var(--muted)]">{body}</motion.p>
    </motion.div>
  );
}
