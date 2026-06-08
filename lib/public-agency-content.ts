export type AgencyOfferId =
  | 'content-operations-setup'
  | 'monthly-founder-content'
  | 'customer-communication-system'
  | 'custom-startup-ops';

export type AgencyOffer = {
  id: AgencyOfferId;
  title: string;
  eyebrow: string;
  outcome: string;
  includes: string[];
  cadence: string;
  bestFit: string;
  cta: string;
  href: string;
};

export type AgencyProcessStep = {
  number: string;
  title: string;
  description: string;
};

export type AgencyFaq = {
  question: string;
  answer: string;
};

export type AgencyFitItem = {
  label: string;
  description: string;
};

export const agencyNavLinks = [
  { label: 'Services', href: '/agency/services' },
  { label: 'Process', href: '/agency/process' },
  { label: 'Packages', href: '/agency/packages' },
  { label: 'Contact', href: '/agency/contact' },
] as const;

export const agencyPositioning = {
  eyebrow: 'Done-for-you startup content and customer communication',
  headline: 'Turn calls, meetings, and customer conversations into content your market can actually use.',
  subheadline:
    'We help founder-led startups turn raw company knowledge into LinkedIn posts, newsletters, customer updates, release messages, and support-ready communication assets.',
  primaryCta: 'Start agency intake',
  secondaryCta: 'See service packages',
  reassurance:
    'This is a managed service, not another SaaS login. You send source material, review drafts, and get useful communication assets back.',
  proof:
    'Built from the operating system behind AudioRepurpose, adapted into a private service workflow for startup teams.',
} as const;

export const agencySourceExamples = [
  'Customer call notes',
  'Founder updates',
  'Product demo insights',
  'Support themes',
  'Release notes',
  'Slack discussion summaries',
] as const;

export const agencyOutcomes = [
  'consistent founder content without starting from a blank page',
  'customer updates that explain what changed and why it matters',
  'reusable support and customer-success messaging',
  'a repeatable source-to-draft workflow for weekly output',
] as const;

export const agencyOffers: AgencyOffer[] = [
  {
    id: 'content-operations-setup',
    eyebrow: 'One-time setup',
    title: 'Content Operations Setup',
    outcome:
      'A repeatable content and communication operating system built around your voice, customers, and source material.',
    includes: [
      'positioning and audience intake',
      'brand voice and founder voice notes',
      'content pillars and customer pain point themes',
      'source workflows for calls, meeting notes, updates, and manual notes',
      'starter templates for posts, newsletters, product updates, and customer messages',
    ],
    cadence: 'One setup sprint with async intake and one or two working sessions.',
    bestFit:
      'Teams with useful raw knowledge but no repeatable content or communication system.',
    cta: 'Request a setup audit',
    href: '/agency/contact?package=content-operations-setup',
  },
  {
    id: 'monthly-founder-content',
    eyebrow: 'Recurring',
    title: 'Monthly Founder Content System',
    outcome:
      'A dependable stream of founder point-of-view content built from real company context.',
    includes: [
      'recurring intake from founder notes, calls, demos, updates, or meeting notes',
      'LinkedIn post drafts and optional X/thread drafts',
      'newsletter sections or founder update drafts',
      'campaign content for launches, hiring, product updates, or customer education',
      'review and delivery rhythm with monthly planning',
    ],
    cadence: 'Weekly or biweekly source intake with weekly draft delivery.',
    bestFit:
      'Founder-led B2B startups where trust, expertise, and point of view drive sales.',
    cta: 'Apply for monthly founder content',
    href: '/agency/contact?package=monthly-founder-content',
  },
  {
    id: 'customer-communication-system',
    eyebrow: 'Setup or recurring',
    title: 'Customer Communication System',
    outcome:
      'Clearer customer updates, release messages, support responses, and education assets.',
    includes: [
      'customer update framework',
      'release and product-update communication templates',
      'support response templates or macros',
      'meeting-to-message workflows',
      'customer pain point extraction and communication tone guidance',
    ],
    cadence: 'Setup sprint or monthly support built from customer calls, notes, and support themes.',
    bestFit:
      'Startups shipping quickly but struggling to explain product changes and customer value clearly.',
    cta: 'Build our customer communication system',
    href: '/agency/contact?package=customer-communication-system',
  },
  {
    id: 'custom-startup-ops',
    eyebrow: 'Custom',
    title: 'Custom Startup Ops Package',
    outcome:
      'A tailored mix of content, communication, source intake, and internal workflow support.',
    includes: [
      'custom source workflows',
      'founder content and customer updates',
      'launch messages and campaign support',
      'internal recap-to-output workflows',
      'advisory on what source material should become public content or customer messaging',
    ],
    cadence: 'Scoped monthly retainer with a prioritized queue and custom delivery rhythm.',
    bestFit:
      'Startups with multiple communication bottlenecks and no dedicated content/customer ops function.',
    cta: 'Talk through a custom workflow',
    href: '/agency/contact?package=custom-startup-ops',
  },
];

export const agencyProcessSteps: AgencyProcessStep[] = [
  {
    number: '01',
    title: 'Discovery and intake',
    description:
      'Clarify goals, audience, channels, customer context, and the source material your team already creates.',
  },
  {
    number: '02',
    title: 'Source setup',
    description:
      'Define how calls, notes, updates, customer conversations, Slack summaries, or documents will be shared.',
  },
  {
    number: '03',
    title: 'Brand and context setup',
    description:
      'Document voice, positioning, content pillars, customer pain points, and communication tone.',
  },
  {
    number: '04',
    title: 'Production',
    description:
      'Turn source material into drafts, updates, templates, and communication assets for review.',
  },
  {
    number: '05',
    title: 'Review and delivery',
    description:
      'Deliver organized drafts for edits, approval, copying, export, or handoff through your preferred workflow.',
  },
  {
    number: '06',
    title: 'Ongoing improvement',
    description:
      'Refine based on feedback, campaign needs, customer questions, and what is actually useful.',
  },
];

export const agencyWhoFor: AgencyFitItem[] = [
  {
    label: 'Founder-led B2B startups',
    description:
      'Teams where founder expertise and customer trust matter, but content is inconsistent.',
  },
  {
    label: 'Teams with calls and Slack knowledge',
    description:
      'Companies with useful discussions, demos, and notes that rarely become external clarity.',
  },
  {
    label: 'Startups needing customer updates',
    description:
      'Teams shipping quickly and needing clearer release notes, customer education, and support messaging.',
  },
  {
    label: 'Teams that want done-for-you execution',
    description:
      'Operators who want a managed production rhythm, not another empty workflow to manage.',
  },
];

export const agencyWhoNotFor: AgencyFitItem[] = [
  {
    label: 'Generic AI spam programs',
    description:
      'The workflow starts from real company context, not volume for its own sake.',
  },
  {
    label: 'Teams unwilling to provide source material',
    description:
      'Good output depends on calls, notes, product context, customer conversations, and review feedback.',
  },
  {
    label: 'Fully automated publishing on day one',
    description:
      'The current service is built around human review and manual delivery, not autoposting.',
  },
  {
    label: 'Consumer influencer brands',
    description:
      'The service is designed for startups, B2B communication, founder trust, and customer education.',
  },
];

export const agencyFaqs: AgencyFaq[] = [
  {
    question: 'Do clients get software access?',
    answer:
      'No. This is a managed service. You send source material, review drafts, and receive content or communication assets without needing a SaaS workspace.',
  },
  {
    question: 'How do you get source material?',
    answer:
      'Source material can come from founder notes, customer calls, meeting notes, product updates, demos, Slack discussion summaries, documents, or manual briefs.',
  },
  {
    question: 'Can you work from Slack or meeting notes?',
    answer:
      'Yes. Slack discussions and meeting notes can be used as source material when shared deliberately. We keep the public service focused on outcomes, not integration mechanics.',
  },
  {
    question: 'Do you write in our brand voice?',
    answer:
      'Yes. Setup includes voice, tone, positioning, audience, customer pain points, and examples so drafts sound like your company rather than generic output.',
  },
  {
    question: 'Do you support newsletters and LinkedIn?',
    answer:
      'Yes. LinkedIn posts, founder updates, newsletter sections, launch messages, and customer updates are core deliverables.',
  },
  {
    question: 'Do you post for us automatically?',
    answer:
      'No. The current workflow is draft, review, and manual delivery. Automatic posting can be considered later only if it is explicitly scoped.',
  },
  {
    question: 'How is this different from a generic AI tool?',
    answer:
      'The service combines source intake, brand context, customer communication strategy, production rhythm, and human review. The goal is useful output, not a blank prompt box.',
  },
  {
    question: 'How long does setup take?',
    answer:
      'Most setup work is scoped after intake. A focused setup sprint can usually define voice, sources, pillars, templates, and the first production rhythm before recurring work begins.',
  },
];

export const agencyContactFields = [
  'name',
  'email',
  'company',
  'website',
  'role',
  'package interest',
  'timeline',
  'budget range',
  'message',
] as const;

export const agencyPublicRoutes = [
  '/agency',
  '/agency/services',
  '/agency/process',
  '/agency/packages',
  '/agency/contact',
  '/agency/thank-you',
] as const;

