"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { isPipelineDocAllowed } from '@/lib/pipeline-doc-access';
import type { PipelineDoc } from '@/lib/pipeline-doc';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error' | 'forbidden';

export default function PipelinePage() {
  const { user, session, loading } = useAuth();
  const [doc, setDoc] = useState<PipelineDoc | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session?.access_token) return;

    const fetchDoc = async () => {
      setState('loading');
      try {
        const response = await fetch('/api/pipeline-doc', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.status === 403) {
          setState('forbidden');
          return;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to load pipeline doc');
        }

        const data = await response.json();
        setDoc(data);
        setState('loaded');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline doc');
        setState('error');
      }
    };

    fetchDoc();
  }, [loading, session?.access_token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto mb-3" />
          <p className="text-slate-500 text-sm dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <p className="text-slate-500 text-sm dark:text-slate-400">Please sign in to view this page.</p>
      </div>
    );
  }

  if (!isPipelineDocAllowed(user.email)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <p className="text-slate-500 text-sm dark:text-slate-400">You do not have access to this page.</p>
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <p className="text-slate-500 text-sm dark:text-slate-400">You do not have access to this page.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <p className="text-slate-500 text-sm dark:text-slate-400">{error || 'Failed to load pipeline doc.'}</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center dark:bg-slate-950">
        <p className="text-slate-500 text-sm dark:text-slate-400">Loading pipeline doc...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-950 dark:text-white">{doc.title}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{doc.summary}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Generated at {new Date(doc.generatedAt).toLocaleString()}</p>
        </div>

        <div className="space-y-6">
          {doc.sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/30">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 dark:text-slate-200">{section.title}</h2>
              <ul className="space-y-2">
                {section.items.map((item, idx) => (
                  <li key={`${section.title}-${idx}`} className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/30">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 dark:text-slate-200">Model Verdict</h2>
          <ul className="space-y-2">
            {doc.modelVerdict.map((item, idx) => (
              <li key={`verdict-${idx}`} className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/30">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 dark:text-slate-200">References</h2>
          <ul className="space-y-2">
            {doc.references.map((ref) => (
              <li key={ref} className="text-sm text-slate-600 dark:text-slate-300">
                <code className="text-slate-800 dark:text-slate-200">{ref}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
