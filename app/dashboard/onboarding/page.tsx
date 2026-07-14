import { Building2, FileText, FolderKanban, Mic2, PenLine, Volume2 } from 'lucide-react';

import { DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';

const setupItems = [
  {
    title: 'Account',
    description: 'Add your name so setup and generated content are tied to the right person.',
    Icon: PenLine,
  },
  {
    title: 'Workspace',
    description: 'Optionally name the workspace that organizes team activity and billing.',
    Icon: Building2,
  },
  {
    title: 'Studio Profile',
    description: 'Capture audience, positioning, and content goals for better drafts.',
    Icon: FileText,
  },
  {
    title: 'Voice',
    description: 'Save a reusable tone and style profile for generated content.',
    Icon: Volume2,
  },
  {
    title: 'Plan',
    description: 'Create a lightweight content plan for channels, audience, and objective.',
    Icon: FolderKanban,
  },
  {
    title: 'Upload',
    description: 'Turn recordings into transcripts, insights, quotes, and reusable drafts.',
    Icon: Mic2,
  },
];

export default function OnboardingPage() {
  return (
    <DashboardPageShell maxWidth="5xl">
      <DashboardPageHeader
        eyebrow="Getting started"
        title="Finish setup"
        description="A short guided flow will finish your account profile, optionally create workspace and Studio context, and show how AudioRepurpose turns recordings into useful content."
        icon={Building2}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {setupItems.map(({ title, description, Icon }) => (
          <section
            key={title}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <Icon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
          </section>
        ))}
      </div>
    </DashboardPageShell>
  );
}
