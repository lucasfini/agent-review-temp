'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Mail, Send } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/lib/site-config';

export default function ContactForm() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const canSubmit = email.trim().length > 0 && subject.trim().length > 0 && message.trim().length > 0 && !submitting;
  const fallbackMailto = useMemo(() => {
    const body = [`From: ${email || 'your email'}`, '', message.trim()].filter(Boolean).join('\n');
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject || 'AudioRepurpose support')}&body=${encodeURIComponent(body)}`;
  }, [email, message, subject]);

  const submit = async () => {
    try {
      setSubmitting(true);
      setStatus(null);

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          category: 'general',
          severity: 'normal',
          affectedPage: '/contact',
          subject,
          message,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send your message.');
      }

      if (data.emailDelivered === false) {
        setStatus({
          type: 'warning',
          message: data.emailWarning || 'Your message was saved, but Resend email delivery is not configured yet.',
        });
      } else {
        setStatus({
          type: 'success',
          message: 'Your message was sent to support.',
        });
      }

      setEmail('');
      setSubject('');
      setMessage('');
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send your message.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Your email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What do you need help with?"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Message</label>
          <textarea
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue, request, or feedback."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        {status && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                : status.type === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{status.message}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send message
          </button>
          <a
            href={fallbackMailto}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Mail className="h-4 w-4" />
            Email support directly
          </a>
        </div>
      </div>
    </div>
  );
}
