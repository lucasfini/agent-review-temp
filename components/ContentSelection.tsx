"use client";

import { useState } from 'react';
import { 
  Check, 
  DollarSign, 
  Zap, 
  FileText, 
  Mail, 
  BookOpen, 
  Quote, 
  Sparkles, 
  ChevronDown, 
  Linkedin, 
  Instagram 
} from 'lucide-react';
import { CONTENT_TYPES, type CostEstimate, formatCost, formatTokens } from '@/lib/cost-estimation';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Step 1</p>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mt-1">Choose your content mix</h3>
          <p className="text-sm text-gray-600">
            Pick the deliverables you want AudioRepurpose to create from this episode.
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleSelectAll}
            disabled={isAllSelected}
            className="px-3 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            disabled={isNoneSelected}
            className="px-3 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CONTENT_TYPES.map((contentType) => {
          if (!contentType.enabled) return null;
          const isSelected = selectedTypes.includes(contentType.id);
          const IconComponent = CONTENT_ICONS[contentType.id as keyof typeof CONTENT_ICONS] || FileText;
          const currentKeywords = keywords[contentType.id] || '';
          const keywordCount = currentKeywords ? currentKeywords.trim().split(' ').filter(Boolean).length : 0;

          return (
            <div
              key={contentType.id}
              className={`relative rounded-xl p-4 transition-all ${
                isSelected
                  ? 'border border-blue-500 bg-blue-50/70 shadow-sm'
                  : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <button
                type="button"
                onClick={() => handleTypeToggle(contentType.id)}
                className="text-left w-full"
              >
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {contentType.name}
                      </p>
                      <p className="text-xs text-gray-500">{contentType.badge}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  <p className={`text-sm leading-relaxed ${isSelected ? 'text-blue-800' : 'text-gray-600'}`}>
                    {contentType.description}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-1 rounded-full ${
                      isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {contentType.count} piece{contentType.count > 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-500">≈ {getPerPieceCost(contentType.id, estimate)} each</span>
                  </div>
                </div>
              </div>
              </button>
              {isSelected && (
                <div className="mt-3 space-y-1">
                  <label className="text-xs font-medium text-gray-500">Keyword guidance (optional)</label>
                  <input
                    type="text"
                    value={currentKeywords}
                    onChange={(e) => handleKeywordInput(contentType.id, e.target.value)}
                    placeholder="Add up to 10 keywords"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    {keywordCount}/10 words used – influence tone, topics, or CTA.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cost Estimate */}
      {showEstimate && estimate && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Estimated Cost</p>
                <p className="text-xs text-gray-500">Model: {estimate.modelName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">{formatCost(estimate.totalCost)}</p>
              <p className="text-xs text-gray-500">
                {estimate.totalPieces} pieces • {formatTokens(estimate.totalTokens)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="mt-3 w-full flex items-center justify-between text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-white"
          >
            <span>{showBreakdown ? 'Hide' : 'Show'} cost details</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
          </button>

          {showBreakdown && (
            <div className="mt-3 space-y-2">
              {estimate.breakdown
                .filter(entry => entry.contentTypeId)
                .map(entry => (
                  <div key={entry.type} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{entry.type}</span>
                    <div className="flex items-center space-x-3">
                      <span className="text-gray-500">
                        {entry.pieces} piece{entry.pieces !== 1 ? 's' : ''}
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatCost(entry.cost)}
                      </span>
                    </div>
                  </div>
                ))}
              {estimate.totalCost > 1.25 && (
                <div className="mt-2 flex items-center space-x-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                  <Zap className="w-4 h-4" />
                  <span>High estimate — deselect a few deliverables to reduce spend.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No selection warning */}
      {isNoneSelected && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800">
            <FileText className="w-5 h-5" />
            <span className="font-medium">No content selected</span>
          </div>
          <p className="text-sm text-red-700 mt-1">
            Please select at least one content type to generate.
          </p>
        </div>
      )}
    </div>
  );
}
