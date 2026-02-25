export type Category = 'concept' | 'person' | 'tool';

export interface InsightSource {
  title: string;
  url: string;
}

export interface Insight {
  id: string;
  title: string;
  category: Category;
  definition: string; // 1-2 sentences
  significance: string; // "Why it matters"
  sources: InsightSource[];
  // For matching in transcript
  matchText?: string;
  matchVariants?: string[];
}

export interface CategoryConfig {
  dotColor: string;
  borderColor: string;
  iconColor: string;
  hoverBg: string;
  icon: 'lightbulb' | 'user' | 'building';
  label: string;
}

export const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  concept: {
    dotColor: 'bg-amber-500',
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-500',
    hoverBg: 'bg-amber-900/20',
    icon: 'lightbulb',
    label: 'Concept',
  },
  person: {
    dotColor: 'bg-blue-500',
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-500',
    hoverBg: 'bg-blue-900/20',
    icon: 'user',
    label: 'Person',
  },
  tool: {
    dotColor: 'bg-emerald-500',
    borderColor: 'border-l-emerald-500',
    iconColor: 'text-emerald-500',
    hoverBg: 'bg-emerald-900/20',
    icon: 'building',
    label: 'Tool',
  },
};
