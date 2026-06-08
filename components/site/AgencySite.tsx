import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Layers3,
  Mail,
  MessageSquareText,
  PenLine,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react';

import AgencyLeadForm from '@/components/site/AgencyLeadForm';
import BrandLogo from '@/components/site/BrandLogo';
import {
  agencyFaqs,
  agencyNavLinks,
  agencyOffers,
  agencyOutcomes,
  agencyPositioning,
  agencyProcessSteps,
  agencySourceExamples,
  agencyWhoFor,
  agencyWhoNotFor,
  type AgencyOffer,
} from '@/lib/public-agency-content';

const offerIcons = {
  'content-operations-setup': Layers3,
  'monthly-founder-content': PenLine,
  'customer-communication-system': MessageSquareText,
  'custom-startup-ops': Workflow,
} as const;

const processIcons = [ClipboardCheck, Send, Users, Sparkles, FileText, RefreshCcw] as const;

export function AgencyHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/agency" className="inline-flex items-center" aria-label="Agency home">
          <BrandLogo showSubtitle={false} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Agency navigation">
          {agencyNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/agency/contact"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Start intake
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

export function AgencyHero() {
  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 text-white">
      <Image
        src="/launch/project-real.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 -z-20 object-cover opacity-15"
      />
      <div className="absolute inset-0 -z-10 bg-zinc-950/80" />
      <div className="absolute left-1/2 top-16 -z-10 hidden w-[42rem] -translate-x-1/2 lg:block">
        <SourceScene />
      </div>
      <div className="mx-auto flex min-h-[82svh] max-w-5xl flex-col justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="mx-auto max-w-2xl text-sm font-semibold uppercase text-emerald-300">
          {agencyPositioning.eyebrow}
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
          {agencyPositioning.headline}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-200">
          {agencyPositioning.subheadline}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/agency/contact"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 sm:w-auto"
          >
            {agencyPositioning.primaryCta}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/agency/packages"
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
          >
            {agencyPositioning.secondaryCta}
          </Link>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-zinc-300">
          {agencyPositioning.reassurance}
        </p>
      </div>
    </section>
  );
}

function SourceScene() {
  const colors = [
    'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
    'border-amber-300/40 bg-amber-300/10 text-amber-100',
    'border-sky-300/40 bg-sky-300/10 text-sky-100',
    'border-rose-300/40 bg-rose-300/10 text-rose-100',
  ];

  return (
    <div className="relative h-[34rem]">
      {agencySourceExamples.map((source, index) => (
        <div
          key={source}
          className={`absolute rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur ${colors[index % colors.length]}`}
          style={{
            left: `${(index % 3) * 28}%`,
            top: `${index * 13}%`,
            width: index % 2 === 0 ? '16rem' : '13rem',
          }}
        >
          <p className="font-semibold">{source}</p>
          <p className="mt-1 text-xs opacity-80">source material</p>
        </div>
      ))}
    </div>
  );
}

export function AgencyPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <AgencyHeader />
      {children}
    </main>
  );
}

export function AgencyPageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="border-b border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-zinc-950 dark:text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-zinc-950 dark:text-white sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-300">{description}</p>
      ) : null}
    </div>
  );
}

export function OutcomeBand() {
  return (
    <section className="border-b border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Outcomes"
          title="The service turns existing company signal into useful communication assets."
          description="The goal is not more tools. The goal is a dependable rhythm for extracting the useful parts of what your team already knows."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {agencyOutcomes.map((outcome) => (
            <div key={outcome} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{outcome}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OfferGrid({ offers = agencyOffers }: { offers?: AgencyOffer[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {offers.map((offer) => {
        const Icon = offerIcons[offer.id];
        return (
          <article key={offer.id} className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{offer.eyebrow}</p>
                <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">{offer.title}</h3>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{offer.outcome}</p>
            <ul className="mt-5 space-y-2">
              {offer.includes.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-zinc-200 pt-5 text-sm dark:border-zinc-800 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-zinc-950 dark:text-white">Cadence</p>
                <p className="mt-1 leading-6 text-zinc-600 dark:text-zinc-300">{offer.cadence}</p>
              </div>
              <div>
                <p className="font-semibold text-zinc-950 dark:text-white">Best fit</p>
                <p className="mt-1 leading-6 text-zinc-600 dark:text-zinc-300">{offer.bestFit}</p>
              </div>
            </div>
            <Link
              href={offer.href}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {offer.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function ProcessSteps() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {agencyProcessSteps.map((step, index) => {
        const Icon = processIcons[index % processIcons.length];
        return (
          <article key={step.number} className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{step.number}</span>
              <Icon className="h-5 w-5 text-zinc-400" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-zinc-950 dark:text-white">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{step.description}</p>
          </article>
        );
      })}
    </div>
  );
}

export function FitSection() {
  return (
    <section className="border-b border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHeader
            eyebrow="Fit"
            title="Built for teams with source material and no consistent output engine."
          />
          <div className="mt-8 space-y-4">
            {agencyWhoFor.map((item) => (
              <div key={item.label} className="flex gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <p className="font-semibold text-zinc-950 dark:text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader
            eyebrow="Not a fit"
            title="Not for generic content volume or fully automated publishing."
          />
          <div className="mt-8 space-y-4">
            {agencyWhoNotFor.map((item) => (
              <div key={item.label} className="flex gap-3">
                <XCircle className="mt-1 h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-300" />
                <div>
                  <p className="font-semibold text-zinc-950 dark:text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section className="border-b border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="FAQ"
          title="Practical answers before intake."
          description="The service is intentionally reviewed and managed. Later phases may add more automation, but the public offer stays outcome-first."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {agencyFaqs.map((faq) => (
            <article key={faq.question} className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-950 dark:text-white">{faq.question}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalAgencyCta() {
  return (
    <section className="bg-zinc-950 py-16 text-white">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <ShieldCheck className="mx-auto h-8 w-8 text-emerald-300" />
        <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
          Start with the communication bottleneck, not a software signup.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-300">
          Tell us what your team is trying to turn into output. We will review fit and recommend the simplest useful service path.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/agency/contact"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Start agency intake
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/agency/process"
            className="inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            See the process
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ContactPlaceholder() {
  return (
    <section className="border-b border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <SectionHeader
            eyebrow="Intake"
            title="Tell us what your team is trying to turn into output."
            description="Calls, customer conversations, meeting notes, product updates, Slack discussion summaries, or founder ideas are all useful starting points."
          />
          <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Submitting an agency inquiry does not create a SaaS account, client portal login, or automatic agency client record.
          </p>
        </div>
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <Mail className="h-4 w-4" />
            Agency intake
          </div>
          <AgencyLeadForm />
        </div>
      </div>
    </section>
  );
}
