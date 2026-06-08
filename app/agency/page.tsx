import type { Metadata } from 'next';

import {
  AgencyHero,
  AgencyPageShell,
  FinalAgencyCta,
  FitSection,
  OfferGrid,
  OutcomeBand,
  ProcessSteps,
  SectionHeader,
} from '@/components/site/AgencySite';
import { agencyPositioning } from '@/lib/public-agency-content';

export const metadata: Metadata = {
  title: 'Done-for-you content and customer communication for startups',
  description:
    'A managed agency service that turns startup calls, meetings, customer conversations, and internal knowledge into content and customer communication assets.',
  alternates: {
    canonical: '/agency',
  },
};

export default function AgencyPage() {
  return (
    <AgencyPageShell>
      <AgencyHero />
      <OutcomeBand />
      <section className="border-b border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Services"
            title="A practical service system for founder content and customer communication."
            description={agencyPositioning.proof}
          />
          <div className="mt-8">
            <OfferGrid />
          </div>
        </div>
      </section>
      <section className="border-b border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Process"
            title="A simple rhythm for turning internal knowledge into external clarity."
          />
          <div className="mt-8">
            <ProcessSteps />
          </div>
        </div>
      </section>
      <FitSection />
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}
