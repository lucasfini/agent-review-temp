"use client";

import { useState } from 'react';
import {
  Check,
  FileText,
  Mail,
  BookOpen,
  Quote,
  ChevronDown,
  Linkedin,
  Instagram
} from 'lucide-react';
import { CONTENT_TYPES, type CostEstimate, formatCost, formatTokens } from '@/lib/cost-estimation';
import type { ContentType } from '@/lib/content-types';

interface ContentSelectionProps {
  selectedTypes: string[];
  onSelectedTypesChange: (selected: string[]) => void;
  estimate: CostEstimate | null;
  showEstimate?: boolean;
  keywords: Record<string, string>;
  onKeywordChange: (typeId: string, value: string) => void;
}

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M4 4h4l4 5 4-5h4l-6 7 6 9h-4l-4-5-4 5H4l6-9z" />
  </svg>
);

const CONTENT_ICONS = {
  twitter_threads: XIcon,
  linkedin_posts: Linkedin,
  instagram_content: Instagram,
  blog_post: BookOpen,
  newsletter: Mail,
  show_notes: FileText,
  quote_graphics: Quote
} as const;

const ENABLED_TYPE_IDS = CONTENT_TYPES.filter(type => type.enabled).map(type => type.id);

const CATEGORY_SECTIONS: Array<{
  id: ContentType['category'];
  label: string;
  description: string;
}> = [
  {
    id: 'social',
    label: 'Social Channels',
    description: 'Platform-ready threads, posts, and carousels'
  },
  {
    id: 'longform',
    label: 'Long-form & Email',
    description: 'High-depth formats that anchor your campaign'
  },
  {
    id: 'support',
    label: 'Supporting Assets',
    description: 'Artifacts that round out each content drop'
  }
];

const getPerPieceCost = (typeId: string, estimate: CostEstimate | null): string => {
  if (!estimate) return '—';
  const entry = estimate.breakdown.find(item => item.contentTypeId === typeId);
  if (!entry) return '—';
  const perPiece = entry.pieces > 0 ? entry.cost / entry.pieces : entry.cost;
  return formatCost(perPiece);
};

export default function ContentSelection({
  selectedTypes,
  onSelectedTypesChange,
  estimate,
  showEstimate = true,
  keywords,
  onKeywordChange
}: ContentSelectionProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const handleTypeToggle = (typeId: string) => {
    onSelectedTypesChange(
      selectedTypes.includes(typeId)
        ? selectedTypes.filter(id => id !== typeId)
        : [...selectedTypes, typeId]
    );
  };

  const handleSelectAll = () => onSelectedTypesChange(ENABLED_TYPE_IDS);
  const handleDeselectAll = () => onSelectedTypesChange([]);

  const isAllSelected = ENABLED_TYPE_IDS.every(id => selectedTypes.includes(id));
  const isNoneSelected = selectedTypes.length === 0;

  const handleKeywordInput = (typeId: string, value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trimStart();
    if (!normalized.trim()) {
      onKeywordChange(typeId, '');
      return;
    }
    const words = normalized.trim().split(' ');
    const limitedValue = words.length > 10 ? words.slice(0, 10).join(' ') : normalized;
    onKeywordChange(typeId, limitedValue);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Content Types</h3>
          <p className="text-xs text-gray-500">
            {selectedTypes.length} of {ENABLED_TYPE_IDS.length} selected
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleSelectAll}
            disabled={isAllSelected}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            All
          </button>
          <button
            onClick={handleDeselectAll}
            disabled={isNoneSelected}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content Groups */}
      <div className="space-y-3">
        {CATEGORY_SECTIONS.map((section) => {
          const types = CONTENT_TYPES.filter(
            (contentType) => contentType.enabled && contentType.category === section.id
          );
          if (!types.length) return null;

          const selectedInSection = types.filter(type => selectedTypes.includes(type.id)).length;

          return (
            <section
              key={section.id}
              className="border border-gray-200 rounded-lg bg-white"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                <div>
                  <p className="text-xs font-semibold text-gray-900">{section.label}</p>
                  <p className="text-[11px] text-gray-500">{section.description}</p>
                </div>
                <span className="text-[11px] font-medium text-gray-500">
                  {selectedInSection}/{types.length} selected
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {types.map((contentType) => {
                  const isSelected = selectedTypes.includes(contentType.id);
                  const IconComponent =
                    CONTENT_ICONS[contentType.id as keyof typeof CONTENT_ICONS] || FileText;
                  const currentKeywords = keywords[contentType.id] || '';
                  const keywordCount = currentKeywords
                    ? currentKeywords
                        .trim()
                        .split(' ')
                        .filter(Boolean).length
                    : 0;
                  const keywordInputId = `keywords-${contentType.id}`;

                  return (
                    <div
                      key={contentType.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTypeToggle(contentType.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleTypeToggle(contentType.id);
                        }
                      }}
                      className={`px-3 py-3 outline-none transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70'
                          : 'hover:bg-gray-50 focus-visible:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-1 h-4 w-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 text-transparent'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-500 flex-shrink-0">
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{contentType.name}</p>
                            {contentType.badge && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">
                                {contentType.badge}
                              </span>
                            )}
                            {contentType.tier && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">
                                {contentType.tier}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {contentType.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            <span>{contentType.count} pieces</span>
                            <span className="inline-block h-1 w-1 rounded-full bg-gray-300" />
                            <span>{getPerPieceCost(contentType.id, estimate)} each</span>
                            <span className="inline-block h-1 w-1 rounded-full bg-gray-300" />
                            <span>{formatTokens(contentType.estimatedTokens ?? 0)}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-600">
                          <p className="font-semibold text-gray-900">{getPerPieceCost(contentType.id, estimate)}</p>
                          <p className="text-[11px] text-gray-500">{contentType.count} outputs</p>
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          className="mt-3 pl-14 space-y-1 text-xs text-gray-600"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <label htmlFor={keywordInputId} className="text-[11px] font-medium text-gray-500">
                            Focus keywords (optional)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id={keywordInputId}
                              type="text"
                              value={currentKeywords}
                              onChange={(e) => handleKeywordInput(contentType.id, e.target.value)}
                              placeholder="Add up to 10 short terms"
                              className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                              {keywordCount}/10
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Cost Breakdown */}
      {showEstimate && estimate && estimate.breakdown.filter(entry => entry.contentTypeId).length > 0 && (
        <div className="border border-gray-300 rounded p-2 bg-white">
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full flex items-center justify-between text-xs font-medium text-gray-700"
          >
            <span>Cost Breakdown</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
          </button>

          {showBreakdown && (
            <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
              {estimate.breakdown
                .filter(entry => entry.contentTypeId)
                .map(entry => (
                  <div key={entry.type} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{entry.type}</span>
                    <span className="font-medium text-gray-900">
                      {formatCost(entry.cost)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* No selection warning */}
      {isNoneSelected && (
        <div className="bg-red-50 border border-red-300 rounded p-2">
          <p className="text-xs text-red-900">
            Select at least one content type
          </p>
        </div>
      )}
    </div>
  );
}
