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
  Copy,
  Download,
  Trash2,
  Zap,
  Layers,
} from 'lucide-react';
import type { SpeakerSegment, SpeakerRole } from '@/lib/types';
import { SPEAKER_ROLE_LABELS, SPEAKER_ROLES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getSpeakerDisplayName, getSpeakerColor } from '@/lib/name-extraction';
import { InsightsSidebar, type Insight } from '@/components/insights';

type TabId = 'speakers' | 'insights' | 'takeaways' | 'summary' | 'chapters' | 'quotes' | 'review' | 'content';

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

  // AI-generated content (Premium tier)
  summary?: string;
  chapters?: Chapter[];
  takeaways?: Takeaway[];
  quotes?: Quote[];

  // Configuration
  tier?: 'basic' | 'pro' | 'premium';
  contentLoading?: boolean; // True when project is still processing (summary/chapters/etc. not ready yet)
  className?: string;

  // Mobile control
  isOpen?: boolean;
  onClose?: () => void;

  // Review tab — segment review workflow
  segments?: SpeakerSegment[];
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
  onGenerateContent?: () => void;

  /** When true, hides all write actions (demo mode) */
  readOnly?: boolean;
}

// Helper to format duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Output card helpers
function resolveOutputKind(output: Output): string {
  return output.metadata?.originalOutputType || output.type || '';
}

function getOutputPlatformMeta(output: Output): { letter: string; iconStyle: string } {
  const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
  if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread') || rawPlatform === 'x')
    return { letter: 'X', iconStyle: 'bg-slate-950 text-white border-slate-700' };
  if (rawPlatform.includes('linkedin'))
    return { letter: 'in', iconStyle: 'bg-blue-600 text-white border-blue-500' };
  if (rawPlatform.includes('instagram'))
    return { letter: 'IG', iconStyle: 'bg-gradient-to-br from-purple-600 to-pink-600 text-white border-purple-500' };
  if (rawPlatform.includes('blog'))
    return { letter: 'B', iconStyle: 'bg-orange-600 text-white border-orange-500' };
  if (rawPlatform.includes('newsletter') || rawPlatform.includes('email'))
    return { letter: '@', iconStyle: 'bg-green-600 text-white border-green-500' };
  if (rawPlatform.includes('show notes'))
    return { letter: '♪', iconStyle: 'bg-indigo-600 text-white border-indigo-500' };
  const kind = resolveOutputKind(output);
  if (kind === 'blog_post')        return { letter: 'B',  iconStyle: 'bg-orange-600 text-white border-orange-500' };
  if (kind === 'email_newsletter') return { letter: '@',  iconStyle: 'bg-green-600 text-white border-green-500' };
  if (kind === 'show_notes')       return { letter: '♪',  iconStyle: 'bg-indigo-600 text-white border-indigo-500' };
  if (kind === 'quote_graphic')    return { letter: '\u201c', iconStyle: 'bg-violet-600 text-white border-violet-500' };
  const displayName = output.metadata?.platform || output.platform || 'G';
  return { letter: displayName.charAt(0).toUpperCase(), iconStyle: 'bg-slate-700 text-white border-slate-600' };
}

function getOutputSubtitle(output: Output): string {
  const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
  if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread')) {
    const posts = output.content.split(/\n\n+/).filter(p => p.trim().length > 0);
    return `${posts.length} posts • 280 chars each`;
  }
  return `${output.content.length.toLocaleString()} characters`;
}

const KIND_LABELS: Record<string, string> = {
  twitter_thread:    'X Thread',
  linkedin_post:     'LinkedIn Post',
  instagram_caption: 'Instagram Post',
  blog_post:         'Blog Post',
  email_newsletter:  'Email Newsletter',
  show_notes:        'Show Notes',
  quote_graphic:     'Quote Graphic',
};

function getPlatformDisplayName(output: Output): string {
  if (output.metadata?.platform && output.metadata.platform !== 'General') {
    return output.metadata.platform;
  }
  if (output.metadata?.platform_label) {
    return output.metadata.platform_label;
  }
  const kind = resolveOutputKind(output);
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  switch (output.platform) {
    case 'twitter': return 'X';
    case 'linkedin': return 'LinkedIn';
    case 'instagram': return 'Instagram';
    case 'email': return 'Email';
    case 'blog': return 'Blog';
    case 'general': return 'General';
    default: return output.platform;
  }
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
  tier = 'basic',
  contentLoading = false,
  className,
  isOpen = true,
  onClose,
  segments = [],
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
  onGenerateContent,
  readOnly = false,
}: ContextSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('speakers');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['speakers']));
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());

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

  // Auto-select uncertain segments when the Review tab is opened with nothing selected
  useEffect(() => {
    if (activeTab === 'review' && selectedCount === 0 && hasUncertainSegments) {
      onSelectAllUncertain?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Available tabs — priority order: Review → Speakers → Content → Insights → Summary → Chapters → Takeaways → Quotes
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number }> = [
      // 1. Review (always)
      {
        id: 'review',
        label: 'Review',
        icon: <ListChecks className="w-4 h-4" />,
        count: selectedCount > 0 ? selectedCount : undefined,
      },
      // 2. Speakers (always)
      { id: 'speakers', label: 'Speakers', icon: <Users className="w-4 h-4" />, count: speakerList.length },
      // 3. Content (always)
      {
        id: 'content',
        label: 'Content',
        icon: <Layers className="w-4 h-4" />,
        count: outputs.length || undefined,
      },
    ];

    if (tier !== 'basic') {
      // 4. Insights
      tabs.push({
        id: 'insights',
        label: 'Insights',
        icon: insightsLoading || insightsGenerating
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <Lightbulb className="w-4 h-4" />,
        count: insights.length || undefined,
      });

      // 5. Summary
      const summaryLoading = !summary && contentLoading;
      tabs.push({
        id: 'summary',
        label: 'Summary',
        icon: summaryLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <Sparkles className="w-4 h-4" />,
      });
    }

    if (tier === 'premium') {
      // 6. Chapters
      const chaptersLoading = chapters.length === 0 && contentLoading;
      tabs.push({
        id: 'chapters',
        label: 'Chapters',
        icon: chaptersLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <BookOpen className="w-4 h-4" />,
        count: chapters.length || undefined,
      });

      // 7. Takeaways
      const takeawaysLoading = takeaways.length === 0 && contentLoading;
      tabs.push({
        id: 'takeaways',
        label: 'Takeaways',
        icon: takeawaysLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <CheckCircle className="w-4 h-4" />,
        count: takeaways.length || undefined,
      });

      // 8. Quotes
      const quotesLoading = quotes.length === 0 && contentLoading;
      tabs.push({
        id: 'quotes',
        label: 'Quotes',
        icon: quotesLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <MessageSquare className="w-4 h-4" />,
        count: quotes.length || undefined,
      });
    }

    return tabs;
  }, [speakerList.length, outputs.length, insights.length, summary, chapters.length, takeaways.length, quotes.length, tier, insightsLoading, insightsGenerating, contentLoading, selectedCount, hasUncertainSegments]);

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

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-slate-900 border-l border-slate-800',
        className
      )}
      data-tour="sidebar-panel"
      aria-hidden={!isOpen}
    >
      {/* Tab Navigation - Wrapping and centered */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-800/30">
        <div className="flex flex-wrap justify-center p-2 gap-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-tour={
                tab.id === 'review'
                  ? 'sidebar-tab-review'
                  : tab.id === 'speakers'
                  ? 'sidebar-tab-speakers'
                  : tab.id === 'content'
                  ? 'sidebar-tab-content'
                  : tab.id === 'insights'
                  ? 'sidebar-tab-insights'
                  : tab.id === 'summary'
                  ? 'sidebar-tab-summary'
                  : tab.id === 'chapters'
                  ? 'sidebar-tab-chapters'
                  : tab.id === 'takeaways'
                  ? 'sidebar-tab-takeaways'
                  : tab.id === 'quotes'
                  ? 'sidebar-tab-quotes'
                  : undefined
              }
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Speakers Tab */}
        {activeTab === 'speakers' && (
          <div className="p-4 space-y-3" data-tour="speakers-panel">
            {speakerList.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
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
                        ? 'bg-blue-900/20 border-blue-800/30 shadow-sm'
                        : 'bg-slate-800/30 border-transparent hover:bg-slate-800/50 hover:border-slate-700'
                    )}
                  >
                    {/* Color dot indicator */}
                    <button
                      onClick={() => onSpeakerClick?.(speaker.id)}
                      className={cn('w-3 h-3 rounded-full mt-1 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1', dotColor)}
                      title="Filter by speaker"
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
                            className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-600 rounded-md bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            disabled={isSaving}
                          />
                          <button
                            onClick={() => handleSaveEdit(speaker.id)}
                            disabled={isSaving || !editingName.trim()}
                            className="p-1 text-green-600 hover:text-green-300 disabled:opacity-50"
                            title="Save"
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
                            className="p-1 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        /* Display mode */
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn('font-semibold text-sm cursor-text hover:underline', activeSpeakerId === speaker.id ? 'text-blue-200' : textColor)}
                              onClick={() => handleStartEdit(speaker.id, speaker.displayName)}
                              title="Click to rename"
                            >
                              {speaker.displayName}
                            </span>
                            {onSpeakerRoleChange ? (
                              <div className="relative" data-role-dropdown>
                                <button
                                  onClick={() => setEditingRoleSpeakerId(speaker.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-300 cursor-pointer"
                                >
                                  {speaker.role ? (
                                    <>{getRoleIcon(speaker.role)} {SPEAKER_ROLE_LABELS[speaker.role as SpeakerRole] ?? speaker.role}</>
                                  ) : (
                                    <><Plus className="w-3 h-3" /> Role</>
                                  )}
                                </button>
                                {editingRoleSpeakerId === speaker.id && (
                                  <div className="absolute left-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                                    {SPEAKER_ROLES.map(role => (
                                      <button
                                        key={role}
                                        onClick={() => {
                                          onSpeakerRoleChange(speaker.id, role);
                                          setEditingRoleSpeakerId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-800/50 text-left text-slate-300"
                                      >
                                        {getRoleIcon(role)} {SPEAKER_ROLE_LABELS[role]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              speaker.role && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-700">
                                  {getRoleIcon(speaker.role)}
                                  {SPEAKER_ROLE_LABELS[speaker.role as SpeakerRole] ?? speaker.role}
                                </span>
                              )
                            )}
                            {projectId && (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(prev => prev === speaker.id ? null : speaker.id);
                                  }}
                                  className="p-1 text-slate-500 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="More actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {activeMenuId === speaker.id && (
                                  <div className="absolute right-0 mt-1 w-28 rounded-md border bg-slate-900 shadow-md z-10">
                                    {onSpeakerMerge && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuId(null);
                                          setMergeSourceId(speaker.id);
                                          setMergeTargetId('');
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800/50"
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
                                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-900/20"
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
                            <div className="mt-2 rounded-md border border-blue-100 bg-blue-900/20 p-2 text-[11px] text-blue-300 space-y-2">
                              <div>Merge into:</div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={mergeTargetId}
                                  onChange={(e) => setMergeTargetId(e.target.value)}
                                  className="text-[11px] border border-blue-800/30 rounded px-2 py-1 bg-slate-900 text-blue-300"
                                >
                                  <option value="">Select speaker</option>
                                  {speakerList
                                    .filter(s => s.id !== mergeSourceId)
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {getSpeakerDisplayName(s)}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  onClick={handleMerge}
                                  disabled={!mergeTargetId}
                                  className="px-2 py-1 rounded border border-blue-800/30 bg-blue-600 text-white disabled:opacity-50"
                                >
                                  Merge
                                </button>
                                <button
                                  onClick={() => {
                                    setMergeSourceId(null);
                                    setMergeTargetId('');
                                  }}
                                  className="px-2 py-1 rounded border border-transparent text-blue-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {deleteSpeakerId === speaker.id && (
                            <div className="mt-2 rounded-md border border-red-800/30 bg-red-900/20 p-2 text-[11px] text-red-300 space-y-2">
                              <div className="font-medium">Delete this speaker?</div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={deleteTargetId}
                                  onChange={(e) => setDeleteTargetId(e.target.value)}
                                  className="flex-1 text-[11px] border border-red-800/30 rounded px-2 py-1 bg-slate-900 text-slate-100"
                                >
                                  <option value="">Reassign segments to…</option>
                                  {speakerList
                                    .filter(s => s.id !== deleteSpeakerId)
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {getSpeakerDisplayName(s)}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  onClick={() => handleDeleteSubmit(speaker.id, 'reassign')}
                                  disabled={!deleteTargetId || savingSpeaker === speaker.id}
                                  className="px-2 py-1 rounded border border-red-800/30 bg-slate-900 text-red-400 disabled:opacity-50 whitespace-nowrap"
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
            {projectId && (
              <div className="pt-1">
                {!addSpeakerExpanded ? (
                  <button
                    onClick={() => setAddSpeakerExpanded(true)}
                    className="w-full text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 justify-center py-1.5 rounded-lg border border-dashed border-slate-700 hover:border-slate-600 transition-colors"
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
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-600 rounded-md bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="flex-1 text-xs border border-slate-600 rounded-md px-2 py-1 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className="p-3">
            {outputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-blue-900/20 flex items-center justify-center mb-4">
                  <Layers className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-50 mb-1">No content yet</h3>
                <p className="text-xs text-slate-400 max-w-[220px] mb-4">
                  Generate content from your transcript to see it here.
                </p>
                {onGenerateContent && (
                  <button
                    onClick={onGenerateContent}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-semibold bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Generate Content
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {outputs.map((output, index) => {
                  const platformMeta = getOutputPlatformMeta(output);
                  const toneLabel = output.metadata?.ui_metadata?.theme_label
                    || output.metadata?.theme_label
                    || output.metadata?.theme
                    || output.metadata?.tone;
                  const isExpanded = expandedOutputs.has(output.id);
                  return (
                    <div
                      key={output.id}
                      {...(index === 0 ? { 'data-tour': 'content-output' } : {})}
                      data-expanded={isExpanded ? 'true' : 'false'}
                      onClick={() => {
                        setExpandedOutputs((prev) => {
                          const next = new Set(prev);
                          if (next.has(output.id)) {
                            next.delete(output.id);
                          } else {
                            next.add(output.id);
                          }
                          return next;
                        });
                      }}
                      className="bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 rounded-2xl p-4 flex flex-col gap-3 transition-colors group cursor-pointer"
                    >
                      {/* Top Row */}
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 ${platformMeta.iconStyle}`}>
                          {platformMeta.letter}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 font-medium text-sm leading-snug truncate">{getPlatformDisplayName(output)}</p>
                          <p className="text-slate-500 text-xs">{getOutputSubtitle(output)}</p>
                        </div>
                        <span className="flex-shrink-0 border border-emerald-500/30 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full">
                          Ready
                        </span>
                      </div>

                      {/* Content Snippet */}
                      <p className={`text-white text-sm italic leading-relaxed whitespace-pre-wrap ${isExpanded ? 'line-clamp-none' : 'line-clamp-2'}`}>
                        {output.content}
                      </p>

                      {/* Tone / style */}
                      {toneLabel && (
                        <div className="flex justify-end">
                          <span className="text-[10px] uppercase tracking-wide text-slate-300 border border-slate-700/70 bg-slate-800/60 px-2 py-0.5 rounded-full">
                            {toneLabel}
                          </span>
                        </div>
                      )}

                      {/* Action Row (hover) */}
                      <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity border-t border-slate-700/50 pt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyOutput?.(output);
                          }}
                          className="p-1.5 text-slate-500 hover:text-violet-400 hover:bg-violet-900/20 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownloadOutput?.(output);
                          }}
                          className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {!readOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOutput?.(output.id);
                            }}
                            disabled={deletingOutput === output.id}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingOutput === output.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="p-3 h-full" data-tour="insights-panel">
            {hasInsights ? (
              /* Display insights if they exist */
              <InsightsSidebar
                insights={insights}
                activeInsightId={activeInsightId ?? null}
                onInsightClick={onInsightClick || (() => {})}
                className="border-l-0"
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
                <p className="text-sm font-medium text-slate-300">Loading insights...</p>
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
                <p className="text-sm font-medium text-slate-300">Generating insights</p>
                <p className="text-xs text-slate-500 mt-1">Analyzing your transcript...</p>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-900/20 flex items-center justify-center mb-4">
                  <Lightbulb className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-50 mb-1">No insights yet</h3>
                <p className="text-xs text-slate-400 max-w-[220px]">
                  Please check back soon, your insights will be generated shortly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Review Tab */}
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
                  <p className="text-xs text-violet-400 font-medium">{aiTouchupResult}</p>
                )}
              </div>
            )}

            {/* AI Touch-up preview */}
            {!readOnly && touchupPreview && (
              <div className="p-3 rounded-xl border border-violet-800/30 bg-violet-900/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-900">
                    ✦ AI Corrections ({touchupPreview.filter(i => i.accepted).length}/{touchupPreview.length})
                  </span>
                  <button
                    onClick={onDismissPreview}
                    className="text-violet-400 hover:text-violet-400 p-0.5"
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
                          item.accepted ? 'bg-slate-900 border-violet-800/30' : 'bg-slate-800/50 border-slate-700 opacity-50'
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
                            <span className="text-green-400">{newName}</span>
                          </div>
                          {item.segmentText && (
                            <p className="text-slate-400 truncate">"{item.segmentText}"</p>
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
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Selected segment list */}
            {selectedCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Segments to review</p>
                {segments
                  .map((segment, idx) => ({ segment, idx }))
                  .filter(({ idx }) => selectedSegments?.has(idx))
                  .map(({ segment, idx }) => {
                    const segmentSpeakerId = segment.finalSpeakerId || segment.speakerId;
                    const speaker = (speakers as Record<string, any>)[segmentSpeakerId];
                    const speakerName = getSpeakerDisplayName(speaker) || segmentSpeakerId;
                    const colorClasses = getSpeakerColor(segmentSpeakerId);
                    const colorParts = colorClasses.split(' ');
                    const textColor = colorParts.find((c: string) => c.startsWith('text-')) || 'text-slate-400';
                    const bgColor = colorParts.find((c: string) => c.startsWith('bg-')) || 'bg-slate-800/50';
                    const dotColor = bgColor.replace('-50', '-500').replace('-100', '-500');
                    const isUncertain = segment.status === 'uncertain' && (
                      segment.confidenceReason === 'acoustic_only' ||
                      segment.confidenceReason === 'transition_short' ||
                      segment.confidenceReason === 'role_mismatch'
                    );
                    const mins = Math.floor(segment.startTime / 60);
                    const secs = Math.floor(segment.startTime % 60);
                    const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;

                    return (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 hover:border-blue-800/30 transition-colors space-y-2"
                      >
                        {/* Speaker + timestamp row */}
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <button
                            onClick={() => onScrollToSegment?.(idx)}
                            className={`text-xs font-semibold ${textColor} hover:underline truncate`}
                          >
                            {speakerName}
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
                        {/* Text snippet */}
                        <p
                          onClick={() => onScrollToSegment?.(idx)}
                          className="text-xs text-slate-400 leading-relaxed line-clamp-2 cursor-pointer hover:text-slate-50"
                        >
                          {segment.text?.slice(0, 100)}{(segment.text?.length ?? 0) > 100 ? '…' : ''}
                        </p>
                        {/* Action row */}
                        <div className="flex items-center gap-2">
                          <select
                            value={segmentSpeakerId}
                            onChange={(e) => {
                              if (e.target.value !== segmentSpeakerId) {
                                onSegmentReassign?.(idx, e.target.value);
                              }
                            }}
                            className="flex-1 text-[11px] border border-slate-700 rounded-md px-2 py-1 bg-slate-900 text-slate-300 focus:outline-none focus:border-blue-300"
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
                            className="flex-shrink-0 p-1.5 rounded-lg bg-green-900/20 text-green-600 hover:bg-green-100 hover:text-green-300 transition-colors border border-green-100"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                  <ListChecks className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-300 mb-1">No segments selected</p>
                <p className="text-xs text-slate-500 max-w-[200px]">
                  Check the boxes next to segments in the transcript to review them here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div className="p-4" data-tour="summary-panel">
            {summary ? (
              <div className="prose prose-sm max-w-none">
                {summary.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} className="text-sm text-slate-300 leading-relaxed mb-3">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-purple-800/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-400">Generating summary...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-purple-900/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-purple-300" />
                </div>
                <p className="text-sm text-slate-400">Please check back soon, your summary will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Chapters Tab */}
        {activeTab === 'chapters' && (
          <div className="p-3" data-tour="chapters-panel">
            {chapters.length > 0 ? (
              <div className="space-y-2">
                {chapters.map((chapter, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-indigo-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-400 text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-50 truncate">
                          {chapter.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-400">
                            {formatDuration(chapter.start_time)} - {formatDuration(chapter.end_time)}
                          </span>
                        </div>
                        {chapter.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
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
                <p className="text-sm text-slate-400">Detecting chapters...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-900/20 flex items-center justify-center mb-4">
                  <BookOpen className="w-7 h-7 text-indigo-300" />
                </div>
                <p className="text-sm text-slate-400">Please check back soon, your chapters will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Takeaways Tab */}
        {activeTab === 'takeaways' && (
          <div className="p-3" data-tour="takeaways-panel">
            {takeaways.length > 0 ? (
              <div className="space-y-2">
                {takeaways.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900 rounded-lg border border-slate-800"
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-300">{item.takeaway}</p>
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
                <p className="text-sm text-slate-400">Extracting takeaways...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-900/20 flex items-center justify-center mb-4">
                  <CheckCircle className="w-7 h-7 text-green-300" />
                </div>
                <p className="text-sm text-slate-400">Please check back soon, your takeaways will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Quotes Tab */}
        {activeTab === 'quotes' && (
          <div className="p-3" data-tour="quotes-panel">
            {quotes.length > 0 ? (
              <div className="space-y-2">
                {quotes.map((quote, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900 rounded-lg border border-slate-800"
                  >
                    <blockquote className="text-sm text-slate-300 italic border-l-2 border-amber-300 pl-3">
                      "{quote.quote}"
                    </blockquote>
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
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
                <p className="text-sm text-slate-400">Finding notable quotes...</p>
                <p className="text-xs text-slate-500 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-900/20 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-amber-300" />
                </div>
                <p className="text-sm text-slate-400">Please check back soon, your quotes will be generated shortly.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default ContextSidebar;
