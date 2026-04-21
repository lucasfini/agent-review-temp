'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Lightbulb,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BookOpen,
  MessageSquare,
  User,
  Mic,
  Radio,
  HelpCircle,
  Clock,
  Edit2,
  Check,
  X,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  ListChecks,
  Plus,
  Layers,
  PanelBottomClose,
  PanelBottomOpen,
  Facebook,
  Instagram,
  Youtube,
  Mail,
  FileText,
  Quote,
  Newspaper,
} from 'lucide-react';
import type { SpeakerSegment, SpeakerRole } from '@/lib/types';
import { SPEAKER_ROLE_LABELS, SPEAKER_ROLES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getSpeakerDisplayName, getSpeakerColor } from '@/lib/name-extraction';
import { formatReviewReason } from '@/lib/speaker-review';
import { InsightsSidebar, type Insight } from '@/components/insights';
import InlineContentStudio from '@/components/project/InlineContentStudio';
import { ANALYSIS_OPTION_CONFIG, type AnalysisOptionKey } from '@/lib/analysis-options';
import { CONTENT_TYPES } from '@/lib/content-types';

type TabId = 'speakers' | 'review' | 'generate' | 'content';
type ContentSectionId = 'analysis' | 'outputs';
type AnalysisViewId = 'summary' | 'insights' | 'chapters' | 'takeaways' | 'quotes';

const XIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M4 4h4l4 5 4-5h4l-6 7 6 9h-4l-4-5-4 5H4l6-9z" />
  </svg>
);

const LinkedinIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const TikTokIcon = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.35h-3.2v12.4a2.89 2.89 0 1 1-2-2.75V8.72a6.13 6.13 0 1 0 5.2 6.02V8.45a8.06 8.06 0 0 0 4.77 1.57V6.69Z" />
  </svg>
);

function getOutputContentIcon(contentTypeId: string) {
  switch (contentTypeId) {
    case 'twitter_threads':
      return XIcon;
    case 'linkedin_posts':
      return LinkedinIcon;
    case 'facebook_post':
      return Facebook;
    case 'instagram_content':
      return Instagram;
    case 'youtube_description':
      return Youtube;
    case 'short_form_video_script':
      return TikTokIcon;
    case 'podcast_episode_description':
      return Mic;
    case 'show_notes':
      return FileText;
    case 'blog_post':
      return Newspaper;
    case 'newsletter':
      return Mail;
    case 'quote_graphics':
      return Quote;
    default:
      return FileText;
  }
}

function getAnalysisViewIcon(viewId: AnalysisViewId) {
  switch (viewId) {
    case 'summary':
      return Sparkles;
    case 'insights':
      return Lightbulb;
    case 'chapters':
      return BookOpen;
    case 'takeaways':
      return CheckCircle;
    case 'quotes':
      return MessageSquare;
    default:
      return Sparkles;
  }
}

const OUTPUT_TYPE_TO_CONTENT_TYPE: Record<string, string> = {
  twitter_thread: 'twitter_threads',
  linkedin_post: 'linkedin_posts',
  instagram_caption: 'instagram_content',
  blog_post: 'blog_post',
  email_newsletter: 'newsletter',
  show_notes: 'show_notes',
  quote_graphic: 'quote_graphics',
  facebook_post: 'facebook_post',
  youtube_description: 'youtube_description',
  podcast_episode_description: 'podcast_episode_description',
  short_form_video_script: 'short_form_video_script',
};

function getContentTypeIdForOutput(output: Output): string | null {
  const original = output.metadata?.originalOutputType;
  if (typeof original === 'string' && OUTPUT_TYPE_TO_CONTENT_TYPE[original]) {
    return OUTPUT_TYPE_TO_CONTENT_TYPE[original];
  }
  if (OUTPUT_TYPE_TO_CONTENT_TYPE[output.type]) {
    return OUTPUT_TYPE_TO_CONTENT_TYPE[output.type];
  }
  return null;
}

const ANALYSIS_CARD_STYLES: Record<AnalysisOptionKey, {
  icon: React.ReactNode;
  cardClass: string;
  badgeClass: string;
}> = {
  namedSpeakers: {
    icon: <Users className="h-4 w-4" />,
    cardClass: 'border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/20',
    badgeClass: 'bg-sky-500 text-white border-sky-400',
  },
  summary: {
    icon: <Sparkles className="h-4 w-4" />,
    cardClass: 'border-violet-200 bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/20',
    badgeClass: 'bg-violet-500 text-white border-violet-400',
  },
  insights: {
    icon: <Lightbulb className="h-4 w-4" />,
    cardClass: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
    badgeClass: 'bg-amber-500 text-white border-amber-400',
  },
  chapters: {
    icon: <BookOpen className="h-4 w-4" />,
    cardClass: 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/20',
    badgeClass: 'bg-indigo-500 text-white border-indigo-400',
  },
  takeaways: {
    icon: <CheckCircle className="h-4 w-4" />,
    cardClass: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    badgeClass: 'bg-emerald-500 text-white border-emerald-400',
  },
  quotes: {
    icon: <MessageSquare className="h-4 w-4" />,
    cardClass: 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20',
    badgeClass: 'bg-rose-500 text-white border-rose-400',
  },
};

interface Output {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  metadata?: any;
}

interface TouchupPreviewItem {
  index: number;
  oldSpeakerId: string;
  newSpeakerId: string;
  reason: string;
  confidence: number | null;
  segmentText: string;
  accepted: boolean;
}

interface Speaker {
  id: string;
  finalName?: string;
  fallbackName?: string;
  customName?: string;
  extractedName?: { name: string; confidence: number };
  role?: string;
  roleConfidence?: number;
  segmentCount?: number;
}

interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
  description?: string;
}

interface Takeaway {
  takeaway: string;
  timestamp?: number;
}

interface Quote {
  quote: string;
  speaker?: string;
  timestamp?: number;
  platform?: string;
}

interface ContextSidebarProps {
  // Speaker data
  speakers?: Record<string, Speaker>;
  onSpeakerClick?: (speakerId: string) => void;
  activeSpeakerId?: string | null;
  projectId?: string;
  onSpeakerRename?: (speakerId: string, newName: string) => void;
  onSpeakerMerge?: (sourceSpeakerId: string, targetSpeakerId: string) => void;
  onSpeakerAdd?: (name: string, role: SpeakerRole) => Promise<void>;
  onSpeakerDelete?: (speakerId: string, action: 'reassign' | 'delete', targetId?: string) => Promise<void>;
  onSpeakerRoleChange?: (speakerId: string, role: SpeakerRole) => Promise<void>;

  // Insights data
  insights?: Insight[];
  activeInsightId?: string | null;
  onInsightClick?: (insightId: string) => void;
  insightsLoading?: boolean;
  insightsGenerating?: boolean;
  onGenerateInsights?: () => void;

  // AI-generated content
  summary?: string;
  chapters?: Chapter[];
  takeaways?: Takeaway[];
  quotes?: Quote[];

  // Configuration
  contentLoading?: boolean; // True when project is still processing (summary/chapters/etc. not ready yet)
  className?: string;

  // Mobile control
  isOpen?: boolean;
  onClose?: () => void;
  mobileSheet?: boolean;

  // Review tab — segment review workflow
  segments?: SpeakerSegment[];
  reviewItems?: Array<{
    index: number;
    speakerId: string;
    reasons?: string[];
    primaryReason?: string;
    label?: string;
  }>;
  reviewSegmentIndices?: number[];
  selectedSegments?: Set<number>;
  hasUncertainSegments?: boolean;
  onSelectAllUncertain?: () => void;
  onClearSelection?: () => void;
  onToggleSegmentSelection?: (index: number) => void;
  onScrollToSegment?: (index: number) => void;
  onConfirmSegment?: (index: number) => void;
  onSegmentReassign?: (segmentIndex: number, newSpeakerId: string) => void;
  // AI touch-up
  aiTouchupLoading?: boolean;
  onAiTouchup?: () => void;
  aiTouchupResult?: string | null;
  touchupPreview?: TouchupPreviewItem[] | null;
  applyingTouchup?: boolean;
  onApplyTouchup?: () => void;
  onTogglePreviewItem?: (index: number) => void;
  onDismissPreview?: () => void;

  // Content tab — generated outputs
  outputs?: Output[];
  onCopyOutput?: (output: Output) => void;
  onDownloadOutput?: (output: Output) => void;
  onDeleteOutput?: (outputId: string) => void;
  deletingOutput?: string | null;
  generatingContentTypes?: Set<string>;
  onGenerateContentBlock?: (block: any) => Promise<void>;
  contentGuidanceByType?: Record<string, string>;
  onContentGuidanceChange?: (contentTypeId: string, value: string) => void;
  analysisStates?: Partial<Record<AnalysisOptionKey, { available: boolean; generating: boolean }>>;
  onGenerateAnalysisOption?: (key: AnalysisOptionKey) => Promise<void> | void;
  /** When true, hides all write actions (demo mode) */
  readOnly?: boolean;
}

// Helper to format duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Role icon mapping
function getRoleIcon(role?: string) {
  switch (role) {
    case 'host':
      return <Mic className="w-3 h-3" />;
    case 'co_host':
      return <Radio className="w-3 h-3" />;
    case 'guest':
      return <User className="w-3 h-3" />;
    case 'candidate':
      return <User className="w-3 h-3" />;
    case 'advertiser':
      return <Mic className="w-3 h-3" />;
    case 'narrator':
      return <BookOpen className="w-3 h-3" />;
    case 'quoted_audio':
      return <MessageSquare className="w-3 h-3" />;
    default:
      return <HelpCircle className="w-3 h-3" />;
  }
}

export function ContextSidebar({
  speakers = {},
  onSpeakerClick,
  activeSpeakerId,
  projectId,
  onSpeakerRename,
  onSpeakerMerge,
  onSpeakerAdd,
  onSpeakerDelete,
  onSpeakerRoleChange,
  insights = [],
  activeInsightId,
  onInsightClick,
  insightsLoading = false,
  insightsGenerating = false,
  onGenerateInsights,
  summary,
  chapters = [],
  takeaways = [],
  quotes = [],
  contentLoading = false,
  className,
  isOpen = true,
  onClose,
  mobileSheet = true,
  segments = [],
  reviewItems = [],
  reviewSegmentIndices = [],
  selectedSegments,
  hasUncertainSegments = false,
  onSelectAllUncertain,
  onClearSelection,
  onToggleSegmentSelection,
  onScrollToSegment,
  onConfirmSegment,
  onSegmentReassign,
  aiTouchupLoading = false,
  onAiTouchup,
  aiTouchupResult,
  touchupPreview,
  applyingTouchup = false,
  onApplyTouchup,
  onTogglePreviewItem,
  onDismissPreview,
  outputs = [],
  onCopyOutput,
  onDownloadOutput,
  onDeleteOutput,
  deletingOutput,
  generatingContentTypes = new Set(),
  onGenerateContentBlock,
  contentGuidanceByType = {},
  onContentGuidanceChange,
  analysisStates = {},
  onGenerateAnalysisOption,
  readOnly = false,
}: ContextSidebarProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('review');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['speakers']));
  const [expandedContentSections, setExpandedContentSections] = useState<Set<string>>(
    new Set(['addons', 'contentTypes'])
  );
  const [expandedContentPanels, setExpandedContentPanels] = useState<Set<ContentSectionId>>(
    new Set(['analysis', 'outputs'])
  );
  const [activeContentSection, setActiveContentSection] = useState<ContentSectionId>('analysis');
  const [activeAnalysisView, setActiveAnalysisView] = useState<AnalysisViewId>('summary');
  const [activeOutputType, setActiveOutputType] = useState<string | null>(null);
  const [contentOptionsCollapsed, setContentOptionsCollapsed] = useState(false);

  // Speaker editing state
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingSpeaker, setSavingSpeaker] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingRoleSpeakerId, setEditingRoleSpeakerId] = useState<string | null>(null);

  // Close role dropdown on outside click
  useEffect(() => {
    if (!editingRoleSpeakerId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-role-dropdown]')) {
        setEditingRoleSpeakerId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingRoleSpeakerId]);

  // Add speaker form state
  const [addSpeakerExpanded, setAddSpeakerExpanded] = useState(false);
  const [addSpeakerName, setAddSpeakerName] = useState('');
  const [addSpeakerRole, setAddSpeakerRole] = useState<SpeakerRole>('guest');
  const [addSpeakerSaving, setAddSpeakerSaving] = useState(false);

  const toggleContentSection = (sectionId: string) => {
    setExpandedContentSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const toggleContentPanel = (sectionId: ContentSectionId) => {
    setExpandedContentPanels((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleAddSpeakerSubmit = async () => {
    if (!addSpeakerName.trim() || !onSpeakerAdd) return;
    setAddSpeakerSaving(true);
    try {
      await onSpeakerAdd(addSpeakerName.trim(), addSpeakerRole);
      setAddSpeakerExpanded(false);
      setAddSpeakerName('');
      setAddSpeakerRole('guest');
    } catch (error) {
      console.error('Failed to add speaker:', error);
    } finally {
      setAddSpeakerSaving(false);
    }
  };

  // Delete speaker state
  const [deleteSpeakerId, setDeleteSpeakerId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);

    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMobileExpanded(false);
    }
  }, [isOpen]);

  const handleDeleteSubmit = async (speakerId: string, action: 'reassign' | 'delete') => {
    if (!onSpeakerDelete) return;
    if (action === 'reassign' && !deleteTargetId) return;
    setSavingSpeaker(speakerId);
    try {
      await onSpeakerDelete(speakerId, action, action === 'reassign' ? deleteTargetId : undefined);
      setDeleteSpeakerId(null);
      setDeleteTargetId('');
    } catch (error) {
      console.error('Failed to delete speaker:', error);
    } finally {
      setSavingSpeaker(null);
    }
  };

  // Speaker editing handlers
  const handleStartEdit = (speakerId: string, currentName: string) => {
    setEditingSpeakerId(speakerId);
    setEditingName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingSpeakerId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (speakerId: string) => {
    if (!editingName.trim() || !onSpeakerRename) {
      handleCancelEdit();
      return;
    }

    setSavingSpeaker(speakerId);
    try {
      await onSpeakerRename(speakerId, editingName.trim());
      handleCancelEdit();
    } catch (error) {
      console.error('Failed to rename speaker:', error);
    } finally {
      setSavingSpeaker(null);
    }
  };

  const handleMerge = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    if (!projectId) return;

    try {
      setSavingSpeaker(mergeSourceId);
      await onSpeakerMerge?.(mergeSourceId, mergeTargetId);
      setMergeSourceId(null);
      setMergeTargetId('');
    } finally {
      setSavingSpeaker(null);
    }
  };

  // Build speaker list sorted by segment count
  const speakerList = useMemo(() => {
    return Object.entries(speakers)
      .map(([speakerId, speaker]) => ({
        ...speaker,
        id: speakerId,
        displayName: getSpeakerDisplayName(speaker as any) || speaker.finalName || speaker.fallbackName || `Speaker ${speakerId}`,
        colorClasses: getSpeakerColor(speakerId),
      }))
      .sort((a, b) => (b.segmentCount || 0) - (a.segmentCount || 0));
  }, [speakers]);

  const selectedCount = selectedSegments?.size ?? 0;
  const reviewSegmentIndexSet = useMemo(
    () => new Set(reviewSegmentIndices),
    [reviewSegmentIndices]
  );
  const openReviewCount = reviewItems.length;
  const resolvedReviewCount = useMemo(
    () => reviewItems.filter((item) => !reviewSegmentIndexSet.has(item.index)).length,
    [reviewItems, reviewSegmentIndexSet]
  );
  const reviewItemsBySpeaker = useMemo(() => {
    const groups = new Map<string, typeof reviewItems>();
    for (const item of reviewItems) {
      const key = item.speakerId || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).map(([speakerId, items]) => ({
      speakerId,
      items: items.sort((a, b) => a.index - b.index),
    }));
  }, [reviewItems]);

  // Auto-select uncertain segments when the Review tab is opened with nothing selected
  useEffect(() => {
    if (activeTab === 'review' && selectedCount === 0 && hasUncertainSegments) {
      onSelectAllUncertain?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!activeInsightId) return;
    if (!insights.length) return;
    setActiveTab('content');
    setActiveContentSection('analysis');
    setExpandedContentPanels((prev) => new Set(prev).add('analysis'));
    setActiveAnalysisView('insights');
  }, [activeInsightId, insights.length]);

  const availableTabs = useMemo(
    () => [
      {
        id: 'speakers' as const,
        label: 'Speakers',
        icon: <Users className="w-4 h-4" />,
        count: speakerList.length > 0 ? speakerList.length : undefined,
      },
      {
        id: 'review' as const,
        label: 'Review',
        icon: <ListChecks className="w-4 h-4" />,
        count: openReviewCount > 0 ? openReviewCount : undefined,
      },
      {
        id: 'generate' as const,
        label: 'Generate',
        icon: <Sparkles className="w-4 h-4" />,
        count:
          Object.values(analysisStates).filter((state) => state?.generating).length +
          generatingContentTypes.size || undefined,
      },
      {
        id: 'content' as const,
        label: 'Content',
        icon: <Layers className="w-4 h-4" />,
        count: outputs.length + (summary ? 1 : 0) + (insights.length ? 1 : 0) + (chapters.length ? 1 : 0) + (takeaways.length ? 1 : 0) + (quotes.length ? 1 : 0) || undefined,
      },
    ],
    [speakerList.length, openReviewCount, analysisStates, generatingContentTypes.size, outputs.length, summary, insights.length, chapters.length, takeaways.length, quotes.length]
  );

  const availableAnalysisViews = useMemo(() => {
    const views: Array<{ id: AnalysisViewId; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }> = [];
    if (summary) views.push({ id: 'summary', label: 'Summary', icon: getAnalysisViewIcon('summary') });
    if (insights.length > 0) views.push({ id: 'insights', label: 'Insights', count: insights.length, icon: getAnalysisViewIcon('insights') });
    if (chapters.length > 0) views.push({ id: 'chapters', label: 'Chapters', count: chapters.length, icon: getAnalysisViewIcon('chapters') });
    if (takeaways.length > 0) views.push({ id: 'takeaways', label: 'Takeaways', count: takeaways.length, icon: getAnalysisViewIcon('takeaways') });
    if (quotes.length > 0) views.push({ id: 'quotes', label: 'Quotes', count: quotes.length, icon: getAnalysisViewIcon('quotes') });
    return views;
  }, [chapters.length, insights.length, quotes.length, summary, takeaways.length]);

  const availableOutputViews = useMemo(() => {
    const contentTypeCounts = new Map<string, number>();
    outputs.forEach((output) => {
      const contentTypeId = getContentTypeIdForOutput(output);
      if (!contentTypeId) return;
      contentTypeCounts.set(contentTypeId, (contentTypeCounts.get(contentTypeId) || 0) + 1);
    });

    return CONTENT_TYPES.flatMap((contentType) => {
      const count = contentTypeCounts.get(contentType.id);
      return count ? [{ id: contentType.id, label: contentType.name, count, icon: getOutputContentIcon(contentType.id) }] : [];
    });
  }, [outputs]);

  useEffect(() => {
    if (availableAnalysisViews.length > 0) {
      if (!availableAnalysisViews.some((view) => view.id === activeAnalysisView)) {
        setActiveAnalysisView(availableAnalysisViews[0].id);
      }
      if (activeContentSection === 'outputs' && availableOutputViews.length === 0) {
        setActiveContentSection('analysis');
      }
      return;
    }

    if (availableOutputViews.length > 0) {
      setActiveContentSection('outputs');
      return;
    }
  }, [activeAnalysisView, activeContentSection, availableAnalysisViews, availableOutputViews]);

  useEffect(() => {
    if (isMobileViewport) {
      setExpandedContentPanels(new Set([activeContentSection]));
      return;
    }

    if (availableAnalysisViews.length > 0 && availableOutputViews.length === 0) {
      setExpandedContentPanels(new Set(['analysis']));
      return;
    }
    if (availableOutputViews.length > 0 && availableAnalysisViews.length === 0) {
      setExpandedContentPanels(new Set(['outputs']));
      return;
    }
    setExpandedContentPanels(new Set(['analysis', 'outputs']));
  }, [activeContentSection, availableAnalysisViews.length, availableOutputViews.length, isMobileViewport]);

  useEffect(() => {
    if (availableOutputViews.length === 0) {
      setActiveOutputType(null);
      if (availableAnalysisViews.length > 0) {
        setActiveContentSection('analysis');
      }
      return;
    }

    if (!activeOutputType || !availableOutputViews.some((view) => view.id === activeOutputType)) {
      setActiveOutputType(availableOutputViews[0].id);
    }
  }, [activeOutputType, availableAnalysisViews.length, availableOutputViews]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Determine if insights truly exist (check array length properly)
  const hasInsights = insights && insights.length > 0;
  const activeAnalysisLabel = availableAnalysisViews.find((view) => view.id === activeAnalysisView)?.label ?? 'Analysis';
  const activeOutputLabel = availableOutputViews.find((view) => view.id === activeOutputType)?.label ?? 'Output';

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800',
        isMobileViewport && isOpen && mobileSheet && (mobileExpanded ? 'h-[82svh]' : 'h-[62svh]'),
        className
      )}
      data-tour="sidebar-panel"
      aria-hidden={!isOpen}
    >
      {onClose && mobileSheet && (
        <div className="flex-shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project tools</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Review, generate, and manage speaker context without leaving the transcript.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileExpanded((prev) => !prev)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label={mobileExpanded ? 'Collapse tools panel' : 'Expand tools panel'}
              >
                {mobileExpanded ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close tools panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30 lg:static lg:z-auto sticky top-0 z-10">
        {(() => {
          const reviewTabs = availableTabs.filter((tab) => tab.id === 'speakers' || tab.id === 'review');
          const contentTabs = availableTabs.filter((tab) => tab.id === 'generate' || tab.id === 'content');

          const renderTabButton = (tab: typeof availableTabs[number]) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              title={tab.label}
              data-tour={
                tab.id === 'speakers'
                  ? 'sidebar-tab-speakers'
                  : tab.id === 'review'
                  ? 'sidebar-tab-review'
                  : tab.id === 'generate'
                  ? 'sidebar-tab-generate'
                  : tab.id === 'content'
                  ? 'sidebar-tab-content'
                  : undefined
              }
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-all',
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <span className="flex items-center justify-center [&_svg]:h-4.5 [&_svg]:w-4.5">
                {tab.icon}
              </span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  'ml-0.5 rounded-full px-1 py-0.5 text-[9px] font-semibold',
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );

          return (
            <div className="flex w-full items-stretch gap-2 border border-slate-200/80 bg-white/70 px-1 py-1 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
              <div className="flex flex-1 items-stretch gap-1">
                {reviewTabs.map(renderTabButton)}
              </div>

              <div className="flex items-stretch justify-center py-0">
                <div className="h-full w-px bg-slate-300/80 dark:bg-slate-700/80" />
              </div>

              <div className="flex flex-1 items-stretch gap-1">
                {contentTabs.map(renderTabButton)}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Speakers Tab */}
        {activeTab === 'speakers' && (
          <div className="p-4 space-y-3" data-tour="speakers-panel">
            {speakerList.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-3 text-slate-400 dark:text-slate-300" />
                <p className="text-sm">No speakers detected yet</p>
              </div>
            ) : (
              speakerList.map((speaker) => {
                const colorParts = speaker.colorClasses.split(' ');
                const textColor = colorParts.find(c => c.startsWith('text-')) || 'text-slate-400';
                const bgColor = colorParts.find(c => c.startsWith('bg-')) || 'bg-slate-800/50';
                const dotColor = bgColor.includes('/')
                  ? 'bg-slate-500'
                  : bgColor.replace('-50', '-500').replace('-100', '-500');
                const isEditing = editingSpeakerId === speaker.id;
                const isSaving = savingSpeaker === speaker.id;

                return (
                  <div
                    key={speaker.id}
                    className={cn(
                      'group w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all border',
                      activeSpeakerId === speaker.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 shadow-sm'
                        : 'bg-slate-100/60 dark:bg-slate-800/30 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700'
                    )}
                  >
                    {/* Color dot indicator */}
                    <button
                      onClick={() => onSpeakerClick?.(speaker.id)}
                      className={cn('w-3 h-3 rounded-full mt-1 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1', dotColor)}
                      title="Filter by speaker"
                      aria-label={`Filter transcript by speaker ${speaker.displayName}`}
                    />

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        /* Editing mode */
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(speaker.id);
                              else if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            disabled={isSaving}
                          />
                          <button
                            onClick={() => handleSaveEdit(speaker.id)}
                            disabled={isSaving || !editingName.trim()}
                            className="p-1 text-green-600 hover:text-green-300 disabled:opacity-50"
                            title="Save"
                            aria-label={`Save speaker name for ${speaker.displayName}`}
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
                            title="Cancel"
                            aria-label={`Cancel speaker name edit for ${speaker.displayName}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        /* Display mode */
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            {readOnly ? (
                              <span
                                className={cn('font-semibold text-sm', activeSpeakerId === speaker.id ? 'text-blue-200' : textColor)}
                              >
                                {speaker.displayName}
                              </span>
                            ) : (
                              <span
                                className={cn('font-semibold text-sm cursor-text hover:underline', activeSpeakerId === speaker.id ? 'text-blue-200' : textColor)}
                                onClick={() => handleStartEdit(speaker.id, speaker.displayName)}
                                title="Click to rename"
                              >
                                {speaker.displayName}
                              </span>
                            )}
                            {!readOnly && onSpeakerRoleChange ? (
                              <div className="relative" data-role-dropdown>
                                <button
                                  onClick={() => setEditingRoleSpeakerId(speaker.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                  aria-label={`Set role for speaker ${speaker.displayName}`}
                                >
                                  {speaker.role ? (
                                    <>{getRoleIcon(speaker.role)} {SPEAKER_ROLE_LABELS[speaker.role as SpeakerRole] ?? speaker.role}</>
                                  ) : (
                                    <><Plus className="w-3 h-3" /> Role</>
                                  )}
                                </button>
                                {editingRoleSpeakerId === speaker.id && (
                                  <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                                    {SPEAKER_ROLES.map(role => (
                                      <button
                                        key={role}
                                        onClick={() => {
                                          onSpeakerRoleChange(speaker.id, role);
                                          setEditingRoleSpeakerId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left text-slate-600 dark:text-slate-300"
                                        aria-label={`Set speaker ${speaker.displayName} role to ${SPEAKER_ROLE_LABELS[role]}`}
                                      >
                                        {getRoleIcon(role)} {SPEAKER_ROLE_LABELS[role]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              speaker.role && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                                  {getRoleIcon(speaker.role)}
                                  {SPEAKER_ROLE_LABELS[speaker.role as SpeakerRole] ?? speaker.role}
                                </span>
                              )
                            )}
                            {!readOnly && projectId && (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(prev => prev === speaker.id ? null : speaker.id);
                                  }}
                                  className="p-1 text-slate-500 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="More actions"
                                  aria-label={`Open more speaker actions for ${speaker.displayName}`}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {activeMenuId === speaker.id && (
                                  <div className="absolute right-0 mt-1 w-28 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md z-10">
                                    {onSpeakerMerge && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuId(null);
                                          setMergeSourceId(speaker.id);
                                          setMergeTargetId('');
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                                        aria-label={`Merge speaker ${speaker.displayName}`}
                                      >
                                        Merge
                                      </button>
                                    )}
                                    {onSpeakerDelete && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuId(null);
                                          setDeleteSpeakerId(speaker.id);
                                          setDeleteTargetId('');
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        aria-label={`Delete speaker ${speaker.displayName}`}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {speaker.segmentCount !== undefined && (
                            <p className="text-xs text-slate-500 mt-1">
                              {speaker.segmentCount} segment{speaker.segmentCount !== 1 ? 's' : ''}
                            </p>
                          )}
                          {mergeSourceId === speaker.id && (
                            <div className="mt-2 rounded-md border border-blue-200 dark:border-blue-100 bg-blue-50 dark:bg-blue-900/20 p-2 text-[11px] text-blue-700 dark:text-blue-300 space-y-2">
                              <div>Merge into:</div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={mergeTargetId}
                                  onChange={(e) => setMergeTargetId(e.target.value)}
                                  className="text-[11px] border border-blue-300 dark:border-blue-800/30 rounded px-2 py-1 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300"
                                  aria-label={`Merge speaker ${speaker.displayName} into`}
                                >
                                  <option value="">Select speaker</option>
                                  {speakerList
                                    .filter(s => s.id !== mergeSourceId)
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {getSpeakerDisplayName(s as any)}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  onClick={handleMerge}
                                  disabled={!mergeTargetId}
                                  className="px-2 py-1 rounded border border-blue-800/30 bg-blue-600 text-white disabled:opacity-50"
                                  aria-label={`Confirm merge for speaker ${speaker.displayName}`}
                                >
                                  Merge
                                </button>
                                <button
                                  onClick={() => {
                                    setMergeSourceId(null);
                                    setMergeTargetId('');
                                  }}
                                  className="px-2 py-1 rounded border border-transparent text-blue-600 dark:text-blue-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {deleteSpeakerId === speaker.id && (
                            <div className="mt-2 rounded-md border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-900/20 p-2 text-[11px] text-red-700 dark:text-red-300 space-y-2">
                              <div className="font-medium">Delete this speaker?</div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={deleteTargetId}
                                  onChange={(e) => setDeleteTargetId(e.target.value)}
                                  className="flex-1 text-[11px] border border-red-300 dark:border-red-800/30 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                                  aria-label={`Reassign segments for speaker ${speaker.displayName}`}
                                >
                                  <option value="">Reassign segments to…</option>
                                  {speakerList
                                    .filter(s => s.id !== deleteSpeakerId)
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {getSpeakerDisplayName(s as any)}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  onClick={() => handleDeleteSubmit(speaker.id, 'reassign')}
                                  disabled={!deleteTargetId || savingSpeaker === speaker.id}
                                  className="px-2 py-1 rounded border border-red-300 dark:border-red-800/30 bg-white dark:bg-slate-900 text-red-500 dark:text-red-400 disabled:opacity-50 whitespace-nowrap"
                                  aria-label={`Reassign and remove speaker ${speaker.displayName}`}
                                >
                                  {savingSpeaker === speaker.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Move'}
                                </button>
                              </div>
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => handleDeleteSubmit(speaker.id, 'delete')}
                                  disabled={savingSpeaker === speaker.id}
                                  className="px-2 py-1 rounded bg-red-600 text-white text-[11px] disabled:opacity-50"
                                >
                                  Delete all segments
                                </button>
                                <button
                                  onClick={() => { setDeleteSpeakerId(null); setDeleteTargetId(''); }}
                                  className="px-2 py-1 text-red-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Add Speaker */}
            {!readOnly && projectId && (
              <div className="pt-1">
                {!addSpeakerExpanded ? (
                  <button
                    onClick={() => setAddSpeakerExpanded(true)}
                    className="w-full text-xs text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 flex items-center gap-1 justify-center py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                  >
                    + Add speaker
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={addSpeakerName}
                        onChange={(e) => setAddSpeakerName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && addSpeakerName.trim()) handleAddSpeakerSubmit();
                          else if (e.key === 'Escape') { setAddSpeakerExpanded(false); setAddSpeakerName(''); setAddSpeakerRole('guest'); }
                        }}
                        placeholder="e.g. Unknown Guest"
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        disabled={addSpeakerSaving}
                      />
                      <button
                        onClick={() => { setAddSpeakerExpanded(false); setAddSpeakerName(''); setAddSpeakerRole('guest'); }}
                        disabled={addSpeakerSaving}
                        className="p-1 text-slate-500 hover:text-slate-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={addSpeakerRole}
                        onChange={(e) => setAddSpeakerRole(e.target.value as SpeakerRole)}
                        disabled={addSpeakerSaving}
                        className="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {SPEAKER_ROLES.map(role => (
                          <option key={role} value={role}>{SPEAKER_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddSpeakerSubmit}
                        disabled={addSpeakerSaving || !addSpeakerName.trim()}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                      >
                        {addSpeakerSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div className="p-3">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/50 p-3">
                <button
                  type="button"
                  onClick={() => toggleContentSection('addons')}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add-ons</p>
                  </div>
                  {expandedContentSections.has('addons') ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>
                {expandedContentSections.has('addons') ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {ANALYSIS_OPTION_CONFIG.map((option) => {
                      const state = analysisStates[option.key] || { available: false, generating: false };
                      const style = ANALYSIS_CARD_STYLES[option.key];
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => onGenerateAnalysisOption?.(option.key)}
                          disabled={readOnly || state.available || state.generating}
                          className={`rounded-xl border px-2.5 py-3 text-left transition-colors hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70 ${style.cardClass}`}
                        >
                          <div className="flex min-h-[84px] flex-col justify-between gap-2">
                            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${style.badgeClass}`}>
                              {style.icon}
                            </span>
                            <p className="text-xs font-semibold leading-4 text-slate-900 dark:text-slate-50">{option.label}</p>
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                              state.available
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : state.generating
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {state.generating ? <Loader2 className="h-3 w-3 animate-spin" /> : state.available ? <CheckCircle className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/50 p-3" data-tour="content-output">
                <button
                  type="button"
                  onClick={() => toggleContentSection('contentTypes')}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Content Types</p>
                  {expandedContentSections.has('contentTypes') ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>
                {expandedContentSections.has('contentTypes') ? (
                  <div className="mt-3">
                    <InlineContentStudio
                      outputs={outputs}
                      generatingIds={generatingContentTypes}
                      deletingOutput={deletingOutput ?? null}
                      onGenerate={async (block) => { await onGenerateContentBlock?.(block); }}
                      onCopyOutput={async (output) => { onCopyOutput?.(output); }}
                      onDownloadOutput={(output) => { onDownloadOutput?.(output); }}
                      onDeleteOutput={async (outputId) => { await onDeleteOutput?.(outputId); }}
                      guidanceByType={contentGuidanceByType}
                      onGuidanceChange={onContentGuidanceChange}
                      readOnly={readOnly}
                      compact
                      title=""
                      description=""
                      showOutputs={false}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-3" data-tour="review-panel">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Segment Review</p>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Open review items</span>
                  <span className="text-slate-500 dark:text-slate-400">{openReviewCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Resolved this session</span>
                  <span className="text-slate-500 dark:text-slate-400">{resolvedReviewCount}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${openReviewCount > 0 ? Math.min(100, (resolvedReviewCount / openReviewCount) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className="p-2.5 space-y-2.5">
            <>
              <div className="relative rounded-xl border border-slate-200 bg-slate-100/50 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                {contentOptionsCollapsed ? (
                  availableAnalysisViews.length > 0 ? (
                    <div className="grid grid-cols-5 gap-1">
                      {availableAnalysisViews.map((view) => {
                        const Icon = view.icon;
                        return (
                          <button
                            key={view.id}
                            type="button"
                            onClick={() => {
                              setActiveContentSection('analysis');
                              setActiveAnalysisView(view.id);
                            }}
                            aria-label={view.label}
                            title={view.label}
                            className={cn(
                              'flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent text-slate-700 transition-colors dark:text-slate-200',
                              activeContentSection === 'analysis' && activeAnalysisView === view.id
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                            )}
                          >
                            <span className="flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </span>
                            {view.count ? (
                              <span className={cn(
                                'rounded-full px-1 py-0.5 text-[9px] font-semibold leading-none',
                                activeContentSection === 'analysis' && activeAnalysisView === view.id
                                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              )}>
                                {view.count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : availableOutputViews.length > 0 ? (
                    <div className="grid grid-cols-5 gap-1">
                      {availableOutputViews.map((view) => {
                        const Icon = view.icon;
                        return (
                          <button
                            key={view.id}
                            type="button"
                            onClick={() => {
                              setActiveContentSection('outputs');
                              setActiveOutputType(view.id);
                            }}
                            aria-label={view.label}
                            title={view.label}
                            className={cn(
                              'flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent text-slate-700 transition-colors dark:text-slate-200',
                              activeContentSection === 'outputs' && activeOutputType === view.id
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                            )}
                          >
                            <span className="flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </span>
                            {view.count ? (
                              <span className={cn(
                                'rounded-full px-1 py-0.5 text-[9px] font-semibold leading-none',
                                activeContentSection === 'outputs' && activeOutputType === view.id
                                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              )}>
                                {view.count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
                      Generate summaries, insights, chapters, takeaways, or quotes to populate this section.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    {availableAnalysisViews.length > 0 ? (
                      <div className="grid grid-cols-5 gap-1">
                        {availableAnalysisViews.map((view) => {
                          const Icon = view.icon;
                          return (
                            <button
                              key={view.id}
                              type="button"
                              onClick={() => {
                                setActiveContentSection('analysis');
                                setActiveAnalysisView(view.id);
                              }}
                              aria-label={view.label}
                              title={view.label}
                              className={cn(
                                'flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent text-slate-700 transition-colors dark:text-slate-200',
                                activeContentSection === 'analysis' && activeAnalysisView === view.id
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                              )}
                            >
                              <span className="flex items-center justify-center">
                                <Icon className="h-4 w-4" />
                              </span>
                              {view.count ? (
                                <span className={cn(
                                  'rounded-full px-1 py-0.5 text-[9px] font-semibold leading-none',
                                  activeContentSection === 'analysis' && activeAnalysisView === view.id
                                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                )}>
                                  {view.count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
                        Generate summaries, insights, chapters, takeaways, or quotes to populate this section.
                      </p>
                    )}

                    {availableOutputViews.length > 0 ? (
                      <>
                        {availableAnalysisViews.length > 0 ? (
                          <div className="border-t border-slate-200/80 dark:border-slate-800/80" />
                        ) : null}
                        <div className="grid grid-cols-5 gap-1">
                          {availableOutputViews.map((view) => {
                            const Icon = view.icon;
                            return (
                              <button
                                key={view.id}
                                type="button"
                                onClick={() => {
                                  setActiveContentSection('outputs');
                                  setActiveOutputType(view.id);
                                }}
                                aria-label={view.label}
                                title={view.label}
                                className={cn(
                                  'flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-transparent bg-transparent text-slate-700 transition-colors dark:text-slate-200',
                                  activeContentSection === 'outputs' && activeOutputType === view.id
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                                )}
                              >
                                <span className="flex items-center justify-center">
                                  <Icon className="h-4 w-4" />
                                </span>
                                {view.count ? (
                                  <span className={cn(
                                    'rounded-full px-1 py-0.5 text-[9px] font-semibold leading-none',
                                    activeContentSection === 'outputs' && activeOutputType === view.id
                                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                  )}>
                                    {view.count}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : availableAnalysisViews.length > 0 ? null : (
                      <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
                        Generate a content type from the Generate tab to populate this section.
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setContentOptionsCollapsed((prev) => !prev)}
                  className="absolute -bottom-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  title={contentOptionsCollapsed ? 'Expand content options' : 'Collapse content options'}
                  aria-label={contentOptionsCollapsed ? 'Expand content options' : 'Collapse content options'}
                >
                  {contentOptionsCollapsed ? (
                    <PanelBottomOpen className="h-4 w-4" />
                  ) : (
                    <PanelBottomClose className="h-4 w-4" />
                  )}
                </button>
              </div>
            </>
          </div>
        )}

        {/* Insights Content View */}
        {activeTab === 'content' && activeContentSection === 'analysis' && activeAnalysisView === 'insights' && (
          <div className="p-3 h-full" data-tour="insights-panel">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeAnalysisLabel}
            </p>
            {hasInsights ? (
              /* Display insights if they exist */
              <InsightsSidebar
                insights={insights}
                activeInsightId={activeInsightId ?? null}
                onInsightClick={onInsightClick || (() => {})}
                className="border-l-0"
                embedded
              />
            ) : insightsLoading ? (
              /* Loading state */
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="relative w-16 h-16 mb-4">
                  <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="28" stroke="#fde68a" strokeWidth="4" />
                    <circle cx="32" cy="32" r="28" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 176" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading insights...</p>
              </div>
            ) : insightsGenerating ? (
              /* Generating state — circular progress */
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="relative w-16 h-16 mb-4">
                  <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="28" stroke="#fde68a" strokeWidth="4" />
                    <circle cx="32" cy="32" r="28" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" strokeDasharray="120 176" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Generating insights</p>
                <p className="text-xs text-slate-500 mt-1">Analyzing your transcript...</p>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
                  <Lightbulb className="w-7 h-7 text-amber-500 dark:text-amber-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">Insights not ready yet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[220px]">
                  They will appear here automatically once processing finishes.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Review Detail Tab */}
        {activeTab === 'review' && (
          <div className="p-3 space-y-3" data-tour="review-panel">

            {/* AI touch-up controls */}
            {!readOnly && selectedCount > 0 && (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={onAiTouchup}
                  disabled={aiTouchupLoading || selectedCount === 0}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 disabled:cursor-not-allowed transition-colors"
                >
                  {aiTouchupLoading ? (
                    <><span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" /> Analyzing…</>
                  ) : (
                    <>✦ Suggest corrections</>
                  )}
                </button>
                {aiTouchupResult && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">{aiTouchupResult}</p>
                )}
              </div>
            )}

            {/* AI Touch-up preview */}
            {!readOnly && touchupPreview && (
              <div className="p-3 rounded-xl border border-violet-300 dark:border-violet-800/30 bg-violet-50 dark:bg-violet-900/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-900">
                    ✦ AI Corrections ({touchupPreview.filter(i => i.accepted).length}/{touchupPreview.length})
                  </span>
                  <button
                    onClick={onDismissPreview}
                    className="text-violet-400 hover:text-violet-400 p-0.5"
                    title="Dismiss AI corrections"
                    aria-label="Dismiss AI corrections"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {touchupPreview.map((item) => {
                    const oldSpk = (speakers as Record<string, any>)[item.oldSpeakerId];
                    const newSpk = (speakers as Record<string, any>)[item.newSpeakerId];
                    const oldName = getSpeakerDisplayName(oldSpk) || item.oldSpeakerId;
                    const newName = getSpeakerDisplayName(newSpk) || item.newSpeakerId;
                    return (
                      <div
                        key={item.index}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs transition-opacity ${
                          item.accepted ? 'bg-white dark:bg-slate-900 border-violet-300 dark:border-violet-800/30' : 'bg-slate-100/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.accepted}
                          onChange={() => onTogglePreviewItem?.(item.index)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 text-violet-600"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1 flex-wrap font-medium">
                            <span className="text-slate-500">#{item.index}</span>
                            <span className="text-red-500 line-through">{oldName}</span>
                            <span className="text-slate-500">→</span>
                            <span className="text-green-600 dark:text-green-400">{newName}</span>
                          </div>
                          {item.segmentText && (
                            <p className="text-slate-500 dark:text-slate-400 truncate">"{item.segmentText}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onApplyTouchup}
                    disabled={applyingTouchup || touchupPreview.every(i => !i.accepted)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 disabled:cursor-not-allowed"
                  >
                    {applyingTouchup ? (
                      <><span className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" /> Applying…</>
                    ) : (
                      `Apply ${touchupPreview.filter(i => i.accepted).length} change${touchupPreview.filter(i => i.accepted).length !== 1 ? 's' : ''}`
                    )}
                  </button>
                  <button
                    onClick={onDismissPreview}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Selected segment list */}
            {selectedCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Segments to review</p>
                {reviewItemsBySpeaker
                  .filter(({ items }) => items.some((item) => selectedSegments?.has(item.index)))
                  .map(({ speakerId, items }) => {
                    const speaker = (speakers as Record<string, any>)[speakerId];
                    const speakerName = getSpeakerDisplayName(speaker) || speakerId;
                    const groupedItems = items.filter((item) => selectedSegments?.has(item.index));

                    return (
                      <div key={speakerId} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{speakerName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {groupedItems.length} item{groupedItems.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        {groupedItems.map((item) => {
                          const idx = item.index;
                          const segment = segments[idx];
                          if (!segment) return null;

                          const segmentSpeakerId = segment.finalSpeakerId || segment.speakerId;
                          const segmentSpeaker = (speakers as Record<string, any>)[segmentSpeakerId];
                          const segmentSpeakerName = getSpeakerDisplayName(segmentSpeaker) || segmentSpeakerId;
                          const colorClasses = getSpeakerColor(segmentSpeakerId);
                          const colorParts = colorClasses.split(' ');
                          const textColor = colorParts.find((c: string) => c.startsWith('text-')) || 'text-slate-400';
                          const bgColor = colorParts.find((c: string) => c.startsWith('bg-')) || 'bg-slate-800/50';
                          const dotColor = bgColor.replace('-50', '-500').replace('-100', '-500');
                          const isUncertain = reviewSegmentIndexSet.has(idx);
                          const mins = Math.floor(segment.startTime / 60);
                          const secs = Math.floor(segment.startTime % 60);
                          const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;

                          return (
                            <div
                              key={idx}
                              className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800/30 transition-colors space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                                <button
                                  onClick={() => onScrollToSegment?.(idx)}
                                  className={`text-xs font-semibold ${textColor} hover:underline truncate`}
                                >
                                  {segmentSpeakerName}
                                </button>
                                <span className="ml-auto text-[11px] text-slate-500 font-mono flex-shrink-0">{timestamp}</span>
                                {isUncertain && (
                                  <span className="text-yellow-500 text-[11px]" title="Uncertain attribution">⚠️</span>
                                )}
                                <button
                                  onClick={() => onToggleSegmentSelection?.(idx)}
                                  title="Remove from review"
                                  className="flex-shrink-0 p-0.5 text-slate-500 hover:text-slate-400 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>

                              <p
                                onClick={() => onScrollToSegment?.(idx)}
                                className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 cursor-pointer hover:text-slate-900 dark:hover:text-slate-50"
                              >
                                {segment.text?.slice(0, 100)}
                                {(segment.text?.length ?? 0) > 100 ? '…' : ''}
                              </p>

                              <div className="flex items-center gap-1 flex-wrap">
                                {(item.reasons || []).length > 0 ? (
                                  (item.reasons || []).map((reason) => (
                                    <span
                                      key={`${idx}-${reason}`}
                                      className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-800/30 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                    >
                                      {formatReviewReason(reason)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                    Needs review
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  value={segmentSpeakerId}
                                  onChange={(e) => {
                                    if (e.target.value !== segmentSpeakerId) {
                                      onSegmentReassign?.(idx, e.target.value);
                                    }
                                  }}
                                  className="flex-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-blue-400 dark:focus:border-blue-300"
                                >
                                  {Object.entries(speakers).map(([speakerId, spk]) => (
                                    <option key={speakerId} value={speakerId}>
                                      {getSpeakerDisplayName(spk as any)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => onConfirmSegment?.(idx)}
                                  title="Confirm attribution"
                                  className="flex-shrink-0 p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-100 hover:text-green-700 dark:hover:text-green-300 transition-colors border border-green-200 dark:border-green-100"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mb-3">
                  <ListChecks className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">{openReviewCount === 0 ? 'No review needed' : 'No segments selected'}</p>
                <p className="text-xs text-slate-500 max-w-[200px]">
                  {openReviewCount === 0
                    ? 'Speaker assignment looks clean. Only outliers will appear here.'
                    : 'Review items are auto-selected here so you can confirm or reassign them quickly.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary Content View */}
        {activeTab === 'content' && activeContentSection === 'analysis' && activeAnalysisView === 'summary' && (
          <div className="p-4" data-tour="summary-panel">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeAnalysisLabel}
            </p>
            {summary ? (
              <div className="prose prose-sm max-w-none">
                {summary.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-purple-800/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Generating summary...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-purple-500 dark:text-purple-300" />
                </div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Summary not ready yet</h3>
                <p className="text-xs text-slate-500 max-w-[200px]">It will appear here automatically once processing finishes.</p>
              </div>
            )}
          </div>
        )}

        {/* Chapters Content View */}
        {activeTab === 'content' && activeContentSection === 'analysis' && activeAnalysisView === 'chapters' && (
          <div className="p-3" data-tour="chapters-panel">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeAnalysisLabel}
            </p>
            {chapters.length > 0 ? (
              <div className="space-y-2">
                {chapters.map((chapter, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                          {chapter.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDuration(chapter.start_time)} - {formatDuration(chapter.end_time)}
                          </span>
                        </div>
                        {chapter.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {chapter.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-indigo-800/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Detecting chapters...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">
                  <BookOpen className="w-7 h-7 text-indigo-500 dark:text-indigo-300" />
                </div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Chapters not ready yet</h3>
                <p className="text-xs text-slate-500 max-w-[200px]">They will appear here automatically once processing finishes.</p>
              </div>
            )}
          </div>
        )}

        {/* Takeaways Content View */}
        {activeTab === 'content' && activeContentSection === 'analysis' && activeAnalysisView === 'takeaways' && (
          <div className="p-3" data-tour="takeaways-panel">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeAnalysisLabel}
            </p>
            {takeaways.length > 0 ? (
              <div className="space-y-2">
                {takeaways.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-600 dark:text-slate-300">{item.takeaway}</p>
                        {item.timestamp !== undefined && (
                          <span className="inline-flex items-center mt-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDuration(item.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-green-800/30 border-t-green-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Extracting takeaways...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
                  <CheckCircle className="w-7 h-7 text-green-500 dark:text-green-300" />
                </div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Takeaways not ready yet</h3>
                <p className="text-xs text-slate-500 max-w-[200px]">They will appear here automatically once processing finishes.</p>
              </div>
            )}
          </div>
        )}

        {/* Quotes Content View */}
        {activeTab === 'content' && activeContentSection === 'analysis' && activeAnalysisView === 'quotes' && (
          <div className="p-3" data-tour="quotes-panel">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeAnalysisLabel}
            </p>
            {quotes.length > 0 ? (
              <div className="space-y-2">
                {quotes.map((quote, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <blockquote className="text-sm text-slate-600 dark:text-slate-300 italic border-l-2 border-amber-400 dark:border-amber-300 pl-3">
                      "{quote.quote}"
                    </blockquote>
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {quote.speaker && <span>— {quote.speaker}</span>}
                      {quote.timestamp !== undefined && (
                        <span className="inline-flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDuration(quote.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-amber-800/30 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Finding notable quotes...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-amber-500 dark:text-amber-300" />
                </div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Quotes not ready yet</h3>
                <p className="text-xs text-slate-500 max-w-[200px]">They will appear here automatically once processing finishes.</p>
              </div>
            )}
          </div>
        )}

        {/* Generated Output Content View */}
        {activeTab === 'content' && activeContentSection === 'outputs' && activeOutputType ? (
          <div className="p-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {activeOutputLabel}
            </p>
            <InlineContentStudio
              outputs={outputs}
              generatingIds={generatingContentTypes}
              deletingOutput={deletingOutput ?? null}
              onGenerate={async (block) => { await onGenerateContentBlock?.(block); }}
              onCopyOutput={async (output) => { onCopyOutput?.(output); }}
              onDownloadOutput={(output) => { onDownloadOutput?.(output); }}
              onDeleteOutput={async (outputId) => { await onDeleteOutput?.(outputId); }}
              guidanceByType={contentGuidanceByType}
              onGuidanceChange={onContentGuidanceChange}
              readOnly={readOnly}
              compact
              title=""
              description=""
              showGrid={false}
              contentTypeFilter={activeOutputType}
            />
          </div>
        ) : null}
      </div>

    </aside>
  );
}

export default ContextSidebar;
