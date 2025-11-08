"use client";

import { useState } from 'react';
import { X, Loader2, Zap, DollarSign, Settings } from 'lucide-react';
import { CONTENT_TYPES, calculateCostEstimate, formatCost } from '@/lib/cost-estimation';
// Temporarily disable model selection to keep modal working
// import { useModelSelection } from '@/lib/models/use-model-selection';
// import ModelSelector from './ModelSelector';

interface ContentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedTypes: string[], estimate: any, selectedModel?: any) => Promise<void>;
  projectId: string;
  transcriptionLength: number;
  transcriptionText: string;
}

export default function ContentSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  transcriptionLength,
  transcriptionText
}: ContentSelectionModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    CONTENT_TYPES.map(type => type.id) // Default to all selected
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Model selection hook - disabled
  // const modelSelection = useModelSelection({
  //   transcriptionText,
  //   selectedContentTypes: selectedTypes,
  //   defaultModelId: 'gpt-4-turbo' // Default to GPT-4 Turbo since it works
  // });

  const estimate = calculateCostEstimate(selectedTypes, transcriptionLength);

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const handleSelectAll = () => {
    setSelectedTypes(CONTENT_TYPES.map(type => type.id));
  };

  const handleDeselectAll = () => {
    setSelectedTypes([]);
  };

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) {
      alert('Please select at least one content type.');
      return;
    }

    setIsGenerating(true);
    try {
      await onConfirm(selectedTypes, estimate, null);
      onClose();
    } catch (error) {
      console.error('Failed to start content generation:', error);
      alert('Failed to start content generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  console.log('ContentSelectionModal rendering:', { isOpen, projectId, transcriptionLength, selectedTypesCount: selectedTypes.length });

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: 9999 }}>
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={!isGenerating ? onClose : undefined}
        ></div>

        {/* Modal panel */}
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full z-[10000]" style={{ zIndex: 10000 }}>
          {/* Debug indicator */}
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded z-[10001]">
            MODAL OPEN
          </div>
          
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Content Generation
                </h3>
                <p className="text-sm text-gray-500">
                  Select content types to generate
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={isGenerating}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content Selection */}
          <div className="bg-white px-6 py-6">
            {/* Content Types Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-gray-700">
                Content Types & AI Model
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className={`flex items-center space-x-1 px-2 py-1 text-xs rounded-md transition-colors ${
                    showAdvancedSettings 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-3 h-3" />
                  <span>Advanced</span>
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleDeselectAll}
                  className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Model Selection - Disabled for stability */}
            {showAdvancedSettings && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">
                  Model selection feature temporarily disabled for stability. Currently using GPT-4 Turbo.
                </div>
              </div>
            )}

            {/* Content Types Selection Header */}
            <div className="text-sm font-medium text-gray-700 mb-3">
              Select Content Types
            </div>

            {/* Content Type Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {CONTENT_TYPES.map((contentType) => {
                const isSelected = selectedTypes.includes(contentType.id);
                
                return (
                  <label
                    key={contentType.id}
                    className={`relative flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleTypeToggle(contentType.id)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className={`text-sm font-medium ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {contentType.name}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs ${
                          isSelected ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {contentType.count} piece{contentType.count !== 1 ? 's' : ''}
                        </span>
                        <span className={`text-xs font-medium ${
                          isSelected ? 'text-blue-700' : 'text-gray-600'
                        }`}>
                          {formatCost(contentType.costPerPiece)}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Cost Summary */}
            <div className="bg-gray-50 rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-gray-900">
                    Estimated Cost (GPT-4 Turbo)
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCost(estimate.totalCost)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {estimate.totalPieces} pieces selected
                  </div>
                </div>
              </div>
            </div>

            {/* No selection warning */}
            {selectedTypes.length === 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  Please select at least one content type to generate.
                </p>
              </div>
            )}
          </div>

          {/* Footer with Generate Button */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                disabled={isGenerating}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              
              <button
                onClick={handleGenerate}
                disabled={selectedTypes.length === 0 || isGenerating}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating Content...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Generate {estimate.totalPieces} Pieces
                    <span className="ml-2 text-blue-200">
                      ({formatCost(estimate.totalCost)})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}