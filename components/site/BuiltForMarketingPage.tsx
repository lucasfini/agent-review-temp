"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleCheck,
  CloudUpload,
  FileText,
  Quote,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  CheckLine,
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
import {
  BUILT_FOR_PAGE_LIST,
  BUILT_FOR_PAGES,
  type BuiltForCard,
  type BuiltForOutput,
  type BuiltForPageData,
  type BuiltForPageSlug,
} from "@/components/site/builtForContent";
import { cn } from "@/lib/utils";

export function BuiltForMarketingPage({ slug }: { slug: BuiltForPageSlug }) {
  const { theme } = useMarketingTheme();
  useMarketingSectionFocus();
  const page = BUILT_FOR_PAGES[slug];

  return (
    <MarketingShell theme={theme}>
      <MarketingNav theme={theme} />
      <BuiltForHero page={page} />
      <FeatureSection page={page} />
      <PainSection page={page} />
      <BenefitsSection page={page} />
      <WorkflowSection page={page} />
      <OutputsSection page={page} />
      <SourceBackedSection page={page} />
      <FaqSection page={page} />
      <FinalCtaSection page={page} theme={theme} />
    </MarketingShell>
  );
}

export function BuiltForIndexPage() {
  const { theme } = useMarketingTheme();
  useMarketingSectionFocus();

  return (
    <MarketingShell theme={theme}>
      <MarketingNav theme={theme} />
      <MarketingSection id="built-for" band="home" grid className="min-h-[calc(92svh_-_var(--nav-h))]">
        <div className="grid items-center gap-[var(--section-gap)] xl:grid-cols-[0.9fr_1.1fr]">
          <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[780px]">
            <motion.div variants={fadeUp}>
              <PillBadge icon={Users}>Built for content teams</PillBadge>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="mt-4 font-serif text-[clamp(48px,5.1vw,92px)] font-semibold leading-[0.94] tracking-normal text-[var(--text)]"
            >
              AudioRepurpose is built for teams that turn conversations into{" "}
              <GradientText>content.</GradientText>
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-[clamp(17px,1.05vw,22px)] leading-8 text-[var(--muted)]">
              Explore how different teams use AudioRepurpose to capture source material, find the signal, and create review-ready assets from the recordings they already have.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-6 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href={SIGNUP_HREF} className="h-12 rounded-full px-7">
                Sign up for free
              </PrimaryButton>
              <SecondaryButton href="/pricing" className="h-12 rounded-full px-7">
                View pricing
              </SecondaryButton>
            </motion.div>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <ParallaxVisual distance={22} rotate={0.7}>
              <BuiltForHubVisual />
            </ParallaxVisual>
          </motion.div>
        </div>
      </MarketingSection>

      <MarketingSection id="built-for-pages" band="b" grid className="min-h-0">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
          <motion.div variants={fadeUp} className="grid gap-5 lg:grid-cols-[0.74fr_1fr] lg:items-end">
            <div>
              <PillBadge icon={Sparkles}>Choose your workflow</PillBadge>
              <h2 className="section-title mt-4 font-serif font-semibold">
                Each team gets a sharper path from <GradientText>source to asset.</GradientText>
              </h2>
            </div>
            <p className="section-copy max-w-2xl text-[var(--muted)] lg:justify-self-end">
              Every audience page uses the same source-backed system, then adapts the examples, pain points, and outputs to the team doing the work.
            </p>
          </motion.div>
          <motion.div variants={slowStagger} className="mt-8 grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3">
            {BUILT_FOR_PAGE_LIST.map((pageItem) => (
              <motion.div key={pageItem.slug} variants={fadeUp}>
                <BuiltForIndexCard page={pageItem} />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </MarketingSection>

      <MarketingSection id="built-for-cta" band="a" grid className="min-h-0">
        <div className="grid gap-[var(--card-gap)]">
          <Surface className="grid overflow-hidden p-0 xl:grid-cols-[0.56fr_0.44fr]">
            <div className="p-[var(--card-padding)]">
              <PillBadge icon={BookOpenText}>Source-backed content operations</PillBadge>
              <h2 className="section-title mt-4 font-serif font-semibold">
                Start with one team, then keep the source context reusable.
              </h2>
              <p className="section-copy mt-4 text-[var(--muted)]">
                AudioRepurpose gives teams a shared way to turn calls, webinars, videos, and notes into content without losing the transcript, speaker, or review context.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton href={SIGNUP_HREF}>Sign up for free</PrimaryButton>
                <SecondaryButton href={CONTACT_HREF}>Book a demo</SecondaryButton>
              </div>
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] p-[var(--card-padding)] xl:border-l xl:border-t-0">
              <SourceLedger title="Shared source context" items={["Recordings", "Analysis", "Studio context", "Library assets"]} />
            </div>
          </Surface>
          <MarketingFooter theme={theme} />
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}

function BuiltForHero({ page }: { page: BuiltForPageData }) {
  const HeroIcon = page.icon;

  return (
    <section
      id="built-for"
      data-focus-section="built-for"
      className="page-section !min-h-[clamp(540px,76svh,760px)] overflow-hidden border-b border-white/10 bg-[#050814] !py-[clamp(64px,9svh,118px)] text-white"
      style={{
        background:
          "radial-gradient(circle at 50% -10%, rgba(79, 139, 255, 0.26), transparent 36%), radial-gradient(circle at 88% 26%, rgba(167, 139, 250, 0.16), transparent 28%), linear-gradient(180deg, #080B1C 0%, #050814 62%, #071024 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[var(--bg-a)]" />
      <div className="section-container relative z-10">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="section-inner mx-auto flex max-w-[860px] flex-col items-center text-center"
        >
          <motion.div variants={fadeUp}>
            <PillBadge
              icon={HeroIcon}
              className="border-white/15 bg-white/10 text-[#AFC7FF] shadow-none"
            >
              {page.eyebrow}
            </PillBadge>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="mt-5 font-serif text-[clamp(56px,8vw,116px)] font-semibold leading-[0.9] tracking-normal text-white"
          >
            {page.heroHeadline}
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-5 max-w-[780px] text-[clamp(17px,1.25vw,22px)] leading-8 text-[#C9D4E8]"
          >
            {page.heroSubheadline}
          </motion.p>
          <motion.div variants={fadeUp} className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryButton href={page.primaryHref} className="h-12 rounded-full px-7">
              {page.primaryCta}
            </PrimaryButton>
            <SecondaryButton
              href={page.secondaryHref}
              className="h-12 rounded-full border-white/15 bg-white/10 px-7 text-white shadow-none hover:bg-white/15"
            >
              {page.secondaryCta}
            </SecondaryButton>
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8FA4C8]"
          >
            {page.heroBullets.slice(0, 3).map((bullet, index) => (
              <span key={bullet} className="inline-flex items-center gap-2">
                {index > 0 ? <span className="h-1 w-1 rounded-full bg-[#5D6F91]" /> : null}
                {bullet}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function PainSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-problem" band="b" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid gap-[var(--section-gap)] xl:grid-cols-[0.82fr_1.18fr] xl:items-start">
        <SectionIntro eyebrow={page.pain.eyebrow} title={page.pain.title} body={page.pain.body} />
        <CardGrid cards={page.pain.points} />
      </div>
    </MarketingSection>
  );
}

function BenefitsSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-benefits" band="a" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid gap-[var(--section-gap)] xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
        <CardGrid cards={page.benefits.points} />
        <SectionIntro eyebrow={page.benefits.eyebrow} title={page.benefits.title} body={page.benefits.body} />
      </div>
    </MarketingSection>
  );
}

function FeatureSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-features" band="a" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
        <motion.div variants={fadeUp} className="mx-auto max-w-4xl text-center">
          <div className="flex justify-center">
            <PillBadge icon={Sparkles}>{page.features.eyebrow}</PillBadge>
          </div>
          <h2 className="section-title mx-auto mt-4 font-serif font-semibold">
            {page.features.title}
          </h2>
          <p className="section-copy mx-auto mt-4 text-[var(--muted)]">
            {page.features.body}
          </p>
        </motion.div>
        <motion.div variants={slowStagger} className="mt-8 grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3">
          {page.features.cards.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp}>
              <FeatureCard card={feature} />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </MarketingSection>
  );
}

function WorkflowSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-workflow" band="b" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid gap-[var(--section-gap)] xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
        <SectionIntro eyebrow={page.workflow.eyebrow} title={page.workflow.title} body={page.workflow.body} />
        <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.16 }} className="grid gap-4">
          {page.workflow.steps.map((step, index) => (
            <motion.div key={step.title} variants={fadeUp}>
              <WorkflowStep step={step} index={index} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </MarketingSection>
  );
}

function OutputsSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-outputs" band="a" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
        <motion.div variants={fadeUp} className="mx-auto max-w-4xl text-center">
          <PillBadge icon={CircleCheck}>{page.outputs.eyebrow}</PillBadge>
          <h2 className="section-title mx-auto mt-4 font-serif font-semibold">
            {page.outputs.title}
          </h2>
          <p className="section-copy mx-auto mt-4 text-[var(--muted)]">
            {page.outputs.body}
          </p>
        </motion.div>
        <motion.div variants={slowStagger} className="mt-8 grid gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3">
          {page.outputs.cards.map((output) => (
            <motion.div key={output.title} variants={fadeUp}>
              <OutputCard output={output} />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </MarketingSection>
  );
}

function SourceBackedSection({ page }: { page: BuiltForPageData }) {
  return (
    <MarketingSection id="built-for-source-backed" band="b" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid items-center gap-[var(--section-gap)] xl:grid-cols-[1.05fr_0.95fr]">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <SourceLedger title={page.sourceBacked.eyebrow} items={page.sourceBacked.checks} />
        </motion.div>
        <SectionIntro
          eyebrow={page.sourceBacked.eyebrow}
          title={page.sourceBacked.title}
          body={page.sourceBacked.body}
          checks={page.sourceBacked.checks}
        />
      </div>
    </MarketingSection>
  );
}

function FaqSection({ page }: { page: BuiltForPageData }) {
  const relatedPages = BUILT_FOR_PAGE_LIST.filter((item) => item.slug !== page.slug).slice(0, 3);

  return (
    <MarketingSection id="built-for-faq" band="a" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid gap-[var(--section-gap)] xl:grid-cols-[0.48fr_0.52fr]">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }} className="grid gap-[var(--card-gap)]">
          <motion.div variants={fadeUp}>
            <Surface className="p-[var(--card-padding)]">
              <PillBadge icon={Users}>{page.collaboration.eyebrow}</PillBadge>
              <h2 className="mt-4 font-serif text-[clamp(34px,2.6vw,56px)] font-semibold leading-tight text-[var(--text)]">
                {page.collaboration.title}
              </h2>
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{page.collaboration.body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {page.collaboration.collaborators.map((collaborator) => (
                  <span
                    key={collaborator}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--muted)]"
                  >
                    {collaborator}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid gap-2">
                {relatedPages.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/built-for/${related.slug}`}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-bold text-[var(--text)] transition hover:bg-[var(--surface)] hover:text-[var(--blue)]"
                  >
                    <span>{related.navTitle}</span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </Surface>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Surface className="p-[var(--card-padding)]">
              <IconTile Icon={Quote} tone="purple" />
              <p className="mt-4 font-serif text-[clamp(26px,2vw,42px)] font-semibold leading-tight text-[var(--text)]">
                {page.collaboration.note}
              </p>
            </Surface>
          </motion.div>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
          <motion.div variants={fadeUp}>
            <PillBadge icon={Search}>FAQ</PillBadge>
            <h2 className="section-title mt-4 font-serif font-semibold">
              Questions {page.navTitle.toLowerCase()} usually ask.
            </h2>
          </motion.div>
          <motion.div variants={slowStagger} className="mt-6 grid gap-3">
            {page.faq.map((item) => (
              <motion.div key={item.question} variants={fadeUp}>
                <FaqItem question={item.question} answer={item.answer} />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </MarketingSection>
  );
}

function FinalCtaSection({ page, theme }: { page: BuiltForPageData; theme: ThemeName }) {
  const FinalIcon = page.icon;

  return (
    <MarketingSection id="built-for-cta" band="b" grid className="!min-h-0 !py-[clamp(56px,6vw,104px)]">
      <div className="grid gap-[var(--card-gap)]">
        <Surface className="overflow-hidden border-[#17223A] bg-[#050814] p-0 text-white shadow-[0_28px_90px_rgba(5,8,20,0.28)]">
          <div className="grid gap-0 xl:grid-cols-[0.58fr_0.42fr]">
            <div className="p-[var(--card-padding)]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">
                <FinalIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {page.finalCta.eyebrow}
              </span>
              <h2 className="mt-4 font-serif text-[clamp(42px,3.8vw,78px)] font-semibold leading-[0.95] tracking-normal">
                {page.finalCta.title}
              </h2>
              <p className="section-copy mt-4 text-[#B9C5D8]">
                {page.finalCta.body}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton href={page.primaryHref} className="h-12 rounded-full px-7">
                  {page.finalCta.primaryCta}
                </PrimaryButton>
                <Link
                  href={page.finalCta.secondaryHref}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/10 px-7 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8DB4FF]"
                >
                  {page.finalCta.secondaryCta}
                </Link>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.03] p-[var(--card-padding)] xl:border-l xl:border-t-0">
              <div className="grid gap-3">
                {page.finalCta.steps.map((step, index) => (
                  <div key={step.label} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-[#8DB4FF]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{step.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[#B9C5D8]">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Surface>
        <MarketingFooter theme={theme} />
      </div>
    </MarketingSection>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
  checks,
}: {
  eyebrow: string;
  title: string;
  body: string;
  checks?: readonly string[];
}) {
  return (
    <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }} className="max-w-[700px]">
      <motion.div variants={fadeUp}>
        <PillBadge>{eyebrow}</PillBadge>
      </motion.div>
      <motion.h2 variants={fadeUp} className="section-title mt-4 font-serif font-semibold">
        {title}
      </motion.h2>
      <motion.p variants={fadeUp} className="section-copy mt-4 text-[var(--muted)]">
        {body}
      </motion.p>
      {checks ? (
        <motion.div variants={fadeUp} className="mt-5 flex flex-wrap gap-x-7 gap-y-2.5">
          {checks.map((check) => (
            <CheckLine key={check}>{check}</CheckLine>
          ))}
        </motion.div>
      ) : null}
    </motion.div>
  );
}

function CardGrid({ cards }: { cards: readonly BuiltForCard[] }) {
  return (
    <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="grid gap-[var(--card-gap)] md:grid-cols-2">
      {cards.map((card) => (
        <motion.div key={card.title} variants={fadeUp}>
          <FeatureCard card={card} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function FeatureCard({ card }: { card: BuiltForCard }) {
  return (
    <Surface className="flex h-full flex-col p-[var(--card-padding)]">
      <IconTile Icon={card.icon} tone={card.tone ?? "blue"} />
      <h3 className="mt-4 text-xl font-bold text-[var(--text)]">{card.title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{card.body}</p>
    </Surface>
  );
}

function WorkflowStep({ step, index }: { step: BuiltForCard; index: number }) {
  return (
    <Surface className="grid gap-4 p-4 sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:p-5">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--blue)_10%,var(--surface))] text-sm font-bold text-[var(--blue)]">
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <IconTile Icon={step.icon} tone={step.tone ?? "blue"} className="h-9 w-9 rounded-xl" />
          <h3 className="text-xl font-bold text-[var(--text)]">{step.title}</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
      </div>
    </Surface>
  );
}

function OutputCard({ output }: { output: BuiltForOutput }) {
  return (
    <Surface className="flex h-full flex-col p-[var(--card-padding)]">
      <div className="flex items-start justify-between gap-4">
        <IconTile Icon={output.icon} tone={output.tone ?? "blue"} />
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          {output.label}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-bold text-[var(--text)]">{output.title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{output.body}</p>
    </Surface>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-base font-bold text-[var(--text)]">
        <span>{question}</span>
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--blue)] transition group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{answer}</p>
    </details>
  );
}

function BuiltForIndexCard({ page }: { page: BuiltForPageData }) {
  const Icon = page.icon;

  return (
    <Link
      href={page.canonicalPath}
      className="group block h-full rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <Surface className="flex h-full flex-col p-[var(--card-padding)]">
        <IconTile Icon={Icon} tone={page.slug === "creators" ? "purple" : "blue"} />
        <h3 className="mt-4 text-2xl font-bold text-[var(--text)]">{page.navTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{page.heroSubheadline}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {page.heroBullets.slice(0, 3).map((bullet) => (
            <span key={bullet} className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
              {bullet}
            </span>
          ))}
        </div>
        <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-[var(--blue)]">
          View page
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </Surface>
    </Link>
  );
}

function BuiltForHubVisual() {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#20B26B]" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Built For Hub</p>
        </div>
      </div>
      <div className="grid gap-3 p-[var(--card-padding)] md:grid-cols-2">
        {BUILT_FOR_PAGE_LIST.map((page, index) => {
          const Icon = page.icon;
          return (
            <Link
              key={page.slug}
              href={page.canonicalPath}
              className={cn(
                "grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 transition hover:bg-[var(--surface)]",
                index === 0 && "md:col-span-2",
              )}
            >
              <IconTile Icon={Icon} tone={index % 3 === 1 ? "purple" : index % 3 === 2 ? "green" : "blue"} className="h-11 w-11" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--text)]">{page.navTitle}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--muted)]">
                  {page.heroBullets.join(" / ")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </Surface>
  );
}

function SourceLedger({ title, items }: { title: string; items: readonly string[] }) {
  const ledgerRows: Array<readonly [string, string, LucideIcon]> = [
    ["Recording", "Original source, file, or supported import context.", CloudUpload],
    ["Transcript", "Speaker-aware transcript and analysis context.", FileText],
    ["Drafts", "Review-ready outputs shaped by source material.", Sparkles],
    ["Library", "Saved assets, source links, tags, and generation context.", BookOpenText],
  ];

  return (
    <Surface className="p-[var(--card-padding)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--blue)]">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-[var(--text)]">What stays attached</h3>
        </div>
        <IconTile Icon={Search} tone="purple" className="h-12 w-12" />
      </div>
      <div className="mt-5 grid gap-3">
        {ledgerRows.map(([label, body, Icon], index) => (
          <div key={label as string} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--blue)]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--text)]">{label}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{body}</p>
            </div>
            {items[index] ? (
              <div className="col-span-2 flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--muted)]">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--success)]" />
                {items[index]}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Surface>
  );
}
