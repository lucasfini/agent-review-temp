"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { Fragment } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Zap,
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
} from "@/components/site/marketing";
import { useAuth } from "@/lib/auth/context";
import {
  buildSignupHref,
  formatAnnualSavingsPercentSummary,
  formatPublicPlanPrice,
  getPublicPlanCardFeatures,
  hasCompleteAnnualPricing,
  normalizePublicBillingInterval,
  type PublicPricingCell,
  type PublicPricingComparisonGroup,
  type PublicPricingPlan,
} from "@/lib/billing/public-pricing";
import type { KnownPlanSlug, PlanBillingInterval } from "@/lib/billing/plans";
import { useSubscriptionCheckout } from "@/lib/hooks/useSubscriptionCheckout";
import { cn } from "@/lib/utils";

const planPresentation: Record<
  KnownPlanSlug,
  {
    icon: LucideIcon;
    cta: string;
    featured: boolean;
    badge?: string;
  }
> = {
  free: {
    icon: PlayCircle,
    cta: "Start generating",
    featured: false,
  },
  standard: {
    icon: TrendingUp,
    cta: "Start Standard",
    featured: false,
  },
  pro: {
    icon: Sparkles,
    cta: "Start Pro",
    featured: true,
    badge: "Most Popular",
  },
  teams: {
    icon: Building2,
    cta: "Start Teams",
    featured: false,
  },
};

type PublicPricingPageProps = {
  plans: PublicPricingPlan[];
  comparisonGroups: PublicPricingComparisonGroup[];
  pricingDataSource: "active-plans" | "fallback";
};

export default function PublicPricingPage({
  plans,
  comparisonGroups,
  pricingDataSource,
}: PublicPricingPageProps) {
  const { theme } = useMarketingTheme();
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>("month");
  const annualPricingAvailable = hasCompleteAnnualPricing(plans);
  const selectedInterval = normalizePublicBillingInterval(billingInterval, plans);
  const annualSavingsSummary = annualPricingAvailable ? formatAnnualSavingsPercentSummary(plans) : null;
  useMarketingSectionFocus();

  return (
    <MarketingShell theme={theme}>
      <MarketingNav theme={theme} />
      <MarketingSection
        id="pricing"
        band="home"
        grid
        className="min-h-[calc(58svh_-_var(--nav-h))] !py-[clamp(56px,7svh,92px)]"
      >
        <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-4xl text-center">
          <motion.div variants={fadeUp}>
            <PillBadge icon={Zap}>Simple pricing</PillBadge>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="mt-4 font-serif text-[clamp(48px,5.4vw,96px)] font-semibold leading-[0.94] tracking-normal text-[var(--text)]"
          >
            Plans for recurring <GradientText>content operations.</GradientText>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-[clamp(17px,1.05vw,22px)] leading-8 text-[var(--muted)]">
            Start free, then upgrade for more workspace credits, more seats, top-ups, and team capacity.
          </motion.p>
        </motion.div>
      </MarketingSection>

      <MarketingSection id="plans" band="b" grid className="min-h-0 !pt-[clamp(28px,4svh,56px)]">
        <div className="grid gap-[var(--section-gap)]">
          <PricingCards
            plans={plans}
            billingInterval={selectedInterval}
            requestedInterval={billingInterval}
            annualPricingAvailable={annualPricingAvailable}
            annualSavingsSummary={annualSavingsSummary}
            onIntervalChange={setBillingInterval}
          />
          <PricingComparisonChart plans={plans} comparisonGroups={comparisonGroups} />
        </div>
      </MarketingSection>

      <MarketingSection id="pricing-cta" band="a" grid className="min-h-0">
        <div className="grid gap-[var(--card-gap)]">
          <Surface className="grid overflow-hidden p-0 xl:grid-cols-[0.58fr_0.42fr]">
            <div className="p-[var(--card-padding)]">
              <PillBadge icon={Sparkles}>Ready to start</PillBadge>
              <h2 className="section-title mt-4 font-serif font-semibold">
                Turn the next useful recording into a reusable content workflow.
              </h2>
              <p className="section-copy mt-4 text-[var(--muted)]">
                Use Free to test the workflow, then move to a paid plan when you need more monthly capacity or team seats.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton href={SIGNUP_HREF}>Sign up for free</PrimaryButton>
                <SecondaryButton href={CONTACT_HREF}>Book a demo</SecondaryButton>
              </div>
            </div>
            <div className="grid place-items-center border-t border-[var(--border)] bg-[var(--surface-soft)] p-[var(--card-padding)] xl:border-l xl:border-t-0">
              <div className="w-full max-w-sm rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--blue)]">Included on every plan</p>
                <div className="mt-4 grid gap-3">
                  {["Transcripts", "Generated content", "Studio and Library workflow"].map((item) => (
                    <p key={item} className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--blue)]" />
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </Surface>
          {pricingDataSource === "fallback" ? (
            <p className="text-center text-xs text-[var(--muted)]">
              Pricing data is using the public fallback while live plan rows are unavailable.
            </p>
          ) : null}
          <MarketingFooter theme={theme} />
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}

function PricingCards({
  plans,
  billingInterval,
  requestedInterval,
  annualPricingAvailable,
  annualSavingsSummary,
  onIntervalChange,
}: {
  plans: PublicPricingPlan[];
  billingInterval: PlanBillingInterval;
  requestedInterval: PlanBillingInterval;
  annualPricingAvailable: boolean;
  annualSavingsSummary: string | null;
  onIntervalChange: (interval: PlanBillingInterval) => void;
}) {
  return (
    <div className="grid gap-9">
      <div className="mx-auto flex flex-col items-center gap-3 text-center">
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          {(["month", "year"] as const).map((interval) => {
            const disabled = interval === "year" && !annualPricingAvailable;
            const selected = requestedInterval === interval && !disabled;
            return (
              <button
                key={interval}
                type="button"
                disabled={disabled}
                onClick={() => onIntervalChange(interval)}
                className={cn(
                  "h-10 rounded-full px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
                  selected
                    ? "bg-[var(--text)] text-[var(--surface)] shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]",
                  disabled && "cursor-not-allowed opacity-45 hover:text-[var(--muted)]",
                )}
              >
                {interval === "month" ? "Monthly" : "Annual"}
              </button>
            );
          })}
        </div>
        {annualPricingAvailable && annualSavingsSummary ? (
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--success)_38%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--success)]">
              {annualSavingsSummary}
            </span>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Annual totals are computed from configured plan prices.
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-[var(--muted)]">
            Annual billing appears when every paid plan has a configured annual price.
          </p>
        )}
      </div>

      <motion.div variants={slowStagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="pricing-page-grid mx-auto grid w-full max-w-[1200px] gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <PricingCard key={plan.slug} plan={plan} billingInterval={billingInterval} />
        ))}
      </motion.div>
    </div>
  );
}

function PricingCard({
  plan,
  billingInterval,
}: {
  plan: PublicPricingPlan;
  billingInterval: PlanBillingInterval;
}) {
  const presentation = planPresentation[plan.slug];
  const Icon = presentation.icon;
  const price = formatPublicPlanPrice(plan, billingInterval);
  const ctaLabel = plan.slug === "teams" && !plan.stripeMonthlyPriceConfigured ? "Contact sales" : presentation.cta;

  return (
    <motion.div
      variants={fadeUp}
      className="relative"
    >
      {presentation.featured || plan.isPopular ? (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#07112F] px-5 py-2 text-xs font-bold text-white shadow-[0_14px_30px_rgba(7,17,47,0.20)]">
          <span className="inline-flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {presentation.badge ?? "Recommended"}
          </span>
        </div>
      ) : null}
      <Surface
        className={cn(
          "flex h-full flex-col p-6 xl:p-7",
          (presentation.featured || plan.isPopular) && "border-[#AEBBFF] shadow-[0_24px_80px_rgba(124,58,237,0.13)] ring-1 ring-[#CBD8FF]",
        )}
      >
        <IconTile Icon={Icon} tone={presentation.featured || plan.isPopular ? "purple" : "blue"} className="h-10 w-10" />
        <h2 className="mt-4 text-2xl font-bold text-[var(--text)]">{plan.name}</h2>
        <p className="mt-2 min-h-[58px] text-[15px] leading-7 text-[var(--muted)]">
          {plan.positioning}
        </p>
        <div className="my-4 h-px bg-[var(--border)]" />
        <div>
          <span className="text-3xl font-extrabold text-[var(--text)]">{price.main}</span>
          {price.suffix ? <span className="ml-1 text-lg font-medium text-[var(--muted)]">{price.suffix}</span> : null}
          <p className="mt-1 min-h-5 text-xs font-semibold text-[var(--muted)]">{price.helper}</p>
          {price.savings ? <p className="mt-1 text-xs font-bold text-[var(--blue)]">{price.savings}</p> : null}
        </div>
        <div className="mt-5 grid gap-3">
          {getPublicPlanCardFeatures(plan).map((feature) => (
            <p key={feature} className="flex items-start gap-3 text-[15px] font-medium leading-7 text-[var(--muted)]">
              <CheckCircle2 aria-hidden="true" className="mt-1 h-[18px] w-[18px] shrink-0 text-[var(--blue)]" />
              {feature}
            </p>
          ))}
        </div>
        <div className="mt-auto pt-5">
          <PlanCta plan={plan} billingInterval={billingInterval} featured={presentation.featured || plan.isPopular} ctaLabel={ctaLabel} />
        </div>
      </Surface>
    </motion.div>
  );
}

function PlanCta({
  plan,
  billingInterval,
  featured,
  ctaLabel,
}: {
  plan: PublicPricingPlan;
  billingInterval: PlanBillingInterval;
  featured: boolean;
  ctaLabel: string;
}) {
  const { session } = useAuth();
  const { checkoutPlanId, error, startCheckout } = useSubscriptionCheckout();
  const isSubmitting = checkoutPlanId === plan.slug || checkoutPlanId === plan.id;
  const canSelfServe = plan.slug !== "free" && (billingInterval === "year" ? plan.stripeAnnualPriceConfigured : plan.stripeMonthlyPriceConfigured);
  const href = plan.slug === "free"
    ? SIGNUP_HREF
    : canSelfServe
      ? buildSignupHref(plan, billingInterval)
      : CONTACT_HREF;

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (plan.slug === "free" || !canSelfServe || !session?.access_token) return;
    event.preventDefault();
    await startCheckout({ planSlug: plan.slug, billingInterval });
  };

  return (
    <div className="grid gap-2">
      <Link
        href={href}
        onClick={handleClick}
        aria-disabled={isSubmitting}
        data-plan={plan.slug}
        data-checkout-interval={billingInterval}
        className={cn(
          "group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-semibold transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          featured
            ? "bg-[linear-gradient(135deg,var(--blue),var(--purple))] text-white shadow-[0_14px_32px_rgba(20,99,255,0.22)] hover:-translate-y-px hover:shadow-[0_18px_42px_rgba(20,99,255,0.28)]"
            : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[0_10px_24px_rgba(15,23,42,0.04)] hover:-translate-y-px hover:bg-[var(--surface-soft)]",
          isSubmitting && "pointer-events-none opacity-70",
        )}
      >
        {isSubmitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : canSelfServe && plan.slug !== "free" ? <CreditCard aria-hidden="true" className="h-4 w-4" /> : null}
        <span>{isSubmitting ? "Redirecting..." : ctaLabel}</span>
        {!isSubmitting ? <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" /> : null}
      </Link>
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}

function PricingComparisonChart({
  plans,
  comparisonGroups,
}: {
  plans: PublicPricingPlan[];
  comparisonGroups: PublicPricingComparisonGroup[];
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }}>
      <Surface className="mx-auto w-full max-w-[1200px] overflow-hidden p-0">
        <div className="border-b border-[var(--border)] p-6 sm:p-7">
          <PillBadge icon={BarChart3}>Compare plans</PillBadge>
          <h2 className="mt-4 font-serif text-[clamp(34px,3.4vw,64px)] font-semibold leading-tight text-[var(--text)]">
            What each plan includes.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">
            Most product features are available across plans. Credits, seats, top-ups, and team capacity define the upgrade ladder.
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 md:hidden">
          {comparisonGroups.map((group) => (
            <div key={group.title} className="grid gap-3">
              <h3 className="rounded-xl border border-[color-mix(in_srgb,var(--blue)_18%,var(--border))] bg-[color-mix(in_srgb,var(--blue)_8%,var(--surface-soft))] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--blue)]">{group.title}</h3>
              {group.rows.map((row) => (
                <div key={`${group.title}-${row.label}`} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                  <h4 className="text-[15px] font-bold leading-6 text-[var(--text)]">{row.label}</h4>
                  {row.description ? <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{row.description}</p> : null}
                  <div className="mt-4 grid gap-2">
                    {plans.map((plan) => (
                      <div key={plan.slug} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3.5 py-2.5">
                        <span className="text-sm font-bold text-[var(--muted)]">{plan.name}</span>
                        <CellDisplay cell={row.values[plan.slug]} compact />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block xl:overflow-visible">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <th scope="col" className="w-[30%] bg-[var(--surface)] px-6 py-5 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text)]">
                  Capability
                </th>
                {plans.map((plan) => (
                  <th key={plan.slug} scope="col" className="bg-[var(--surface)] px-6 py-5 text-[15px] font-extrabold text-[var(--text)]">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonGroups.map((group) => (
                <Fragment key={group.title}>
                  <tr className="border-y border-[color-mix(in_srgb,var(--blue)_18%,var(--border))] bg-[color-mix(in_srgb,var(--blue)_8%,var(--surface-soft))]">
                    <th colSpan={plans.length + 1} className="px-6 py-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--blue)]">
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={`${group.title}-${row.label}`} className="border-b border-[var(--border)] last:border-b-0">
                      <th scope="row" className="px-6 py-5 align-top">
                        <span className="block text-[15px] font-extrabold leading-6 text-[var(--text)]">{row.label}</span>
                        {row.description ? <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{row.description}</span> : null}
                      </th>
                      {plans.map((plan) => (
                        <td key={plan.slug} className="px-6 py-5 align-top text-[15px] font-semibold leading-7 text-[var(--text)]">
                          <CellDisplay cell={row.values[plan.slug]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </motion.div>
  );
}

function CellDisplay({
  cell,
  compact = false,
}: {
  cell?: PublicPricingCell;
  compact?: boolean;
}) {
  if (!cell || cell.type === "dash") {
    return (
      <span aria-label="Not included" className="inline-flex items-center justify-center text-[var(--muted)]">
        <Minus aria-hidden="true" className="h-4 w-4" />
      </span>
    );
  }

  if (cell.type === "check") {
    return (
      <span className={cn("inline-flex items-center gap-2 font-bold text-[var(--text)]", compact && "text-sm")}>
        <span className={cn("inline-flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]", compact ? "h-6 w-6" : "h-7 w-7")}>
          <Check aria-hidden="true" className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        </span>
        {cell.label ? <span>{cell.label}</span> : <span className="sr-only">Included</span>}
      </span>
    );
  }

  return <span className={cn("font-semibold text-[var(--text)]", compact && "text-right text-xs")}>{cell.value}</span>;
}
