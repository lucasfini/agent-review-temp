'use client';

import { useState } from 'react';
import { ChevronDown, Check, AlertTriangle, Info, Zap, Brain, Clock, DollarSign } from 'lucide-react';
import { ModelSpec } from '@/lib/models/config';
import { CompatibilityCheck } from '@/lib/models/token-estimation';
import { formatTokenCount, formatPercentage } from '@/lib/models/token-estimation';

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
    { id: 'all', name: 'All Models', icon: null },
    { id: 'recommended', name: 'Recommended', icon: Check },
    { id: 'general', name: 'General Purpose', icon: Brain },
    { id: 'fast', name: 'Fast & Efficient', icon: Zap },
    { id: 'reasoning', name: 'Advanced Reasoning', icon: Brain }
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
  
  const getCompatibilityIcon = (model: ModelSpec) => {
    const status = getCompatibilityStatus(model);
    
    switch (status) {
      case 'compatible':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'incompatible':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const getCapabilityIcon = (capability: keyof ModelSpec['capabilities'], value: any) => {
    switch (capability) {
      case 'reasoning':
        return <Brain className="w-3 h-3" />;
      case 'creativity':
        return <Zap className="w-3 h-3" />;
      case 'speed':
        return <Clock className="w-3 h-3" />;
      default:
        return null;
    }
  };
  
  const formatCost = (cost: number) => {
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(4)}`;
  };
  
  return (
    <div className="space-y-4">
      {/* Token Usage Summary */}
      {tokenEstimate && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Info className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Token Usage Estimate</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-blue-600 font-medium">Total</div>
              <div className="text-blue-800">{formatTokenCount(tokenEstimate.totalTokens)}</div>
            </div>
            <div>
              <div className="text-blue-600 font-medium">Input</div>
              <div className="text-blue-800">{formatTokenCount(tokenEstimate.totalInputTokens)}</div>
            </div>
            <div>
              <div className="text-blue-600 font-medium">Output</div>
              <div className="text-blue-800">{formatTokenCount(tokenEstimate.totalOutputTokens)}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">AI Model</label>
        
        {/* Selected Model Display */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={isCalculating}
            className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <div className="flex items-center space-x-3">
              {selectedModel ? (
                <>
                  {getCompatibilityIcon(selectedModel)}
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{selectedModel.displayName}</div>
                    <div className="text-xs text-gray-500 flex items-center space-x-2">
                      <span>{formatTokenCount(selectedModel.contextLength)} context</span>
                      <span>•</span>
                      <span>{formatCost(getModelCost(selectedModel.id))}</span>
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-gray-500">Select a model...</span>
              )}
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-hidden">
              {/* Category Filter */}
              <div className="border-b border-gray-200 p-2">
                <div className="flex space-x-1">
                  {categories.map(category => {
                    const Icon = category.icon;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          selectedCategory === category.id
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center space-x-1">
                          {Icon && <Icon className="w-3 h-3" />}
                          <span>{category.name}</span>
                        </div>
                      </button>
                    );
                  })}
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
                    <div
                      key={model.id}
                      onClick={() => {
                        if (!isIncompatible) {
                          onSelectModel(model);
                          setIsOpen(false);
                        }
                      }}
                      className={`p-3 border-b border-gray-100 transition-colors ${
                        isIncompatible
                          ? 'bg-gray-50 cursor-not-allowed opacity-60'
                          : 'hover:bg-gray-50 cursor-pointer'
                      } ${isSelected ? 'bg-blue-50 border-blue-200' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          {getCompatibilityIcon(model)}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium text-gray-900 truncate">{model.displayName}</h4>
                              {model.recommended && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  Recommended
                                </span>
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{model.description}</p>
                            
                            {/* Model Specs */}
                            <div className="flex items-center space-x-3 mt-2 text-xs text-gray-600">
                              <span>{formatTokenCount(model.contextLength)}</span>
                              <span>•</span>
                              <span className="capitalize">{model.provider}</span>
                              <span>•</span>
                              <div className="flex items-center space-x-1">
                                <DollarSign className="w-3 h-3" />
                                <span>{formatCost(cost)}</span>
                              </div>
                            </div>
                            
                            {/* Capabilities */}
                            <div className="flex items-center space-x-2 mt-2">
                              {(['reasoning', 'creativity', 'speed'] as const).map(capability => {
                                const value = model.capabilities[capability];
                                const Icon = getCapabilityIcon(capability, value);
                                return (
                                  <div key={capability} className="flex items-center space-x-1">
                                    {Icon}
                                    <div className="flex space-x-0.5">
                                      {[...Array(10)].map((_, i) => (
                                        <div
                                          key={i}
                                          className={`w-1 h-1 rounded-full ${
                                            i < value ? 'bg-blue-500' : 'bg-gray-300'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {/* Compatibility Info */}
                            {compatibility && (
                              <div className="mt-2">
                                {compatibility.warning && (
                                  <div className="text-xs text-yellow-600">{compatibility.warning}</div>
                                )}
                                {compatibility.recommendation && (
                                  <div className="text-xs text-gray-600">{compatibility.recommendation}</div>
                                )}
                                {compatibility.isCompatible && tokenEstimate && (
                                  <div className="text-xs text-gray-500">
                                    Usage: {formatPercentage(compatibility.utilizationPercentage)} of context
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {filteredModels.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <p>No models available for the selected category.</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Selected Model Details */}
        {selectedModel && (
          <div className="text-xs text-gray-600 mt-2">
            <div className="flex items-center justify-between">
              <span>Context: {formatTokenCount(selectedModel.contextLength)}</span>
              <span>Cost: {formatCost(getModelCost(selectedModel.id))}</span>
            </div>
            {getModelCompatibility(selectedModel.id)?.warning && (
              <div className="text-yellow-600 mt-1 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{getModelCompatibility(selectedModel.id)?.warning}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}