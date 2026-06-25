export const BASE_TRANSCRIPTION_PRICE_PER_HOUR = 0.39;
export const BASE_TRANSCRIPTION_PRICE_LABEL = "$0.39/hr";

export const ANALYSIS_PRICE_RULES = {
  namedSpeakers: { multiplier: 2.25, minimumCharge: 0.12 },
  insights: { multiplier: 2.25, minimumCharge: 0.1 },
  summary: { multiplier: 2.0, minimumCharge: 0.04 },
  chapters: { multiplier: 2.0, minimumCharge: 0.03 },
  takeaways: { multiplier: 2.0, minimumCharge: 0.03 },
  quotes: { multiplier: 2.0, minimumCharge: 0.04 },
} as const;

export const CONTENT_OUTPUT_PRICES = {
  twitter_threads: 0.12,
  linkedin_posts: 0.1,
  instagram_content: 0.09,
  facebook_post: 0.08,
  blog_post: 0.32,
  newsletter: 0.18,
  show_notes: 0.12,
  youtube_description: 0.09,
  podcast_episode_description: 0.08,
  short_form_video_script: 0.11,
  quote_graphics: 0.07,
} as const;

export const PAYG_SECTIONS = [
  {
    name: "Starter",
    price: "$299/mo",
    description:
      "For founders or small teams turning calls, meetings, and ideas into a consistent publishing rhythm.",
    features: [
      "Up to 4 projects per month",
      "LinkedIn and X post drafts",
      "Speaker-labeled transcripts",
      "Basic summaries and quotes",
    ],
  },
  {
    name: "Growth",
    price: "$799/mo",
    description:
      "For teams that want a weekly content engine from customer calls, demos, webinars, and founder updates.",
    features: [
      "Up to 12 projects per month",
      "Multi-channel content kits",
      "Content intelligence and takeaways",
      "Reusable team voice and themes",
      "Priority processing",
    ],
  },
  {
    name: "Scale",
    price: "Custom",
    description:
      "For B2B teams with higher source volume, review needs, and recurring campaign workflows.",
    features: [
      "Custom monthly project volume",
      "Founder and executive content workflows",
      "Client-ready export packages",
      "Team onboarding and support",
      "Custom reporting",
    ],
  },
] as const;

export const PRICING_MODEL_SUMMARY =
  "Every plan includes transcription, speaker attribution, AI analysis, and publish-ready drafts for B2B content workflows. Usage limits can be adjusted as your team grows.";

const ONE_HOUR = 1;
const EXAMPLE_BASE_TRANSCRIPTION = BASE_TRANSCRIPTION_PRICE_PER_HOUR * ONE_HOUR;
const EXAMPLE_NAMED_SPEAKERS = Math.max(
  BASE_TRANSCRIPTION_PRICE_PER_HOUR *
    ANALYSIS_PRICE_RULES.namedSpeakers.multiplier *
    ONE_HOUR,
  ANALYSIS_PRICE_RULES.namedSpeakers.minimumCharge,
);
const EXAMPLE_SUMMARY = Math.max(
  BASE_TRANSCRIPTION_PRICE_PER_HOUR *
    ANALYSIS_PRICE_RULES.summary.multiplier *
    ONE_HOUR,
  ANALYSIS_PRICE_RULES.summary.minimumCharge,
);
const EXAMPLE_LINKEDIN_OUTPUT = CONTENT_OUTPUT_PRICES.linkedin_posts;

const EXAMPLE_TOTAL =
  EXAMPLE_BASE_TRANSCRIPTION +
  EXAMPLE_NAMED_SPEAKERS +
  EXAMPLE_SUMMARY +
  EXAMPLE_LINKEDIN_OUTPUT;

export const PRICING_EXAMPLE_SUMMARY = `Example estimate: a 60-minute recording with base transcript + named speakers + summary + one LinkedIn post is about $${EXAMPLE_TOTAL.toFixed(
  2,
)}.`;
