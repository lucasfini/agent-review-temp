import type { Metadata } from 'next';

import {
  AgencyPageIntro,
  AgencyPageShell,
  FinalAgencyCta,
  ProcessSteps,
  SectionHeader,
} from '@/components/site/AgencySite';

export const metadata: Metadata = {
  title: 'Agency process for turning startup knowledge into output',
  description:
    'A managed source, context, production, review, and delivery rhythm for startup content and customer communication.',
  alternates: {
    canonical: '/agency/process',
  },
};

export default function AgencyProcessPage() {
  return (
    <AgencyPageShell>
      <AgencyPageIntro
        eyebrow="Process"
        title="A simple rhythm for turning internal knowledge into external clarity."
        description="The service is designed to be low-friction for busy teams: share the source material, define context, review the drafts, and keep improving the communication system."
      />
      <section className="border-b border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ProcessSteps />
        </div>
      </section>
      <section className="border-b border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Review"
            title="Human review stays in the loop."
            description="The current workflow is built around review and manual delivery. The goal is dependable quality and fit, not automatic publishing before the message is ready."
          />
        </div>
      </section>
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}

