import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import {
  AgencyPageShell,
  FinalAgencyCta,
} from '@/components/site/AgencySite';

export const metadata: Metadata = {
  title: 'Agency inquiry received',
  description: 'Thanks for starting an agency inquiry.',
  alternates: {
    canonical: '/agency/thank-you',
  },
};

export default function AgencyThankYouPage() {
  return (
    <AgencyPageShell>
      <section className="border-b border-zinc-200 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-300" />
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-zinc-950 dark:text-white sm:text-5xl">
            Agency inquiry received.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
            We will review the communication need, source material, and package fit before recommending a practical next step.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
            {[
              'We review the inquiry for fit and useful context.',
              'If there is a clear match, we follow up with a short next-step note.',
              'No account, portal, or client record was created by this form.',
            ].map((item) => (
              <div key={item} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <CheckCircle2 className="mb-3 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/agency/process"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Review the process
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/agency/services"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
            >
              See services
            </Link>
          </div>
        </div>
      </section>
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}
