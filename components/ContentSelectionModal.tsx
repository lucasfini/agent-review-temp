"use client";

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Minus, Plus, ChevronDown } from 'lucide-react';
import {
  FileText,
  Mail,
  BookOpen,
  Quote,
  Instagram
} from 'lucide-react';
import {
  CONTENT_TYPES,
  generateBlocksFromQuantities,
  type ContentBlock,
  type ContentCategory
} from '@/lib/content-types';
import { getCuratedThemes, DEFAULT_THEME_ID } from '@/lib/content-themes';
import { calculateCostEstimate, type CostEstimate, formatCost } from '@/lib/cost-estimation';

// Inline X (Twitter) icon
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M4 4h4l4 5 4-5h4l-6 7 6 9h-4l-4-5-4 5H4l6-9z" />
  </svg>
);

// Inline LinkedIn icon
const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const CONTENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  twitter_threads: XIcon,
  linkedin_posts: LinkedinIcon,
  instagram_content: Instagram,
  blog_post: BookOpen,
  newsletter: Mail,
  show_notes: FileText,
  quote_graphics: Quote
};

const CATEGORY_SECTIONS: Array<{
  id: ContentCategory;
  label: string;
}> = [
  { id: 'social', label: 'Social' },
  { id: 'longform', label: 'Long-form' },
  { id: 'support', label: 'Supporting' }
];

interface ContentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    blocks: ContentBlock[],
    estimate: CostEstimate,
    selectedModel?: { id: string; displayName?: string } | null
  ) => Promise<void>;
  projectId: string;
  transcriptionText: string;
  projectTitle?: string | null;
}

const DEFAULT_MODEL_ID = 'gpt-4o-mini';

type QuantityMap = Record<string, { count: number; theme: string }>;

export default function ContentSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  transcriptionText,
  projectTitle
}: ContentSelectionModalProps) {
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const curatedThemes = useMemo(() => getCuratedThemes(), []);

  // Initialize quantities when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial: QuantityMap = {};
      for (const ct of CONTENT_TYPES) {
        if (ct.enabled) {
          initial[ct.id] = { count: 0, theme: DEFAULT_THEME_ID };
        }
      }
      setQuantities(initial);
    }
  }, [isOpen, projectId]);

  const setCount = (typeId: string, delta: number) => {
    setQuantities(prev => {
      const ct = CONTENT_TYPES.find(t => t.id === typeId);
      if (!ct) return prev;
      const current = prev[typeId]?.count ?? 0;
      const max = ct.maxCount ?? ct.count;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [typeId]: { ...prev[typeId], count: next } };
    });
  };

  const setTheme = (typeId: string, themeId: string) => {
    setQuantities(prev => ({
      ...prev,
      [typeId]: { ...prev[typeId], count: prev[typeId]?.count ?? 0, theme: themeId }
    }));
  };

  // Derived totals
  const totalItems = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q.count, 0),
    [quantities]
  );

  const totalCost = useMemo(() => {
    let cost = 0;
    for (const [typeId, q] of Object.entries(quantities)) {
      if (q.count <= 0) continue;
      const ct = CONTENT_TYPES.find(t => t.id === typeId);
      if (!ct) continue;
      cost += (ct.estimatedCostUSD ?? 0) * q.count;
    }
    return Math.round(cost * 1000) / 1000;
  }, [quantities]);

  // Build CostEstimate for the onConfirm callback
  const estimate = useMemo((): CostEstimate | null => {
    if (totalItems === 0 || !transcriptionText) return null;

    const enabledTypeIds = Object.entries(quantities)
      .filter(([, q]) => q.count > 0)
      .map(([id]) => id);

    const base = calculateCostEstimate(enabledTypeIds, transcriptionText, {
      modelId: DEFAULT_MODEL_ID
    });

    return { ...base, totalCost };
  }, [quantities, totalItems, totalCost, transcriptionText]);

  const handleGenerate = async () => {
    if (totalItems === 0 || !estimate) return;

    setIsGenerating(true);
    try {
      const blocks = generateBlocksFromQuantities(quantities);
      await onConfirm(blocks, estimate, null);
      onClose();
    } catch (error) {
      console.error('Failed to start content generation:', error);
      alert('Failed to start content generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-6">
      <div className="relative w-full max-w-2xl bg-white rounded-lg border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Generate Content</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                {projectTitle || `Project ${projectId.slice(0, 8)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {CATEGORY_SECTIONS.map((section) => {
            const types = CONTENT_TYPES.filter(
              ct => ct.enabled && ct.category === section.id
            );
            if (!types.length) return null;

            return (
              <div key={section.id}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {section.label}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <div className="space-y-2">
                  {types.map((ct) => {
                    const IconComponent = CONTENT_ICONS[ct.id] || FileText;
                    const q = quantities[ct.id] ?? { count: 0, theme: DEFAULT_THEME_ID };
                    const max = ct.maxCount ?? ct.count;
                    const unitCost = ct.estimatedCostUSD ?? 0;

                    return (
                      <div
                        key={ct.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          q.count > 0
                            ? 'border-blue-200 bg-blue-50/40'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        {/* Icon */}
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 flex-shrink-0">
                          <IconComponent className="h-4 w-4" />
                        </div>

                        {/* Name + Description */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{ct.name}</p>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-1">{ct.description}</p>
                        </div>

                        {/* Theme selector */}
                        <div className="flex-shrink-0">
                          <div className="relative">
                            <select
                              value={q.theme}
                              onChange={(e) => setTheme(ct.id, e.target.value)}
                              className="appearance-none text-xs border border-gray-200 rounded-md pl-2 pr-6 py-1.5 bg-white text-gray-700 font-medium focus:border-blue-400 focus:ring-1 focus:ring-blue-400 cursor-pointer"
                            >
                              {curatedThemes.map(theme => (
                                <option key={theme.id} value={theme.id}>
                                  {theme.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        </div>

                        {/* Quantity stepper */}
                        <div className="flex items-center gap-0 flex-shrink-0">
                          <button
                            onClick={() => setCount(ct.id, -1)}
                            disabled={q.count <= 0}
                            className="h-7 w-7 flex items-center justify-center rounded-l-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <div className="h-7 w-8 flex items-center justify-center border-y border-gray-300 bg-white text-sm font-semibold text-gray-900 tabular-nums">
                            {q.count}
                          </div>
                          <button
                            onClick={() => setCount(ct.id, 1)}
                            disabled={q.count >= max}
                            className="h-7 w-7 flex items-center justify-center rounded-r-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Per-unit cost */}
                        <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0 tabular-nums">
                          ~{formatCost(unitCost)}ea
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-600 font-medium tabular-nums">
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
            {totalCost > 0 && <span className="ml-1">· ~{formatCost(totalCost)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || totalItems === 0}
              className="inline-flex items-center px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate
                  {totalCost > 0 && (
                    <span className="ml-1 opacity-90">(~{formatCost(totalCost)})</span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
