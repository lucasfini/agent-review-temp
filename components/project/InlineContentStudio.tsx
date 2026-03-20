"use client";

import { useEffect, useMemo, useState, type SVGProps } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Copy, Download, Loader2, Pencil, Sparkles, Trash2, X, Facebook, Instagram, Youtube, Mail, FileText, Quote, Newspaper, Mic } from 'lucide-react';
import { CONTENT_TYPES, type ContentBlock } from '@/lib/content-types';
import { DEFAULT_THEME_ID, getCuratedThemes } from '@/lib/content-themes';

type Output = {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  metadata?: any;
};

type ThemeMap = Record<string, string>;

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

function getThemeIdForOutput(output?: Output): string {
  const raw = output?.metadata?.themeId || output?.metadata?.theme_id || output?.metadata?.theme;
  return typeof raw === 'string' && raw.trim() ? raw : DEFAULT_THEME_ID;
}

const XIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M4 4h4l4 5 4-5h4l-6 7 6 9h-4l-4-5-4 5H4l6-9z" />
  </svg>
);

const LinkedinIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const TikTokIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.35h-3.2v12.4a2.89 2.89 0 1 1-2-2.75V8.72a6.13 6.13 0 1 0 5.2 6.02V8.45a8.06 8.06 0 0 0 4.77 1.57V6.69Z" />
  </svg>
);

const CONTENT_LOGOS = {
  twitter: XIcon,
  linkedin: LinkedinIcon,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: TikTokIcon,
  podcast: Mic,
  showNotes: FileText,
  blog: Newspaper,
  newsletter: Mail,
  quote: Quote,
} as const;

function getLaunchPageLogoKey(contentTypeId: string): keyof typeof CONTENT_LOGOS {
  switch (contentTypeId) {
    case 'twitter_threads':
      return 'twitter';
    case 'linkedin_posts':
      return 'linkedin';
    case 'facebook_post':
      return 'facebook';
    case 'instagram_content':
      return 'instagram';
    case 'youtube_description':
      return 'youtube';
    case 'short_form_video_script':
      return 'tiktok';
    case 'podcast_episode_description':
      return 'podcast';
    case 'show_notes':
      return 'showNotes';
    case 'blog_post':
      return 'blog';
    case 'newsletter':
      return 'newsletter';
    case 'quote_graphics':
      return 'quote';
    default:
      return 'showNotes';
  }
}

function getCardTheme(platform: string) {
  switch (platform) {
    case 'twitter':
      return {
        badge: 'X',
        badgeClass: 'bg-slate-900 text-white border-slate-700',
        cardClass: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70',
      };
    case 'linkedin':
      return {
        badge: 'in',
        badgeClass: 'bg-blue-600 text-white border-blue-500',
        cardClass: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20',
      };
    case 'instagram':
      return {
        badge: 'IG',
        badgeClass: 'bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white border-fuchsia-400',
        cardClass: 'border-pink-200 bg-pink-50 dark:border-pink-900/40 dark:bg-pink-950/20',
      };
    case 'facebook':
      return {
        badge: 'f',
        badgeClass: 'bg-blue-700 text-white border-blue-600',
        cardClass: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20',
      };
    case 'youtube':
      return {
        badge: 'YT',
        badgeClass: 'bg-red-600 text-white border-red-500',
        cardClass: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20',
      };
    case 'email':
      return {
        badge: '@',
        badgeClass: 'bg-orange-500 text-white border-orange-400',
        cardClass: 'border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20',
      };
    case 'blog':
      return {
        badge: 'B',
        badgeClass: 'bg-emerald-600 text-white border-emerald-500',
        cardClass: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
      };
    default:
      return {
        badge: '•',
        badgeClass: 'bg-violet-600 text-white border-violet-500',
        cardClass: 'border-violet-200 bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/20',
      };
  }
}

function formatLengthGuidance(contentType: (typeof CONTENT_TYPES)[number]): string | null {
  if (!contentType.limits) return null;

  const { min, max, unit } = contentType.limits;
  const label = unit === 'words' ? 'words' : 'characters';

  if (min === max) {
    return `Target length: ${min.toLocaleString()} ${label}`;
  }

  return `Target length: ${min.toLocaleString()}-${max.toLocaleString()} ${label}`;
}

function formatUseCaseGuidance(contentType: (typeof CONTENT_TYPES)[number]): string {
  switch (contentType.id) {
    case 'twitter_threads':
      return 'Best for turning one idea into a fast, scrollable thread.';
    case 'linkedin_posts':
      return 'Best for a more professional, insight-driven audience.';
    case 'instagram_content':
      return 'Best for carousel-style storytelling with a clear takeaway.';
    case 'facebook_post':
      return 'Best for conversational posts that invite comments.';
    case 'blog_post':
      return 'Best for a deeper written piece you can publish on your site.';
    case 'newsletter':
      return 'Best for email updates with a clear hook and call to action.';
    case 'show_notes':
      return 'Best for episode pages, timestamps, and listener context.';
    case 'youtube_description':
      return 'Best for discoverability, context, and links under a video.';
    case 'podcast_episode_description':
      return 'Best for the short description shown in podcast apps.';
    case 'short_form_video_script':
      return 'Best for punchy short-form videos with a quick hook.';
    case 'quote_graphics':
      return 'Best for short, memorable pull-quotes you can turn into visuals.';
    default:
      return 'Adjust the style before generating this content type.';
  }
}

type Props = {
  outputs: Output[];
  generatingIds: Set<string>;
  deletingOutput: string | null;
  onGenerate: (block: ContentBlock) => Promise<void>;
  onCopyOutput: (output: Output) => Promise<void> | void;
  onDownloadOutput: (output: Output) => void;
  onDeleteOutput: (outputId: string) => Promise<void> | void;
  compact?: boolean;
  title?: string;
  description?: string;
  showGrid?: boolean;
  showOutputs?: boolean;
  contentTypeFilter?: string | null;
};

export default function InlineContentStudio({
  outputs,
  generatingIds,
  deletingOutput,
  onGenerate,
  onCopyOutput,
  onDownloadOutput,
  onDeleteOutput,
  compact = false,
  title = 'Content Studio',
  description = 'Generate any content type on demand. Use the pencil icon to set the style before you run it.',
  showGrid = true,
  showOutputs = true,
  contentTypeFilter = null,
}: Props) {
  const themes = useMemo(() => getCuratedThemes(), []);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [themeByType, setThemeByType] = useState<ThemeMap>({});
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const activeThemeContentType = useMemo(
    () => CONTENT_TYPES.find((contentType) => contentType.id === editingThemeId) || null,
    [editingThemeId]
  );

  const latestOutputsByType = useMemo(() => {
    const map = new Map<string, Output>();
    for (const output of outputs) {
      const contentTypeId = getContentTypeIdForOutput(output);
      if (!contentTypeId || map.has(contentTypeId)) continue;
      map.set(contentTypeId, output);
    }
    return map;
  }, [outputs]);

  useEffect(() => {
    setThemeByType((prev) => {
      const next = { ...prev };
      for (const contentType of CONTENT_TYPES) {
        if (next[contentType.id]) continue;
        next[contentType.id] = getThemeIdForOutput(latestOutputsByType.get(contentType.id));
      }
      return next;
    });
  }, [latestOutputsByType]);

  const renderedOutputs = useMemo(
    () =>
      CONTENT_TYPES
        .map((contentType) => ({
          contentType,
          output: latestOutputsByType.get(contentType.id),
        }))
        .filter((entry) => entry.output)
        .filter((entry) => !contentTypeFilter || entry.contentType.id === contentTypeFilter),
    [contentTypeFilter, latestOutputsByType]
  );

  const outputsByType = useMemo(() => {
    const map = new Map<string, Output[]>();

    for (const output of outputs) {
      const contentTypeId = getContentTypeIdForOutput(output);
      if (!contentTypeId) continue;
      if (contentTypeFilter && contentTypeId !== contentTypeFilter) continue;
      const existing = map.get(contentTypeId) || [];
      existing.push(output);
      map.set(contentTypeId, existing);
    }

    for (const [contentTypeId, items] of map.entries()) {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      map.set(contentTypeId, items);
    }

    return map;
  }, [contentTypeFilter, outputs]);

  return (
    <section className={compact ? '' : 'border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40'}>
      <div className={compact ? '' : 'px-4 py-4'}>
        {title || description ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              {title ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {title}
                </div>
              ) : null}
              {description ? (
                <p className={title ? 'mt-1 text-sm text-slate-500 dark:text-slate-400' : 'text-sm text-slate-500 dark:text-slate-400'}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {showGrid ? (
          <div className={`mt-4 grid gap-3 ${compact ? 'grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
            {CONTENT_TYPES.map((contentType) => {
            const output = latestOutputsByType.get(contentType.id);
            const selectedThemeId = themeByType[contentType.id] || DEFAULT_THEME_ID;
            const themeName = themes.find((theme) => theme.id === selectedThemeId)?.name || 'Professional';
            const isGenerating = generatingIds.has(contentType.id);
            const cardTheme = getCardTheme(contentType.platformType || contentType.platform);
            const LaunchLogo = CONTENT_LOGOS[getLaunchPageLogoKey(contentType.id)];

              return (
                <div
                key={contentType.id}
                onClick={() =>
                  onGenerate({
                    id: `${contentType.id}_1`,
                    contentTypeId: contentType.id,
                    blockNumber: 1,
                    name: contentType.name,
                    enabled: true,
                    theme: selectedThemeId,
                  })
                }
                role="button"
                tabIndex={isGenerating ? -1 : 0}
                onKeyDown={(event) => {
                  if (isGenerating) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onGenerate({
                      id: `${contentType.id}_1`,
                      contentTypeId: contentType.id,
                      blockNumber: 1,
                      name: contentType.name,
                      enabled: true,
                      theme: selectedThemeId,
                    });
                  }
                }}
                className={`rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${isGenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${compact ? 'min-h-[88px]' : 'bg-white dark:bg-slate-900'} ${cardTheme.cardClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border text-[11px] font-bold ${cardTheme.badgeClass}`}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LaunchLogo className="h-4 w-4" />}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingThemeId((prev) => (prev === contentType.id ? null : contentType.id));
                    }}
                    className="rounded-lg border border-white/70 bg-white/80 p-1.5 text-slate-500 transition-colors hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:text-slate-100"
                    aria-label={`Edit ${contentType.name} style`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3">
                  <p className="line-clamp-2 text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-50">{contentType.name}</p>
                </div>

                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{themeName}</p>
              </div>
              );
            })}
          </div>
        ) : null}

        {activeThemeContentType ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" onClick={() => setEditingThemeId(null)}>
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Select Style</p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                    {activeThemeContentType.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingThemeId(null)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  aria-label="Close style picker"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {activeThemeContentType.description}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {formatUseCaseGuidance(activeThemeContentType)}
                </p>
                {formatLengthGuidance(activeThemeContentType) ? (
                  <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {formatLengthGuidance(activeThemeContentType)}
                  </p>
                ) : null}
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Tone
                </label>
                <select
                  value={themeByType[activeThemeContentType.id] || DEFAULT_THEME_ID}
                  onChange={(event) =>
                    setThemeByType((prev) => ({ ...prev, [activeThemeContentType.id]: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditingThemeId(null)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showOutputs ? (
          <div className="mt-6 space-y-4">
            {renderedOutputs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Generated content will appear here after you run a content type above.
              </div>
            ) : (
              renderedOutputs.map(({ contentType }) => {
                const outputHistory = outputsByType.get(contentType.id) || [];
                if (outputHistory.length === 0) return null;

                return (
                  <div
                    key={contentType.id}
                    className="space-y-3"
                  >
                    {outputHistory.map((output, index) => {
                      const themeName =
                        output.metadata?.ui_metadata?.theme_label ||
                        output.metadata?.theme_label ||
                        output.metadata?.theme ||
                        'Professional';

                      return (
                        <article
                          key={output.id}
                          className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOutputs((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(output.id)) {
                                    next.delete(output.id);
                                  } else {
                                    next.add(output.id);
                                  }
                                  return next;
                                })
                              }
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                                {contentType.name}{outputHistory.length > 1 ? ` ${index + 1}` : ''}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {themeName} · {new Date(output.created_at).toLocaleString()}
                              </p>
                            </button>
                            <div className="flex items-center gap-1">
                              {expandedOutputs.has(output.id) ? (
                                <ChevronUp className="h-4 w-4 text-slate-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-500" />
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCopyOutput(output);
                                }}
                                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                aria-label={`Copy ${contentType.name}`}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDownloadOutput(output);
                                }}
                                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                aria-label={`Download ${contentType.name}`}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteOutput(output.id);
                                }}
                                disabled={deletingOutput === output.id}
                                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 disabled:opacity-60"
                                aria-label={`Delete ${contentType.name}`}
                              >
                                {deletingOutput === output.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                          {expandedOutputs.has(output.id) ? (
                            <div className="px-4 py-4">
                              <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
                                {output.content}
                              </pre>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
