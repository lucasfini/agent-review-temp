'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ModelSpec, 
  getAvailableModels, 
  getRecommendedModels,
  getCompatibleModels,
  MODEL_SPECS 
} from './config';
import { 
  TokenEstimate,
  CompatibilityCheck,
  calculateTokenRequirements,
  checkModelCompatibility,
  calculateModelCost,
  findOptimalModel
} from './token-estimation';

export interface ModelSelectionState {
  // Selected model
  selectedModel: ModelSpec | null;
  
  // Available models
  availableModels: ModelSpec[];
  compatibleModels: ModelSpec[];
  recommendedModels: ModelSpec[];
  
  // Token calculations
  tokenEstimate: TokenEstimate | null;
  
  // Model compatibility
  compatibilityChecks: Map<string, CompatibilityCheck>;
  
  // Cost calculations
  costs: Map<string, number>;
  optimalModel: { model: ModelSpec; cost: number; reasoning: string } | null;
  
  // UI state
  isCalculating: boolean;
  error: string | null;
}

export interface UseModelSelectionOptions {
  transcriptionText: string;
  selectedContentTypes: string[];
  defaultModelId?: string;
  onModelChange?: (model: ModelSpec | null) => void;
  onCostChange?: (cost: number) => void;
}

export function useModelSelection({
  transcriptionText,
  selectedContentTypes,
  defaultModelId = 'gpt-4o',
  onModelChange,
  onCostChange
}: UseModelSelectionOptions) {
  const [state, setState] = useState<ModelSelectionState>({
    selectedModel: null,
    availableModels: [],
    compatibleModels: [],
    recommendedModels: [],
    tokenEstimate: null,
    compatibilityChecks: new Map(),
    costs: new Map(),
    optimalModel: null,
    isCalculating: false,
    error: null
  });
  
  // Calculate token requirements when inputs change
  const tokenEstimate = useMemo(() => {
    if (!transcriptionText || selectedContentTypes.length === 0) {
      return null;
    }
    
    try {
      return calculateTokenRequirements(transcriptionText, selectedContentTypes);
    } catch (error) {
      console.error('Error calculating token requirements:', error);
      return null;
    }
  }, [transcriptionText, selectedContentTypes]);
  
  // Update state when token estimate changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      isCalculating: true,
      error: null
    }));
    
    try {
      const availableModels = getAvailableModels();
      const recommendedModels = getRecommendedModels();
      
      if (!tokenEstimate) {
        setState(prev => ({
          ...prev,
          availableModels,
          recommendedModels,
          compatibleModels: availableModels,
          tokenEstimate: null,
          compatibilityChecks: new Map(),
          costs: new Map(),
          optimalModel: null,
          isCalculating: false
        }));
        return;
      }
      
      // Calculate compatibility and costs for all models
      const compatibilityChecks = new Map<string, CompatibilityCheck>();
      const costs = new Map<string, number>();
      const compatibleModels: ModelSpec[] = [];
      
      availableModels.forEach(model => {
        const compatibility = checkModelCompatibility(model, tokenEstimate);
        const cost = calculateModelCost(model, tokenEstimate);
        
        compatibilityChecks.set(model.id, compatibility);
        costs.set(model.id, cost);
        
        if (compatibility.isCompatible) {
          compatibleModels.push(model);
        }
      });
      
      // Find optimal model
      const optimalModel = findOptimalModel(compatibleModels, tokenEstimate);
      
      // Select default model or optimal model
      let selectedModel = state.selectedModel;
      
      if (!selectedModel) {
        // Try to use default model if compatible
        const defaultModel = availableModels.find(m => m.id === defaultModelId);
        if (defaultModel && compatibilityChecks.get(defaultModel.id)?.isCompatible) {
          selectedModel = defaultModel;
        } else if (optimalModel) {
          // Fallback to optimal model
          selectedModel = optimalModel.model;
        } else if (compatibleModels.length > 0) {
          // Fallback to first compatible model
          selectedModel = compatibleModels[0];
        }
      }
      
      // Verify current selection is still compatible
      if (selectedModel && !compatibilityChecks.get(selectedModel.id)?.isCompatible) {
        selectedModel = optimalModel?.model || compatibleModels[0] || null;
      }
      
      setState(prev => ({
        ...prev,
        availableModels,
        compatibleModels,
        recommendedModels,
        tokenEstimate,
        compatibilityChecks,
        costs,
        optimalModel,
        selectedModel,
        isCalculating: false
      }));
      
      // Notify parent components
      if (onModelChange && selectedModel !== state.selectedModel) {
        onModelChange(selectedModel);
      }
      
      if (onCostChange && selectedModel) {
        const cost = costs.get(selectedModel.id) || 0;
        onCostChange(cost);
      }
      
    } catch (error) {
      console.error('Error in model selection calculation:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isCalculating: false
      }));
    }
  }, [tokenEstimate, defaultModelId, onModelChange, onCostChange]);
  
  // Actions
  const selectModel = (model: ModelSpec | null) => {
    setState(prev => ({
      ...prev,
      selectedModel: model
    }));
    
    if (onModelChange) {
      onModelChange(model);
    }
    
    if (onCostChange && model) {
      const cost = state.costs.get(model.id) || 0;
      onCostChange(cost);
    }
  };
  
  const getModelCompatibility = (modelId: string): CompatibilityCheck | null => {
    return state.compatibilityChecks.get(modelId) || null;
  };
  
  const getModelCost = (modelId: string): number => {
    return state.costs.get(modelId) || 0;
  };
  
  const isModelCompatible = (modelId: string): boolean => {
    return state.compatibilityChecks.get(modelId)?.isCompatible || false;
  };
  
  const getModelById = (modelId: string): ModelSpec | undefined => {
    return MODEL_SPECS.find(model => model.id === modelId);
  };
  
  return {
    // State
    ...state,
    
    // Actions
    selectModel,
    getModelCompatibility,
    getModelCost,
    isModelCompatible,
    getModelById,
    
    // Computed values
    hasCompatibleModels: state.compatibleModels.length > 0,
    selectedModelCost: state.selectedModel ? state.costs.get(state.selectedModel.id) || 0 : 0,
    selectedModelCompatibility: state.selectedModel ? state.compatibilityChecks.get(state.selectedModel.id) : null
  };
}