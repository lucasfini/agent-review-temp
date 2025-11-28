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
  Instagram,
  Minus
} from 'lucide-react';
import { CONTENT_TYPES } from '@/lib/content-types';
import type { ContentType, ContentBlock } from '@/lib/content-types';
import { CONTENT_THEMES, getThemeCategories, getThemesByCategory, DEFAULT_THEME_ID } from '@/lib/content-themes';

interface ContentSelectionProps {
  blocks: ContentBlock[];
  onBlocksChange: (blocks: ContentBlock[]) => void;
  estimatedCost: number;
  showEstimate?: boolean;
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

export default function ContentSelection({
  blocks,
  onBlocksChange,
  estimatedCost,
  showEstimate = true
}: ContentSelectionProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(CONTENT_TYPES.map(ct => ct.id)));

  const toggleExpanded = (typeId: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(typeId)) {
      newExpanded.delete(typeId);
    } else {
      newExpanded.add(typeId);
    }
    setExpandedTypes(newExpanded);
  };

  const handleBlockToggle = (blockId: string) => {
    onBlocksChange(
      blocks.map(block =>
        block.id === blockId
          ? { ...block, enabled: !block.enabled }
          : block
      )
    );
  };

  const handleThemeChange = (blockId: string, themeId: string) => {
    onBlocksChange(
      blocks.map(block =>
        block.id === blockId
          ? { ...block, theme: themeId }
          : block
      )
    );
  };

  const handleSelectAllType = (contentTypeId: string) => {
    const typeBlocks = blocks.filter(b => b.contentTypeId === contentTypeId);
    const allEnabled = typeBlocks.every(b => b.enabled);

    onBlocksChange(
      blocks.map(block =>
        block.contentTypeId === contentTypeId
          ? { ...block, enabled: !allEnabled }
          : block
      )
    );
  };

  const getTypeSelectionState = (contentTypeId: string): 'all' | 'some' | 'none' => {
    const typeBlocks = blocks.filter(b => b.contentTypeId === contentTypeId);
    const enabledCount = typeBlocks.filter(b => b.enabled).length;

    if (enabledCount === 0) return 'none';
    if (enabledCount === typeBlocks.length) return 'all';
    return 'some';
  };

  const handleSelectAll = () => {
    onBlocksChange(blocks.map(block => ({ ...block, enabled: true })));
  };

  const handleDeselectAll = () => {
    onBlocksChange(blocks.map(block => ({ ...block, enabled: false })));
  };

  const enabledCount = blocks.filter(b => b.enabled).length;
  const isAllSelected = enabledCount === blocks.length;
  const isNoneSelected = enabledCount === 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Content Blocks</h3>
          <p className="text-xs text-gray-500">
            {enabledCount} of {blocks.length} blocks selected
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

          const sectionBlocks = blocks.filter(b =>
            types.some(t => t.id === b.contentTypeId)
          );
          const selectedInSection = sectionBlocks.filter(b => b.enabled).length;

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
                  {selectedInSection}/{sectionBlocks.length} selected
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {types.map((contentType) => {
                  const IconComponent =
                    CONTENT_ICONS[contentType.id as keyof typeof CONTENT_ICONS] || FileText;
                  const typeBlocks = blocks.filter(b => b.contentTypeId === contentType.id);
                  const selectionState = getTypeSelectionState(contentType.id);
                  const isExpanded = expandedTypes.has(contentType.id);

                  return (
                    <div key={contentType.id} className="bg-white">
                      {/* Content Type Header */}
                      <div className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          {/* Select All Checkbox for this type */}
                          <button
                            onClick={() => handleSelectAllType(contentType.id)}
                            className={`mt-1 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              selectionState === 'all'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : selectionState === 'some'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300 text-transparent hover:border-gray-400'
                            }`}
                          >
                            {selectionState === 'all' && <Check className="h-3 w-3" />}
                            {selectionState === 'some' && <Minus className="h-3 w-3" />}
                          </button>

                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-500 flex-shrink-0">
                            <IconComponent className="h-4 w-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <p className="text-sm font-medium text-gray-900">{contentType.name}</p>
                              {contentType.badge && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">
                                  {contentType.badge}
                                </span>
                              )}
                              <span className="text-[11px] text-gray-500">
                                ({typeBlocks.length} {typeBlocks.length === 1 ? 'piece' : 'pieces'})
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">
                              {contentType.description}
                            </p>
                          </div>

                          {/* Expand/Collapse Button */}
                          <button
                            onClick={() => toggleExpanded(contentType.id)}
                            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Individual Blocks */}
                      {isExpanded && (
                        <div className="px-3 pb-2 space-y-2">
                          {typeBlocks.map((block) => {
                            const theme = CONTENT_THEMES.find(t => t.id === block.theme);

                            return (
                              <div
                                key={block.id}
                                className={`flex items-center gap-3 p-2 rounded border transition-all ${
                                  block.enabled
                                    ? 'bg-blue-50/50 border-blue-200'
                                    : 'bg-gray-50 border-gray-200'
                                }`}
                              >
                                {/* Block Checkbox */}
                                <button
                                  onClick={() => handleBlockToggle(block.id)}
                                  className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                    block.enabled
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-gray-300 text-transparent hover:border-gray-400'
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                </button>

                                {/* Block Name */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900">
                                    {block.name}
                                  </p>
                                </div>

                                {/* Theme Selector */}
                                <div className="w-48 flex-shrink-0">
                                  <select
                                    value={block.theme}
                                    onChange={(e) => handleThemeChange(block.id, e.target.value)}
                                    disabled={!block.enabled}
                                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  >
                                    {getThemeCategories().map(category => (
                                      <optgroup key={category} label={category}>
                                        {getThemesByCategory(category).map(theme => (
                                          <option key={theme.id} value={theme.id}>
                                            {theme.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                  {block.enabled && theme && (
                                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                                      {theme.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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

      {/* Cost Display */}
      {showEstimate && (
        <div className="border border-gray-300 rounded p-3 bg-white">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Estimated Cost</span>
            <span className="font-semibold text-gray-900">
              ${estimatedCost.toFixed(4)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {enabledCount} {enabledCount === 1 ? 'block' : 'blocks'} selected
          </p>
        </div>
      )}

      {/* No selection warning */}
      {isNoneSelected && (
        <div className="bg-red-50 border border-red-300 rounded p-2">
          <p className="text-xs text-red-900">
            Select at least one content block to generate
          </p>
        </div>
      )}
    </div>
  );
}
