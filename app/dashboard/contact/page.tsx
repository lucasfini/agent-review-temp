"use client";

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { AlertCircle, Copy, LifeBuoy, Loader2, Mail, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const SUPPORT_EMAIL = 'support@audiorepurpose.com';

type Category = 'bug' | 'feedback' | 'billing' | 'account' | 'feature';
type Severity = 'low' | 'normal' | 'high';

const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: 'bug', label: 'Bug / broken workflow' },
  { value: 'feedback', label: 'General feedback' },
  { value: 'billing', label: 'Billing or credits' },
  { value: 'account', label: 'Account or access' },
  { value: 'feature', label: 'Feature request' },
];

export default function ContactPage() {
  const { user, session, isDemoMode } = useAuth();
  const [category, setCategory] = useState<Category>('bug');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [affectedPage, setAffectedPage] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const remaining = 800 - message.length;
  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !submitting;

  const copySupportEmail = async () => {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const fallbackMailto = useMemo(() => {
    const body = [
      user?.email ? `From: ${user.email}` : '',
      affectedPage ? `Page: ${affectedPage}` : '',
      projectTitle ? `Project: ${projectTitle}` : '',
      serviceArea ? `Service: ${serviceArea}` : '',
      '',
      message.trim(),
    ].filter(Boolean).join('\n');

    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject || 'AudioRepurpose support request')}&body=${encodeURIComponent(body)}`;
  }, [affectedPage, message, projectTitle, serviceArea, subject, user?.email]);

  const submit = async () => {
    if (!session?.access_token) {
      toast.error('You need to be signed in to submit a support request.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          category,
          severity,
          affectedPage,
          projectTitle,
          serviceArea,
          subject,
          message,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit support request.');
      }

      toast.success('Support request submitted.');
      setSubject('');
      setMessage('');
      setProjectTitle('');
      setServiceArea('');
      if (!isDemoMode) {
        setAffectedPage(window.location.pathname);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit support request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-950 min-h-full text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
          <LifeBuoy className="h-4 w-4 text-blue-500 dark:text-blue-400" />
          <span className="font-semibold">AudioRepurpose support</span>
          <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Feedback
          </span>
          <span className="rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
            Contact us
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#232323] shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
          <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">How can we help?</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Send a support request for bugs, billing issues, account problems, or product feedback.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                Include the page, project, and a short reproduction path.
              </div>
            </div>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Account</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{user?.email || SUPPORT_EMAIL}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">What are you having issues with?</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Which page is affected?</label>
                <input
                  value={affectedPage}
                  onChange={(e) => setAffectedPage(e.target.value)}
                  placeholder="/dashboard/projects"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Which service area is affected?</label>
                <input
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  placeholder="Studio, billing, exports, analytics..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Which project is affected?</label>
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="Project title or ID (optional)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                <p>
                  Faster support happens when you include the page, project, what you expected, and what actually happened.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary of the problem or feedback"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Message</label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{remaining} characters left</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 800))}
                rows={7}
                placeholder="Describe the issue or feedback. Include what you clicked, what happened, and what you expected."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#262626] px-3 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send support request
            </button>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1d1d1d] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-300">Having trouble submitting the form?</p>
              <p className="mt-1">Email us directly at <span className="text-slate-900 dark:text-slate-100">{SUPPORT_EMAIL}</span>.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={fallbackMailto}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email support
                </a>
                <button
                  type="button"
                  onClick={copySupportEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied' : 'Copy email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
