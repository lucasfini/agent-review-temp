import { Suspense, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Headphones,
  Layers3,
  Mail,
  Megaphone,
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
import AgencyFunnelTracker from '@/components/site/AgencyFunnelTracker';
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

const signalStages = [
  {
    label: 'Source',
    title: 'Calls, notes, updates',
    description: 'Customer calls, founder notes, product updates, and Slack summaries.',
    Icon: Headphones,
    accent: 'bg-cyan-500',
  },
  {
    label: 'Context',
    title: 'Voice and customer signal',
    description: 'Positioning, audience, customer pain points, and internal nuance.',
    Icon: ShieldCheck,
    accent: 'bg-emerald-500',
  },
  {
    label: 'Output',
    title: 'Drafts ready to review',
    description: 'Founder posts, newsletters, launch notes, and customer messages.',
    Icon: FileCheck2,
    accent: 'bg-amber-500',
  },
] as const;

export function AgencyHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 text-neutral-950 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/agency" className="inline-flex items-center gap-3" aria-label="Agency home">
          <BrandLogo showSubtitle={false} size="sm" />
          <span className="hidden text-sm font-semibold sm:inline">AudioRepurpose Agency</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Agency navigation">
          {agencyNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/agency/contact"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
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
    <section className="relative isolate overflow-hidden bg-neutral-950 text-white">
      <Image
        src="/launch/project-real.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 -z-20 object-cover opacity-20"
      />
      <div className="absolute inset-0 -z-10 bg-neutral-950/80" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-36 bg-neutral-950" />

      <div className="mx-auto flex min-h-[76svh] max-w-7xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-cyan-100 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            {agencyPositioning.eyebrow}
          </p>
          <h1 className="mx-auto mt-6 max-w-5xl text-4xl font-semibold leading-[1.05] text-white sm:text-5xl lg:text-7xl">
            {agencyPositioning.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-neutral-200 sm:text-lg">
            {agencyPositioning.subheadline}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/agency/contact"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-200 sm:w-auto"
            >
              {agencyPositioning.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/agency/packages"
              className="inline-flex w-full items-center justify-center rounded-md border border-white/28 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              {agencyPositioning.secondaryCta}
            </Link>
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-neutral-300">
            {agencyPositioning.reassurance}
          </p>
        </div>

        <SignalFlowPreview />
      </div>
    </section>
  );
}

function SignalFlowPreview() {
  return (
    <div className="mx-auto mt-12 grid w-full max-w-5xl gap-3 text-left md:grid-cols-3">
      {signalStages.map((stage, index) => {
        const Icon = stage.Icon;
        return (
          <div
            key={stage.label}
            className="motion-safe:animate-fade-up rounded-lg border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/20 backdrop-blur"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-md ${stage.accent} text-neutral-950`}>
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-xs font-semibold uppercase text-neutral-300">{stage.label}</p>
              </div>
              {index < signalStages.length - 1 ? (
                <ArrowRight className="hidden h-4 w-4 text-white/40 md:block" />
              ) : null}
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">{stage.title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{stage.description}</p>
          </div>
        );
      })}
    </div>
  );
}

export function AgencyPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <AgencyFunnelTracker />
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
    <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase text-cyan-700">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-neutral-950 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-neutral-600">
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
      <p className="text-sm font-semibold uppercase text-cyan-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-neutral-950 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-neutral-600">{description}</p>
      ) : null}
    </div>
  );
}

export function OutcomeBand() {
  return (
    <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div>
          <SectionHeader
            eyebrow="Outcomes"
            title="The useful parts of your company conversations become a weekly communication system."
            description="The goal is not more tools. The goal is a dependable rhythm for extracting the useful parts of what your team already knows."
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-2xl font-semibold text-neutral-950">4+</p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">core output formats per source workflow</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-2xl font-semibold text-neutral-950">1</p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">review rhythm for intake, drafts, and delivery</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-2xl font-semibold text-neutral-950">0</p>
              <p className="mt-1 text-sm leading-6 text-neutral-600">new SaaS workspace for clients to manage</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          {agencyOutcomes.map((outcome, index) => (
            <div key={outcome} className="rounded-lg border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex gap-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-neutral-950 text-white">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-6 text-neutral-700">{outcome}</p>
              </div>
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
          <article key={offer.id} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-cyan-700">{offer.eyebrow}</p>
                <h3 className="mt-1 text-xl font-semibold text-neutral-950">{offer.title}</h3>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-neutral-600">{offer.outcome}</p>
            <ul className="mt-5 grid gap-2">
              {offer.includes.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6 text-neutral-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-neutral-200 pt-5 text-sm sm:grid-cols-2">
              <div>
                <p className="font-semibold text-neutral-950">Cadence</p>
                <p className="mt-1 leading-6 text-neutral-600">{offer.cadence}</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-950">Best fit</p>
                <p className="mt-1 leading-6 text-neutral-600">{offer.bestFit}</p>
              </div>
            </div>
            <Link
              href={offer.href}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
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
          <article key={step.number} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-cyan-700">{step.number}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-neutral-950">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{step.description}</p>
          </article>
        );
      })}
    </div>
  );
}

export function FitSection() {
  return (
    <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHeader
            eyebrow="Fit"
            title="Built for teams with source material and no consistent output engine."
          />
          <div className="mt-8 space-y-4">
            {agencyWhoFor.map((item) => (
              <div key={item.label} className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-neutral-950">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-700">{item.description}</p>
                  </div>
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
              <div key={item.label} className="rounded-lg border border-rose-200 bg-rose-50 p-5">
                <div className="flex gap-3">
                  <XCircle className="mt-1 h-5 w-5 flex-shrink-0 text-rose-700" />
                  <div>
                    <p className="font-semibold text-neutral-950">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-700">{item.description}</p>
                  </div>
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
    <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="FAQ"
          title="Practical answers before intake."
          description="The service is intentionally reviewed and managed. Later phases may add more automation, but the public offer stays outcome-first."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {agencyFaqs.map((faq) => (
            <article key={faq.question} className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
              <h3 className="font-semibold text-neutral-950">{faq.question}</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalAgencyCta() {
  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 py-16 text-white sm:py-20">
      <div className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 opacity-20 lg:block">
        <Image
          src="/launch/hub-real.png"
          alt=""
          fill
          sizes="50vw"
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-neutral-950/80" />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <ShieldCheck className="h-8 w-8 text-cyan-300" />
          <h2 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
            Start with the communication bottleneck, not a software signup.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-300">
            Tell us what your team is trying to turn into output. We will review fit and recommend the simplest useful service path.
          </p>
        </div>
        <div className="grid content-end gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
            <Megaphone className="h-5 w-5 text-amber-300" />
            <p className="mt-3 text-sm font-semibold text-white">Founder content</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
            <CalendarDays className="h-5 w-5 text-cyan-300" />
            <p className="mt-3 text-sm font-semibold text-white">Weekly rhythm</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
            <FileText className="h-5 w-5 text-emerald-300" />
            <p className="mt-3 text-sm font-semibold text-white">Draft delivery</p>
          </div>
          <div className="flex flex-col gap-3 sm:col-span-3 sm:flex-row">
            <Link
              href="/agency/contact"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-5 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-cyan-200"
            >
              Start agency intake
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/agency/process"
              className="inline-flex items-center justify-center rounded-md border border-white/28 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              See the process
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactPlaceholder() {
  return (
    <section className="border-b border-neutral-200 bg-neutral-50 py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <SectionHeader
            eyebrow="Intake"
            title="Tell us what your team is trying to turn into output."
            description="Calls, customer conversations, meeting notes, product updates, Slack discussion summaries, or founder ideas are all useful starting points."
          />
          <div className="mt-8 grid gap-3">
            {agencySourceExamples.slice(0, 4).map((source) => (
              <div key={source} className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="text-sm font-semibold text-neutral-950">{source}</p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">Useful source material for the first workflow.</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-neutral-600">
            Submitting an agency inquiry does not create a SaaS account, client portal login, or automatic agency client record.
          </p>
        </div>
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-700">
            <Mail className="h-4 w-4" />
            Agency intake
          </div>
          <Suspense fallback={<AgencyLeadFormFallback />}>
            <AgencyLeadForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

function AgencyLeadFormFallback() {
  return (
    <div aria-label="Loading agency intake form" className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index}>
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="mt-2 h-10 rounded-md border border-neutral-200 bg-neutral-100" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-32 rounded-md border border-neutral-200 bg-neutral-100" />
      <div className="mt-5 h-11 w-48 rounded-md bg-neutral-200" />
    </div>
  );
}
