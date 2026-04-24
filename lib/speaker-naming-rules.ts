export type SpeakerNamingRuleCategory =
  | 'strong_guest_intro'
  | 'direct_address_intro'
  | 'host_self_id'
  | 'panel_intro'
  | 'weak_guest_mention'
  | 'credit_or_boilerplate_context'
  | 'non_human_location'
  | 'non_human_institution'
  | 'non_human_title_or_role'
  | 'non_human_geopolitical'
  | 'non_human_topic_or_law'
  | 'non_human_show_or_promo'
  | 'non_human_sponsor_product';

export type SpeakerNamingRuleMatch = {
  category: SpeakerNamingRuleCategory;
  confidence: number;
  matchedText: string;
  reason: string;
  name?: string;
};

type NamedRule = {
  category: SpeakerNamingRuleCategory;
  confidence: number;
  reason: string;
  pattern: RegExp;
  nameGroup?: number;
};

type MultiNamedRule = NamedRule & {
  splitNames?: boolean;
};

const NAME_CAPTURE = '([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})';
const NAME_TRAILING_STOP_WORDS = new Set([
  'about',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'was',
  'who',
  'with',
]);

const STRONG_GUEST_INTRO_RULES: NamedRule[] = [
  {
    category: 'strong_guest_intro',
    confidence: 0.92,
    reason: 'host says today we are talking to named participant',
    pattern: new RegExp(`\\b(?:today\\s+we(?:'re|\\s+are)?\\s+talking\\s+to|we(?:'re|\\s+are)?\\s+talking\\s+to)\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
  {
    category: 'strong_guest_intro',
    confidence: 0.92,
    reason: 'host introduces conversation with named participant',
    pattern: new RegExp(`\\b(?:the\\s+following\\s+is\\s+a\\s+conversation\\s+with|(?:our\\s+)?conversation\\s+with)\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
  {
    category: 'strong_guest_intro',
    confidence: 0.9,
    reason: 'host identifies guest by name',
    pattern: new RegExp(`\\b(?:my\\s+guest\\s+today\\s+is|our\\s+guest\\s+(?:today\\s+)?is|guest\\s+today\\s+is)\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
  {
    category: 'strong_guest_intro',
    confidence: 0.88,
    reason: 'host says named participant is joining',
    pattern: new RegExp(`\\b(?:joining\\s+me\\s+is|joining\\s+us\\s+is|I(?:'m|\\s+am)\\s+joined\\s+by|we(?:'re|\\s+are)\\s+joined\\s+by|we(?:'re|\\s+are)\\s+here\\s+with)\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
  {
    category: 'strong_guest_intro',
    confidence: 0.88,
    reason: 'host names participant then immediately addresses them by first name',
    pattern: new RegExp(`\\b${NAME_CAPTURE}[.!?]\\s+[A-Z][a-z]+,\\s+(?:thank|thanks|welcome)\\b`, 'gi'),
  },
  {
    category: 'strong_guest_intro',
    confidence: 0.86,
    reason: 'host describes named participant role in intro',
    pattern: new RegExp(`\\b${NAME_CAPTURE}\\s+(?:(?:is|was)\\s+(?:a|an)\\s+(?:author|columnist|consultant|economist|editor|founder|journalist|physicist|professor|reporter|researcher|writer)|who\\s+(?:specializes|specialises)\\s+in|specializes\\s+in|specialises\\s+in|host\\s+of|editor\\s+of|founder\\s+of|co-founder\\s+of|author\\s+of|reporter\\s+at|climate\\s+editor)\\b`, 'gi'),
  },
];

const DIRECT_ADDRESS_INTRO_RULES: NamedRule[] = [
  {
    category: 'direct_address_intro',
    confidence: 0.94,
    reason: 'host directly welcomes named participant',
    pattern: new RegExp(`\\b${NAME_CAPTURE},\\s+(?:it'?s|its|good|great|glad|thank|thanks|welcome)\\b`, 'gi'),
  },
  {
    category: 'direct_address_intro',
    confidence: 0.9,
    reason: 'host thanks named participant for appearing',
    pattern: new RegExp(`\\b${NAME_CAPTURE},\\s+(?:thanks|thank\\s+you)\\s+(?:for\\s+(?:being|joining|coming)|so\\s+much)\\b`, 'gi'),
  },
];

const PANEL_INTRO_RULES: NamedRule[] = [
  {
    category: 'panel_intro',
    confidence: 0.86,
    reason: 'host enumerates panel participant',
    pattern: new RegExp(`\\b(?:we\\s+have|we(?:'ve|\\s+have)\\s+got|we\\s+also\\s+have|and\\s+our\\s+very\\s+own|plus|our\\s+panel\\s+includes)\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
];

const WEAK_GUEST_MENTION_RULES: NamedRule[] = [
  {
    category: 'weak_guest_mention',
    confidence: 0.35,
    reason: 'mid-conversation reference to conversation with named person',
    pattern: new RegExp(`\\b(?:had|have|recently\\s+had)\\s+a\\s+conversation\\s+with\\s+${NAME_CAPTURE}\\b`, 'gi'),
  },
];

const CREDIT_CONTEXT_RULES: MultiNamedRule[] = [
  {
    category: 'credit_or_boilerplate_context',
    confidence: 0.96,
    reason: 'production or contributor credit is not participant evidence',
    pattern: /\b(?:hosted\s+by|produced\s+by|edited\s+by|engineered\s+by|mixed\s+by|fact\s*checking\s+by|video\s+production\s+by|research\s+by|music\s+by|special\s+thanks\s+to|thanks\s+to|our\s+producer\s+is|our\s+producers\s+are)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)*)/gi,
    splitNames: true,
  },
];

const NON_HUMAN_RULES: NamedRule[] = [
  {
    category: 'non_human_show_or_promo',
    confidence: 0.95,
    reason: 'show, promo, or URL text is not a human speaker',
    pattern: /\b(?:markets?|podcast|show|tour|newsletter|episode|promo|advertiser|sponsor|[a-z0-9-]+\.(?:com|org|net|io|co))\b/gi,
  },
  {
    category: 'non_human_location',
    confidence: 0.94,
    reason: 'location or transport hub is not a human speaker',
    pattern: /\b(?:station|airport|terminal|transport\s+hub|city|beach|international|west\s+coast|east\s+coast)\b/gi,
  },
  {
    category: 'non_human_institution',
    confidence: 0.94,
    reason: 'institution or media body is not a human speaker',
    pattern: /\b(?:school|university|college|law\s+school|institute|center|centre|department|ministry|foundation|magazine|newspaper|news|opinion|world\s+service|radio|network|press|times|bloomberg|bbc|vox\s+media|general\s+assembly|security\s+council|united\s+nations|u\.?n\.?)\b/gi,
  },
  {
    category: 'non_human_title_or_role',
    confidence: 0.92,
    reason: 'title or office is not a speaker identity by itself',
    pattern: /\b(?:secretary|minister|president|prime\s+minister|senator|governor|chief\s+of\s+staff|human\s+services|department\s+of)\b/gi,
  },
  {
    category: 'non_human_geopolitical',
    confidence: 0.94,
    reason: 'geopolitical entity is not a human speaker',
    pattern: /\b(?:united\s+states|united\s+kingdom|u\.?s\.?|u\.?k\.?|america|israel|palestinians?|iran|russia|ukraine|china|canada|europe|european\s+union)\b/gi,
  },
  {
    category: 'non_human_topic_or_law',
    confidence: 0.92,
    reason: 'topic, law, treaty, or award is not a human speaker',
    pattern: /\b(?:treaty|resolution|accord|agreement|act|bill|law|nobel(?:\s+prize)?)\b/gi,
  },
  {
    category: 'non_human_sponsor_product',
    confidence: 0.9,
    reason: 'known sponsor or product name is not a conversational human speaker',
    pattern: /\b(?:sofi|vcx|vanguard|rubrik|zbiotics|nymag|virgin\s+atlantic)\b/gi,
  },
];

function reset(pattern: RegExp): RegExp {
  pattern.lastIndex = 0;
  return pattern;
}

function cleanCapturedRuleName(rawName: string | undefined): string | null {
  if (!rawName) return null;
  const rawWords = rawName
    .replace(/[.,:;!?()[\]{}"“”‘’]+$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const words: string[] = [];

  for (const word of rawWords) {
    if (NAME_TRAILING_STOP_WORDS.has(word.toLowerCase())) break;
    if (!/^[A-Z][a-zA-Z'-]+$/.test(word) && !/^[A-Z]{2,}$/.test(word)) break;
    words.push(word);
  }

  if (words.length < 2 || words.length > 4) return null;

  return words.join(' ');
}

function matchesNamedRules(text: string, rules: NamedRule[]): SpeakerNamingRuleMatch[] {
  const matches: SpeakerNamingRuleMatch[] = [];

  for (const rule of rules) {
    let match: RegExpExecArray | null;
    const pattern = reset(rule.pattern);
    while ((match = pattern.exec(text)) !== null) {
      const name = cleanCapturedRuleName(match[rule.nameGroup ?? 1]);
      if (!name) continue;
      matches.push({
        category: rule.category,
        confidence: rule.confidence,
        matchedText: match[0],
        reason: rule.reason,
        name,
      });
    }
  }

  return matches;
}

function matchesMultiNamedRules(text: string, rules: MultiNamedRule[]): SpeakerNamingRuleMatch[] {
  const matches: SpeakerNamingRuleMatch[] = [];

  for (const rule of rules) {
    let match: RegExpExecArray | null;
    const pattern = reset(rule.pattern);
    while ((match = pattern.exec(text)) !== null) {
      const rawValue = match[rule.nameGroup ?? 1];
      if (!rawValue) continue;
      const rawNames = rule.splitNames
        ? rawValue.split(/\s*(?:,| and | & )\s*/i).filter(Boolean)
        : [rawValue];
      for (const rawName of rawNames) {
        const name = cleanCapturedRuleName(rawName);
        if (!name) continue;
        matches.push({
          category: rule.category,
          confidence: rule.confidence,
          matchedText: match[0],
          reason: rule.reason,
          name,
        });
      }
    }
  }

  return matches;
}

export function matchStrongGuestIntroRules(text: string): SpeakerNamingRuleMatch[] {
  return matchesNamedRules(text, [...STRONG_GUEST_INTRO_RULES, ...DIRECT_ADDRESS_INTRO_RULES]);
}

export function matchPanelIntroRules(text: string): SpeakerNamingRuleMatch[] {
  return matchesNamedRules(text, PANEL_INTRO_RULES);
}

export function matchWeakGuestMentionRules(text: string): SpeakerNamingRuleMatch[] {
  return matchesNamedRules(text, WEAK_GUEST_MENTION_RULES);
}

export function matchCreditContextNameRules(text: string): SpeakerNamingRuleMatch[] {
  return matchesMultiNamedRules(text, CREDIT_CONTEXT_RULES);
}

export function matchNonHumanSpeakerNameRules(candidate: string): SpeakerNamingRuleMatch[] {
  const matches: SpeakerNamingRuleMatch[] = [];

  for (const rule of NON_HUMAN_RULES) {
    let match: RegExpExecArray | null;
    const pattern = reset(rule.pattern);
    while ((match = pattern.exec(candidate)) !== null) {
      matches.push({
        category: rule.category,
        confidence: rule.confidence,
        matchedText: match[0],
        reason: rule.reason,
        name: candidate,
      });
    }
  }

  return matches;
}
