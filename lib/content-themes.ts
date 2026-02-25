// Comprehensive theme library for content generation
// Each theme includes psychological profile and prompt modifiers

export interface ContentTheme {
  id: string;
  name: string;
  category: string;
  description: string;
  promptModifier: string;
  contentGuidelines: string;
  examplePhrases: string[];
  psychologyTriggers: string[];
}

export const CONTENT_THEMES: ContentTheme[] = [
  // PROFESSIONAL TONES
  {
    id: 'professional',
    name: 'Professional',
    category: 'Professional',
    description: 'Polished, credible, and business-appropriate',
    promptModifier: 'Write in a polished, professional tone that builds credibility and trust.',
    contentGuidelines: 'Use industry terminology appropriately, maintain formal structure, avoid slang',
    examplePhrases: ['According to research', 'Industry experts suggest', 'Best practices indicate'],
    psychologyTriggers: ['Authority', 'Credibility', 'Trust']
  },
  {
    id: 'corporate',
    name: 'Corporate',
    category: 'Professional',
    description: 'Enterprise-level, strategic, boardroom-ready',
    promptModifier: 'Write as a C-suite executive addressing stakeholders.',
    contentGuidelines: 'Focus on ROI, strategic impact, organizational value, use business metrics',
    examplePhrases: ['Strategic initiative', 'Organizational impact', 'Stakeholder value'],
    psychologyTriggers: ['Status', 'Authority', 'Results']
  },
  {
    id: 'executive',
    name: 'Executive',
    category: 'Professional',
    description: 'Leadership-focused, decisive, high-level thinking',
    promptModifier: 'Write as a senior leader making bold, decisive statements.',
    contentGuidelines: 'Be direct, focus on vision and outcomes, minimize details',
    examplePhrases: ['Here\'s what matters', 'The bottom line', 'Our focus is'],
    psychologyTriggers: ['Leadership', 'Vision', 'Decisiveness']
  },
  {
    id: 'academic',
    name: 'Academic',
    category: 'Professional',
    description: 'Research-driven, scholarly, evidence-based',
    promptModifier: 'Write as a researcher presenting evidence-based findings.',
    contentGuidelines: 'Cite sources, use data, maintain objectivity, structured arguments',
    examplePhrases: ['Research shows', 'Studies indicate', 'Evidence suggests'],
    psychologyTriggers: ['Evidence', 'Logic', 'Objectivity']
  },
  {
    id: 'technical',
    name: 'Technical',
    category: 'Professional',
    description: 'Precise, detailed, specialist-focused',
    promptModifier: 'Write for a technically sophisticated audience with precise language.',
    contentGuidelines: 'Use technical terminology accurately, include specific details, assume expertise',
    examplePhrases: ['The architecture consists of', 'Implementation details', 'Technical specifications'],
    psychologyTriggers: ['Expertise', 'Precision', 'Detail']
  },

  // EDUCATIONAL
  {
    id: 'educational',
    name: 'Educational',
    category: 'Educational',
    description: 'Teaching-focused, clear, instructive',
    promptModifier: 'Write as an expert teacher explaining concepts clearly.',
    contentGuidelines: 'Break down complex ideas, use examples, define terms, logical progression',
    examplePhrases: ['Let me explain', 'Here\'s how it works', 'Think of it this way'],
    psychologyTriggers: ['Curiosity', 'Understanding', 'Learning']
  },
  {
    id: 'howto',
    name: 'How-To',
    category: 'Educational',
    description: 'Step-by-step, practical, actionable',
    promptModifier: 'Write clear, actionable instructions that anyone can follow.',
    contentGuidelines: 'Use numbered steps, action verbs, specific instructions, anticipated obstacles',
    examplePhrases: ['Step 1:', 'Here\'s exactly how', 'Follow these steps'],
    psychologyTriggers: ['Action', 'Achievement', 'Clarity']
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    category: 'Educational',
    description: 'Guided learning, supportive, comprehensive',
    promptModifier: 'Write as a patient tutor guiding someone through a learning journey.',
    contentGuidelines: 'Encourage learner, acknowledge challenges, provide context, build confidence',
    examplePhrases: ['You\'ll learn', 'By the end', 'Don\'t worry if'],
    psychologyTriggers: ['Support', 'Progress', 'Confidence']
  },
  {
    id: 'explanatory',
    name: 'Explanatory',
    category: 'Educational',
    description: 'Clarifying, insightful, illuminating',
    promptModifier: 'Write to make complex topics simple and understandable.',
    contentGuidelines: 'Use analogies, visual language, clarify misconceptions, build mental models',
    examplePhrases: ['Think of it like', 'In other words', 'To put it simply'],
    psychologyTriggers: ['Clarity', 'Insight', 'Understanding']
  },
  {
    id: 'informative',
    name: 'Informative',
    category: 'Educational',
    description: 'Fact-focused, comprehensive, objective',
    promptModifier: 'Write to inform without persuading, presenting balanced information.',
    contentGuidelines: 'Present multiple perspectives, stick to facts, provide context, neutral tone',
    examplePhrases: ['According to data', 'Research indicates', 'Here\'s what we know'],
    psychologyTriggers: ['Knowledge', 'Objectivity', 'Completeness']
  },

  // EMOTIONAL / INSPIRATIONAL
  {
    id: 'inspirational',
    name: 'Inspirational',
    category: 'Emotional',
    description: 'Uplifting, energizing, possibility-focused',
    promptModifier: 'Write to inspire action and belief in what\'s possible.',
    contentGuidelines: 'Use vivid language, paint future possibilities, emotional resonance, optimism',
    examplePhrases: ['Imagine what\'s possible', 'You have the power', 'This is your moment'],
    psychologyTriggers: ['Hope', 'Possibility', 'Energy']
  },
  {
    id: 'motivational',
    name: 'Motivational',
    category: 'Emotional',
    description: 'Action-driving, energetic, rallying',
    promptModifier: 'Write to motivate immediate action and overcome resistance.',
    contentGuidelines: 'Strong calls to action, overcome objections, create urgency, build momentum',
    examplePhrases: ['Now is the time', 'Don\'t wait', 'Take action today'],
    psychologyTriggers: ['Urgency', 'Action', 'Momentum']
  },
  {
    id: 'empowering',
    name: 'Empowering',
    category: 'Emotional',
    description: 'Confidence-building, enabling, supportive',
    promptModifier: 'Write to make readers feel capable and in control.',
    contentGuidelines: 'Acknowledge their power, provide tools, build self-efficacy, remove doubt',
    examplePhrases: ['You already have', 'You\'re capable of', 'Trust yourself'],
    psychologyTriggers: ['Confidence', 'Control', 'Capability']
  },
  {
    id: 'uplifting',
    name: 'Uplifting',
    category: 'Emotional',
    description: 'Positive, encouraging, heartwarming',
    promptModifier: 'Write to lift spirits and spread positivity.',
    contentGuidelines: 'Focus on silver linings, celebrate wins, express gratitude, radiate warmth',
    examplePhrases: ['There\'s beauty in', 'Celebrate this', 'Good things are coming'],
    psychologyTriggers: ['Joy', 'Gratitude', 'Warmth']
  },
  {
    id: 'heartfelt',
    name: 'Heartfelt',
    category: 'Emotional',
    description: 'Sincere, genuine, emotionally connected',
    promptModifier: 'Write from the heart with genuine emotion and sincerity.',
    contentGuidelines: 'Show vulnerability, express genuine feeling, personal connection, authenticity',
    examplePhrases: ['From the heart', 'I truly believe', 'This matters because'],
    psychologyTriggers: ['Connection', 'Sincerity', 'Emotion']
  },

  // HUMOR
  {
    id: 'funny',
    name: 'Funny',
    category: 'Humor',
    description: 'Lighthearted, amusing, entertaining',
    promptModifier: 'Write with humor and wit to entertain while informing.',
    contentGuidelines: 'Use playful language, unexpected comparisons, exaggeration, keep it light',
    examplePhrases: ['Plot twist:', 'Spoiler alert:', 'Here\'s the kicker'],
    psychologyTriggers: ['Surprise', 'Delight', 'Entertainment']
  },
  {
    id: 'witty',
    name: 'Witty',
    category: 'Humor',
    description: 'Clever, sharp, intellectually amusing',
    promptModifier: 'Write with clever wordplay and intelligent humor.',
    contentGuidelines: 'Use wordplay, irony, clever observations, assume intelligent audience',
    examplePhrases: ['Ironically enough', 'The plot thickens', 'How delightfully absurd'],
    psychologyTriggers: ['Intelligence', 'Cleverness', 'Appreciation']
  },
  {
    id: 'sarcastic',
    name: 'Sarcastic',
    category: 'Humor',
    description: 'Ironic, tongue-in-cheek, mockingly humorous',
    promptModifier: 'Write with sarcasm and irony to make points through mockery.',
    contentGuidelines: 'Use obvious irony, exaggerate for effect, make absurdity clear, don\'t offend',
    examplePhrases: ['Oh sure, because that makes total sense', 'Shocking absolutely no one', 'Who could have seen that coming'],
    psychologyTriggers: ['Irony', 'Superiority', 'Amusement']
  },
  {
    id: 'satirical',
    name: 'Satirical',
    category: 'Humor',
    description: 'Critical humor, mockery with purpose',
    promptModifier: 'Write satire that critiques through exaggeration and absurdity.',
    contentGuidelines: 'Exaggerate to expose flaws, use absurdity to criticize, maintain clear target',
    examplePhrases: ['In a shocking turn of events', 'Breaking: water is wet', 'Sources confirm'],
    psychologyTriggers: ['Critique', 'Recognition', 'Subversion']
  },
  {
    id: 'selfdeprecating',
    name: 'Self-Deprecating',
    category: 'Humor',
    description: 'Humble, relatable, laughing at oneself',
    promptModifier: 'Write with self-deprecating humor that builds relatability.',
    contentGuidelines: 'Acknowledge own flaws, share mistakes, remain likeable, balance with competence',
    examplePhrases: ['Spoiler: I was wrong', 'Past me was an idiot', 'I learned this the hard way'],
    psychologyTriggers: ['Relatability', 'Humility', 'Authenticity']
  },
  {
    id: 'darkhumor',
    name: 'Dark Humor',
    category: 'Humor',
    description: 'Edgy, provocative, gallows humor',
    promptModifier: 'Write with dark humor that finds comedy in difficult topics.',
    contentGuidelines: 'Balance edge with taste, know the audience, use carefully, don\'t punch down',
    examplePhrases: ['Well this aged poorly', 'Yikes', 'Oof, let\'s unpack that'],
    psychologyTriggers: ['Shock', 'Coping', 'Boundary-pushing']
  },

  // URGENCY / CONTROVERSIAL
  {
    id: 'urgent',
    name: 'Urgent',
    category: 'Urgency',
    description: 'Time-sensitive, pressing, immediate',
    promptModifier: 'Write with urgency to drive immediate attention and action.',
    contentGuidelines: 'Create FOMO, emphasize time constraints, show consequences of inaction',
    examplePhrases: ['Right now', 'This won\'t last', 'Time is running out'],
    psychologyTriggers: ['Scarcity', 'FOMO', 'Action']
  },
  {
    id: 'controversial',
    name: 'Controversial',
    category: 'Urgency',
    description: 'Opinion-driven, debate-sparking, polarizing',
    promptModifier: 'Write with strong opinions that spark discussion and debate.',
    contentGuidelines: 'Take clear stance, acknowledge opposition, use strong language, back with reasoning',
    examplePhrases: ['Let\'s be honest', 'Unpopular opinion:', 'Here\'s what nobody\'s saying'],
    psychologyTriggers: ['Engagement', 'Identity', 'Debate']
  },
  {
    id: 'provocative',
    name: 'Provocative',
    category: 'Urgency',
    description: 'Challenge conventional thinking, stir reaction',
    promptModifier: 'Write to challenge assumptions and provoke thought.',
    contentGuidelines: 'Question norms, present contrarian views, make bold claims, support with logic',
    examplePhrases: ['What if we\'re wrong about', 'Everyone believes X, but', 'The uncomfortable truth'],
    psychologyTriggers: ['Curiosity', 'Challenge', 'Disruption']
  },
  {
    id: 'bold',
    name: 'Bold',
    category: 'Urgency',
    description: 'Confident, daring, unafraid',
    promptModifier: 'Write with bold confidence and fearless claims.',
    contentGuidelines: 'Make strong statements, show conviction, take risks, own your position',
    examplePhrases: ['Here\'s the truth', 'I\'m calling it', 'Mark my words'],
    psychologyTriggers: ['Confidence', 'Certainty', 'Leadership']
  },
  {
    id: 'fearless',
    name: 'Fearless',
    category: 'Urgency',
    description: 'Unfiltered, brave, boundary-breaking',
    promptModifier: 'Write without fear of judgment or backlash.',
    contentGuidelines: 'Say what others won\'t, break taboos appropriately, authentic unfiltered voice',
    examplePhrases: ['Let me say what everyone\'s thinking', 'Forget what they told you', 'The real story'],
    psychologyTriggers: ['Courage', 'Authenticity', 'Freedom']
  },

  // STORYTELLING
  {
    id: 'storytelling',
    name: 'Storytelling',
    category: 'Storytelling',
    description: 'Narrative-driven, engaging, plot-based',
    promptModifier: 'Write as a compelling story with clear narrative arc.',
    contentGuidelines: 'Use story structure, create tension, develop characters, show don\'t tell',
    examplePhrases: ['It started when', 'But then', 'In the end'],
    psychologyTriggers: ['Engagement', 'Emotion', 'Memory']
  },
  {
    id: 'narrative',
    name: 'Narrative',
    category: 'Storytelling',
    description: 'Flowing, connected, journey-focused',
    promptModifier: 'Write as a cohesive narrative with clear beginning, middle, end.',
    contentGuidelines: 'Connect events logically, build progression, create satisfying conclusion',
    examplePhrases: ['The journey began', 'As we discovered', 'This led to'],
    psychologyTriggers: ['Flow', 'Connection', 'Completion']
  },
  {
    id: 'personal',
    name: 'Personal',
    category: 'Storytelling',
    description: 'First-person, intimate, individual experience',
    promptModifier: 'Write from personal experience with intimate details.',
    contentGuidelines: 'Share personal insights, use "I" statements, reveal specific moments',
    examplePhrases: ['In my experience', 'I discovered that', 'What I learned was'],
    psychologyTriggers: ['Intimacy', 'Relatability', 'Trust']
  },
  {
    id: 'anecdotal',
    name: 'Anecdotal',
    category: 'Storytelling',
    description: 'Story-based, example-driven, illustrative',
    promptModifier: 'Write using specific anecdotes and real examples.',
    contentGuidelines: 'Use concrete stories, specific details, real scenarios, vivid imagery',
    examplePhrases: ['For example', 'Here\'s what happened', 'I remember when'],
    psychologyTriggers: ['Concreteness', 'Visualization', 'Memory']
  },
  {
    id: 'journeybased',
    name: 'Journey-Based',
    category: 'Storytelling',
    description: 'Transformation-focused, before/after, progression',
    promptModifier: 'Write as a transformation journey from point A to point B.',
    contentGuidelines: 'Show starting point, obstacles faced, transformation, current state',
    examplePhrases: ['Where we started', 'The turning point', 'Where we are now'],
    psychologyTriggers: ['Transformation', 'Hope', 'Progress']
  },

  // CONVERSATIONAL
  {
    id: 'casual',
    name: 'Casual',
    category: 'Conversational',
    description: 'Relaxed, informal, everyday language',
    promptModifier: 'Write as if chatting with a friend over coffee.',
    contentGuidelines: 'Use contractions, informal language, keep it light, conversational flow',
    examplePhrases: ['Here\'s the thing', 'You know what I mean?', 'Pretty much'],
    psychologyTriggers: ['Comfort', 'Accessibility', 'Ease']
  },
  {
    id: 'friendly',
    name: 'Friendly',
    category: 'Conversational',
    description: 'Warm, approachable, personable',
    promptModifier: 'Write with warmth and friendliness like talking to a good friend.',
    contentGuidelines: 'Be welcoming, use inclusive language, show care, positive tone',
    examplePhrases: ['Hey there', 'I\'m excited to share', 'Let\'s dive in'],
    psychologyTriggers: ['Warmth', 'Connection', 'Welcome']
  },
  {
    id: 'relatable',
    name: 'Relatable',
    category: 'Conversational',
    description: 'Common ground, shared experience, "me too"',
    promptModifier: 'Write to create "me too" moments and shared understanding.',
    contentGuidelines: 'Acknowledge common struggles, use universal experiences, validate feelings',
    examplePhrases: ['We\'ve all been there', 'You\'re not alone', 'Same here'],
    psychologyTriggers: ['Recognition', 'Validation', 'Belonging']
  },
  {
    id: 'downtoearth',
    name: 'Down-to-Earth',
    category: 'Conversational',
    description: 'Practical, realistic, no-nonsense',
    promptModifier: 'Write with practical common sense and realistic expectations.',
    contentGuidelines: 'Avoid hype, be realistic, practical advice, acknowledge limitations',
    examplePhrases: ['Let\'s be real', 'In practice', 'The reality is'],
    psychologyTriggers: ['Trust', 'Realism', 'Practicality']
  },
  {
    id: 'approachable',
    name: 'Approachable',
    category: 'Conversational',
    description: 'Welcoming, easy to engage with, low barrier',
    promptModifier: 'Write in a way that makes readers feel comfortable engaging.',
    contentGuidelines: 'Simplify without dumbing down, be welcoming, encourage questions',
    examplePhrases: ['Don\'t worry if', 'It\'s okay to', 'Feel free to'],
    psychologyTriggers: ['Comfort', 'Safety', 'Invitation']
  },

  // AUTHORITY
  {
    id: 'expert',
    name: 'Expert',
    category: 'Authority',
    description: 'Deep knowledge, specialist perspective',
    promptModifier: 'Write as a recognized expert sharing specialized knowledge.',
    contentGuidelines: 'Demonstrate expertise, use precise language, share insider knowledge',
    examplePhrases: ['In my [X] years of experience', 'What the data shows', 'The key insight'],
    psychologyTriggers: ['Authority', 'Expertise', 'Trust']
  },
  {
    id: 'authoritative',
    name: 'Authoritative',
    category: 'Authority',
    description: 'Commanding, definitive, final word',
    promptModifier: 'Write with authority as the definitive source.',
    contentGuidelines: 'State facts confidently, minimal hedging, clear conclusions, cite credentials',
    examplePhrases: ['The data is clear', 'Here\'s what you need to know', 'The answer is'],
    psychologyTriggers: ['Authority', 'Certainty', 'Trust']
  },
  {
    id: 'confident',
    name: 'Confident',
    category: 'Authority',
    description: 'Self-assured, certain, unwavering',
    promptModifier: 'Write with complete confidence in your message.',
    contentGuidelines: 'Avoid qualifiers, state opinions as facts when appropriate, show conviction',
    examplePhrases: ['Without question', 'Absolutely', 'There\'s no doubt'],
    psychologyTriggers: ['Certainty', 'Trust', 'Leadership']
  },
  {
    id: 'thoughtleader',
    name: 'Thought Leader',
    category: 'Authority',
    description: 'Visionary, forward-thinking, influential',
    promptModifier: 'Write as someone shaping the future of the industry.',
    contentGuidelines: 'Share unique perspectives, predict trends, challenge status quo',
    examplePhrases: ['The future of', 'We\'re seeing a shift toward', 'The next evolution'],
    psychologyTriggers: ['Vision', 'Innovation', 'Leadership']
  },
  {
    id: 'visionary',
    name: 'Visionary',
    category: 'Authority',
    description: 'Future-focused, big-picture, transformative',
    promptModifier: 'Write painting a compelling vision of the future.',
    contentGuidelines: 'Think big picture, describe future states, inspire transformation',
    examplePhrases: ['Imagine a world where', 'The future holds', 'We\'re moving toward'],
    psychologyTriggers: ['Hope', 'Possibility', 'Inspiration']
  },

  // CREATIVE / ARTISTIC
  {
    id: 'creative',
    name: 'Creative',
    category: 'Creative',
    description: 'Original, imaginative, artistic',
    promptModifier: 'Write with creative flair and original expression.',
    contentGuidelines: 'Use vivid imagery, creative metaphors, unexpected connections, artistic language',
    examplePhrases: ['Picture this', 'Like a', 'In a way'],
    psychologyTriggers: ['Imagination', 'Delight', 'Originality']
  },
  {
    id: 'poetic',
    name: 'Poetic',
    category: 'Creative',
    description: 'Lyrical, rhythmic, aesthetically beautiful',
    promptModifier: 'Write with poetic language and aesthetic beauty.',
    contentGuidelines: 'Use rhythm, vivid imagery, metaphor, emotional resonance, beautiful language',
    examplePhrases: ['Like whispers of', 'Dancing between', 'The rhythm of'],
    psychologyTriggers: ['Beauty', 'Emotion', 'Aesthetic']
  },
  {
    id: 'metaphorical',
    name: 'Metaphorical',
    category: 'Creative',
    description: 'Symbol-rich, comparative, figurative',
    promptModifier: 'Write using powerful metaphors and symbolic language.',
    contentGuidelines: 'Use extended metaphors, symbolic comparisons, help readers see differently',
    examplePhrases: ['Think of it as', 'It\'s like', 'In the same way that'],
    psychologyTriggers: ['Understanding', 'Insight', 'Connection']
  },

  // AUTHENTIC / VULNERABLE
  {
    id: 'vulnerable',
    name: 'Vulnerable',
    category: 'Authentic',
    description: 'Open, exposed, emotionally honest',
    promptModifier: 'Write with emotional vulnerability and openness.',
    contentGuidelines: 'Share struggles, admit uncertainty, show humanity, be emotionally open',
    examplePhrases: ['I\'ll be honest', 'This is hard to admit', 'I struggled with'],
    psychologyTriggers: ['Connection', 'Trust', 'Empathy']
  },
  {
    id: 'raw',
    name: 'Raw',
    category: 'Authentic',
    description: 'Unfiltered, intense, emotionally direct',
    promptModifier: 'Write with raw, unfiltered emotion and truth.',
    contentGuidelines: 'Don\'t sugarcoat, express intense feeling, be direct, show real struggle',
    examplePhrases: ['The brutal truth', 'Let me be blunt', 'Here\'s what\'s real'],
    psychologyTriggers: ['Authenticity', 'Intensity', 'Reality']
  },
  {
    id: 'honest',
    name: 'Honest',
    category: 'Authentic',
    description: 'Truthful, straightforward, genuine',
    promptModifier: 'Write with complete honesty and truth.',
    contentGuidelines: 'Tell the whole truth, acknowledge gray areas, admit unknowns',
    examplePhrases: ['To be completely honest', 'The truth is', 'I won\'t lie'],
    psychologyTriggers: ['Trust', 'Truth', 'Integrity']
  },
  {
    id: 'transparent',
    name: 'Transparent',
    category: 'Authentic',
    description: 'Open, clear, nothing hidden',
    promptModifier: 'Write with complete transparency about process and thinking.',
    contentGuidelines: 'Reveal thinking process, show behind scenes, explain reasoning openly',
    examplePhrases: ['Here\'s exactly how', 'Behind the scenes', 'My thinking was'],
    psychologyTriggers: ['Trust', 'Understanding', 'Openness']
  },
  {
    id: 'authentic',
    name: 'Authentic',
    category: 'Authentic',
    description: 'True to self, genuine, real',
    promptModifier: 'Write as your genuine self without pretense.',
    contentGuidelines: 'Stay true to voice, avoid copying others, be real, show personality',
    examplePhrases: ['In my view', 'What I\'ve found', 'Personally'],
    psychologyTriggers: ['Trust', 'Connection', 'Genuineness']
  },

  // TACTICAL / RESULTS-FOCUSED
  {
    id: 'actionable',
    name: 'Actionable',
    category: 'Tactical',
    description: 'Immediately implementable, practical steps',
    promptModifier: 'Write with clear, actionable steps readers can implement today.',
    contentGuidelines: 'Specific actions, remove barriers, make it easy, immediate value',
    examplePhrases: ['Do this now', 'Start by', 'The first step'],
    psychologyTriggers: ['Action', 'Progress', 'Achievement']
  },
  {
    id: 'tactical',
    name: 'Tactical',
    category: 'Tactical',
    description: 'Strategy-focused, methodical, systematic',
    promptModifier: 'Write with tactical precision about specific strategies.',
    contentGuidelines: 'Break down tactics, explain "how", sequence matters, be systematic',
    examplePhrases: ['The strategy is', 'Tactically speaking', 'The approach'],
    psychologyTriggers: ['Strategy', 'Mastery', 'Control']
  },
  {
    id: 'strategic',
    name: 'Strategic',
    category: 'Tactical',
    description: 'Long-term thinking, systematic planning',
    promptModifier: 'Write about long-term strategy and systematic approach.',
    contentGuidelines: 'Think long-term, connect to bigger picture, show how pieces fit',
    examplePhrases: ['Strategically', 'The long game', 'Think ahead'],
    psychologyTriggers: ['Planning', 'Vision', 'Success']
  },
  {
    id: 'datadriven',
    name: 'Data-Driven',
    category: 'Tactical',
    description: 'Metrics-focused, evidence-based, quantified',
    promptModifier: 'Write with data, metrics, and measurable results.',
    contentGuidelines: 'Use numbers, cite statistics, show metrics, prove with data',
    examplePhrases: ['The data shows', 'According to metrics', 'X% of'],
    psychologyTriggers: ['Proof', 'Logic', 'Trust']
  },
  {
    id: 'resultsfocused',
    name: 'Results-Focused',
    category: 'Tactical',
    description: 'Outcome-oriented, bottom-line, ROI-driven',
    promptModifier: 'Write focusing on concrete results and outcomes.',
    contentGuidelines: 'Lead with results, show ROI, focus on outcomes not process',
    examplePhrases: ['The result', 'This led to', 'The outcome was'],
    psychologyTriggers: ['Achievement', 'Success', 'Value']
  },

  // OPTIMISTIC / POSITIVE
  {
    id: 'optimistic',
    name: 'Optimistic',
    category: 'Positive',
    description: 'Hopeful, positive outlook, glass-half-full',
    promptModifier: 'Write with optimism about possibilities and outcomes.',
    contentGuidelines: 'Focus on opportunities, see silver linings, express hope, positive framing',
    examplePhrases: ['The good news is', 'There\'s opportunity in', 'Bright future ahead'],
    psychologyTriggers: ['Hope', 'Positivity', 'Possibility']
  },
  {
    id: 'hopeful',
    name: 'Hopeful',
    category: 'Positive',
    description: 'Forward-looking, encouraging, light-filled',
    promptModifier: 'Write to instill hope and forward momentum.',
    contentGuidelines: 'Point toward better future, acknowledge challenges but emphasize hope',
    examplePhrases: ['There\'s hope', 'We can', 'It\'s possible'],
    psychologyTriggers: ['Hope', 'Future', 'Possibility']
  },
  {
    id: 'positive',
    name: 'Positive',
    category: 'Positive',
    description: 'Upbeat, affirmative, constructive',
    promptModifier: 'Write with consistently positive framing and energy.',
    contentGuidelines: 'Use positive language, avoid negative framing, celebrate wins',
    examplePhrases: ['The upside', 'What\'s working', 'Progress is'],
    psychologyTriggers: ['Positivity', 'Energy', 'Momentum']
  },
  {
    id: 'cheerful',
    name: 'Cheerful',
    category: 'Positive',
    description: 'Bright, sunny, joyful energy',
    promptModifier: 'Write with cheerful, bright energy that lifts mood.',
    contentGuidelines: 'Use exclamation points sparingly, bright language, spread joy',
    examplePhrases: ['Great news!', 'How exciting', 'Love this'],
    psychologyTriggers: ['Joy', 'Energy', 'Delight']
  },
  {
    id: 'enthusiastic',
    name: 'Enthusiastic',
    category: 'Positive',
    description: 'Excited, passionate, energetic',
    promptModifier: 'Write with genuine enthusiasm and passion.',
    contentGuidelines: 'Show excitement, express passion, energetic language, share enthusiasm',
    examplePhrases: ['I\'m so excited about', 'This is incredible', 'Can\'t wait to'],
    psychologyTriggers: ['Excitement', 'Passion', 'Energy']
  },

  // CONTRARIAN / CRITICAL
  {
    id: 'cynical',
    name: 'Cynical',
    category: 'Critical',
    description: 'Skeptical, distrustful, world-weary',
    promptModifier: 'Write with healthy cynicism and skepticism.',
    contentGuidelines: 'Question motives, point out flaws, express doubt, challenge optimism',
    examplePhrases: ['Let\'s not pretend', 'Of course they would', 'Surprise, surprise'],
    psychologyTriggers: ['Skepticism', 'Reality', 'Truth']
  },
  {
    id: 'pessimistic',
    name: 'Pessimistic',
    category: 'Critical',
    description: 'Worst-case thinking, cautious, wary',
    promptModifier: 'Write acknowledging risks and potential downsides.',
    contentGuidelines: 'Point out risks, prepare for worst case, temper optimism with reality',
    examplePhrases: ['But here\'s the problem', 'The downside', 'What could go wrong'],
    psychologyTriggers: ['Caution', 'Preparation', 'Realism']
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    category: 'Critical',
    description: 'Opposite of popular opinion, counter-narrative',
    promptModifier: 'Write taking the contrarian position to popular views.',
    contentGuidelines: 'Challenge conventional wisdom, present opposite view, make case for unpopular position',
    examplePhrases: ['Actually', 'Contrary to popular belief', 'Everyone says X, but'],
    psychologyTriggers: ['Challenge', 'Independence', 'Curiosity']
  },
  {
    id: 'devilsadvocate',
    name: 'Devil\'s Advocate',
    category: 'Critical',
    description: 'Argue opposite side, test thinking',
    promptModifier: 'Write challenging ideas to strengthen arguments.',
    contentGuidelines: 'Question assumptions, poke holes, present counter-arguments, test logic',
    examplePhrases: ['But what if', 'Playing devil\'s advocate', 'Consider this'],
    psychologyTriggers: ['Critical thinking', 'Depth', 'Rigor']
  },
  {
    id: 'skeptical',
    name: 'Skeptical',
    category: 'Critical',
    description: 'Questioning, doubting, evidence-demanding',
    promptModifier: 'Write with healthy skepticism, demanding proof.',
    contentGuidelines: 'Question claims, demand evidence, point out logical flaws, maintain doubt',
    examplePhrases: ['Show me the proof', 'I\'m not convinced', 'Where\'s the evidence'],
    psychologyTriggers: ['Logic', 'Truth-seeking', 'Rigor']
  }
];

// Helper function to get theme by ID
export function getThemeById(id: string): ContentTheme | undefined {
  return CONTENT_THEMES.find(theme => theme.id === id);
}

// Helper function to get themes by category
export function getThemesByCategory(category: string): ContentTheme[] {
  return CONTENT_THEMES.filter(theme => theme.category === category);
}

// Get all unique categories
export function getThemeCategories(): string[] {
  return Array.from(new Set(CONTENT_THEMES.map(theme => theme.category)));
}

// Curated subset of themes shown in the simplified modal UI
export const CURATED_THEME_IDS: string[] = [
  'professional',
  'casual',
  'educational',
  'storytelling',
  'witty',
  'inspirational',
  'bold',
  'actionable',
  'authentic',
  'thoughtleader',
  'datadriven',
  'contrarian'
];

// Get only the curated themes for modal dropdowns
export function getCuratedThemes(): ContentTheme[] {
  return CURATED_THEME_IDS
    .map(id => CONTENT_THEMES.find(t => t.id === id))
    .filter((t): t is ContentTheme => t !== undefined);
}

// Default theme
export const DEFAULT_THEME_ID = 'professional';
