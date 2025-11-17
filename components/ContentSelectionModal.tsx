"use client";

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Zap, DollarSign, Sparkles, ShieldCheck, ChevronDown } from 'lucide-react';
import ContentSelection from './ContentSelection';
import ModelSelector from './ModelSelector';
import { calculateCostEstimate, CONTENT_TYPES, type CostEstimate, formatCost, formatTokens } from '@/lib/cost-estimation';
import { useModelSelection } from '@/lib/models/use-model-selection';
import type { ModelSpec } from '@/lib/models/config';

interface ContentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    selectedTypes: string[],
    estimate: CostEstimate,
    selectedModel?: ModelSpec | null,
    keywords?: Record<string, string>
  ) => Promise<void>;
  projectId: string;
  transcriptionText: string;
  projectTitle?: string | null;
}

const DEFAULT_MODEL_ID = 'gpt-4o';
const DEFAULT_SELECTION = CONTENT_TYPES.filter(type => type.enabled).map(type => type.id);

export default function ContentSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  transcriptionText,
  projectTitle
}: ContentSelectionModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(DEFAULT_SELECTION);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [contentKeywords, setContentKeywords] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setSelectedTypes(DEFAULT_SELECTION);
      setShowCostDetails(false);
      setContentKeywords({});
    }
  }, [isOpen, projectId]);

  const modelSelection = useModelSelection({
    transcriptionText,
    selectedContentTypes: selectedTypes,
    defaultModelId: DEFAULT_MODEL_ID
  });

  const estimate = useMemo(() => {
    if (!selectedTypes.length || !transcriptionText) {
      return null;
    }
    return calculateCostEstimate(selectedTypes, transcriptionText, {
      modelId: modelSelection.selectedModel?.id,
      tokenEstimate: modelSelection.tokenEstimate
    });
  }, [
    selectedTypes,
    transcriptionText,
    modelSelection.selectedModel?.id,
    modelSelection.tokenEstimate
  ]);

  const handleGenerate = async () => {
    if (!selectedTypes.length) {
      alert('Please select at least one content type.');
      return;
    }

    if (!estimate) {
      alert('Unable to estimate cost. Please try again.');
      return;
    }

    setIsGenerating(true);
    try {
      const keywordPayload = selectedTypes.reduce<Record<string, string>>((acc, typeId) => {
        const value = contentKeywords[typeId]?.trim();
        if (value) acc[typeId] = value;
        return acc;
      }, {});

      await onConfirm(selectedTypes, estimate, modelSelection.selectedModel, keywordPayload);
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
      <div className="relative w-full max-w-4xl bg-white rounded-lg border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
        <button
          onClick={onClose}
          disabled={isGenerating}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Header */}
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Generate Content
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {projectTitle || `Project ${projectId.slice(0, 8)}`}
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
            <div className="space-y-3">
              <ContentSelection
                selectedTypes={selectedTypes}
                onSelectedTypesChange={setSelectedTypes}
                estimate={estimate}
                keywords={contentKeywords}
                onKeywordChange={(typeId, value) =>
                  setContentKeywords(prev => ({ ...prev, [typeId]: value }))
                }
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

              <div className="border border-gray-300 rounded p-3 bg-white">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Cost Estimate</h3>
                {estimate ? (
                  <>
                    <div className="mb-2">
                      <div className="text-xl font-semibold text-gray-900">{formatCost(estimate.totalCost)}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {estimate.totalPieces} pieces · {formatTokens(estimate.totalTokens)}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{estimate.modelName}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCostDetails(!showCostDetails)}
                      className="w-full flex items-center justify-between text-xs text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                    >
                      <span>{showCostDetails ? 'Hide' : 'Show'} details</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCostDetails ? 'rotate-180' : ''}`} />
                    </button>
                    {showCostDetails && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1 text-xs">
                        <div className="space-y-1">
                          {estimate.breakdown.map(entry => (
                            <div key={entry.type} className="flex items-center justify-between text-gray-600">
                              <span>{entry.type}</span>
                              <span className="font-medium text-gray-900">{formatCost(entry.cost)}</span>
                            </div>
                          ))}
                        </div>
                        {modelSelection.tokenEstimate && (
                          <div className="pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-0.5">
                            <div>Total: {formatTokens(modelSelection.tokenEstimate.totalTokens)}</div>
                            <div>Input: {formatTokens(modelSelection.tokenEstimate.totalInputTokens)}</div>
                            <div>Output: {formatTokens(modelSelection.tokenEstimate.totalOutputTokens)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">Select content types</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            {estimate ? `${estimate.totalPieces} pieces • ${formatCost(estimate.totalCost)}` : 'Select content types'}
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
              disabled={isGenerating || !selectedTypes.length}
              className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Generating
                </>
              ) : (
                <>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
