export type ProductPageKey =
  | "upload"
  | "teams"
  | "studio"
  | "library"
  | "integrations"
  | "analysis";

export type ProductIconKey =
  | "analysis"
  | "calendar"
  | "check"
  | "clock"
  | "file"
  | "folder"
  | "goal"
  | "library"
  | "link"
  | "message"
  | "palette"
  | "plug"
  | "quote"
  | "search"
  | "shield"
  | "sparkles"
  | "upload"
  | "users"
  | "workflow";

export type ProductPreviewTone = "blue" | "green" | "purple" | "amber" | "cyan" | "slate";

export type ProductPreviewItem = {
  label: string;
  value?: string;
  description?: string;
  icon?: ProductIconKey;
  tone?: ProductPreviewTone;
};

export type ProductPageContent = {
  slug: ProductPageKey;
  navLabel: string;
  navDescription: string;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  metadata: {
    title: string;
    description: string;
  };
  icon: ProductIconKey;
  sections: {
    featuresTitle: string;
    featuresDescription: string;
    workflowTitle: string;
    workflowDescription: string;
    useCasesTitle: string;
    useCasesDescription: string;
  };
  quickBenefits: Array<{
    title: string;
    description: string;
  }>;
  features: Array<{
    title: string;
    description: string;
    icon: ProductIconKey;
  }>;
  workflow: Array<{
    title: string;
    description: string;
  }>;
  useCases: Array<{
    title: string;
    description: string;
  }>;
  connectedProducts: ProductPageKey[];
  connectionSummary: string;
  finalCta: {
    eyebrow: string;
    title: string;
    description: string;
  };
  preview: {
    title: string;
    subtitle: string;
    primaryAction: string;
    secondaryAction?: string;
    tabs: string[];
    stats: Array<{
      label: string;
      value: string;
      description: string;
      icon: ProductIconKey;
      tone?: ProductPreviewTone;
    }>;
    mainPanel: {
      eyebrow: string;
      title: string;
      description: string;
      items: ProductPreviewItem[];
    };
    sidePanel: {
      eyebrow: string;
      title: string;
      description: string;
      items: ProductPreviewItem[];
    };
    table: {
      title: string;
      rows: Array<{
        label: string;
        detail: string;
        status: string;
        tone?: ProductPreviewTone;
      }>;
    };
  };
};

export const productPages: Record<ProductPageKey, ProductPageContent> = {
  upload: {
    slug: "upload",
    navLabel: "Upload",
    navDescription: "Upload audio, import source files, and choose what to generate.",
    eyebrow: "Product / Upload",
    title: "Turn raw recordings into",
    highlight: "ready source material.",
    description:
      "Upload audio, video, notes, and connected source files, then prepare them for transcript, analysis, generation, and reuse.",
    primaryCta: "Start uploading",
    secondaryCta: "See workflow",
    metadata: {
      title: "Upload | AudioRepurpose",
      description:
        "Upload recordings, import source material, choose transcript or analysis modules, and prepare audio for content generation in AudioRepurpose.",
    },
    icon: "upload",
    sections: {
      featuresTitle: "Everything source material needs before generation.",
      featuresDescription:
        "Prepare recordings, source files, speaker context, and processing choices before the material moves into analysis or draft generation.",
      workflowTitle: "How upload fits into the audio-to-content process.",
      workflowDescription:
        "Upload creates the structured starting point: it collects source material, captures setup choices, and sends the project into the right next workflow.",
      useCasesTitle: "Practical ways teams use upload.",
      useCasesDescription:
        "Use Upload when valuable audio, video, notes, or external source material needs to become an organized project before anyone drafts.",
    },
    quickBenefits: [
      {
        title: "Centralize source material",
        description: "Keep recordings, URLs, connected-source imports, and transcript-only work in one workspace.",
      },
      {
        title: "Choose the processing path",
        description: "Start with transcript-only or select named speakers, summary, insights, chapters, takeaways, and quotes.",
      },
      {
        title: "Carry context forward",
        description: "Source labels, speaker hints, and analysis choices stay connected to projects and downstream drafts.",
      },
      {
        title: "Route work into the platform",
        description: "Move uploaded material into Analysis, Studio-guided generation, and Library review workflows.",
      },
    ],
    features: [
      {
        title: "Local audio and video upload",
        description: "Bring MP3, WAV, M4A, MP4, MOV, and similar source files directly into the workspace.",
        icon: "upload",
      },
      {
        title: "URL import",
        description: "Use direct media links or best-effort public video imports when you do not want to download files manually.",
        icon: "link",
      },
      {
        title: "Connected-source imports",
        description: "Queue material from supported connected sources such as meeting recordings, cloud files, notes, and uploads.",
        icon: "plug",
      },
      {
        title: "Transcript-only mode",
        description: "Create the transcript first when you want to defer analysis and content generation decisions.",
        icon: "file",
      },
      {
        title: "Analysis module selection",
        description: "Pick the exact structured outputs you want before processing starts.",
        icon: "analysis",
      },
      {
        title: "Speaker roster help",
        description: "Pre-define speaker names and roles to help the speaker workflow match voices to identities earlier.",
        icon: "users",
      },
      {
        title: "Queue and progress visibility",
        description: "Track queued and processing files without leaving the upload flow.",
        icon: "clock",
      },
      {
        title: "Workspace source history",
        description: "Return to previous source material in the workspace when you need to review what has already been processed.",
        icon: "folder",
      },
    ],
    workflow: [
      {
        title: "Add the source",
        description: "Upload a file, import a URL, or choose material from a supported connected source.",
      },
      {
        title: "Select transcript and analysis options",
        description: "Decide whether the source should become a transcript only or include structured analysis modules.",
      },
      {
        title: "Attach speaker and source context",
        description: "Add roster hints or source labels so the project keeps useful context after processing.",
      },
      {
        title: "Send the project forward",
        description: "Use the transcript and analysis as the base for Studio-guided drafts and Library assets.",
      },
    ],
    useCases: [
      {
        title: "Repurpose podcasts and webinars",
        description: "Use long-form recordings as the starting point for summaries, quotes, posts, show notes, and campaign drafts.",
      },
      {
        title: "Process customer and sales calls",
        description: "Turn demos, interviews, and customer conversations into source-backed transcripts and reusable insights.",
      },
      {
        title: "Capture voice notes and updates",
        description: "Bring informal recordings into the same workflow as polished events and meetings.",
      },
      {
        title: "Import team source material",
        description: "Use supported app and cloud-source imports when valuable recordings already live outside the upload form.",
      },
    ],
    connectedProducts: ["analysis", "studio", "library", "integrations"],
    connectionSummary:
      "Upload is the intake layer. It feeds Analysis with transcripts and modules, gives Studio source material to shape, and gives Library assets worth saving.",
    finalCta: {
      eyebrow: "Start with better source context",
      title: "Build better content from organized uploads.",
      description:
        "Bring recordings into one workflow, choose what should happen next, and keep the source context attached through review.",
    },
    preview: {
      title: "Upload",
      subtitle: "Prepare source material for transcript, analysis, and generation.",
      primaryAction: "Upload files",
      secondaryAction: "URL import",
      tabs: ["Local upload", "Integrations", "URL import"],
      stats: [
        {
          label: "Source files",
          value: "3",
          description: "Ready for processing",
          icon: "upload",
          tone: "blue",
        },
        {
          label: "Selected modules",
          value: "6",
          description: "Transcript, speakers, summary, quotes",
          icon: "analysis",
          tone: "purple",
        },
        {
          label: "Queued minutes",
          value: "84",
          description: "Across active uploads",
          icon: "clock",
          tone: "cyan",
        },
        {
          label: "Next handoff",
          value: "Analysis",
          description: "Source context stays attached",
          icon: "workflow",
          tone: "green",
        },
      ],
      mainPanel: {
        eyebrow: "Upload audio or video",
        title: "Source intake queue",
        description: "Generic source files move through the same preparation flow before generation.",
        items: [
          {
            label: "Customer interview.mp4",
            value: "Queued",
            description: "Local upload · 42 min",
            icon: "message",
            tone: "blue",
          },
          {
            label: "Launch webinar.wav",
            value: "Processing",
            description: "Named speakers + quotes",
            icon: "upload",
            tone: "purple",
          },
          {
            label: "Transcript notes.txt",
            value: "Ready",
            description: "Transcript-only source",
            icon: "file",
            tone: "green",
          },
        ],
      },
      sidePanel: {
        eyebrow: "Helpful setup",
        title: "Processing choices",
        description: "Upload keeps source context and module selections together.",
        items: [
          { label: "Transcript only", value: "Off", icon: "file", tone: "slate" },
          { label: "Speaker hints", value: "Added", icon: "users", tone: "blue" },
          { label: "Audio quality", value: "Ready", icon: "check", tone: "green" },
          { label: "Advanced options", value: "Auto-detect", icon: "sparkles", tone: "purple" },
        ],
      },
      table: {
        title: "Upload history",
        rows: [
          { label: "Product demo recording", detail: "Local upload · MP4", status: "Completed", tone: "green" },
          { label: "Customer call excerpt", detail: "Drive import · WAV", status: "Ready", tone: "blue" },
          { label: "Voice memo batch", detail: "Mobile source · M4A", status: "Queued", tone: "amber" },
        ],
      },
    },
  },
  teams: {
    slug: "teams",
    navLabel: "Teams",
    navDescription: "Collaborate across roles, shared workspaces, and review flows.",
    eyebrow: "Product / Teams",
    title: "Keep content work moving",
    highlight: "across the team.",
    description:
      "Invite teammates, manage shared context, review drafts, and keep source-backed content workflows organized from intake to approval.",
    primaryCta: "Invite your team",
    secondaryCta: "See team workflow",
    metadata: {
      title: "Teams | AudioRepurpose",
      description:
        "Use AudioRepurpose team workspaces to invite members, manage roles, share Studio and Library assets, and organize content review.",
    },
    icon: "users",
    sections: {
      featuresTitle: "Collaboration tools built around reusable context.",
      featuresDescription:
        "Keep members, roles, shared assets, and review states close to the source-backed work the team is producing.",
      workflowTitle: "How teams fit into the audio-to-content process.",
      workflowDescription:
        "Teams provides the operating layer for shared workspaces, reusable context, review visibility, and the handoffs between upload, Studio, and Library.",
      useCasesTitle: "Practical ways teams work together.",
      useCasesDescription:
        "Use Teams when source material, content direction, draft review, and reusable assets need to move between multiple collaborators.",
    },
    quickBenefits: [
      {
        title: "Shared workspace context",
        description: "Keep team source material, Studio assets, Library drafts, and billing context organized around a workspace.",
      },
      {
        title: "Role-aware access",
        description: "Use owner, admin, editor, and reader roles to control who can manage, edit, or review shared work.",
      },
      {
        title: "Private or shared assets",
        description: "Keep Studio profiles, voices, plans, collections, and drafts private until they are ready to share.",
      },
      {
        title: "Review-ready operations",
        description: "Use Library statuses and source context to make review less dependent on scattered notes.",
      },
    ],
    features: [
      {
        title: "Workspace invitations",
        description: "Invite new members into a team workspace and track pending or active seats.",
        icon: "users",
      },
      {
        title: "Role management",
        description: "Assign admin, editor, or reader access so each teammate gets the right level of control.",
        icon: "shield",
      },
      {
        title: "Shared Studio assets",
        description: "Share profiles, brand voices, and campaign plans when the same context should guide team output.",
        icon: "sparkles",
      },
      {
        title: "Shared Library collections",
        description: "Make collections and saved drafts available to the workspace while preserving private work when needed.",
        icon: "library",
      },
      {
        title: "Review status visibility",
        description: "Track draft, in-review, approved, published, archived, and needs-revision states in the Library workflow.",
        icon: "check",
      },
      {
        title: "Source-backed handoff",
        description: "Keep the original project, generation context, and source labels near the draft a teammate is reviewing.",
        icon: "workflow",
      },
      {
        title: "Workspace-level integrations",
        description: "Manage connected tools from the workspace so imported source material lands in the right place.",
        icon: "plug",
      },
      {
        title: "Team billing visibility",
        description: "Keep team plans, seats, and shared capacity aligned with the workspace where content work happens.",
        icon: "goal",
      },
    ],
    workflow: [
      {
        title: "Create or use a workspace",
        description: "Organize recordings, Studio context, Library assets, integrations, and billing around the team workspace.",
      },
      {
        title: "Invite members and set roles",
        description: "Give teammates the access they need for managing, editing, or reviewing work.",
      },
      {
        title: "Share the reusable context",
        description: "Move private Studio and Library assets into the workspace when they should guide team workflows.",
      },
      {
        title: "Review and reuse drafts together",
        description: "Use Library status, source context, and saved versions to keep content review structured.",
      },
    ],
    useCases: [
      {
        title: "Marketing production teams",
        description: "Keep campaign source material, brand voice, drafts, and review states in one shared workspace.",
      },
      {
        title: "Founder-led content teams",
        description: "Let a founder upload source recordings while teammates turn the material into review-ready drafts.",
      },
      {
        title: "Cross-functional review",
        description: "Give readers visibility into source-backed assets without handing them edit access.",
      },
      {
        title: "Recurring content operations",
        description: "Use shared Studio context and Library collections to repeat the same production pattern across recordings.",
      },
    ],
    connectedProducts: ["studio", "library", "integrations", "upload"],
    connectionSummary:
      "Teams connects the operational layer. It makes Studio context shareable, keeps Library review organized, and gives integrations a workspace to import into.",
    finalCta: {
      eyebrow: "Bring the workflow into one workspace",
      title: "Give every teammate the right context before review starts.",
      description:
        "Use shared workspaces and roles to keep audio-to-content work organized from upload through Library review.",
    },
    preview: {
      title: "Team",
      subtitle: "Invite members, manage roles, and coordinate review.",
      primaryAction: "Invite member",
      secondaryAction: "Roles",
      tabs: ["Members", "Invites", "Audit log"],
      stats: [
        {
          label: "Active seats",
          value: "8",
          description: "Joined workspace members",
          icon: "users",
          tone: "blue",
        },
        {
          label: "Pending invites",
          value: "2",
          description: "Awaiting acceptance",
          icon: "clock",
          tone: "amber",
        },
        {
          label: "Shared assets",
          value: "14",
          description: "Studio and Library items",
          icon: "library",
          tone: "purple",
        },
        {
          label: "Review queue",
          value: "5",
          description: "Drafts needing attention",
          icon: "check",
          tone: "green",
        },
      ],
      mainPanel: {
        eyebrow: "Workspace identity",
        title: "Shared production workspace",
        description: "Team setup keeps roles, workspace details, and reusable context in one operational surface.",
        items: [
          {
            label: "Workspace name",
            value: "Content Team",
            description: "Shared team container",
            icon: "folder",
            tone: "blue",
          },
          {
            label: "Default review role",
            value: "Editor",
            description: "Create, generate, edit, and organize content",
            icon: "shield",
            tone: "purple",
          },
          {
            label: "Shared collection",
            value: "In review",
            description: "Campaign drafts ready for feedback",
            icon: "library",
            tone: "amber",
          },
        ],
      },
      sidePanel: {
        eyebrow: "Invite teammate",
        title: "Role guide",
        description: "Use role labels without exposing private workspace data.",
        items: [
          { label: "Owner", value: "Full control", icon: "shield", tone: "purple" },
          { label: "Admin", value: "Workspace management", icon: "users", tone: "blue" },
          { label: "Editor", value: "Create and review", icon: "file", tone: "green" },
          { label: "Reader", value: "View shared work", icon: "search", tone: "slate" },
        ],
      },
      table: {
        title: "Members and review activity",
        rows: [
          { label: "Content strategist", detail: "Editor · Launch collection", status: "Reviewing", tone: "blue" },
          { label: "Client reviewer", detail: "Reader · Proof library", status: "Needs approval", tone: "amber" },
          { label: "Producer", detail: "Admin · Upload queue", status: "Assigned", tone: "green" },
        ],
      },
    },
  },
  studio: {
    slug: "studio",
    navLabel: "Studio",
    navDescription: "Manage profiles, voices, campaign plans, and reusable brand context.",
    eyebrow: "Product / Studio",
    title: "Give every draft the",
    highlight: "context your team knows.",
    description:
      "Save reusable profiles, brand voice, campaign direction, and generation guidance so each output starts with the right context.",
    primaryCta: "Open Studio",
    secondaryCta: "See context flow",
    metadata: {
      title: "Studio | AudioRepurpose",
      description:
        "Use AudioRepurpose Studio to manage profiles, brand voices, campaign plans, and reusable generation context.",
    },
    icon: "sparkles",
    sections: {
      featuresTitle: "Reusable context for voice, campaigns, and content direction.",
      featuresDescription:
        "Turn profile details, brand voice, campaign plans, and generation guidance into context your team can reuse across recordings.",
      workflowTitle: "How Studio guides the audio-to-content process.",
      workflowDescription:
        "Studio gives every uploaded and analyzed source the direction it needs before that material becomes draft content.",
      useCasesTitle: "Practical ways teams use Studio.",
      useCasesDescription:
        "Use Studio when repeated content work needs consistent audience context, voice guidance, campaign direction, and reusable creative rules.",
    },
    quickBenefits: [
      {
        title: "Reusable profile context",
        description: "Store positioning, audience, content goals, and default workspace context instead of rewriting prompts.",
      },
      {
        title: "Voice guardrails",
        description: "Define tone, content pillars, examples, banned phrases, and CTA preferences for generated drafts.",
      },
      {
        title: "Plan-specific direction",
        description: "Tie output to a campaign objective, channels, audience, dates, selected voice, and generation guidance.",
      },
      {
        title: "Private or team-shared setup",
        description: "Keep context private or share it with the workspace when the team should reuse it.",
      },
    ],
    features: [
      {
        title: "Creator profiles",
        description: "Capture brand, website, positioning, audience, content goals, and default profile settings.",
        icon: "users",
      },
      {
        title: "Brand voices",
        description: "Define tone chips, voice notes, content pillars, writing examples, banned phrases, and CTA preferences.",
        icon: "palette",
      },
      {
        title: "Campaign plans",
        description: "Set objectives, audience, dates, status, output channels, selected voice, and generation guidance.",
        icon: "calendar",
      },
      {
        title: "Generation guidance",
        description: "Attach instructions that shape the drafts created from uploaded source material.",
        icon: "workflow",
      },
      {
        title: "Sharing controls",
        description: "Keep Studio assets private or share them to the workspace for team workflows.",
        icon: "shield",
      },
      {
        title: "Output channel context",
        description: "Help the generation step understand whether the plan is for social posts, newsletters, blogs, or other supported outputs.",
        icon: "goal",
      },
      {
        title: "Context snapshots",
        description: "Keep profile, voice, and plan context attached when generated work is saved into the Library.",
        icon: "file",
      },
      {
        title: "Campaign reuse",
        description: "Reuse proven setup across multiple recordings instead of configuring each source from scratch.",
        icon: "sparkles",
      },
    ],
    workflow: [
      {
        title: "Define the profile",
        description: "Add company, audience, positioning, and content goals that apply across the workspace.",
      },
      {
        title: "Shape the voice",
        description: "Set tone, examples, pillars, CTA preferences, and language to avoid.",
      },
      {
        title: "Build the plan",
        description: "Choose the campaign objective, channels, dates, audience, and generation guidance.",
      },
      {
        title: "Generate and save with context",
        description: "Use Studio context during generation and keep the context snapshot attached in Library.",
      },
    ],
    useCases: [
      {
        title: "Campaign launches",
        description: "Keep audience, offer, channels, and voice aligned across multiple drafts from multiple recordings.",
      },
      {
        title: "Founder or executive voice",
        description: "Turn recorded thinking into drafts that follow a saved voice and positioning profile.",
      },
      {
        title: "Customer-proof content",
        description: "Apply consistent proof-first guidance when turning calls, webinars, and interviews into assets.",
      },
      {
        title: "Team-wide brand context",
        description: "Share reusable context so collaborators generate drafts from the same profile, voice, and plan.",
      },
    ],
    connectedProducts: ["upload", "analysis", "library", "teams"],
    connectionSummary:
      "Studio gives uploaded and analyzed source material reusable direction before drafts are generated and saved into the Library.",
    finalCta: {
      eyebrow: "Make context reusable",
      title: "Stop rebuilding the same brief for every recording.",
      description:
        "Set the profile, voice, and plan once, then use that context wherever source material becomes content.",
    },
    preview: {
      title: "Studio",
      subtitle: "Build reusable profiles, voice, and campaign direction.",
      primaryAction: "Open Studio",
      secondaryAction: "New plan",
      tabs: ["Profile", "Voice", "Plans"],
      stats: [
        {
          label: "Profiles",
          value: "3",
          description: "Audience and positioning setups",
          icon: "users",
          tone: "blue",
        },
        {
          label: "Voice rules",
          value: "18",
          description: "Tone, examples, and language notes",
          icon: "palette",
          tone: "purple",
        },
        {
          label: "Campaign plans",
          value: "5",
          description: "Reusable channel guidance",
          icon: "calendar",
          tone: "green",
        },
        {
          label: "Shared context",
          value: "On",
          description: "Available to the workspace",
          icon: "sparkles",
          tone: "cyan",
        },
      ],
      mainPanel: {
        eyebrow: "Brand voice",
        title: "Reusable generation context",
        description: "Studio previews show the same profile, voice, and plan structure the dashboard uses.",
        items: [
          {
            label: "Tone",
            value: "Clear + practical",
            description: "Concise operator-led voice",
            icon: "palette",
            tone: "purple",
          },
          {
            label: "Content pillars",
            value: "4 active",
            description: "Customer proof, education, launch, POV",
            icon: "folder",
            tone: "blue",
          },
          {
            label: "CTA preference",
            value: "Direct",
            description: "Reusable action guidance",
            icon: "goal",
            tone: "green",
          },
        ],
      },
      sidePanel: {
        eyebrow: "Campaign plan",
        title: "Launch context",
        description: "Plans keep audience, channels, and instructions close to generation.",
        items: [
          { label: "Audience", value: "B2B teams", icon: "users", tone: "blue" },
          { label: "Channels", value: "LinkedIn + email", icon: "message", tone: "green" },
          { label: "Guidance", value: "Proof first", icon: "sparkles", tone: "purple" },
          { label: "Source links", value: "Attached", icon: "link", tone: "cyan" },
        ],
      },
      table: {
        title: "Context snapshots",
        rows: [
          { label: "Launch plan", detail: "Profile + voice + campaign", status: "Active", tone: "green" },
          { label: "Customer proof voice", detail: "Shared workspace context", status: "In use", tone: "blue" },
          { label: "Newsletter direction", detail: "Saved generation guidance", status: "Draft", tone: "slate" },
        ],
      },
    },
  },
  library: {
    slug: "library",
    navLabel: "Library",
    navDescription: "Save drafts, collections, reusable assets, and approved content.",
    eyebrow: "Product / Library",
    title: "Keep every useful draft",
    highlight: "easy to find and review.",
    description:
      "Save generated assets, organize collections, preserve source context, and reuse approved content across campaigns.",
    primaryCta: "Build your library",
    secondaryCta: "See saved assets",
    metadata: {
      title: "Library | AudioRepurpose",
      description:
        "Use AudioRepurpose Library to organize saved drafts, collections, source links, statuses, tags, and generation context.",
    },
    icon: "library",
    sections: {
      featuresTitle: "A searchable home for drafts, assets, and approved content.",
      featuresDescription:
        "Save useful outputs with status, source links, collection structure, and context so they can be reviewed and reused later.",
      workflowTitle: "How Library preserves the audio-to-content process.",
      workflowDescription:
        "Library keeps generated and manual drafts connected to the source material, Studio context, and review status that shaped them.",
      useCasesTitle: "Practical ways teams use Library.",
      useCasesDescription:
        "Use Library when content has moved beyond a one-off draft and needs to be organized, reviewed, approved, or reused.",
    },
    quickBenefits: [
      {
        title: "Save the strongest assets",
        description: "Turn useful generated outputs into durable Library items instead of one-off drafts.",
      },
      {
        title: "Organize by collection",
        description: "Group related drafts by campaign, topic, customer proof, or production workflow.",
      },
      {
        title: "Keep review metadata visible",
        description: "Track type, platform, status, source label, plan, tags, excerpt, body, and published date.",
      },
      {
        title: "Preserve generation context",
        description: "Retain the profile, voice, plan, and generated timestamp that shaped saved work.",
      },
    ],
    features: [
      {
        title: "Saved content assets",
        description: "Store generated and manual drafts with the fields your team needs for review.",
        icon: "file",
      },
      {
        title: "Collections",
        description: "Group related saved drafts and keep unfiled material visible until it belongs somewhere.",
        icon: "folder",
      },
      {
        title: "Status filtering",
        description: "Filter work by draft, in review, approved, scheduled, published, archived, and needs revision.",
        icon: "check",
      },
      {
        title: "Search and tags",
        description: "Find drafts by title, body, source label, tags, and other saved metadata.",
        icon: "search",
      },
      {
        title: "Source project links",
        description: "Keep saved work connected to the recording and project context that produced it.",
        icon: "link",
      },
      {
        title: "Generation context snapshots",
        description: "Review which Studio profile, voice, plan, and generation timestamp shaped a saved item.",
        icon: "sparkles",
      },
      {
        title: "Version history",
        description: "See saved revisions and change summaries as content evolves through review.",
        icon: "clock",
      },
      {
        title: "Team sharing",
        description: "Share collections and items with the workspace when reusable content should move beyond private work.",
        icon: "users",
      },
    ],
    workflow: [
      {
        title: "Generate or add a draft",
        description: "Create content from a processed project or save manual work into the Library.",
      },
      {
        title: "File it into a collection",
        description: "Attach the item to a collection, source project, plan, platform, and tags.",
      },
      {
        title: "Move it through review",
        description: "Update status as the draft moves through review, revision, approval, scheduling, or publishing.",
      },
      {
        title: "Reuse with source context",
        description: "Return to the saved draft, source label, and generation context when a future campaign needs it.",
      },
    ],
    useCases: [
      {
        title: "Customer proof libraries",
        description: "Save quotes, proof points, posts, and newsletter sections from customer recordings.",
      },
      {
        title: "Campaign asset collections",
        description: "Group launch drafts, social posts, blog sections, and email copy around a shared plan.",
      },
      {
        title: "Review queues",
        description: "Keep drafts that need attention separate from approved or published work.",
      },
      {
        title: "Reusable source-backed copy",
        description: "Return to saved assets with the original project, source label, tags, and context still attached.",
      },
    ],
    connectedProducts: ["studio", "analysis", "teams", "upload"],
    connectionSummary:
      "Library is the durable layer. It saves the outputs shaped by Upload, Analysis, and Studio so Teams can review and reuse them.",
    finalCta: {
      eyebrow: "Make good drafts durable",
      title: "Turn generated work into a reusable content library.",
      description:
        "Save the outputs worth keeping, preserve their context, and make review easier for the next person.",
    },
    preview: {
      title: "Library",
      subtitle: "Browse saved outputs, collections, and reusable assets.",
      primaryAction: "New collection",
      secondaryAction: "New draft",
      tabs: ["All saved", "Unfiled", "Ready", "Needs review"],
      stats: [
        {
          label: "Collections",
          value: "6",
          description: "Campaign and proof libraries",
          icon: "folder",
          tone: "blue",
        },
        {
          label: "Saved drafts",
          value: "42",
          description: "Generated and manual assets",
          icon: "file",
          tone: "purple",
        },
        {
          label: "Ready",
          value: "18",
          description: "Approved or publishable",
          icon: "check",
          tone: "green",
        },
        {
          label: "Needs review",
          value: "7",
          description: "Waiting for feedback",
          icon: "clock",
          tone: "amber",
        },
      ],
      mainPanel: {
        eyebrow: "All saved drafts",
        title: "Reusable source-backed assets",
        description: "Saved items keep status, source labels, tags, and context visible for review.",
        items: [
          {
            label: "Customer proof post",
            value: "Approved",
            description: "Source project + quote tags",
            icon: "quote",
            tone: "green",
          },
          {
            label: "Newsletter section",
            value: "In review",
            description: "Campaign collection",
            icon: "message",
            tone: "amber",
          },
          {
            label: "Quote caption set",
            value: "Draft",
            description: "Reusable social copy",
            icon: "file",
            tone: "blue",
          },
        ],
      },
      sidePanel: {
        eyebrow: "Create saved draft",
        title: "Metadata stays attached",
        description: "Library previews use generic fields inspired by the real form layout.",
        items: [
          { label: "Type", value: "Post", icon: "file", tone: "blue" },
          { label: "Platform", value: "LinkedIn", icon: "message", tone: "cyan" },
          { label: "Status", value: "In review", icon: "check", tone: "amber" },
          { label: "Tags", value: "Launch, proof", icon: "folder", tone: "purple" },
        ],
      },
      table: {
        title: "Recent saved assets",
        rows: [
          { label: "Launch announcement draft", detail: "Campaign collection · LinkedIn", status: "Ready", tone: "green" },
          { label: "Customer quote bank", detail: "Proof library · Source linked", status: "Approved", tone: "blue" },
          { label: "Newsletter intro", detail: "Email draft · Voice attached", status: "Needs review", tone: "amber" },
        ],
      },
    },
  },
  integrations: {
    slug: "integrations",
    navLabel: "Integrations",
    navDescription: "Connect supported tools and bring external source material into the workflow.",
    eyebrow: "Product / Integrations",
    title: "Bring external source material",
    highlight: "into the workflow.",
    description:
      "Connect supported tools, import recordings and notes, and move outside source material into the same upload, analysis, and library flow.",
    primaryCta: "Connect a source",
    secondaryCta: "See supported flows",
    metadata: {
      title: "Integrations | AudioRepurpose",
      description:
        "Connect supported tools such as Zoom, Microsoft Teams, YouTube, Notion, OneDrive, Google Drive, Granola AI, and Slack to AudioRepurpose workflows.",
    },
    icon: "plug",
    sections: {
      featuresTitle: "Connected sources for recordings, notes, and workflow inputs.",
      featuresDescription:
        "Bring supported external recordings, files, pages, and notes into the same structured intake flow as local uploads.",
      workflowTitle: "How integrations feed the audio-to-content process.",
      workflowDescription:
        "Integrations extend intake by moving source material from supported tools into Upload, Analysis, Studio, and Library workflows.",
      useCasesTitle: "Practical ways teams use integrations.",
      useCasesDescription:
        "Use Integrations when the source material already lives in meeting tools, cloud storage, notes, uploads, or workspace systems.",
    },
    quickBenefits: [
      {
        title: "Use supported source providers",
        description: "Import recordings, uploads, cloud files, shared notes, or transcripts from connected provider flows.",
      },
      {
        title: "Keep imports workspace-scoped",
        description: "Manage connected tools from the workspace so source material lands in the right team context.",
      },
      {
        title: "Queue material into Upload",
        description: "Move imported files, pages, notes, or uploads into the same processing options as local uploads.",
      },
      {
        title: "Stay inside supported flows",
        description: "Use connected providers for verified source intake while the rest of the content workflow stays consistent.",
      },
    ],
    features: [
      {
        title: "Zoom recording imports",
        description: "Review recent cloud recordings from a connected Zoom account and queue available files.",
        icon: "message",
      },
      {
        title: "Microsoft Teams recordings",
        description: "Find Teams recordings from the connected Microsoft workspace and move them into processing.",
        icon: "users",
      },
      {
        title: "YouTube uploads",
        description: "Import from your connected YouTube uploads or use best-effort public URL import where appropriate.",
        icon: "upload",
      },
      {
        title: "Cloud file sources",
        description: "Bring audio and video files from connected Google Drive and OneDrive accounts.",
        icon: "folder",
      },
      {
        title: "Notion pages",
        description: "Import shared pages, transcripts, and notes from a connected Notion workspace.",
        icon: "file",
      },
      {
        title: "Granola notes",
        description: "Paste exported Granola notes, summaries, or transcript text into the upload queue.",
        icon: "file",
      },
      {
        title: "Slack files",
        description: "Import recent audio and video files from a connected Slack workspace.",
        icon: "message",
      },
      {
        title: "Connection management",
        description: "Review connected account status and manage provider connections from workspace settings.",
        icon: "plug",
      },
    ],
    workflow: [
      {
        title: "Connect the provider",
        description: "Use workspace settings to connect a supported source provider.",
      },
      {
        title: "Choose the external material",
        description: "Pick recordings, files, pages, notes, or uploads from the connected provider flow.",
      },
      {
        title: "Queue it like an upload",
        description: "Send imported material into the Upload workflow with the same transcript and analysis choices.",
      },
      {
        title: "Analyze, generate, and save",
        description: "Use Analysis, Studio, and Library once the source material is inside AudioRepurpose.",
      },
    ],
    useCases: [
      {
        title: "Meeting recording intake",
        description: "Bring Zoom and Microsoft Teams recordings into the content workflow without manually downloading every file.",
      },
      {
        title: "Cloud drive source cleanup",
        description: "Move audio and video files from Google Drive or OneDrive into a structured transcript and analysis workflow.",
      },
      {
        title: "Notes-to-content workflows",
        description: "Use Notion pages or pasted Granola notes as source material when the transcript already exists elsewhere.",
      },
      {
        title: "Workspace source operations",
        description: "Keep provider connections tied to the workspace that owns the resulting projects and Library assets.",
      },
    ],
    connectedProducts: ["upload", "analysis", "library", "teams"],
    connectionSummary:
      "Integrations extend Upload. They bring external source material into the same Analysis, Studio, Library, and Teams workflow.",
    finalCta: {
      eyebrow: "Connect where source material already lives",
      title: "Turn external recordings and notes into structured content work.",
      description:
        "Use supported provider flows to bring source material into AudioRepurpose without changing the rest of the workflow.",
    },
    preview: {
      title: "Integrations",
      subtitle: "Connect external tools and data sources to your workflow.",
      primaryAction: "Connect app",
      secondaryAction: "Manage",
      tabs: ["Live", "Import queue", "Settings"],
      stats: [
        {
          label: "Connected",
          value: "6",
          description: "Supported source providers",
          icon: "plug",
          tone: "blue",
        },
        {
          label: "Import queue",
          value: "4",
          description: "Recordings and notes ready",
          icon: "clock",
          tone: "amber",
        },
        {
          label: "Ready sources",
          value: "12",
          description: "Available for upload",
          icon: "folder",
          tone: "green",
        },
        {
          label: "Manual notes",
          value: "3",
          description: "Pasted transcripts or summaries",
          icon: "file",
          tone: "purple",
        },
      ],
      mainPanel: {
        eyebrow: "Connected platforms",
        title: "Provider status",
        description: "A generic provider grid echoes the real Integrations page without exposing account details.",
        items: [
          { label: "Zoom", value: "Connected", description: "Meeting recordings", icon: "message", tone: "blue" },
          { label: "Microsoft Teams", value: "Connected", description: "Workspace recordings", icon: "users", tone: "purple" },
          { label: "YouTube", value: "Connected", description: "Channel uploads", icon: "upload", tone: "amber" },
          { label: "Notion", value: "Connected", description: "Pages and notes", icon: "file", tone: "slate" },
          { label: "Cloud Drive", value: "Connected", description: "Audio and video files", icon: "folder", tone: "cyan" },
          { label: "Slack", value: "Connected", description: "Shared files", icon: "message", tone: "green" },
        ],
      },
      sidePanel: {
        eyebrow: "Import queue",
        title: "Source material",
        description: "Imported material is staged before it enters Upload.",
        items: [
          { label: "Weekly customer call", value: "Ready", icon: "message", tone: "green" },
          { label: "Research notes", value: "Shared", icon: "file", tone: "blue" },
          { label: "Cloud recording", value: "Importable", icon: "folder", tone: "cyan" },
          { label: "Workshop clip", value: "Queued", icon: "clock", tone: "amber" },
        ],
      },
      table: {
        title: "Supported flows",
        rows: [
          { label: "Meeting recording intake", detail: "Provider recording · Upload queue", status: "Available", tone: "green" },
          { label: "Notes-to-content source", detail: "Page export · Transcript text", status: "Shared", tone: "blue" },
          { label: "Cloud file import", detail: "Audio/video source · Workspace scoped", status: "Ready", tone: "cyan" },
        ],
      },
    },
  },
  analysis: {
    slug: "analysis",
    navLabel: "Analysis",
    navDescription: "Review transcripts, extract insights, coach content quality, and define goals.",
    eyebrow: "Product / Analysis",
    title: "Turn transcripts into",
    highlight: "structured intelligence.",
    description:
      "Run transcript modules, extract useful moments, review coaching gaps, define goals, and turn raw audio into source-backed guidance for content decisions.",
    primaryCta: "Run analysis",
    secondaryCta: "See modules",
    metadata: {
      title: "Analysis | AudioRepurpose",
      description:
        "Use AudioRepurpose Analysis for named speakers, summaries, insights, chapters, takeaways, quotes, goals, and content quality coaching.",
    },
    icon: "analysis",
    sections: {
      featuresTitle: "Transcript intelligence for clearer content decisions.",
      featuresDescription:
        "Use transcript modules, coaching signals, goals, and extracted moments to decide what a source should become.",
      workflowTitle: "How analysis turns source material into usable direction.",
      workflowDescription:
        "Analysis turns uploaded or imported material into structured evidence that can guide Studio generation and Library review.",
      useCasesTitle: "Practical ways teams use analysis.",
      useCasesDescription:
        "Use Analysis when a transcript needs to become summaries, quotes, topics, coaching notes, goals, or reusable decision context.",
    },
    quickBenefits: [
      {
        title: "Transcript modules",
        description: "Generate named speakers, summaries, insights, chapters, takeaways, and quotes from the source transcript.",
      },
      {
        title: "Topic and opportunity review",
        description: "Track topic coverage, content opportunities, and recurring signals from real project data.",
      },
      {
        title: "Creator coaching",
        description: "Surface coaching gaps and recommendations that help improve the next source or draft.",
      },
      {
        title: "Goal-guided analysis",
        description: "Use active goals to guide what the app should remember, improve, include, or avoid.",
      },
    ],
    features: [
      {
        title: "Named speakers",
        description: "Replace generic speaker labels with likely names and host or guest roles when the transcript supports it.",
        icon: "users",
      },
      {
        title: "Summaries",
        description: "Create concise project summaries that make long recordings easier to scan and reuse.",
        icon: "file",
      },
      {
        title: "Insights",
        description: "Extract concepts, people, and useful talking points from the transcript.",
        icon: "sparkles",
      },
      {
        title: "Chapters",
        description: "Break the recording into timestamped sections for faster review.",
        icon: "calendar",
      },
      {
        title: "Takeaways",
        description: "Pull out the most important ideas so teams can decide what should become content.",
        icon: "goal",
      },
      {
        title: "Quotes",
        description: "Find notable lines worth reusing in posts, decks, captions, and campaigns.",
        icon: "quote",
      },
      {
        title: "Goals",
        description: "Tell analysis what to include, remember, improve, or avoid across future recordings.",
        icon: "check",
      },
      {
        title: "Coverage and coaching",
        description: "Review topic coverage, coaching gaps, missed opportunities, content mix, and analysis snapshots.",
        icon: "analysis",
      },
    ],
    workflow: [
      {
        title: "Start from the transcript",
        description: "Use an uploaded or imported source as the base for analysis.",
      },
      {
        title: "Select the modules",
        description: "Choose named speakers, summary, insights, chapters, takeaways, quotes, or transcript-only output.",
      },
      {
        title: "Review insights and coaching",
        description: "Inspect topic coverage, gaps, opportunities, goals, and recommendations from the dashboard.",
      },
      {
        title: "Send useful material forward",
        description: "Use quotes, takeaways, summaries, and insights to guide Studio generation and Library saves.",
      },
    ],
    useCases: [
      {
        title: "Voice-of-customer review",
        description: "Turn customer calls and interviews into quotes, insights, objections, and recurring themes.",
      },
      {
        title: "Podcast and webinar breakdowns",
        description: "Create summaries, chapters, quotes, and takeaways that make long-form recordings easier to repurpose.",
      },
      {
        title: "Content quality coaching",
        description: "Use topic coverage and coaching gaps to decide what to clarify, repeat, or improve.",
      },
      {
        title: "Goal-based content planning",
        description: "Set goals that guide analysis toward important CTAs, themes, claims, or recurring ideas.",
      },
    ],
    connectedProducts: ["upload", "studio", "library", "teams"],
    connectionSummary:
      "Analysis turns source material into structured evidence. Studio uses that evidence for generation, and Library keeps the strongest outputs reviewable.",
    finalCta: {
      eyebrow: "Extract the useful signal",
      title: "Make every transcript easier to understand, coach, and reuse.",
      description:
        "Run the modules that matter, keep evidence close, and turn raw recordings into content decisions your team can review.",
    },
    preview: {
      title: "Analytics",
      subtitle: "Track transcript modules, coaching gaps, and content activity.",
      primaryAction: "Run analysis",
      secondaryAction: "Export report",
      tabs: ["7D", "30D", "90D"],
      stats: [
        {
          label: "Topic coverage",
          value: "Mapped",
          description: "Themes found in the source",
          icon: "analysis",
          tone: "cyan",
        },
        {
          label: "Coaching gaps",
          value: "3",
          description: "Recommended next improvements",
          icon: "goal",
          tone: "amber",
        },
        {
          label: "Reusable quotes",
          value: "18",
          description: "Lines worth reviewing",
          icon: "quote",
          tone: "purple",
        },
        {
          label: "Goals active",
          value: "4",
          description: "Guidance for future analysis",
          icon: "check",
          tone: "green",
        },
      ],
      mainPanel: {
        eyebrow: "Content mix",
        title: "What the project produced",
        description: "Filled marketing data mirrors the dashboard structure without showing real project names.",
        items: [
          { label: "LinkedIn posts", value: "8 drafts", description: "Short-form proof points", icon: "message", tone: "blue" },
          { label: "Newsletter sections", value: "3 drafts", description: "Longer recap material", icon: "file", tone: "green" },
          { label: "Quote cards", value: "7 ideas", description: "Reusable lines and claims", icon: "quote", tone: "purple" },
        ],
      },
      sidePanel: {
        eyebrow: "Topic intensity",
        title: "Conversation energy",
        description: "Analysis surfaces the source signals your team can act on.",
        items: [
          { label: "Customer proof", value: "High", icon: "check", tone: "green" },
          { label: "Product education", value: "Medium", icon: "library", tone: "blue" },
          { label: "Objection handling", value: "Medium", icon: "message", tone: "amber" },
          { label: "Launch narrative", value: "Rising", icon: "sparkles", tone: "purple" },
        ],
      },
      table: {
        title: "Creator coaching",
        rows: [
          { label: "Clarify the core claim", detail: "Coaching note · High priority", status: "Open", tone: "amber" },
          { label: "Save strongest proof", detail: "Quote review · Library handoff", status: "Ready", tone: "green" },
          { label: "Define next recording goal", detail: "Goal setup · Future source", status: "Suggested", tone: "blue" },
        ],
      },
    },
  },
};

export const productPageList = Object.values(productPages);

export function getProductPage(slug: ProductPageKey): ProductPageContent {
  return productPages[slug];
}

export const PRODUCT_OG_IMAGE = "/launch/product-overview-light.png";

export function getProductRouteMetadata(slug: ProductPageKey) {
  const page = getProductPage(slug);
  const canonical = `/product/${slug}`;

  return {
    title: page.metadata.title,
    description: page.metadata.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: page.metadata.title,
      description: page.metadata.description,
      url: canonical,
      images: [
        {
          url: PRODUCT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${page.navLabel} product page for AudioRepurpose`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.metadata.title,
      description: page.metadata.description,
      images: [PRODUCT_OG_IMAGE],
    },
  };
}
