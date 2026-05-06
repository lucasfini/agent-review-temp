"use client";

import BrandLogo from '@/components/site/BrandLogo';
import { useAuth } from '@/lib/auth/context';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Mic, Sparkles, Wand2 } from 'lucide-react';
import { useTheme } from 'next-themes';

interface FirstLoginWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToUpload: () => void;
}

const highlights = [
  {
    title: 'Upload something real',
    description: 'Podcasts, interviews, webinars, and team calls all fit naturally here.',
    icon: Mic,
  },
  {
    title: 'Get a cleaner transcript',
    description: 'See speakers, structure, and the conversation more clearly.',
    icon: Sparkles,
  },
  {
    title: 'Make content from it',
    description: 'Turn one recording into summaries, posts, notes, and more.',
    icon: Wand2,
  },
];

export function FirstLoginWelcomeModal({
  isOpen,
  onClose,
  onGoToUpload,
}: FirstLoginWelcomeModalProps) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const logoTheme = resolvedTheme === 'dark' ? 'dark' : 'light';
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  const firstName = fullName.split(/\s+/)[0] || '';
  const welcomeName = firstName || user?.email?.split('@')[0] || 'there';

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[560px] gap-0 overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:w-[min(92vw,560px)] sm:rounded-xl [&>button]:right-4 [&>button]:top-4 [&>button]:z-10 [&>button]:bg-white/85 [&>button]:text-slate-600 [&>button]:opacity-100 [&>button]:shadow-sm hover:[&>button]:bg-white hover:[&>button]:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:[&>button]:bg-slate-900/85 dark:[&>button]:text-slate-300 dark:hover:[&>button]:bg-slate-900 dark:hover:[&>button]:text-white">
        <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[calc(100dvh-2rem)]">
          <div className="border-b border-slate-200 bg-slate-50 px-5 pb-6 pt-5 dark:border-slate-800 dark:bg-slate-900/70 sm:px-8 sm:pb-7 sm:pt-7">
            <div className="mb-5 flex items-center gap-3 pr-10">
              <BrandLogo showText={false} size="md" theme={logoTheme} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Welcome
                </p>
                <p className="truncate text-sm text-slate-600 dark:text-slate-300">AudioRepurpose</p>
              </div>
            </div>

            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="max-w-[30rem] break-words pr-8 text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-50 sm:text-3xl">
                Welcome, {welcomeName}.
              </DialogTitle>
              <DialogDescription className="max-w-[34rem] text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base sm:leading-7">
                AudioRepurpose helps you go from one recording to clean transcripts and publish-ready content without a messy workflow.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Quick start
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                Drop in one file and see what the workspace gives back. It is the fastest way to get a feel for the product.
              </p>
            </div>
          </div>

          <div className="bg-white px-5 py-5 dark:bg-slate-950 sm:px-8 sm:py-6">
            <div className="space-y-1">
              {highlights.map(({ title, description, icon: Icon }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-lg px-1 py-2.5"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:justify-start">
              <button
                type="button"
                onClick={onGoToUpload}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
              >
                Upload a file
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
              >
                Explore first
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
