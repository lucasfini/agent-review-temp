export interface PromptTemplate {
  id: string;
  name: string;
  platform: string;
  contentType: string;
  template: string;
  variables: string[];
  instructions: string[];
  scoring?: {
    viralPotential: number;
    engagementFactors: string[];
  };
}

export const CONTENT_ANALYSIS_PROMPTS = {
  VIRAL_HOOKS: `
Identify potential viral hooks from this transcription. Look for:
- Surprising statistics or counterintuitive facts
- Controversial opinions or hot takes
- Personal transformation stories
- "Secret" insights or behind-the-scenes info
- Strong emotional triggers (shock, inspiration, humor)
- Questions that create curiosity gaps

Rate each hook 1-10 for viral potential and explain why.

Transcription: {transcription}
`,

  CLICKBAIT_MOMENTS: `
Find moments that would make people stop scrolling and click. Look for:
- Dramatic reveals or plot twists
- Before/after transformations
- Unexpected confessions or admissions
- Industry secrets being exposed
- Celebrity/authority figure mentions
- Money, relationships, or health breakthroughs

Format as attention-grabbing headlines with timestamps.

Transcription: {transcription}
`,

  EDUCATIONAL_VALUE: `
Extract the highest-value educational content including:
- Step-by-step processes or frameworks
- Common mistakes and how to avoid them
- Tools, resources, or recommendations
- Actionable tips with specific outcomes
- Case studies with measurable results

Rate each insight 1-10 for actionability and value.

Transcription: {transcription}
`,

  EMOTIONAL_PEAKS: `
Identify emotional high points that create connection:
- Vulnerable personal stories
- Moments of triumph or failure
- Relatable struggles or fears
- Inspiring breakthroughs
- Funny anecdotes or observations
- Touching or heartwarming moments

Note the emotion type and intensity (1-10).

Transcription: {transcription}
`
};

export const PLATFORM_TEMPLATES: PromptTemplate[] = [
  // TWITTER/X TEMPLATES
  {
    id: 'twitter_thread_controversial',
    name: 'Twitter Thread - Controversial Take',
    platform: 'twitter',
    contentType: 'thread',
    template: `
Create a Twitter thread starting with this controversial opinion: "{hook}"

Thread structure:
1/ Start with the controversial hook (grab attention)
2/ Provide context (why this matters)
3/ Present evidence/reasoning (2-3 tweets)
4/ Address counterarguments (1-2 tweets)
5/ Share personal experience/example
6/ End with thought-provoking question

Requirements:
- Each tweet under 280 characters
- Use thread numbering (1/8, 2/8, etc.)
- Include line breaks for readability
- End thread with relevant hashtags
- Encourage replies/engagement

Context: {transcription}
`,
    variables: ['hook', 'transcription'],
    instructions: [
      'Start with the strongest controversial opinion',
      'Build argument progressively',
      'Include personal story for credibility',
      'End with engagement-driving question'
    ],
    scoring: {
      viralPotential: 8,
      engagementFactors: ['controversy', 'opinion_validation', 'debate_starter']
    }
  },

  {
    id: 'twitter_thread_educational',
    name: 'Twitter Thread - Educational Framework',
    platform: 'twitter',
    contentType: 'thread',
    template: `
Create an educational Twitter thread teaching: "{insight}"

Thread structure:
1/ Hook: Promise specific outcome in X steps
2/ Why this matters (pain point/benefit)
3/ Step 1 with specific example
4/ Step 2 with specific example  
5/ Step 3 with specific example
6/ Common mistake to avoid
7/ Expected results/timeline
8/ CTA: "Save this thread" + hashtags

Requirements:
- Actionable, specific steps
- Real examples or case studies
- Clear progression
- Bookmark-worthy content

Context: {transcription}
Insight: {insight}
`,
    variables: ['insight', 'transcription'],
    instructions: [
      'Lead with clear value proposition',
      'Include specific, actionable steps',
      'Add real examples for each step',
      'End with save/bookmark CTA'
    ],
    scoring: {
      viralPotential: 7,
      engagementFactors: ['educational_value', 'bookmarkability', 'actionable_content']
    }
  },

  // LINKEDIN TEMPLATES
  {
    id: 'linkedin_leadership_story',
    name: 'LinkedIn - Leadership Story',
    platform: 'linkedin',
    contentType: 'post',
    template: `
Create a LinkedIn post sharing a leadership lesson from: "{story}"

Structure:
- Hook: Start with a surprising statement or question
- Story: Brief narrative (what happened)
- Lesson: What you learned/realized
- Application: How others can apply this
- Engagement: Question for comments

Tone: Professional but personal, vulnerable, inspiring
Length: 1200-1500 characters
Include: 3-5 relevant hashtags

Context: {transcription}
Story: {story}
`,
    variables: ['story', 'transcription'],
    instructions: [
      'Start with compelling hook',
      'Share vulnerable moment',
      'Extract clear lesson',
      'Make it applicable to others'
    ],
    scoring: {
      viralPotential: 6,
      engagementFactors: ['vulnerability', 'leadership_insights', 'relatability']
    }
  },

  {
    id: 'linkedin_industry_prediction',
    name: 'LinkedIn - Industry Prediction',
    platform: 'linkedin',
    contentType: 'post',
    template: `
Create a LinkedIn post about this industry insight: "{prediction}"

Structure:
- Bold prediction or trend forecast
- Current state vs. future state
- Evidence supporting the prediction
- What professionals should do now
- Call for discussion

Tone: Authoritative, forward-thinking, discussion-starting
Include industry-specific hashtags
Encourage professionals to share their views

Context: {transcription}
Prediction: {prediction}
`,
    variables: ['prediction', 'transcription'],
    instructions: [
      'Make bold, specific predictions',
      'Support with evidence',
      'Give actionable advice',
      'Encourage industry discussion'
    ],
    scoring: {
      viralPotential: 7,
      engagementFactors: ['thought_leadership', 'future_insights', 'industry_relevance']
    }
  },

  // INSTAGRAM TEMPLATES
  {
    id: 'instagram_carousel_tips',
    name: 'Instagram Carousel - Tips',
    platform: 'instagram',
    contentType: 'carousel',
    template: `
Create an Instagram carousel about: "{topic}"

Slide breakdown:
Slide 1: Eye-catching title + main benefit
Slide 2-6: One tip per slide with explanation (30-40 words max)
Slide 7: Summary/key takeaway
Slide 8: CTA slide (follow for more, save this post)

Caption:
- Hook in first line
- Brief intro (100-150 words)
- Bullet summary of tips
- Engaging question
- 15-20 relevant hashtags

Visual style: Minimalist, clean, readable fonts

Context: {transcription}
Topic: {topic}
`,
    variables: ['topic', 'transcription'],
    instructions: [
      'Create scroll-stopping title slide',
      'Keep text concise and readable',
      'Use consistent visual style',
      'Include strong CTA'
    ],
    scoring: {
      viralPotential: 8,
      engagementFactors: ['visual_appeal', 'saveability', 'educational_value']
    }
  },

  // TIKTOK/REELS TEMPLATES
  {
    id: 'reels_transformation_story',
    name: 'Reels - Transformation Story',
    platform: 'instagram',
    contentType: 'reel',
    template: `
Create a Reels script for this transformation: "{transformation}"

Hook (first 3 seconds):
"I {struggled with X} → Now I {achieved Y}"

Script breakdown:
0-3s: Hook + visual of "before"
3-8s: The turning point/realization
8-15s: What changed (process/method)
15-25s: Results/after state
25-30s: Key lesson + CTA

Text overlays:
- Hook text on screen for first 3 seconds
- Key insights as text overlays
- Before/after comparison graphics

Trending audio suggestion
Hashtags: Mix of trending + niche

Context: {transcription}
Transformation: {transformation}
`,
    variables: ['transformation', 'transcription'],
    instructions: [
      'Hook must grab attention in 3 seconds',
      'Show clear before/after',
      'Include text overlays for accessibility',
      'End with strong CTA'
    ],
    scoring: {
      viralPotential: 9,
      engagementFactors: ['transformation_story', 'visual_impact', 'relatability']
    }
  }
];

export const CONTENT_SCORING_CRITERIA = {
  VIRAL_POTENTIAL: {
    CONTROVERSY: { weight: 0.3, description: 'Likely to spark debate or strong opinions' },
    SURPRISE: { weight: 0.25, description: 'Contains unexpected or counterintuitive information' },
    EMOTION: { weight: 0.2, description: 'Triggers strong emotional response' },
    RELATABILITY: { weight: 0.15, description: 'Highly relatable to target audience' },
    TIMELINESS: { weight: 0.1, description: 'Relevant to current trends or events' }
  },

  ENGAGEMENT_FACTORS: {
    SHAREABILITY: 'Content people want to share with others',
    SAVEABILITY: 'Content people want to save for later',
    COMMENTABILITY: 'Content that encourages comments/discussion',
    ACTIONABILITY: 'Content that inspires immediate action',
    QUOTABILITY: 'Content with highly quotable moments'
  }
};

export function getPromptTemplate(templateId: string): PromptTemplate | null {
  return PLATFORM_TEMPLATES.find(template => template.id === templateId) || null;
}

export function getTemplatesByPlatform(platform: string): PromptTemplate[] {
  return PLATFORM_TEMPLATES.filter(template => template.platform === platform);
}

export function scoreContent(content: string, criteria: keyof typeof CONTENT_SCORING_CRITERIA.VIRAL_POTENTIAL): number {
  // This would be implemented with actual AI scoring logic
  // For now, return a placeholder score
  return Math.random() * 10;
}