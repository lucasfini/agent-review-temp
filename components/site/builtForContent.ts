import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  CircleCheck,
  CloudUpload,
  FileText,
  HeartHandshake,
  Lightbulb,
  Megaphone,
  MessageSquareText,
  Quote,
  Rocket,
  Search,
  Sparkles,
  Target,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export type BuiltForPageSlug =
  | "marketing-teams"
  | "founders"
  | "sales-teams"
  | "customer-success"
  | "product-marketers"
  | "consultants"
  | "creators";

type Tone = "blue" | "purple" | "green" | "amber";

export type BuiltForCard = {
  title: string;
  body: string;
  icon: LucideIcon;
  tone?: Tone;
};

export type BuiltForOutput = {
  title: string;
  body: string;
  label: string;
  icon: LucideIcon;
  tone?: Tone;
};

export type BuiltForFaq = {
  question: string;
  answer: string;
};

export type BuiltForCtaStep = {
  label: string;
  body: string;
};

export type BuiltForPageData = {
  slug: BuiltForPageSlug;
  navTitle: string;
  pageTitle: string;
  metaTitle: string;
  metaDescription: string;
  canonicalPath: string;
  eyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  icon: LucideIcon;
  heroBullets: readonly string[];
  sourceTypes: readonly string[];
  pain: {
    eyebrow: string;
    title: string;
    body: string;
    points: readonly BuiltForCard[];
  };
  benefits: {
    eyebrow: string;
    title: string;
    body: string;
    points: readonly BuiltForCard[];
  };
  features: {
    eyebrow: string;
    title: string;
    body: string;
    cards: readonly BuiltForCard[];
  };
  workflow: {
    eyebrow: string;
    title: string;
    body: string;
    steps: readonly BuiltForCard[];
  };
  outputs: {
    eyebrow: string;
    title: string;
    body: string;
    cards: readonly BuiltForOutput[];
  };
  sourceBacked: {
    eyebrow: string;
    title: string;
    body: string;
    checks: readonly string[];
  };
  collaboration: {
    eyebrow: string;
    title: string;
    body: string;
    collaborators: readonly string[];
    note: string;
  };
  faq: readonly BuiltForFaq[];
  finalCta: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
    secondaryHref: string;
    steps: readonly BuiltForCtaStep[];
  };
};

const SIGNUP_HREF = "/auth/signup";

export const BUILT_FOR_PAGES = {
  "marketing-teams": {
    slug: "marketing-teams",
    navTitle: "Marketing teams",
    pageTitle: "Marketing Teams",
    metaTitle: "Marketing Teams | AudioRepurpose",
    metaDescription:
      "Turn webinars, customer calls, interviews, and campaign research into source-backed campaign drafts, customer proof, and reusable content assets.",
    canonicalPath: "/built-for/marketing-teams",
    eyebrow: "BUILT FOR MARKETING TEAMS",
    heroHeadline: "Marketing Teams",
    heroSubheadline:
      "Turn customer calls, webinars, interviews, and campaign conversations into source-backed content for campaigns, launches, emails, and social posts.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: Megaphone,
    heroBullets: ["Campaign drafts", "Customer proof", "Channel-ready outputs", "Reusable brand voice"],
    sourceTypes: ["Customer call", "Webinar", "Founder interview", "Campaign research"],
    pain: {
      eyebrow: "The campaign bottleneck",
      title: "Your best campaign material is already inside recorded conversations.",
      body:
        "Customer language, webinar moments, and founder POV often sit in transcripts or call notes while the content calendar starts from scratch.",
      points: [
        {
          title: "Customer language gets buried",
          body: "The phrases customers use are hard to find once a call becomes another file in storage.",
          icon: MessageSquareText,
        },
        {
          title: "Webinars become one-off assets",
          body: "A useful event may produce a replay link, but not the posts, newsletters, quotes, and briefs it could support.",
          icon: Video,
          tone: "purple",
        },
        {
          title: "Campaign context gets rewritten",
          body: "Teams repeat the same audience, voice, and goal guidance every time they draft.",
          icon: Sparkles,
          tone: "green",
        },
        {
          title: "Proof is hard to trace",
          body: "Strong claims slow down in review when nobody can quickly find the source behind them.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Build a campaign workflow from the sources your team already records.",
      body:
        "AudioRepurpose keeps source intake, transcript analysis, Studio context, and saved Library assets in one review path.",
      points: [
        {
          title: "Turn one source into many drafts",
          body: "Create posts, newsletters, blog drafts, scripts, and quote graphics from a single recording.",
          icon: FileText,
        },
        {
          title: "Preserve proof points",
          body: "Keep important claims close to transcript, speaker, and source context.",
          icon: Quote,
          tone: "purple",
        },
        {
          title: "Reuse campaign context",
          body: "Use Studio profiles, voices, and plans to keep generation aligned with the goal.",
          icon: Sparkles,
          tone: "green",
        },
        {
          title: "Save what is worth reusing",
          body: "Move strong drafts and customer language into Library collections for later campaigns.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for campaign teams.",
      body:
        "Create campaign drafts from recordings while keeping transcript, speaker, and review context attached.",
      cards: [
        {
          title: "Campaign-ready drafts",
          body: "Generate LinkedIn posts, email newsletters, blog drafts, quote graphics, and short-form scripts from source material.",
          icon: FileText,
        },
        {
          title: "Customer language extraction",
          body: "Find phrases, objections, outcomes, and proof points your audience already uses.",
          icon: MessageSquareText,
          tone: "purple",
        },
        {
          title: "Studio campaign context",
          body: "Apply profile, voice, and plan guidance before generation starts.",
          icon: Sparkles,
          tone: "green",
        },
        {
          title: "Source-backed review",
          body: "Keep claims tied to the recording, transcript, speaker, and review context.",
          icon: Search,
          tone: "amber",
        },
        {
          title: "Library workflow",
          body: "Save drafts with source links, statuses, tags, and generation context.",
          icon: BookOpenText,
        },
        {
          title: "Output controls",
          body: "Choose only the formats that match the source instead of generating every possible draft.",
          icon: CircleCheck,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Campaign workflow",
      title: "From customer voice to review-ready campaign material.",
      body:
        "The workflow stays the same across source types, but the output examples are tuned for marketing work.",
      steps: [
        {
          title: "Add the campaign source",
          body: "Start from a customer call, webinar, interview, or campaign research recording.",
          icon: CloudUpload,
        },
        {
          title: "Pull customer language",
          body: "Extract quotes, objections, proof points, and the phrases your audience already uses.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft campaign assets",
          body: "Create posts, newsletters, blog drafts, short-form scripts, and quote graphics for review.",
          icon: Megaphone,
          tone: "green",
        },
        {
          title: "Save reusable messaging",
          body: "Move strong proof, customer language, and approved drafts into Library collections.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What marketing can create",
      title: "A source-backed content kit from every useful conversation.",
      body:
        "Use the formats already supported by AudioRepurpose, then refine them before anything ships.",
      cards: [
        {
          title: "LinkedIn posts",
          body: "Turn customer insight, founder POV, or webinar moments into professional social drafts.",
          label: "Social",
          icon: Megaphone,
        },
        {
          title: "Email newsletter sections",
          body: "Create structured newsletter material with a source-backed angle.",
          label: "Email",
          icon: FileText,
          tone: "purple",
        },
        {
          title: "Blog drafts and outlines",
          body: "Use transcripts and insights to draft long-form campaign content.",
          label: "Long-form",
          icon: BookOpenText,
          tone: "green",
        },
        {
          title: "Quote graphics",
          body: "Capture quotable excerpts with speaker attribution for review.",
          label: "Quote",
          icon: Quote,
          tone: "amber",
        },
        {
          title: "Short-form scripts",
          body: "Shape strong moments into concise video script drafts.",
          label: "Video",
          icon: Video,
        },
        {
          title: "Campaign brief notes",
          body: "Collect audience language, objections, and proof points before drafting.",
          label: "Brief",
          icon: Target,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Review campaigns with the transcript close by.",
      body:
        "Outputs should not feel detached from the source. AudioRepurpose keeps the transcript, speaker context, generated draft, and Library metadata connected for review.",
      checks: ["Transcript and speaker context", "Quotes and proof points", "Studio voice and plan guidance", "Saved Library context"],
    },
    collaboration: {
      eyebrow: "Campaign collaboration",
      title: "Marketing work gets stronger when customer proof is easy to share.",
      body:
        "Campaign teams can pass source-backed language to sales, product marketing, customer success, and content teammates without detaching it from the original conversation.",
      collaborators: ["Sales", "Product marketing", "Customer success", "Content teams"],
      note:
        "Campaign claims are easier to review when customer language, proof points, and the transcript stay connected.",
    },
    faq: [
      {
        question: "Can this help turn webinars into campaign assets?",
        answer:
          "Yes. Webinars can become transcripts, summaries, quotes, posts, newsletters, blog drafts, scripts, and other review-ready campaign material.",
      },
      {
        question: "Can we pull customer language from interviews?",
        answer:
          "Yes. You can extract customer phrases, objections, outcomes, quotes, and themes from recorded interviews and calls.",
      },
      {
        question: "Can it help with social posts and email drafts?",
        answer:
          "Yes. Supported output types include LinkedIn posts, X threads, email newsletters, blog posts, short-form scripts, and quote graphics.",
      },
      {
        question: "Can we keep claims tied to the original transcript?",
        answer:
          "Yes. AudioRepurpose keeps drafts close to transcript, speaker, quote, and source context so claims can be reviewed.",
      },
      {
        question: "Does AudioRepurpose publish campaigns automatically?",
        answer:
          "No verified publishing automation exists in the current site. Treat outputs as review-ready drafts your team edits before publishing.",
      },
    ],
    finalCta: {
      eyebrow: "Marketing teams",
      title: "Turn your next campaign recording into source-backed assets.",
      body:
        "Start with one customer call, webinar, or interview. Keep the proof attached and move the strongest ideas into a review-ready content library.",
      primaryCta: "Sign up for free",
      secondaryCta: "View pricing",
      secondaryHref: "/pricing",
      steps: [
        { label: "Source", body: "Add the customer call, webinar, interview, or campaign research." },
        { label: "Signal", body: "Pull customer language, proof points, objections, and takeaways." },
        { label: "Draft", body: "Create campaign assets for the channels your team manages." },
        { label: "Review", body: "Save reusable messaging with the source context attached." },
      ],
    },
  },
  founders: {
    slug: "founders",
    navTitle: "Founders",
    pageTitle: "Founders",
    metaTitle: "Founders | AudioRepurpose",
    metaDescription:
      "Turn founder thinking, customer learning, product updates, investor updates, and internal recordings into clear source-backed drafts and notes.",
    canonicalPath: "/built-for/founders",
    eyebrow: "BUILT FOR FOUNDERS",
    heroHeadline: "Founders",
    heroSubheadline:
      "Turn founder thinking, customer conversations, and product notes into clearer updates, strategy notes, and source-backed content.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: Rocket,
    heroBullets: ["Founder POV", "Customer learning", "Launch notes", "Review-ready drafts"],
    sourceTypes: ["Voice note", "Customer call", "Investor update", "Team discussion"],
    pain: {
      eyebrow: "The founder bottleneck",
      title: "Useful thinking happens faster than it becomes usable content.",
      body:
        "Founder ideas, customer learning, and team context often live in recordings long after the moment has passed.",
      points: [
        {
          title: "Ideas scatter across recordings",
          body: "Voice notes, sales calls, and team updates each hold pieces of the narrative.",
          icon: Video,
        },
        {
          title: "Customer learning fades",
          body: "The exact language behind a product decision is easy to lose after the call.",
          icon: MessageSquareText,
          tone: "purple",
        },
        {
          title: "Updates take extra assembly",
          body: "Investor, team, and launch updates often require rebuilding context from scratch.",
          icon: CalendarDays,
          tone: "green",
        },
        {
          title: "Drafts start from a blank page",
          body: "The source material exists, but it has not been shaped into review-ready notes.",
          icon: FileText,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Turn raw founder context into a reusable source of record.",
      body:
        "AudioRepurpose helps founders move from recorded thinking to summaries, content drafts, and useful internal notes.",
      points: [
        {
          title: "Capture founder POV",
          body: "Turn thoughts, updates, and interviews into drafts without losing the source.",
          icon: Rocket,
        },
        {
          title: "Extract customer themes",
          body: "Find repeated pain, objections, outcomes, and customer language.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Reuse company context",
          body: "Store profile, audience, voice, and plan guidance in Studio.",
          icon: Sparkles,
          tone: "green",
        },
        {
          title: "Keep proof nearby",
          body: "Return to transcripts, speaker context, summaries, and saved drafts during review.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for founder-led work.",
      body:
        "Capture product thinking, customer learning, and team context before useful ideas disappear into recordings.",
      cards: [
        {
          title: "Founder POV capture",
          body: "Turn voice notes, interviews, and updates into source-backed draft content.",
          icon: Rocket,
        },
        {
          title: "Customer learning extraction",
          body: "Pull themes, objections, outcomes, and useful language from calls.",
          icon: MessageSquareText,
          tone: "purple",
        },
        {
          title: "Update drafting",
          body: "Shape recordings into newsletters, posts, launch notes, and internal summaries.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Company context reuse",
          body: "Use Studio profiles, voices, and plans to keep drafts aligned.",
          icon: Sparkles,
          tone: "amber",
        },
        {
          title: "Source of record",
          body: "Keep transcripts, speakers, summaries, and drafts connected.",
          icon: BookOpenText,
        },
        {
          title: "Fast review loop",
          body: "Move from raw recording to draft without building a heavy content process.",
          icon: CircleCheck,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Founder workflow",
      title: "From raw context to clearer updates.",
      body:
        "Use the same source-backed workflow for customer learning, launch thinking, and recurring founder communication.",
      steps: [
        {
          title: "Capture founder context",
          body: "Start from a voice note, customer call, product update, investor note, or team discussion.",
          icon: CloudUpload,
        },
        {
          title: "Pull customer and product themes",
          body: "Extract the customer language, product lessons, decisions, and useful quotes behind the idea.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft updates or notes",
          body: "Turn the source into founder-led posts, launch notes, investor update material, or team summaries.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Keep decisions tied to the source",
          body: "Review the draft against the transcript, speaker context, and original source before sharing.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What founders can create",
      title: "Clearer updates from the conversations already happening.",
      body:
        "Use AudioRepurpose for draft and note creation, not as a replacement for founder judgment.",
      cards: [
        {
          title: "Founder LinkedIn posts",
          body: "Turn a point of view or customer lesson into a professional social draft.",
          label: "Social",
          icon: Rocket,
        },
        {
          title: "Investor update notes",
          body: "Shape recorded thinking into source-backed update material for review.",
          label: "Notes",
          icon: CalendarDays,
          tone: "purple",
        },
        {
          title: "Product narrative drafts",
          body: "Capture the customer and product context behind a strategic message.",
          label: "Narrative",
          icon: Target,
          tone: "green",
        },
        {
          title: "Customer learning summaries",
          body: "Summarize calls into themes, quotes, and takeaways.",
          label: "Learning",
          icon: Lightbulb,
          tone: "amber",
        },
        {
          title: "Launch notes",
          body: "Turn product updates and customer proof into launch material.",
          label: "Launch",
          icon: Megaphone,
        },
        {
          title: "Team update summaries",
          body: "Create concise internal notes from recurring recordings.",
          label: "Internal",
          icon: Users,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Keep founder content connected to the moment that created it.",
      body:
        "AudioRepurpose keeps useful drafts close to transcripts, summaries, quotes, and Studio context so a strong idea can be reviewed before it ships.",
      checks: ["Voice notes and calls", "Customer language", "Studio profile and voice", "Saved Library drafts"],
    },
    collaboration: {
      eyebrow: "Founder alignment",
      title: "Founder context should be useful beyond the person who recorded it.",
      body:
        "Product, sales, investors, advisors, leadership, and the broader team can reuse clearer notes when the source behind the decision stays attached.",
      collaborators: ["Product", "Sales", "Investors", "Advisors", "Leadership"],
      note:
        "Founder-led content is stronger when the customer lesson, product decision, and original recording stay close together.",
    },
    faq: [
      {
        question: "Can this turn raw notes into updates?",
        answer:
          "Yes. Voice notes, calls, and recorded updates can become summaries, posts, launch notes, and internal update drafts.",
      },
      {
        question: "Can it help summarize customer learning?",
        answer:
          "Yes. It can extract summaries, takeaways, quotes, themes, and customer language from recorded customer conversations.",
      },
      {
        question: "Can it support investor or team updates?",
        answer:
          "Use AudioRepurpose to draft and organize update material from recordings. It is not a financial reporting tool.",
      },
      {
        question: "Can founder-led content stay grounded in the original source?",
        answer:
          "Yes. Drafts can stay connected to transcript, speaker, quote, Studio, and Library context for review.",
      },
      {
        question: "Does it replace strategy work?",
        answer:
          "No. It helps turn source material into review-ready notes and drafts so the founder can decide what is worth using.",
      },
    ],
    finalCta: {
      eyebrow: "Founders",
      title: "Put your next founder recording to work before the context fades.",
      body:
        "Start with one call, voice note, or update. Extract the useful signal and turn it into a draft your team can review.",
      primaryCta: "Sign up for free",
      secondaryCta: "Book a demo",
      secondaryHref: "/#pricing",
      steps: [
        { label: "Context", body: "Capture the voice note, customer call, product update, or team discussion." },
        { label: "Theme", body: "Pull out customer learning, product context, and useful founder POV." },
        { label: "Update", body: "Draft posts, launch notes, investor material, or internal summaries." },
        { label: "Decision", body: "Keep decisions and drafts traceable to the original source." },
      ],
    },
  },
  "sales-teams": {
    slug: "sales-teams",
    navTitle: "Sales teams",
    pageTitle: "Sales Teams",
    metaTitle: "Sales Teams | AudioRepurpose",
    metaDescription:
      "Turn sales calls into source-backed summaries, buyer language, objections, follow-up context, and enablement-ready content.",
    canonicalPath: "/built-for/sales-teams",
    eyebrow: "BUILT FOR SALES TEAMS",
    heroHeadline: "Sales Teams",
    heroSubheadline:
      "Turn sales calls into buyer language, objection patterns, follow-up material, and reusable insights your team can learn from.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: MessageSquareText,
    heroBullets: ["Buyer language", "Objection patterns", "Call summaries", "Enablement snippets"],
    sourceTypes: ["Discovery call", "Demo", "Buyer interview", "Follow-up call"],
    pain: {
      eyebrow: "The sales-call gap",
      title: "Every call teaches the team something, but the learning is hard to reuse.",
      body:
        "Objections, buyer language, and follow-up context often stay with the person who took the call.",
      points: [
        {
          title: "Objections repeat",
          body: "Concerns and blockers show up across calls, but patterns stay anecdotal.",
          icon: MessageSquareText,
        },
        {
          title: "Buyer language gets paraphrased",
          body: "The exact words prospects use are easy to lose in notes.",
          icon: Quote,
          tone: "purple",
        },
        {
          title: "Follow-up context scatters",
          body: "Summaries, decisions, and next steps can land in separate tools.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Marketing loses the source",
          body: "Useful sales-call language becomes less useful when the transcript context is gone.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Make sales calls useful beyond the deal note.",
      body:
        "AudioRepurpose turns recorded calls into summaries, quote banks, objection notes, and source-backed enablement material.",
      points: [
        {
          title: "Summarize calls quickly",
          body: "Create concise summaries, decisions, takeaways, and follow-up context.",
          icon: FileText,
        },
        {
          title: "Preserve buyer language",
          body: "Keep important phrases and quotes tied to speakers and source material.",
          icon: Quote,
          tone: "purple",
        },
        {
          title: "Capture objections",
          body: "Surface repeated concerns, blockers, and questions from real conversations.",
          icon: MessageSquareText,
          tone: "green",
        },
        {
          title: "Feed enablement",
          body: "Turn call learning into internal notes, FAQs, and customer-facing snippets.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for sales conversations.",
      body:
        "Turn call recordings into summaries, buyer language, objection notes, and source-backed enablement drafts.",
      cards: [
        {
          title: "Objection capture",
          body: "Surface repeated concerns, blockers, and decision questions from call transcripts.",
          icon: MessageSquareText,
        },
        {
          title: "Buyer language library",
          body: "Save phrases prospects use to describe pain, value, and alternatives.",
          icon: Quote,
          tone: "purple",
        },
        {
          title: "Call summaries",
          body: "Create concise summaries, decisions, takeaways, and follow-up notes.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Competitive context",
          body: "Capture competitor mentions as reviewable source context.",
          icon: Search,
          tone: "amber",
        },
        {
          title: "Speaker-aware quotes",
          body: "Keep important lines tied to the right person for later review.",
          icon: Users,
        },
        {
          title: "Enablement drafts",
          body: "Turn sales conversations into internal notes, posts, FAQs, and snippets.",
          icon: BookOpenText,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Sales workflow",
      title: "From call recording to team learning.",
      body:
        "Use the workflow after discovery calls, demos, buyer interviews, or follow-up conversations.",
      steps: [
        {
          title: "Add the sales call",
          body: "Bring in a discovery call, demo, buyer interview, or follow-up conversation.",
          icon: CloudUpload,
        },
        {
          title: "Capture objections and buyer language",
          body: "Pull objections, decision questions, competitor mentions, quotes, and phrases prospects actually use.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Create follow-up and enablement notes",
          body: "Turn the call into summaries, follow-up context, objection digests, and enablement snippets.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Share learning with the team",
          body: "Save the useful language and keep transcript context attached for review by managers and teammates.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What sales can create",
      title: "Artifacts that keep sales learning close to the source.",
      body:
        "Outputs are drafts and notes for review, not CRM automation or automated deal management.",
      cards: [
        {
          title: "Discovery call summaries",
          body: "Summarize pain, priorities, decisions, and next steps.",
          label: "Summary",
          icon: FileText,
        },
        {
          title: "Objection digests",
          body: "Collect repeated concerns and questions from transcripts.",
          label: "Objections",
          icon: MessageSquareText,
          tone: "purple",
        },
        {
          title: "Follow-up context",
          body: "Create source-backed material a rep can review before writing.",
          label: "Follow-up",
          icon: CircleCheck,
          tone: "green",
        },
        {
          title: "Competitive note summaries",
          body: "Capture competitor mentions without turning them into unsupported claims.",
          label: "Notes",
          icon: Search,
          tone: "amber",
        },
        {
          title: "Customer quote banks",
          body: "Preserve quotable language with speaker context.",
          label: "Quotes",
          icon: Quote,
        },
        {
          title: "Enablement snippets",
          body: "Turn call learning into short internal or customer-facing draft material.",
          label: "Enablement",
          icon: BookOpenText,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Keep buyer language tied to the call that created it.",
      body:
        "When a sales insight moves into content, enablement, or follow-up, the transcript and speaker context should stay easy to review.",
      checks: ["Call summaries", "Buyer quotes", "Objection notes", "Transcript context"],
    },
    collaboration: {
      eyebrow: "Sales learning",
      title: "Sales-call insight should not stay trapped with one rep.",
      body:
        "Sales managers, enablement, marketing, customer success, and RevOps can reuse buyer language and objections when the call context stays reviewable.",
      collaborators: ["Sales managers", "Enablement", "Marketing", "Customer success", "RevOps"],
      note:
        "Sales content stays more useful when buyer language, objections, and follow-up context remain tied to the original call.",
    },
    faq: [
      {
        question: "Can this replace manual call notes?",
        answer:
          "It can draft summaries, takeaways, quotes, and follow-up context from calls. It is not positioned as a CRM or system of record.",
      },
      {
        question: "Can it help summarize objections?",
        answer:
          "Yes. It can surface repeated concerns, blockers, decision questions, and objection themes from recorded calls.",
      },
      {
        question: "Can managers reuse call insights for team learning?",
        answer:
          "Yes. Saved summaries, quote banks, and objection notes can help managers review patterns without losing transcript context.",
      },
      {
        question: "Can sales content stay tied to the original conversation?",
        answer:
          "Yes. AudioRepurpose keeps drafts and notes close to transcript, speaker, quote, and source context.",
      },
      {
        question: "Does it send follow-up emails?",
        answer:
          "No dedicated email-send workflow is claimed. Use outputs as draft material your team reviews and sends through existing tools.",
      },
    ],
    finalCta: {
      eyebrow: "Sales teams",
      title: "Make every important sales call easier to summarize and reuse.",
      body:
        "Start with one call. Capture the objections, buyer language, and follow-up context your team should not lose.",
      primaryCta: "Sign up for free",
      secondaryCta: "View pricing",
      secondaryHref: "/pricing",
      steps: [
        { label: "Call", body: "Add the discovery call, demo, buyer interview, or follow-up recording." },
        { label: "Objection", body: "Capture blockers, buyer language, questions, and competitor mentions." },
        { label: "Follow-up", body: "Draft summaries and follow-up context your team can review." },
        { label: "Enablement", body: "Save reusable snippets and learning with the call source attached." },
      ],
    },
  },
  "customer-success": {
    slug: "customer-success",
    navTitle: "Customer success",
    pageTitle: "Customer Success Teams",
    metaTitle: "Customer Success Teams | AudioRepurpose",
    metaDescription:
      "Turn customer conversations into feedback, education ideas, onboarding notes, success story inputs, renewal context, and source-backed proof points.",
    canonicalPath: "/built-for/customer-success",
    eyebrow: "BUILT FOR CUSTOMER SUCCESS",
    heroHeadline: "Customer Success Teams",
    heroSubheadline:
      "Turn customer conversations into feedback, education, proof points, follow-up material, and reusable context for your team.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: HeartHandshake,
    heroBullets: ["Customer feedback", "Education ideas", "Success story inputs", "Reusable proof"],
    sourceTypes: ["Onboarding call", "QBR", "Customer interview", "Support conversation"],
    pain: {
      eyebrow: "The customer context gap",
      title: "Customer conversations hold feedback, education ideas, and proof your team needs later.",
      body:
        "Recurring calls often contain product feedback, blockers, wins, and help-content opportunities that are hard to reuse.",
      points: [
        {
          title: "Feedback lives in calls",
          body: "Product requests and recurring blockers are easy to miss after a long meeting.",
          icon: MessageSquareText,
        },
        {
          title: "Help ideas repeat",
          body: "Onboarding and support questions point to useful education content, but they rarely become drafts.",
          icon: BookOpenText,
          tone: "purple",
        },
        {
          title: "Proof stays anecdotal",
          body: "Outcomes and customer wins need quote and source context before teams can use them.",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Follow-ups get buried",
          body: "Risks, open questions, and next steps can hide inside long recordings.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Turn recurring customer calls into reusable team context.",
      body:
        "AudioRepurpose helps customer teams create summaries, insights, proof points, and education drafts from the conversations they already run.",
      points: [
        {
          title: "Capture feedback",
          body: "Extract product requests, blockers, wins, and recurring themes.",
          icon: MessageSquareText,
        },
        {
          title: "Create education drafts",
          body: "Turn onboarding and support conversations into reusable notes and outlines.",
          icon: BookOpenText,
          tone: "purple",
        },
        {
          title: "Preserve proof",
          body: "Capture customer quotes and outcomes for later review.",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Share customer learning",
          body: "Save source-backed assets that product, marketing, and sales can review.",
          icon: Users,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for customer conversations.",
      body:
        "Turn onboarding calls, QBRs, interviews, and support conversations into reusable notes, drafts, and proof points.",
      cards: [
        {
          title: "Feedback capture",
          body: "Extract product requests, blockers, wins, and recurring themes from calls.",
          icon: MessageSquareText,
        },
        {
          title: "Customer education drafts",
          body: "Turn onboarding and support conversations into reusable guides, notes, and outlines.",
          icon: BookOpenText,
          tone: "purple",
        },
        {
          title: "Success story inputs",
          body: "Capture outcomes, before-and-after moments, and quotes for proof-driven content.",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Handoff context",
          body: "Keep transcript, speaker, summary, decisions, and draft context together.",
          icon: Users,
          tone: "amber",
        },
        {
          title: "Signal review",
          body: "Surface risks, opportunities, and follow-ups as notes your team can review.",
          icon: Search,
        },
        {
          title: "Library reuse",
          body: "Save proof points and education ideas for future campaigns and internal work.",
          icon: BookOpenText,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Customer success workflow",
      title: "From customer conversation to reusable customer context.",
      body:
        "Turn onboarding calls, QBRs, and interviews into source-backed notes and drafts.",
      steps: [
        {
          title: "Add the customer conversation",
          body: "Start from a QBR, onboarding call, customer interview, or support conversation.",
          icon: CloudUpload,
        },
        {
          title: "Capture feedback and open questions",
          body: "Pull product requests, blockers, wins, follow-ups, quotes, and risk signals for review.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Create education or follow-up material",
          body: "Draft summaries, help outlines, proof notes, onboarding material, and handoff context.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Save context for handoffs",
          body: "Keep customer learning in Library with transcript and speaker context attached.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What customer success can create",
      title: "Customer context that survives the call.",
      body:
        "Use the outputs as review-ready notes and drafts for customer education, internal handoffs, and proof collection.",
      cards: [
        {
          title: "Onboarding summaries",
          body: "Capture questions, blockers, decisions, and next steps from onboarding calls.",
          label: "Summary",
          icon: FileText,
        },
        {
          title: "QBR recap notes",
          body: "Summarize customer priorities, outcomes, and follow-up context.",
          label: "Recap",
          icon: CalendarDays,
          tone: "purple",
        },
        {
          title: "Product feedback digests",
          body: "Collect requests, blockers, and repeated themes for review.",
          label: "Feedback",
          icon: MessageSquareText,
          tone: "green",
        },
        {
          title: "Help content outlines",
          body: "Turn repeated questions into outline material for education content.",
          label: "Education",
          icon: BookOpenText,
          tone: "amber",
        },
        {
          title: "Customer quote banks",
          body: "Capture quotable proof with speaker and source context.",
          label: "Quotes",
          icon: Quote,
        },
        {
          title: "Success story source notes",
          body: "Save outcomes and before-and-after moments for later review.",
          label: "Proof",
          icon: HeartHandshake,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Keep customer proof connected to real customer conversations.",
      body:
        "The value is not just a summary. It is a summary, quote, or draft that can be reviewed against the source call.",
      checks: ["Customer feedback", "Onboarding themes", "Proof points", "Saved Library assets"],
    },
    collaboration: {
      eyebrow: "Customer handoffs",
      title: "Customer context is most useful when every team sees the source.",
      body:
        "Support, product, sales, onboarding, implementation, and account teams can reuse customer learning when feedback, proof, and follow-ups stay attached to the call.",
      collaborators: ["Support", "Product", "Sales", "Onboarding", "Implementation", "Account teams"],
      note:
        "Customer learning travels farther when feedback, education ideas, and proof points keep their source context.",
    },
    faq: [
      {
        question: "Can this summarize customer calls?",
        answer:
          "Yes. Customer calls can become summaries, takeaways, quotes, follow-up notes, and review-ready drafts.",
      },
      {
        question: "Can it capture feedback and feature requests?",
        answer:
          "Yes. Product feedback, customer language, blockers, requests, and recurring themes are supported public messaging.",
      },
      {
        question: "Can it help create education or onboarding content?",
        answer:
          "It can turn onboarding and support conversations into summaries, drafts, outlines, and reusable education notes.",
      },
      {
        question: "Can it help preserve context for handoffs?",
        answer:
          "Yes. Saved Library assets can keep source links, statuses, tags, transcript context, and generated drafts together.",
      },
      {
        question: "Does AudioRepurpose manage renewals?",
        answer:
          "No. It helps capture and review customer context, but it is not positioned as a renewal management system.",
      },
    ],
    finalCta: {
      eyebrow: "Customer success",
      title: "Turn customer calls into reusable context for feedback, education, and proof.",
      body:
        "Start with one customer conversation. Capture what matters and keep the source attached for the team.",
      primaryCta: "Sign up for free",
      secondaryCta: "Book a demo",
      secondaryHref: "/#pricing",
      steps: [
        { label: "Conversation", body: "Add the onboarding call, QBR, support conversation, or interview." },
        { label: "Feedback", body: "Capture requests, blockers, wins, follow-ups, and customer proof." },
        { label: "Education", body: "Draft help outlines, onboarding notes, summaries, and proof material." },
        { label: "Handoff", body: "Save reusable customer context with the source attached." },
      ],
    },
  },
  "product-marketers": {
    slug: "product-marketers",
    navTitle: "Product marketers",
    pageTitle: "Product Marketers",
    metaTitle: "Product Marketers | AudioRepurpose",
    metaDescription:
      "Pull customer language, objections, competitive notes, proof points, and launch angles from recorded market conversations.",
    canonicalPath: "/built-for/product-marketers",
    eyebrow: "BUILT FOR PRODUCT MARKETERS",
    heroHeadline: "Product Marketers",
    heroSubheadline:
      "Turn market conversations into positioning, messaging, launch angles, proof points, and voice-of-customer insights.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: Target,
    heroBullets: ["Voice of customer", "Launch angles", "Objection themes", "Proof points"],
    sourceTypes: ["Customer interview", "Win/loss call", "Launch discussion", "Webinar"],
    pain: {
      eyebrow: "The positioning gap",
      title: "Market language is hard to use when it is spread across recordings.",
      body:
        "Customer interviews, sales calls, and launch discussions hold the positioning inputs, but the source context often gets lost.",
      points: [
        {
          title: "Research is scattered",
          body: "Positioning inputs live across transcripts, notes, and meeting recordings.",
          icon: Search,
        },
        {
          title: "Launch ideas lose the source",
          body: "Campaign angles are weaker when the customer proof behind them is hard to find.",
          icon: Megaphone,
          tone: "purple",
        },
        {
          title: "Objections stay anecdotal",
          body: "Repeated pushback and alternative language may never become structured messaging input.",
          icon: MessageSquareText,
          tone: "green",
        },
        {
          title: "Claims need review",
          body: "Product marketing claims should be tied back to source evidence before publishing.",
          icon: Quote,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Build messaging from the market conversations behind the product.",
      body:
        "AudioRepurpose helps product marketers organize customer language, objections, outcomes, and proof into usable campaign material.",
      points: [
        {
          title: "Capture voice of customer",
          body: "Extract the words customers use to describe pain, value, alternatives, and outcomes.",
          icon: MessageSquareText,
        },
        {
          title: "Organize launch signal",
          body: "Turn launch calls and interviews into angles, posts, newsletters, and briefs.",
          icon: Megaphone,
          tone: "purple",
        },
        {
          title: "Keep claims source-backed",
          body: "Trace quotes and proof points back to the transcript context.",
          icon: Search,
          tone: "green",
        },
        {
          title: "Reuse plan guidance",
          body: "Apply Studio plan, voice, and profile context across launch work.",
          icon: Sparkles,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for messaging work.",
      body:
        "Use transcripts, summaries, insights, quotes, Studio context, and Library assets to create clearer messaging inputs.",
      cards: [
        {
          title: "Positioning signal",
          body: "Pull pain, value, alternative, and outcome language from transcripts.",
          icon: Target,
        },
        {
          title: "Launch content drafts",
          body: "Generate posts, newsletter sections, blog drafts, and campaign angles from launch recordings.",
          icon: Megaphone,
          tone: "purple",
        },
        {
          title: "Objection patterns",
          body: "Capture repeated objections and unanswered questions for messaging review.",
          icon: MessageSquareText,
          tone: "green",
        },
        {
          title: "Competitive notes",
          body: "Keep competitor mentions as reviewable source context without turning them into automatic claims.",
          icon: Search,
          tone: "amber",
        },
        {
          title: "Proof point library",
          body: "Save quotes, outcomes, and examples for campaigns and launch work.",
          icon: BookOpenText,
        },
        {
          title: "Studio plan guidance",
          body: "Tie drafts to campaign objective, channel, audience, and voice guidance.",
          icon: Sparkles,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Product marketing workflow",
      title: "From market conversation to messaging input.",
      body:
        "Use each recording to build a source-backed view of customer language, objections, proof, and launch angles.",
      steps: [
        {
          title: "Add the market conversation",
          body: "Start from a customer interview, sales call, webinar, win/loss-style call, or launch discussion.",
          icon: CloudUpload,
        },
        {
          title: "Extract positioning signals",
          body: "Pull pain, value, alternatives, objections, proof points, quotes, and customer language.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Build messaging inputs",
          body: "Draft positioning notes, launch angles, sales narrative snippets, and campaign material.",
          icon: Megaphone,
          tone: "green",
        },
        {
          title: "Keep proof attached",
          body: "Keep transcripts, speakers, quotes, and saved drafts close to every messaging claim.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What product marketers can create",
      title: "Messaging inputs and launch drafts with source context attached.",
      body:
        "These are source-backed assets for review, not automated market research conclusions.",
      cards: [
        {
          title: "Messaging research summaries",
          body: "Summarize pain, value, alternatives, and outcome language.",
          label: "Research",
          icon: Target,
        },
        {
          title: "Launch angle notes",
          body: "Turn launch discussions into sharper campaign directions.",
          label: "Launch",
          icon: Megaphone,
          tone: "purple",
        },
        {
          title: "Customer quote banks",
          body: "Save reviewable quotes with source and speaker context.",
          label: "Quotes",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Sales narrative snippets",
          body: "Create short pieces of messaging support from market conversations.",
          label: "Sales",
          icon: MessageSquareText,
          tone: "amber",
        },
        {
          title: "Blog and newsletter drafts",
          body: "Generate long-form and email material from the same source.",
          label: "Content",
          icon: FileText,
        },
        {
          title: "Objection pattern digests",
          body: "Collect repeated concerns and review how they should change messaging.",
          label: "Objections",
          icon: Search,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Make every messaging claim easier to review.",
      body:
        "AudioRepurpose keeps market language, transcripts, quotes, and saved drafts connected so the team can inspect the source behind the claim.",
      checks: ["Customer language", "Objection themes", "Competitive mentions", "Launch plan context"],
    },
    collaboration: {
      eyebrow: "Messaging alignment",
      title: "Product marketing inputs need to travel across go-to-market teams.",
      body:
        "Product, sales, marketing, customer success, and leadership can review stronger messaging when the customer language and proof behind it stay attached.",
      collaborators: ["Product", "Sales", "Marketing", "Customer success", "Leadership"],
      note:
        "Messaging work gets clearer when launch angles, objection patterns, and proof points can be checked against the source.",
    },
    faq: [
      {
        question: "Can this support voice-of-customer research?",
        answer:
          "Yes. AudioRepurpose turns recordings into transcripts, summaries, insights, quotes, and reusable Library assets.",
      },
      {
        question: "Can it support launch messaging?",
        answer:
          "Yes. Studio plans and supported content outputs can shape launch posts, newsletters, blog drafts, proof notes, and campaign material.",
      },
      {
        question: "Can it surface objection patterns?",
        answer:
          "Yes. It can collect repeated objections, alternative language, unanswered questions, and themes from recorded conversations.",
      },
      {
        question: "Can we use it for positioning work?",
        answer:
          "Yes. Use it to organize customer language, outcomes, alternatives, objections, quotes, and proof points for review.",
      },
      {
        question: "Does it prove market claims automatically?",
        answer:
          "No. It keeps source context attached so product marketers can review evidence before publishing claims.",
      },
    ],
    finalCta: {
      eyebrow: "Product marketers",
      title: "Build clearer messaging from the conversations behind your product.",
      body:
        "Start with one interview, sales call, or launch discussion. Extract the language and proof your next campaign needs.",
      primaryCta: "Sign up for free",
      secondaryCta: "View pricing",
      secondaryHref: "/pricing",
      steps: [
        { label: "Conversation", body: "Add the interview, sales call, webinar, or launch discussion." },
        { label: "Theme", body: "Extract customer language, objections, alternatives, and outcomes." },
        { label: "Message", body: "Draft positioning inputs, launch angles, and campaign material." },
        { label: "Proof", body: "Keep every useful claim close to transcript and speaker context." },
      ],
    },
  },
  consultants: {
    slug: "consultants",
    navTitle: "Consultants",
    pageTitle: "Consultants",
    metaTitle: "Consultants | AudioRepurpose",
    metaDescription:
      "Turn workshops, client interviews, discovery calls, and strategy sessions into summaries, insights, recommendations, briefs, and client-ready drafts.",
    canonicalPath: "/built-for/consultants",
    eyebrow: "BUILT FOR CONSULTANTS",
    heroHeadline: "Consultants",
    heroSubheadline:
      "Turn workshops, interviews, discovery calls, and client sessions into structured summaries, reports, recommendations, and deliverable drafts.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: BriefcaseBusiness,
    heroBullets: ["Workshop recaps", "Client insights", "Source-backed notes", "Draft deliverables"],
    sourceTypes: ["Workshop", "Client interview", "Discovery call", "Strategy session"],
    pain: {
      eyebrow: "The consulting handoff",
      title: "Client sessions contain the raw material, but deliverables need structure.",
      body:
        "Long recordings make it hard to capture themes, priorities, quotes, decisions, and next steps without losing source context.",
      points: [
        {
          title: "Sessions are long",
          body: "Workshops and discovery calls can take too much manual time to process.",
          icon: CalendarDays,
        },
        {
          title: "Recommendations need proof",
          body: "Client-facing claims are stronger when the source context stays attached.",
          icon: Search,
          tone: "purple",
        },
        {
          title: "Client language gets lost",
          body: "The exact wording behind a priority or blocker is easy to smooth over in notes.",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Follow-up takes structure",
          body: "Summaries, next steps, and recommendations need a clean first draft.",
          icon: FileText,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Turn client recordings into structured material for review.",
      body:
        "AudioRepurpose helps consultants extract themes, decisions, quotes, and draft materials from source sessions.",
      points: [
        {
          title: "Summarize long sessions",
          body: "Create concise summaries, decisions, open questions, and next steps.",
          icon: FileText,
        },
        {
          title: "Extract client signal",
          body: "Pull themes, priorities, blockers, and useful client language.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft useful materials",
          body: "Generate outlines, notes, recommendations, and client-facing draft content.",
          icon: BriefcaseBusiness,
          tone: "green",
        },
        {
          title: "Save reusable expertise",
          body: "Keep strong frameworks, drafts, and source-backed assets organized.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for client sessions.",
      body:
        "Create briefs, notes, summaries, and draft recommendations without losing the source context behind them.",
      cards: [
        {
          title: "Client call summaries",
          body: "Create concise summaries, decisions, open questions, and next steps.",
          icon: FileText,
        },
        {
          title: "Workshop signal extraction",
          body: "Pull themes, priorities, blockers, and useful client language.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft deliverables",
          body: "Generate outlines, notes, recommendations, and client-facing content drafts.",
          icon: BriefcaseBusiness,
          tone: "green",
        },
        {
          title: "Source-backed review",
          body: "Return to transcript and speaker context when a claim needs proof.",
          icon: Search,
          tone: "amber",
        },
        {
          title: "Library organization",
          body: "Save reusable frameworks, drafts, and client source material.",
          icon: BookOpenText,
        },
        {
          title: "Voice control",
          body: "Use Studio voice settings for polished, consistent client materials.",
          icon: Sparkles,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Consulting workflow",
      title: "From client session to clearer deliverable draft.",
      body:
        "Use recordings to capture the useful signal before writing the client-facing version.",
      steps: [
        {
          title: "Add the client session",
          body: "Start from a workshop, discovery call, client interview, or strategy recording.",
          icon: CloudUpload,
        },
        {
          title: "Extract priorities and decisions",
          body: "Pull priorities, blockers, decisions, open questions, useful quotes, and client language.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft client-ready material",
          body: "Create summaries, recommendations, outlines, follow-up notes, and deliverable drafts.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Review against source",
          body: "Use transcript and speaker context to refine the material before client delivery.",
          icon: Search,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What consultants can create",
      title: "Client-ready starting points from recorded source material.",
      body:
        "Outputs are drafts and structured notes that consultants review before client delivery.",
      cards: [
        {
          title: "Workshop recaps",
          body: "Summarize decisions, themes, open questions, and next steps.",
          label: "Recap",
          icon: CalendarDays,
        },
        {
          title: "Discovery summaries",
          body: "Capture client goals, priorities, blockers, and useful language.",
          label: "Discovery",
          icon: Search,
          tone: "purple",
        },
        {
          title: "Strategy notes",
          body: "Turn recorded context into structured notes for review.",
          label: "Strategy",
          icon: Target,
          tone: "green",
        },
        {
          title: "Recommendation outlines",
          body: "Draft the shape of a recommendation from the source material.",
          label: "Outline",
          icon: BriefcaseBusiness,
          tone: "amber",
        },
        {
          title: "Proposal inputs",
          body: "Save source-backed observations that can inform future proposals.",
          label: "Proposal",
          icon: FileText,
        },
        {
          title: "Client quote capture",
          body: "Preserve quotable excerpts with speaker context.",
          label: "Quotes",
          icon: Quote,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Client-facing work is easier to defend when the source stays attached.",
      body:
        "Keep transcript, speaker context, summary, and draft material close together while shaping recommendations.",
      checks: ["Workshop summaries", "Client language", "Recommendations", "Saved Library context"],
    },
    collaboration: {
      eyebrow: "Delivery alignment",
      title: "Consulting work moves faster when session context is easy to review.",
      body:
        "Clients, account teams, subject-matter experts, project managers, and delivery teams can align around clearer notes when workshop context stays source-backed.",
      collaborators: ["Clients", "Account teams", "Subject-matter experts", "Project managers", "Delivery teams"],
      note:
        "Recommendations are easier to defend when priorities, decisions, and client language remain tied to the session.",
    },
    faq: [
      {
        question: "Can this turn workshops into client-ready material?",
        answer:
          "Yes. Workshops can become summaries, briefs, recommendation outlines, follow-up notes, and other review-ready draft material.",
      },
      {
        question: "Can it summarize discovery calls?",
        answer:
          "Yes. Discovery calls can become summaries, decisions, open questions, client language, and next-step notes.",
      },
      {
        question: "Can it help draft reports or recommendations?",
        answer:
          "It can draft outlines, notes, summaries, and recommendation material from source sessions. Consultants should review the final client version.",
      },
      {
        question: "Can clients review the source-backed output?",
        answer:
          "AudioRepurpose keeps source context attached for review. How much source material is shared with a client depends on your delivery process.",
      },
      {
        question: "Does AudioRepurpose create finished consulting decks?",
        answer:
          "No verified deck-generation feature exists. Use it for briefs, notes, outlines, summaries, and draft recommendations.",
      },
    ],
    finalCta: {
      eyebrow: "Consultants",
      title: "Turn your next client session into a clearer source-backed deliverable draft.",
      body:
        "Start with one workshop or discovery call. Extract the signal, shape the draft, and keep the proof close.",
      primaryCta: "Sign up for free",
      secondaryCta: "Book a demo",
      secondaryHref: "/#pricing",
      steps: [
        { label: "Session", body: "Add the workshop, discovery call, interview, or strategy recording." },
        { label: "Priority", body: "Extract decisions, blockers, open questions, and client language." },
        { label: "Draft", body: "Create summaries, recommendations, outlines, and follow-up notes." },
        { label: "Deliverable", body: "Review against the source before shaping the client-facing version." },
      ],
    },
  },
  creators: {
    slug: "creators",
    navTitle: "Creators",
    pageTitle: "Creators",
    metaTitle: "Creators | AudioRepurpose",
    metaDescription:
      "Repurpose podcasts, videos, interviews, voice notes, and demos into transcripts, highlights, posts, newsletters, show notes, and source-backed drafts.",
    canonicalPath: "/built-for/creators",
    eyebrow: "BUILT FOR CREATORS",
    heroHeadline: "Creators",
    heroSubheadline:
      "Turn podcasts, videos, interviews, demos, and voice notes into reusable drafts, quotes, outlines, newsletters, and posts.",
    primaryCta: "Sign up for free",
    primaryHref: SIGNUP_HREF,
    secondaryCta: "View pricing",
    secondaryHref: "/pricing",
    icon: Video,
    heroBullets: ["Podcast repurposing", "Show notes", "Quote graphics", "Multi-channel drafts"],
    sourceTypes: ["Podcast", "Interview", "Video", "Voice note"],
    pain: {
      eyebrow: "The creator repurposing gap",
      title: "One strong recording can contain more useful ideas than a creator has time to process.",
      body:
        "Long-form episodes, videos, interviews, and notes need a repeatable way to become highlights, drafts, and reusable ideas.",
      points: [
        {
          title: "Long recordings hide the best ideas",
          body: "Strong quotes, stories, and teaching moments are hard to find later.",
          icon: Search,
        },
        {
          title: "Every format needs another pass",
          body: "Show notes, posts, newsletters, descriptions, and scripts all take extra work.",
          icon: FileText,
          tone: "purple",
        },
        {
          title: "Drafts can drift",
          body: "Repurposed content should stay close to the original point and speaker context.",
          icon: Quote,
          tone: "green",
        },
        {
          title: "Voice takes repetition",
          body: "Audience, tone, and channel guidance are often rebuilt every time.",
          icon: Sparkles,
          tone: "amber",
        },
      ],
    },
    benefits: {
      eyebrow: "Why it works",
      title: "Make every episode, video, or interview easier to reuse.",
      body:
        "AudioRepurpose helps creators extract highlights, summaries, quotes, and drafts from long-form source material.",
      points: [
        {
          title: "Create multiple formats",
          body: "Turn one source into posts, newsletters, show notes, scripts, and quote graphics.",
          icon: FileText,
        },
        {
          title: "Extract highlights",
          body: "Find strong ideas, quotes, stories, chapters, and takeaways.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Keep the source attached",
          body: "Review drafts against transcript and speaker context.",
          icon: Search,
          tone: "green",
        },
        {
          title: "Reuse your voice",
          body: "Use Studio profile and voice guidance for consistent drafts.",
          icon: Sparkles,
          tone: "amber",
        },
      ],
    },
    features: {
      eyebrow: "Key features",
      title: "Key features for repurposing.",
      body:
        "Turn long-form source material into draft outputs and analysis without claiming clip editing or direct publishing.",
      cards: [
        {
          title: "Multi-channel drafts",
          body: "Create posts, X threads, newsletters, show notes, scripts, and quote graphics.",
          icon: Video,
        },
        {
          title: "Highlight extraction",
          body: "Surface strong ideas, quotes, stories, chapters, and takeaways.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Show notes support",
          body: "Generate episode summaries and structured show notes from recordings.",
          icon: BookOpenText,
          tone: "green",
        },
        {
          title: "Voice consistency",
          body: "Use Studio profile and voice context to keep drafts aligned.",
          icon: Sparkles,
          tone: "amber",
        },
        {
          title: "Library reuse",
          body: "Save ideas, drafts, quotes, and source-backed assets for future content.",
          icon: BookOpenText,
        },
        {
          title: "Source-aware editing",
          body: "Keep transcript and original context close while reviewing.",
          icon: Search,
          tone: "green",
        },
      ],
    },
    workflow: {
      eyebrow: "Creator workflow",
      title: "From long-form source to a reusable content set.",
      body:
        "Use the same source-backed path for podcasts, videos, interviews, demos, livestreams, and voice notes.",
      steps: [
        {
          title: "Add the long-form recording",
          body: "Start from a podcast, video, interview, demo, livestream, or voice note.",
          icon: CloudUpload,
        },
        {
          title: "Find reusable moments",
          body: "Extract summaries, chapters, takeaways, quotes, stories, and ideas worth turning into content.",
          icon: Lightbulb,
          tone: "purple",
        },
        {
          title: "Draft content for multiple channels",
          body: "Create posts, newsletters, show notes, descriptions, scripts, and quote graphics from the same source.",
          icon: FileText,
          tone: "green",
        },
        {
          title: "Save quotes and ideas",
          body: "Move strong drafts, quotes, highlights, and source-backed ideas into Library for future use.",
          icon: BookOpenText,
          tone: "amber",
        },
      ],
    },
    outputs: {
      eyebrow: "What creators can create",
      title: "Multiple content drafts from one long-form source.",
      body:
        "AudioRepurpose creates review-ready drafts and structured notes, not automatic publishing or video editing.",
      cards: [
        {
          title: "Podcast show notes",
          body: "Summarize episodes with useful structure for listeners.",
          label: "Show notes",
          icon: BookOpenText,
        },
        {
          title: "YouTube descriptions",
          body: "Draft video descriptions from the source transcript.",
          label: "YouTube",
          icon: Video,
          tone: "purple",
        },
        {
          title: "LinkedIn posts",
          body: "Turn strong ideas into professional social drafts.",
          label: "Social",
          icon: Megaphone,
          tone: "green",
        },
        {
          title: "X threads",
          body: "Shape a topic or story into a thread-format draft.",
          label: "Thread",
          icon: MessageSquareText,
          tone: "amber",
        },
        {
          title: "Email newsletters",
          body: "Create longer-form email material from the recording.",
          label: "Email",
          icon: FileText,
        },
        {
          title: "Quote graphics",
          body: "Capture quotable excerpts with speaker attribution.",
          label: "Quotes",
          icon: Quote,
          tone: "purple",
        },
      ],
    },
    sourceBacked: {
      eyebrow: "Source-backed confidence",
      title: "Repurpose without losing what made the original strong.",
      body:
        "Keep the transcript, speaker context, highlights, and saved drafts connected so every output can be reviewed against the source.",
      checks: ["Transcript and chapters", "Quotes and takeaways", "Studio voice context", "Saved ideas and drafts"],
    },
    collaboration: {
      eyebrow: "Creator collaboration",
      title: "Creator workflows need reusable source material, not another blank page.",
      body:
        "Editors, producers, guests, sponsors, assistants, and collaborators can work from clearer drafts when the episode, interview, or video source stays attached.",
      collaborators: ["Editors", "Producers", "Guests", "Sponsors", "Assistants", "Collaborators"],
      note:
        "Repurposed content stays sharper when quotes, outlines, and drafts can be checked against the original recording.",
    },
    faq: [
      {
        question: "Can this repurpose podcasts and interviews?",
        answer:
          "Yes. Podcasts, interviews, videos, demos, and voice notes can become transcripts, summaries, drafts, quotes, and content ideas.",
      },
      {
        question: "Can it create show notes or newsletter drafts?",
        answer:
          "Yes. Show notes and email newsletters are supported content types, along with posts, descriptions, scripts, and quote graphics.",
      },
      {
        question: "Can it help find quotes and highlights?",
        answer:
          "Yes. Quote extraction, takeaways, chapters, summaries, and highlights are supported analysis themes.",
      },
      {
        question: "Can I reuse one recording across multiple channels?",
        answer:
          "Yes. One source can support multiple review-ready drafts such as posts, newsletters, show notes, descriptions, scripts, and quote graphics.",
      },
      {
        question: "Does AudioRepurpose edit video clips?",
        answer:
          "No verified clip-editing workflow exists. It supports draft outputs such as short-form video scripts, descriptions, posts, and quote graphics.",
      },
    ],
    finalCta: {
      eyebrow: "Creators",
      title: "Turn your next episode, interview, or video into a reusable content library.",
      body:
        "Start with one long-form source. Extract the best moments and shape them into drafts you can review across channels.",
      primaryCta: "Sign up for free",
      secondaryCta: "View pricing",
      secondaryHref: "/pricing",
      steps: [
        { label: "Recording", body: "Add the podcast, video, interview, demo, livestream, or voice note." },
        { label: "Highlight", body: "Find quotes, stories, chapters, takeaways, and reusable ideas." },
        { label: "Draft", body: "Create posts, newsletters, show notes, scripts, and descriptions." },
        { label: "Reuse", body: "Save strong drafts and source-backed ideas for future content." },
      ],
    },
  },
} as const satisfies Record<BuiltForPageSlug, BuiltForPageData>;

export type BuiltForRouteSlug = BuiltForPageSlug;

export const BUILT_FOR_PAGE_LIST = Object.values(BUILT_FOR_PAGES);

export const BUILT_FOR_ROUTE_PAGES = Object.fromEntries(
  BUILT_FOR_PAGE_LIST.map((page) => [
    page.slug,
    {
      slug: page.slug,
      navTitle: page.navTitle,
      heroBody: page.heroSubheadline,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      canonicalPath: page.canonicalPath,
    },
  ]),
) as Record<
  BuiltForRouteSlug,
  {
    slug: BuiltForRouteSlug;
    navTitle: string;
    heroBody: string;
    metaTitle: string;
    metaDescription: string;
    canonicalPath: string;
  }
>;

export const BUILT_FOR_ROUTE_PAGE_LIST = Object.values(BUILT_FOR_ROUTE_PAGES);

export function isBuiltForPageSlug(value: string): value is BuiltForPageSlug {
  return value in BUILT_FOR_PAGES;
}

export function isBuiltForRouteSlug(value: string): value is BuiltForRouteSlug {
  return isBuiltForPageSlug(value);
}
