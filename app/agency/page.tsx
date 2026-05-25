import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  MessageSquareText,
  Rocket,
  Send,
  Sparkles,
} from "lucide-react";
import BrandLogo from "@/components/site/BrandLogo";

const workflow = [
  {
    label: "Send",
    title: "Weekly raw material",
    description:
      "Founder notes, investor updates, customer calls, product demos, podcasts, or team recordings.",
    Icon: Send,
  },
  {
    label: "Shape",
    title: "We find the useful angles",
    description:
      "We pull out the strongest lessons, opinions, stories, proof points, and launch updates.",
    Icon: Sparkles,
  },
  {
    label: "Publish",
    title: "You get ready-to-post drafts",
    description:
      "LinkedIn posts, X posts, threads, newsletter blocks, and short-form script ideas.",
    Icon: FileText,
  },
] as const;

const deliverables = [
  "Founder LinkedIn posts",
  "X posts and short threads",
  "Newsletter sections",
  "Launch and product update posts",
  "Customer-story angles",
  "Weekly content calendar",
] as const;

const audience = [
  "YC-style startups with weekly progress but no time to write",
  "B2B founders who sell through point of view and trust",
  "Early teams turning calls, demos, and updates into public momentum",
] as const;

export default function AgencyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_52%,#ffffff_100%)] dark:border-white/10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_58%,#020617_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.06)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center">
              <BrandLogo showSubtitle={false} />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="hidden rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white sm:inline-flex"
              >
                Product
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Book a content strategy call
              </Link>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-blue-200">
                <Rocket className="h-3.5 w-3.5" />
                Done-for-you startup content agency
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                Turn your startup updates into posts investors, customers, and
                candidates actually understand.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                Send weekly updates, calls, demos, or founder notes. We turn
                them into publish-ready LinkedIn and X content using the same
                content system behind AudioRepurpose.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-700"
                >
                  Book a content strategy call
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                >
                  View the platform
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_30px_90px_-55px_rgba(15,23,42,0.65)] backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/70">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Example weekly input
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  “We shipped our onboarding redesign, learned why trial users
                  were dropping off, and closed two design partners.”
                </p>
              </div>
              <div className="my-4 flex justify-center text-blue-600 dark:text-blue-300">
                <ArrowRight className="h-5 w-5 rotate-90" />
              </div>
              <div className="space-y-3">
                {[
                  "LinkedIn post: what the onboarding redesign taught us",
                  "X thread: 5 activation lessons from real trial users",
                  "Newsletter block: product update for customers and investors",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                  >
                    <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {workflow.map(({ label, title, description, Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
                  {label}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Built for
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Startups with momentum, but no spare writing team.
              </h2>
              <div className="mt-6 space-y-3">
                {audience.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Deliverables
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {deliverables.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
