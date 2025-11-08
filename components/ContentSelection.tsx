"use client";

import { useState, useEffect } from 'react';
import { Check, DollarSign, Zap, Users, FileText, Mail, BookOpen, Quote } from 'lucide-react';
import { CONTENT_TYPES, calculateCostEstimate, formatCost, formatTokens, type ContentType } from '@/lib/cost-estimation';

interface ContentSelectionProps {
  transcriptionLength: number;
  onSelectionChange: (selectedTypes: string[], estimate: any) => void;
  initialSelection?: string[];
  showEstimate?: boolean;
}

const PLATFORM_ICONS = {
  twitter: Users,
  linkedin: Users,
  instagram: Users,
  general: FileText
};

const CONTENT_ICONS = {
  twitter_threads: Users,
  linkedin_posts: Users,
  instagram_content: Users,
  blog_post: BookOpen,
  newsletter: Mail,
  show_notes: FileText,
  quote_graphics: Quote
};

export default function ContentSelection({
  transcriptionLength,
  onSelectionChange,
  initialSelection = CONTENT_TYPES.map(type => type.id),
  showEstimate = true
}: ContentSelectionProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(initialSelection);
  const [estimate, setEstimate] = useState(calculateCostEstimate(initialSelection, transcriptionLength));

  useEffect(() => {
    const newEstimate = calculateCostEstimate(selectedTypes, transcriptionLength);
    setEstimate(newEstimate);
    onSelectionChange(selectedTypes, newEstimate);
  }, [selectedTypes, transcriptionLength, onSelectionChange]);

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

  const isAllSelected = selectedTypes.length === CONTENT_TYPES.length;
  const isNoneSelected = selectedTypes.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            Select Content to Generate
          </h3>
          <p className="text-sm text-gray-600">
            Choose which content pieces you'd like to create from your podcast
          </p>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={handleSelectAll}
            disabled={isAllSelected}
            className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            disabled={isNoneSelected}
            className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CONTENT_TYPES.map((contentType) => {
          const isSelected = selectedTypes.includes(contentType.id);
          const IconComponent = CONTENT_ICONS[contentType.id as keyof typeof CONTENT_ICONS] || FileText;
          
          return (
            <div
              key={contentType.id}
              className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleTypeToggle(contentType.id)}
            >
              {/* Selection Indicator */}
              <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                isSelected 
                  ? 'border-blue-500 bg-blue-500' 
                  : 'border-gray-300 bg-white'
              }`}>
                {isSelected && (
                  <Check className="w-3 h-3 text-white" />
                )}
              </div>

              {/* Content Info */}
              <div className="pr-8">
                <div className="flex items-center space-x-3 mb-2">
                  <IconComponent className={`w-5 h-5 ${
                    isSelected ? 'text-blue-600' : 'text-gray-400'
                  }`} />
                  <h4 className={`font-medium ${
                    isSelected ? 'text-blue-900' : 'text-gray-900'
                  }`}>
                    {contentType.name}
                  </h4>
                </div>
                
                <p className={`text-sm ${
                  isSelected ? 'text-blue-700' : 'text-gray-600'
                } mb-3`}>
                  {contentType.description}
                </p>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded-full ${
                    isSelected 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {contentType.count} piece{contentType.count !== 1 ? 's' : ''}
                  </span>
                  
                  <span className={`font-medium ${
                    isSelected ? 'text-blue-700' : 'text-gray-500'
                  }`}>
                    {formatCost(contentType.costPerPiece)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cost Estimate */}
      {showEstimate && (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <h4 className="font-medium text-gray-900">Cost Estimate</h4>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {formatCost(estimate.totalCost)}
              </div>
              <div className="text-xs text-gray-500">
                {estimate.totalPieces} pieces • {formatTokens(estimate.totalTokens)}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            {estimate.breakdown.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{item.type}</span>
                <div className="flex items-center space-x-3">
                  <span className="text-gray-500">
                    {item.pieces} piece{item.pieces !== 1 ? 's' : ''}
                  </span>
                  <span className="font-medium text-gray-900 w-12 text-right">
                    {formatCost(item.cost)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Warning for high costs */}
          {estimate.totalCost > 1.00 && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              <Zap className="w-4 h-4 inline mr-1" />
              High cost estimate. Consider selecting fewer content types to reduce costs.
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