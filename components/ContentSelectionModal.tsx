"use client";

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Zap, DollarSign, Sparkles, ShieldCheck, ChevronDown } from 'lucide-react';
import ContentSelection from './ContentSelection';
import ModelSelector from './ModelSelector';
import { calculateCostEstimate, CONTENT_TYPES, type CostEstimate, formatCost, formatTokens } from '@/lib/cost-estimation';
import { useModelSelection } from '@/lib/models/use-model-selection';
import type { ModelSpec } from '@/lib/models/config';
import { generateContentBlocks, calculateBlocksCost, type ContentBlock } from '@/lib/content-types';
import { DEFAULT_THEME_ID } from '@/lib/content-themes';

interface ContentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    blocks: ContentBlock[],
    estimate: CostEstimate,
    selectedModel?: ModelSpec | null
  ) => Promise<void>;
  projectId: string;
  transcriptionText: string;
  projectTitle?: string | null;
}

const DEFAULT_MODEL_ID = 'gpt-4o';

export default function ContentSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  transcriptionText,
  projectTitle
}: ContentSelectionModalProps) {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);

  // Initialize blocks when modal opens
  useEffect(() => {
    if (isOpen) {
      setBlocks(generateContentBlocks(DEFAULT_THEME_ID));
      setShowCostDetails(false);
    }
  }, [isOpen, projectId]);

  // Get enabled content type IDs for model selection
  const enabledContentTypeIds = useMemo(() => {
    const typeIds = new Set(
      blocks.filter(b => b.enabled).map(b => b.contentTypeId)
    );
    return Array.from(typeIds);
  }, [blocks]);

  const modelSelection = useModelSelection({
    transcriptionText,
    selectedContentTypes: enabledContentTypeIds,
    defaultModelId: DEFAULT_MODEL_ID
  });

  // Calculate cost estimate based on enabled blocks
  const estimate = useMemo(() => {
    if (!blocks.some(b => b.enabled) || !transcriptionText) {
      return null;
    }

    // Use existing cost estimation but adjust for individual blocks
    const estimate = calculateCostEstimate(enabledContentTypeIds, transcriptionText, {
      modelId: modelSelection.selectedModel?.id,
      tokenEstimate: modelSelection.tokenEstimate
    });

    // Adjust total cost based on actual enabled blocks
    if (estimate) {
      const blockCost = calculateBlocksCost(blocks);
      return {
        ...estimate,
        totalCost: blockCost
      };
    }

    return estimate;
  }, [
    blocks,
    enabledContentTypeIds,
    transcriptionText,
    modelSelection.selectedModel?.id,
    modelSelection.tokenEstimate
  ]);

  const handleGenerate = async () => {
    const enabledBlocks = blocks.filter(b => b.enabled);

    if (!enabledBlocks.length) {
      alert('Please select at least one content block.');
      return;
    }

    if (!estimate) {
      alert('Unable to estimate cost. Please try again.');
      return;
    }

    setIsGenerating(true);
    try {
      await onConfirm(enabledBlocks, estimate, modelSelection.selectedModel);
      onClose();
    } catch (error) {
      console.error('Failed to start content generation:', error);
      alert('Failed to start content generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const enabledCount = blocks.filter(b => b.enabled).length;

  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-6">
      <div className="relative w-full max-w-6xl bg-white rounded-lg border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
        <button
          onClick={onClose}
          disabled={isGenerating}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Header */}
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Generate Content
            </h2>
            <p className="text-xs text-gray-600 mt-0.5 truncate max-w-xl">
              {projectTitle || `Project ${projectId.slice(0, 8)}`}
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
            <div className="space-y-3">
              <ContentSelection
                blocks={blocks}
                onBlocksChange={setBlocks}
                estimatedCost={estimate?.totalCost || 0}
                showEstimate={false}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-3">
              <div className="border border-gray-300 rounded p-3 bg-white">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">AI Model</h3>
                <ModelSelector
                  selectedModel={modelSelection.selectedModel}
                  availableModels={modelSelection.availableModels}
                  compatibleModels={modelSelection.compatibleModels}
                  recommendedModels={modelSelection.recommendedModels}
                  onSelectModel={modelSelection.selectModel}
                  getModelCompatibility={modelSelection.getModelCompatibility}
                  getModelCost={modelSelection.getModelCost}
                  isCalculating={modelSelection.isCalculating}
                  tokenEstimate={modelSelection.tokenEstimate}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between sticky bottom-0 z-10">
          <div className="text-xs text-gray-600 font-medium">
            {enabledCount} of {blocks.length} selected
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
              disabled={isGenerating || !enabledCount}
              className="inline-flex items-center px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Content
                  {estimate && estimate.totalCost > 0 && (
                    <span className="ml-1 opacity-90">
                      (~{formatCost(estimate.totalCost)})
                    </span>
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
