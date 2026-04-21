import Link from 'next/link';
import { ArrowRight, LifeBuoy, Mail } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/lib/site-config';
import ContactForm from '@/components/site/contact-form';

export default function ContactPage() {
  const subject = encodeURIComponent('AudioRepurpose support');
  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

  return (
    <main className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-14">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
          <LifeBuoy className="h-4 w-4" />
          Contact AudioRepurpose
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Reach support at {SUPPORT_EMAIL}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Questions about billing, account access, broken workflows, or feature requests should go to our support inbox.
            If you already have an account, you can also submit a structured request from the dashboard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href={mailtoHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Mail className="h-4 w-4" />
            Email support
          </a>
          <Link
            href="/dashboard/contact"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Open dashboard contact form
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <ContactForm />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Best results</p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Include the page you were on, the project title if relevant, what you expected to happen, and what actually
            happened. That gives support enough context to respond faster.
          </p>
        </div>
      </div>
    </main>
  );
}
