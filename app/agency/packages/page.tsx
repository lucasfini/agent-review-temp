import type { Metadata } from 'next';

import {
  AgencyPageIntro,
  AgencyPageShell,
  FaqSection,
  FinalAgencyCta,
  FitSection,
  OfferGrid,
  SectionHeader,
} from '@/components/site/AgencySite';

export const metadata: Metadata = {
  title: 'Agency packages for startup content and communication',
  description:
    'Service packages for content operations setup, founder content, customer communication, and custom startup operations support.',
  alternates: {
    canonical: '/agency/packages',
  },
};

export default function AgencyPackagesPage() {
  return (
    <AgencyPageShell>
      <AgencyPageIntro
        eyebrow="Packages"
        title="Choose a starting point based on the communication problem you need solved."
        description="Exact scope is finalized after intake so the workflow matches your team, source material, and publishing rhythm. Packages are services, not software seats or credit bundles."
      />
      <section className="border-b border-neutral-200 bg-neutral-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <OfferGrid />
        </div>
      </section>
      <section className="border-b border-neutral-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Pricing"
            title="Scoped after intake."
            description="The useful package depends on your source material, review process, channels, and cadence. Intake starts with the bottleneck, then scope follows."
          />
        </div>
      </section>
      <FitSection />
      <FaqSection />
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}
