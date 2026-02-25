'use client';

import React, { useState, useMemo } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSpeakerDisplayName, getSpeakerColor } from '@/lib/name-extraction';
import { InsightsSidebar, type Insight } from '@/components/insights';

type TabId = 'speakers' | 'insights' | 'takeaways' | 'summary' | 'chapters' | 'quotes';

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
}

// Helper to format duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Role icon mapping
function getRoleIcon(role?: string) {
  switch (role?.toLowerCase()) {
    case 'host':
      return <Mic className="w-3 h-3" />;
    case 'guest':
      return <User className="w-3 h-3" />;
    case 'co-host':
      return <Radio className="w-3 h-3" />;
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
}: ContextSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('speakers');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['speakers']));

  // Speaker editing state
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingSpeaker, setSavingSpeaker] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

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

  // Available tabs based on tier — always show tier-appropriate tabs, even when data is loading
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number }> = [
      { id: 'speakers', label: 'Speakers', icon: <Users className="w-4 h-4" />, count: speakerList.length },
    ];

    if (tier !== 'basic') {
      tabs.push({
        id: 'insights',
        label: 'Insights',
        icon: insightsLoading || insightsGenerating
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <Lightbulb className="w-4 h-4" />,
        count: insights.length || undefined,
      });

      // Summary available for pro and premium
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
      const chaptersLoading = chapters.length === 0 && contentLoading;
      tabs.push({
        id: 'chapters',
        label: 'Chapters',
        icon: chaptersLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <BookOpen className="w-4 h-4" />,
        count: chapters.length || undefined,
      });

      const takeawaysLoading = takeaways.length === 0 && contentLoading;
      tabs.push({
        id: 'takeaways',
        label: 'Takeaways',
        icon: takeawaysLoading
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <CheckCircle className="w-4 h-4" />,
        count: takeaways.length || undefined,
      });

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
  }, [speakerList.length, insights.length, summary, chapters.length, takeaways.length, quotes.length, tier, insightsLoading, insightsGenerating, contentLoading]);

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
        'flex flex-col h-full bg-white border-l border-gray-200',
        className
      )}
      aria-hidden={!isOpen}
    >
      {/* Tab Navigation - Wrapping and centered */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50/50">
        <div className="flex flex-wrap justify-center p-2 gap-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-200 text-gray-600'
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
          <div className="p-4 space-y-3">
            {speakerList.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No speakers detected yet</p>
              </div>
            ) : (
              speakerList.map((speaker) => {
                const colorParts = speaker.colorClasses.split(' ');
                const textColor = colorParts.find(c => c.startsWith('text-')) || 'text-gray-600';
                const bgColor = colorParts.find(c => c.startsWith('bg-')) || 'bg-gray-50';
                const dotColor = bgColor.replace('-50', '-500');
                const isEditing = editingSpeakerId === speaker.id;
                const isSaving = savingSpeaker === speaker.id;

                return (
                  <div
                    key={speaker.id}
                    className={cn(
                      'group w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all border',
                      activeSpeakerId === speaker.id
                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                        : 'bg-gray-50/50 border-transparent hover:bg-gray-50 hover:border-gray-200'
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
                            className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            disabled={isSaving}
                          />
                          <button
                            onClick={() => handleSaveEdit(speaker.id)}
                            disabled={isSaving || !editingName.trim()}
                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
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
                            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
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
                              className={cn('font-semibold text-sm cursor-pointer', activeSpeakerId === speaker.id ? 'text-blue-900' : textColor)}
                              onClick={() => onSpeakerClick?.(speaker.id)}
                            >
                              {speaker.displayName}
                            </span>
                            {speaker.role && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-gray-500 border border-gray-200">
                                {getRoleIcon(speaker.role)}
                                {speaker.role}
                              </span>
                            )}
                            {projectId && (onSpeakerRename || onSpeakerMerge) && (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(prev => prev === speaker.id ? null : speaker.id);
                                  }}
                                  className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="More actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {activeMenuId === speaker.id && (
                                  <div className="absolute right-0 mt-1 w-28 rounded-md border bg-white shadow-md z-10">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        handleStartEdit(speaker.id, speaker.displayName);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                                    >
                                      Rename
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        setMergeSourceId(speaker.id);
                                        setMergeTargetId('');
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                                    >
                                      Merge
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {speaker.segmentCount && (
                            <p className="text-xs text-gray-400 mt-1">
                              {speaker.segmentCount} segment{speaker.segmentCount !== 1 ? 's' : ''}
                            </p>
                          )}
                          {mergeSourceId === speaker.id && (
                            <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-800 space-y-2">
                              <div>Merge into:</div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={mergeTargetId}
                                  onChange={(e) => setMergeTargetId(e.target.value)}
                                  className="text-[11px] border border-blue-200 rounded px-2 py-1 bg-white text-blue-800"
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
                                  className="px-2 py-1 rounded border border-blue-200 bg-blue-600 text-white disabled:opacity-50"
                                >
                                  Merge
                                </button>
                                <button
                                  onClick={() => {
                                    setMergeSourceId(null);
                                    setMergeTargetId('');
                                  }}
                                  className="px-2 py-1 rounded border border-transparent text-blue-700"
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
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="h-full">
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
                <p className="text-sm font-medium text-gray-700">Loading insights...</p>
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
                <p className="text-sm font-medium text-gray-700">Generating insights</p>
                <p className="text-xs text-gray-400 mt-1">Analyzing your transcript...</p>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                  <Lightbulb className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">No insights yet</h3>
                <p className="text-xs text-gray-500 max-w-[220px]">
                  Please check back soon, your insights will be generated shortly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div className="p-4">
            {summary ? (
              <div className="prose prose-sm max-w-none">
                {summary.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-3">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : contentLoading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Generating summary...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-purple-300" />
                </div>
                <p className="text-sm text-gray-500">Please check back soon, your summary will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Chapters Tab */}
        {activeTab === 'chapters' && (
          <div className="p-3">
            {chapters.length > 0 ? (
              <div className="space-y-2">
                {chapters.map((chapter, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-gray-100 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate">
                          {chapter.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {formatDuration(chapter.start_time)} - {formatDuration(chapter.end_time)}
                          </span>
                        </div>
                        {chapter.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
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
                <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Detecting chapters...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                  <BookOpen className="w-7 h-7 text-indigo-300" />
                </div>
                <p className="text-sm text-gray-500">Please check back soon, your chapters will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Takeaways Tab */}
        {activeTab === 'takeaways' && (
          <div className="p-3">
            {takeaways.length > 0 ? (
              <div className="space-y-2">
                {takeaways.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-gray-100"
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{item.takeaway}</p>
                        {item.timestamp !== undefined && (
                          <span className="inline-flex items-center mt-1 text-xs text-gray-400">
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
                <div className="w-8 h-8 border-2 border-green-200 border-t-green-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Extracting takeaways...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <CheckCircle className="w-7 h-7 text-green-300" />
                </div>
                <p className="text-sm text-gray-500">Please check back soon, your takeaways will be generated shortly.</p>
              </div>
            )}
          </div>
        )}

        {/* Quotes Tab */}
        {activeTab === 'quotes' && (
          <div className="p-3">
            {quotes.length > 0 ? (
              <div className="space-y-2">
                {quotes.map((quote, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-gray-100"
                  >
                    <blockquote className="text-sm text-gray-700 italic border-l-2 border-amber-300 pl-3">
                      "{quote.quote}"
                    </blockquote>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
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
                <div className="w-8 h-8 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Finding notable quotes...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-amber-300" />
                </div>
                <p className="text-sm text-gray-500">Please check back soon, your quotes will be generated shortly.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default ContextSidebar;
