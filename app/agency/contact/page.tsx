import type { Metadata } from 'next';

import {
  AgencyPageIntro,
  AgencyPageShell,
  ContactPlaceholder,
  FinalAgencyCta,
} from '@/components/site/AgencySite';

export const metadata: Metadata = {
  title: 'Contact the agency',
  description:
    'Start an agency intake for done-for-you startup content and customer communication support.',
  alternates: {
    canonical: '/agency/contact',
  },
};

export default function AgencyContactPage() {
  return (
    <AgencyPageShell>
      <AgencyPageIntro
        eyebrow="Contact"
        title="Start with the source material and communication bottleneck."
        description="Tell us what your team is trying to turn into output: calls, customer conversations, meeting notes, product updates, Slack discussion summaries, or founder ideas."
      />
      <ContactPlaceholder />
      <FinalAgencyCta />
    </AgencyPageShell>
  );
}

