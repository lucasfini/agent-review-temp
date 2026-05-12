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
    name: "Base transcript",
    price: BASE_TRANSCRIPTION_PRICE_LABEL,
    description:
      "Per-hour transcript foundation with numbered speaker labels and timestamps.",
    features: [
      "Clean transcript",
      "Speaker labels (numbered)",
      "Word-level timestamps",
      "Export to Markdown / Notion",
    ],
  },
  {
    name: "Optional analysis",
    price: "Usage-based",
    description:
      "Turn on only what you need during processing. Cost scales with transcript length.",
    features: [
      "Named speakers with roles",
      "Episode summary",
      "Insights",
      "Chapter breakdown",
      "Key takeaways",
      "Notable quotes",
    ],
  },
  {
    name: "Per-output generation",
    price: "Per output",
    description:
      "Generate content later from the project page, one fixed-price output at a time.",
    features: [
      "X / Twitter thread",
      "LinkedIn post",
      "YouTube description",
      "TikTok / Reels script",
      "Podcast show notes",
      "Email newsletter",
      "Blog post",
    ],
  },
] as const;

export const PRICING_MODEL_SUMMARY =
  "Transcription stays low-friction, analysis scales with transcript length, and content outputs are charged per generated asset.";

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
