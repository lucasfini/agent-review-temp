import type { Metadata } from 'next';

import {
  AgencyPageIntro,
  AgencyPageShell,
  FinalAgencyCta,
  OfferGrid,
  SectionHeader,
} from '@/components/site/AgencySite';

export const metadata: Metadata = {
  title: 'Agency services for startup content and customer communication',
  description:
    'Content operations setup, founder content, customer communication systems, and custom startup operations support.',
  alternates: {
    canonical: '/agency/services',
  },
};

export default function AgencyServicesPage() {
  return (
    <AgencyPageShell>
      <AgencyPageIntro
        eyebrow="Services"
        title="Most startups do not have a shortage of ideas. They have a conversion problem."
        description="Calls, demos, Slack threads, and product decisions rarely become clear content or customer communication by themselves. These services turn that raw material into a repeatable output system."
      />
      <section className="border-b border-neutral-200 bg-neutral-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <OfferGrid />
        </div>
      </section>
      <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Service principle"
            title="Source material first. Output second."
            description="The work starts with real customer conversations, founder thinking, product context, support patterns, and team knowledge. That keeps the output specific enough to be useful."
          />
        </div>
      </section>
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}
