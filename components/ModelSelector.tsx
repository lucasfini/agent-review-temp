'use client';

import { useState } from 'react';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { ModelSpec } from '@/lib/models/config';
import { CompatibilityCheck } from '@/lib/models/token-estimation';
import { formatTokenCount } from '@/lib/models/token-estimation';

interface ModelSelectorProps {
  selectedModel: ModelSpec | null;
  availableModels: ModelSpec[];
  compatibleModels: ModelSpec[];
  recommendedModels: ModelSpec[];
  onSelectModel: (model: ModelSpec) => void;
  getModelCompatibility: (modelId: string) => CompatibilityCheck | null;
  getModelCost: (modelId: string) => number;
  isCalculating?: boolean;
  tokenEstimate?: {
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } | null;
}

export default function ModelSelector({
  selectedModel,
  availableModels,
  compatibleModels,
  recommendedModels,
  onSelectModel,
  getModelCompatibility,
  getModelCost,
  isCalculating = false,
  tokenEstimate
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'recommended', name: 'Recommended' },
    { id: 'general', name: 'General' },
    { id: 'fast', name: 'Fast' },
    { id: 'reasoning', name: 'Reasoning' }
  ];
  
  const filteredModels = availableModels.filter(model => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'recommended') return recommendedModels.includes(model);
    return model.category === selectedCategory;
  });
  
  const getCompatibilityStatus = (model: ModelSpec) => {
    const compatibility = getModelCompatibility(model.id);
    if (!compatibility) return 'unknown';

    if (!compatibility.isCompatible) return 'incompatible';
    if (compatibility.warning) return 'warning';
    return 'compatible';
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(4)}`;
  };
  
  return (
    <div className="space-y-3">
      {/* Model Selection */}
      <div className="space-y-2">
        
        {/* Selected Model Display */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={isCalculating}
            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-sm"
          >
            <div className="flex items-center gap-2">
              {selectedModel ? (
                <>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{selectedModel.displayName}</div>
                    <div className="text-xs text-gray-500">
                      {formatCost(getModelCost(selectedModel.id))} • {selectedModel.provider}
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-gray-500">Select model...</span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-hidden">
              {/* Category Filter */}
              <div className="border-b border-gray-200 p-2 bg-gray-50">
                <div className="flex flex-wrap gap-1">
                  {categories.map(category => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        selectedCategory === category.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Model List */}
              <div className="max-h-64 overflow-y-auto">
                {filteredModels.map(model => {
                  const compatibility = getModelCompatibility(model.id);
                  const cost = getModelCost(model.id);
                  const status = getCompatibilityStatus(model);
                  const isSelected = selectedModel?.id === model.id;
                  const isIncompatible = status === 'incompatible';

                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (!isIncompatible) {
                          onSelectModel(model);
                          setIsOpen(false);
                        }
                      }}
                      disabled={isIncompatible}
                      className={`w-full text-left p-3 border-b border-gray-100 transition-colors ${
                        isIncompatible
                          ? 'bg-gray-50 cursor-not-allowed opacity-50'
                          : 'hover:bg-gray-50'
                      } ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900 text-sm">{model.displayName}</h4>
                            {model.recommended && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                Recommended
                              </span>
                            )}
                            {status === 'warning' && (
                              <AlertTriangle className="w-3 h-3 text-yellow-500" />
                            )}
                            {status === 'incompatible' && (
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                            )}
                          </div>

                          <p className="text-xs text-gray-600 mt-1">{model.description}</p>

                          {/* Model Specs */}
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <span className="capitalize">{model.provider}</span>
                            <span>•</span>
                            <span>{formatCost(cost)}</span>
                            <span>•</span>
                            <span>{formatTokenCount(model.contextLength)}</span>
                          </div>

                          {/* Compatibility Warning */}
                          {compatibility?.warning && (
                            <div className="text-xs text-yellow-700 mt-1.5">
                              {compatibility.warning}
                            </div>
                          )}
                        </div>

                        {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {filteredModels.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500">
                  No models available
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}