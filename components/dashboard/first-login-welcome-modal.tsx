"use client";

import BrandLogo from '@/components/site/BrandLogo';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, FileText, Sparkles, Upload } from 'lucide-react';

interface FirstLoginWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToUpload: () => void;
}

const steps = [
  {
    title: 'Upload your audio',
    description: 'Start with a podcast, interview, webinar, or team recording.',
    icon: Upload,
  },
  {
    title: 'Review your project',
    description: 'Open Studio to inspect the transcript, speakers, and extracted insights.',
    icon: FileText,
  },
  {
    title: 'Generate content',
    description: 'Create social posts, summaries, show notes, and more from the same recording.',
    icon: Sparkles,
  },
];

export function FirstLoginWelcomeModal({
  isOpen,
  onClose,
  onGoToUpload,
}: FirstLoginWelcomeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="grid md:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-7 py-7 dark:border-slate-800 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] md:border-b-0 md:border-r">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(125,211,252,0.16),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_28%)]" />
            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="inline-flex rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
                  <BrandLogo showText={false} size="lg" theme="dark" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    First Project
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">AudioRepurpose</p>
                </div>
              </div>

              <DialogHeader className="space-y-3 text-left">
                <DialogTitle className="max-w-md text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-50">
                  Turn one recording into publish-ready assets.
                </DialogTitle>
                <DialogDescription className="max-w-lg text-sm leading-7 text-slate-600 dark:text-slate-300">
                  The quickest path is simple: upload a file, open it in Studio, and generate the content formats you actually need.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-8 rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      What to expect
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                      Most users start by uploading one episode or interview, then use the same project for transcript review, speaker cleanup, and content generation.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">
                    3 steps
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white px-6 py-7 dark:bg-slate-950">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Start here
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                You don&apos;t need to configure anything up front. Just get one project through the pipeline first.
              </p>
            </div>

            <div className="space-y-3">
              {steps.map(({ title, description, icon: Icon }, index) => (
                <div
                  key={title}
                  className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-colors dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        0{index + 1}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Upload, Studio, Billing, and Preferences are always available in the left sidebar.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onGoToUpload}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Upload your first file
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                I&apos;ll explore first
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
