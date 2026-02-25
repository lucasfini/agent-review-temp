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
            className="w-full flex items-center justify-between px-3 py-2 border border-slate-600 rounded-md bg-slate-900 hover:bg-slate-800/50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-sm"
          >
            <div className="flex items-center gap-2">
              {selectedModel ? (
                <>
                  <div className="text-left">
                    <div className="font-medium text-slate-50">{selectedModel.displayName}</div>
                    <div className="text-xs text-slate-400">
                      {formatCost(getModelCost(selectedModel.id))} • {selectedModel.provider}
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-slate-400">Select model...</span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-lg max-h-96 overflow-hidden">
              {/* Category Filter */}
              <div className="border-b border-slate-700 p-2 bg-slate-800/50">
                <div className="flex flex-wrap gap-1">
                  {categories.map(category => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        selectedCategory === category.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-700'
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
                      className={`w-full text-left p-3 border-b border-slate-800 transition-colors ${
                        isIncompatible
                          ? 'bg-slate-800/50 cursor-not-allowed opacity-50'
                          : 'hover:bg-slate-800/50'
                      } ${isSelected ? 'bg-blue-900/20' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-slate-50 text-sm">{model.displayName}</h4>
                            {model.recommended && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-400">
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

                          <p className="text-xs text-slate-400 mt-1">{model.description}</p>

                          {/* Model Specs */}
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                            <span className="capitalize">{model.provider}</span>
                            <span>•</span>
                            <span>{formatCost(cost)}</span>
                            <span>•</span>
                            <span>{formatTokenCount(model.contextLength)}</span>
                          </div>

                          {/* Compatibility Warning */}
                          {compatibility?.warning && (
                            <div className="text-xs text-yellow-400 mt-1.5">
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
                <div className="p-4 text-center text-sm text-slate-400">
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