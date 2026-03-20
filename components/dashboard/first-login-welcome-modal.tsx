"use client";

import BrandLogo from '@/components/site/BrandLogo';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Mic, Sparkles, Wand2 } from 'lucide-react';

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
  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[90vw] sm:w-[700px] lg:w-[740px] max-w-none overflow-hidden border-slate-200/70 bg-white/72 p-0 shadow-2xl backdrop-blur-2xl dark:border-slate-800/70 dark:bg-slate-950/70 [&>button]:bg-transparent [&>button]:text-slate-700 [&>button]:opacity-100 hover:[&>button]:bg-transparent hover:[&>button]:text-slate-950 [&>button]:ring-offset-white dark:[&>button]:text-slate-200 dark:hover:[&>button]:bg-transparent dark:hover:[&>button]:text-white dark:[&>button]:ring-offset-slate-950">
        <div>
          <div className="relative overflow-hidden border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,251,255,0.82)_0%,rgba(238,245,255,0.72)_100%)] px-6 py-6 dark:border-slate-800/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.84)_0%,rgba(17,24,39,0.72)_100%)] sm:px-8 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(125,211,252,0.16),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_28%)]" />
            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="inline-flex rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
                  <BrandLogo showText={false} size="lg" theme="dark" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    Welcome
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">AudioRepurpose</p>
                </div>
              </div>

              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="max-w-xl text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                  Welcome in.
                </DialogTitle>
                <DialogDescription className="max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  AudioRepurpose helps you go from one recording to clean transcripts and publish-ready content without a messy workflow.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-7 rounded-3xl border border-slate-200/70 bg-white/58 p-5 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/45 sm:p-6">
                <div className="flex items-start gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Quick start
                    </p>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-slate-700 dark:text-slate-300">
                      Drop in one file and see what the workspace gives back. It is the fastest way to get a feel for the product.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/42 px-6 py-6 dark:bg-slate-950/38 sm:px-8 sm:py-7">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                What you can do here
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Keep it simple. Start with one recording and explore from there.
              </p>
            </div>

            <div className="grid gap-2.5 md:grid-cols-3">
              {highlights.map(({ title, description, icon: Icon }) => (
                <div
                  key={title}
                  className="flex gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/52 p-3.5 transition-colors dark:border-slate-800/80 dark:bg-slate-900/38"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onGoToUpload}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Upload a file
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
