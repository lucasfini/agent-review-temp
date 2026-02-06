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
  Loader2
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

  // Available tabs based on content and tier
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number }> = [
      { id: 'speakers', label: 'Speakers', icon: <Users className="w-4 h-4" />, count: speakerList.length },
    ];

    if (insights.length > 0 || tier !== 'basic') {
      tabs.push({ id: 'insights', label: 'Insights', icon: <Lightbulb className="w-4 h-4" />, count: insights.length });
    }

    if ((tier === 'pro' || tier === 'premium') && summary) {
      tabs.push({ id: 'summary', label: 'Summary', icon: <Sparkles className="w-4 h-4" /> });
    }

    if (tier === 'premium') {
      if (chapters.length > 0) {
        tabs.push({ id: 'chapters', label: 'Chapters', icon: <BookOpen className="w-4 h-4" />, count: chapters.length });
      }
      if (takeaways.length > 0) {
        tabs.push({ id: 'takeaways', label: 'Takeaways', icon: <CheckCircle className="w-4 h-4" />, count: takeaways.length });
      }
      if (quotes.length > 0) {
        tabs.push({ id: 'quotes', label: 'Quotes', icon: <MessageSquare className="w-4 h-4" />, count: quotes.length });
      }
    }

    return tabs;
  }, [speakerList.length, insights.length, summary, chapters.length, takeaways.length, quotes.length, tier]);

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

  if (!isOpen) return null;

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-white border-l border-gray-200',
        className
      )}
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
                            {/* Edit button - shows on hover */}
                            {projectId && onSpeakerRename && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(speaker.id, speaker.displayName);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit speaker name"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {speaker.segmentCount && (
                            <p className="text-xs text-gray-400 mt-1">
                              {speaker.segmentCount} segment{speaker.segmentCount !== 1 ? 's' : ''}
                            </p>
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
                <div className="w-8 h-8 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Loading insights...</p>
              </div>
            ) : insightsGenerating ? (
              /* Generating state */
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <Sparkles className="w-8 h-8 text-amber-400 animate-pulse mb-4" />
                <p className="text-sm text-gray-500">Generating insights...</p>
                <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
              </div>
            ) : (
              /* Empty state - show generate button */
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                  <Lightbulb className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">No insights yet</h3>
                <p className="text-xs text-gray-500 mb-4 max-w-[200px]">
                  Generate AI-powered insights from your transcript
                </p>
                {onGenerateInsights && (
                  <button
                    onClick={onGenerateInsights}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Insights
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && summary && (
          <div className="p-4">
            <div className="prose prose-sm max-w-none">
              {summary.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-3">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Chapters Tab */}
        {activeTab === 'chapters' && chapters.length > 0 && (
          <div className="p-3 space-y-2">
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
        )}

        {/* Takeaways Tab */}
        {activeTab === 'takeaways' && takeaways.length > 0 && (
          <div className="p-3 space-y-2">
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
        )}

        {/* Quotes Tab */}
        {activeTab === 'quotes' && quotes.length > 0 && (
          <div className="p-3 space-y-2">
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
        )}
      </div>
    </aside>
  );
}

export default ContextSidebar;
