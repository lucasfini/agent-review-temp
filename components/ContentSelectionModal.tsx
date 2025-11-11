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

const DEFAULT_MODEL_ID = 'gpt-4-turbo';
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
    <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-center justify-center px-4 py-6">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-100 max-h-[90vh] flex flex-col overflow-hidden">
        <button
          onClick={onClose}
          disabled={isGenerating}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Header */}
          <header className="space-y-1">
            <div className="flex items-center space-x-2 text-blue-600">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">Generate Content</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {projectTitle || 'Ready to create new assets?'}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Pick the deliverables and AI model for project {projectId.slice(0, 8)}.
            </p>
          </header>

          <div className="grid gap-5 lg:grid-cols-[1.6fr,1fr]">
            <div className="space-y-5">
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
            <div className="space-y-4">
              <div className="border border-gray-100 rounded-xl p-3 shadow-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  <p className="text-xs font-semibold uppercase text-indigo-500">Step 2 · AI Model</p>
                </div>
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

              <div className="border border-gray-100 rounded-xl p-3 shadow-sm space-y-3">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <p className="text-xs font-semibold uppercase text-green-600">Cost Snapshot</p>
                </div>
                {estimate ? (
                  <>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{formatCost(estimate.totalCost)}</p>
                      <p className="text-sm text-gray-500">
                        {estimate.totalPieces} pieces · {formatTokens(estimate.totalTokens)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Using {estimate.modelName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCostDetails(!showCostDetails)}
                      className="w-full flex items-center justify-between text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                    >
                      <span>{showCostDetails ? 'Hide' : 'Show'} breakdown & tokens</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showCostDetails ? 'rotate-180' : ''}`} />
                    </button>
                    {showCostDetails && (
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="space-y-1">
                          {estimate.breakdown.map(entry => (
                            <div key={entry.type} className="flex items-center justify-between">
                              <span>{entry.type}</span>
                              <span className="font-medium text-gray-900">{formatCost(entry.cost)}</span>
                            </div>
                          ))}
                        </div>
                        {modelSelection.tokenEstimate && (
                          <div className="pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                            <div>Total tokens: {formatTokens(modelSelection.tokenEstimate.totalTokens)}</div>
                            <div>Input: {formatTokens(modelSelection.tokenEstimate.totalInputTokens)}</div>
                            <div>Output: {formatTokens(modelSelection.tokenEstimate.totalOutputTokens)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Add at least one content type to estimate cost.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="text-sm text-gray-600">
            {estimate ? `Ready to generate ${estimate.totalPieces} pieces?` : 'Select at least one deliverable to continue.'}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedTypes.length}
              className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Generate {estimate ? `${estimate.totalPieces} pieces` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
