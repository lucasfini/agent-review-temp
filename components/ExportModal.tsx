"use client";

import { useState, useMemo, useEffect } from 'react';
import { X, Download, FileText, CheckSquare, Square, ChevronDown, ChevronRight, Loader2, FileJson, FileType, Archive, MessageCircle, Sparkles, BookOpen, Lightbulb, Quote } from 'lucide-react';

// Types
interface Output {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  metadata?: any;
}

interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
  description?: string;
}

interface Takeaway {
  takeaway: string;
  timestamp?: number;
}

interface SocialQuote {
  quote: string;
  speaker?: string;
  timestamp?: number;
}

interface Project {
  id: string;
  title: string;
  status: string;
  created_at: string;
  performance_level?: 'basic' | 'pro' | 'premium';
  transcription_text?: string;
  ai_summary?: string;
  chapters?: Chapter[];
  key_takeaways?: Takeaway[];
  social_quotes?: SocialQuote[];
  speaker_data?: any;
}

interface ProjectWithOutputs extends Project {
  outputs: Output[];
}

// Core content types that can be exported
export type CoreContentType = 'transcript' | 'conversation' | 'summary' | 'chapters' | 'takeaways' | 'quotes';

export interface ExportManifestItem {
  projectId: string;
  projectTitle: string;
  selectedBlockIds: string[] | 'ALL';
  selectedCoreContent: CoreContentType[];
}

export interface ExportPayload {
  format: 'markdown' | 'pdf' | 'json' | 'plaintext';
  export_manifest: ExportManifestItem[];
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectWithOutputs[];
  onExport: (payload: ExportPayload) => Promise<void>;
}

// Format options configuration
const FORMAT_OPTIONS = [
  { value: 'markdown', label: 'Markdown (ZIP)', icon: Archive, description: 'Organized .md files in a ZIP archive' },
  { value: 'pdf', label: 'PDF', icon: FileType, description: 'Formatted PDF document' },
  { value: 'json', label: 'JSON', icon: FileJson, description: 'Structured JSON data' },
  { value: 'plaintext', label: 'Plain Text', icon: FileText, description: 'Simple .txt files' },
] as const;

// Group outputs by platform/type for better organization
function groupOutputsByType(outputs: Output[]): Record<string, Output[]> {
  return outputs.reduce((acc, output) => {
    const key = output.metadata?.platform || output.platform || output.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(output);
    return acc;
  }, {} as Record<string, Output[]>);
}

function hasConversationData(speakerData: any): boolean {
  if (!speakerData) return false;
  if (typeof speakerData === 'string') {
    try {
      const parsed = JSON.parse(speakerData);
      return Array.isArray(parsed?.segments) && parsed.segments.length > 0;
    } catch {
      return false;
    }
  }
  return Array.isArray(speakerData?.segments) && speakerData.segments.length > 0;
}

export default function ExportModal({
  isOpen,
  onClose,
  projects,
  onExport,
}: ExportModalProps) {
  // State
  const [selectedFormat, setSelectedFormat] = useState<ExportPayload['format']>('markdown');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<Record<string, Set<string>>>({});
  const [selectedCoreContent, setSelectedCoreContent] = useState<Record<string, Set<CoreContentType>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Initialize selected blocks when projects change
  useEffect(() => {
    if (isOpen && projects.length > 0) {
      // Initialize all projects with empty selections
      const initialBlocks: Record<string, Set<string>> = {};
      const initialCore: Record<string, Set<CoreContentType>> = {};
      projects.forEach(p => {
        initialBlocks[p.id] = new Set();
        initialCore[p.id] = new Set();
      });
      setSelectedBlocks(initialBlocks);
      setSelectedCoreContent(initialCore);

      // Auto-select first project if single project or none selected
      if (projects.length === 1 || !selectedProjectId) {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [isOpen, projects]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedBlocks({});
      setSelectedCoreContent({});
      setSelectedProjectId(null);
      setExpandedGroups(new Set());
      setIsExporting(false);
    }
  }, [isOpen]);

  // Get currently selected project
  const activeProject = useMemo(() =>
    projects.find(p => p.id === selectedProjectId) || projects[0],
    [projects, selectedProjectId]
  );

  // Group outputs for the active project
  const groupedOutputs = useMemo(() =>
    activeProject ? groupOutputsByType(activeProject.outputs) : {},
    [activeProject]
  );

  // Get available core content for a project
  const getAvailableCoreContent = (project: ProjectWithOutputs): CoreContentType[] => {
    const available: CoreContentType[] = [];
    if (project.transcription_text) available.push('transcript');
    if (hasConversationData(project.speaker_data)) available.push('conversation');
    if (project.ai_summary) available.push('summary');
    if (project.chapters && project.chapters.length > 0) available.push('chapters');
    if (project.key_takeaways && project.key_takeaways.length > 0) available.push('takeaways');
    if (project.social_quotes && project.social_quotes.length > 0) available.push('quotes');
    return available;
  };

  // Calculate selection stats
  const selectionStats = useMemo(() => {
    let totalSelected = 0;
    let totalAvailable = 0;
    let totalCoreSelected = 0;
    let totalCoreAvailable = 0;
    const projectsWithSelections: string[] = [];

    projects.forEach(p => {
      const blocksSelected = selectedBlocks[p.id]?.size || 0;
      const coreSelected = selectedCoreContent[p.id]?.size || 0;
      const blocksAvailable = p.outputs.length;
      const coreAvailable = getAvailableCoreContent(p).length;

      totalSelected += blocksSelected;
      totalAvailable += blocksAvailable;
      totalCoreSelected += coreSelected;
      totalCoreAvailable += coreAvailable;

      if (blocksSelected > 0 || coreSelected > 0) {
        projectsWithSelections.push(p.id);
      }
    });

    return {
      totalSelected,
      totalAvailable,
      totalCoreSelected,
      totalCoreAvailable,
      projectsWithSelections,
      hasSelections: totalSelected > 0 || totalCoreSelected > 0,
    };
  }, [projects, selectedBlocks, selectedCoreContent]);

  // Check if a project has all outputs selected
  const isProjectFullySelected = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return false;
    return selectedBlocks[projectId]?.size === project.outputs.length && project.outputs.length > 0;
  };

  // Check if a project has some outputs selected
  const isProjectPartiallySelected = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return false;
    const selectedCount = selectedBlocks[projectId]?.size || 0;
    return selectedCount > 0 && selectedCount < project.outputs.length;
  };

  // Toggle individual block selection
  const toggleBlock = (projectId: string, blockId: string) => {
    setSelectedBlocks(prev => {
      const projectSet = new Set(prev[projectId] || []);
      if (projectSet.has(blockId)) {
        projectSet.delete(blockId);
      } else {
        projectSet.add(blockId);
      }
      return { ...prev, [projectId]: projectSet };
    });
  };

  // Toggle all blocks for a project
  const toggleAllForProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    setSelectedBlocks(prev => {
      const isFullySelected = isProjectFullySelected(projectId);
      if (isFullySelected) {
        // Deselect all
        return { ...prev, [projectId]: new Set() };
      } else {
        // Select all
        return { ...prev, [projectId]: new Set(project.outputs.map(o => o.id)) };
      }
    });
  };

  // Toggle all blocks for all projects
  const toggleAllProjects = () => {
    const allFullySelected = projects.every(p => isProjectFullySelected(p.id));

    setSelectedBlocks(() => {
      const newState: Record<string, Set<string>> = {};
      projects.forEach(p => {
        if (allFullySelected) {
          newState[p.id] = new Set();
        } else {
          newState[p.id] = new Set(p.outputs.map(o => o.id));
        }
      });
      return newState;
    });
  };

  // Toggle all blocks in a group for the active project
  const toggleGroup = (groupName: string) => {
    if (!activeProject) return;
    const groupOutputs = groupedOutputs[groupName] || [];

    setSelectedBlocks(prev => {
      const projectSet = new Set(prev[activeProject.id] || []);
      const allInGroupSelected = groupOutputs.every(o => projectSet.has(o.id));

      if (allInGroupSelected) {
        groupOutputs.forEach(o => projectSet.delete(o.id));
      } else {
        groupOutputs.forEach(o => projectSet.add(o.id));
      }

      return { ...prev, [activeProject.id]: projectSet };
    });
  };

  // Toggle group expansion
  const toggleGroupExpansion = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  // Toggle core content selection
  const toggleCoreContent = (projectId: string, contentType: CoreContentType) => {
    setSelectedCoreContent(prev => {
      const projectSet = new Set(prev[projectId] || []);
      if (projectSet.has(contentType)) {
        projectSet.delete(contentType);
      } else {
        projectSet.add(contentType);
      }
      return { ...prev, [projectId]: projectSet };
    });
  };

  // Toggle all core content for a project
  const toggleAllCoreForProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const available = getAvailableCoreContent(project);
    const currentSelected = selectedCoreContent[projectId] || new Set();
    const allSelected = available.every(c => currentSelected.has(c));

    setSelectedCoreContent(prev => ({
      ...prev,
      [projectId]: allSelected ? new Set() : new Set(available)
    }));
  };

  // Handle export
  const handleExport = async () => {
    if (!selectionStats.hasSelections) return;

    setIsExporting(true);

    try {
      const manifest: ExportManifestItem[] = [];

      projects.forEach(project => {
        const selected = selectedBlocks[project.id];
        const coreSelected = selectedCoreContent[project.id];
        const hasBlocks = selected && selected.size > 0;
        const hasCore = coreSelected && coreSelected.size > 0;

        if (hasBlocks || hasCore) {
          const isAllBlocks = selected?.size === project.outputs.length && project.outputs.length > 0;
          manifest.push({
            projectId: project.id,
            projectTitle: project.title,
            selectedBlockIds: hasBlocks ? (isAllBlocks ? 'ALL' : Array.from(selected)) : [],
            selectedCoreContent: hasCore ? Array.from(coreSelected) : [],
          });
        }
      });

      const payload: ExportPayload = {
        format: selectedFormat,
        export_manifest: manifest,
      };

      console.log('[EXPORT] Payload:', JSON.stringify(payload, null, 2));

      await onExport(payload);
      onClose();
    } catch (error) {
      console.error('[EXPORT] Error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const isBulkExport = projects.length > 1;
  const allProjectsFullySelected = projects.every(p => isProjectFullySelected(p.id));

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center px-4 py-6">
      <div className="relative w-full max-w-5xl bg-slate-900 rounded-xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">
              Export Content
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {isBulkExport
                ? `${projects.length} projects selected`
                : projects[0]?.title || 'Export content'
              }
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 text-slate-500 hover:text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Rail: Project List (only for bulk export) */}
          {isBulkExport && (
            <div className="w-64 border-r border-slate-700 flex flex-col bg-slate-800/50">
              <div className="px-4 py-3 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Projects
                  </span>
                  <button
                    onClick={toggleAllProjects}
                    className="text-xs text-blue-600 hover:text-blue-300 font-medium"
                  >
                    {allProjectsFullySelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {projects.map(project => {
                  const isActive = project.id === selectedProjectId;
                  const isFullySelected = isProjectFullySelected(project.id);
                  const isPartiallySelected = isProjectPartiallySelected(project.id);
                  const selectedCount = selectedBlocks[project.id]?.size || 0;

                  return (
                    <div
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-slate-900 shadow-sm border border-blue-800/30'
                          : 'hover:bg-slate-900 hover:shadow-sm border border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAllForProject(project.id);
                          }}
                          className="mt-0.5 flex-shrink-0"
                        >
                          {isFullySelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : isPartiallySelected ? (
                            <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-600/20" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isActive ? 'font-medium text-slate-50' : 'text-slate-300'}`}>
                            {project.title}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {selectedCount} / {project.outputs.length} selected
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Right Rail: Content Blocks */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Active Project Header */}
            {activeProject && (
              <div className="px-6 py-3 border-b border-slate-700 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-50">
                      {activeProject.title}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {activeProject.outputs.length} content blocks available
                    </p>
                  </div>
                  <button
                    onClick={() => toggleAllForProject(activeProject.id)}
                    className="text-xs text-blue-600 hover:text-blue-300 font-medium"
                  >
                    {isProjectFullySelected(activeProject.id) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
            )}

            {/* Content Blocks List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Core Content Section */}
              {activeProject && getAvailableCoreContent(activeProject).length > 0 && (
                <div className="border border-indigo-800/30 rounded-lg overflow-hidden bg-indigo-900/20/30">
                  <div className="flex items-center justify-between px-4 py-3 bg-indigo-900/20">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAllCoreForProject(activeProject.id)}
                        className="flex-shrink-0"
                      >
                        {(() => {
                          const available = getAvailableCoreContent(activeProject);
                          const selected = selectedCoreContent[activeProject.id] || new Set();
                          const allSelected = available.every(c => selected.has(c));
                          const someSelected = available.some(c => selected.has(c));
                          return allSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : someSelected ? (
                            <div className="w-4 h-4 border-2 border-indigo-600 rounded bg-indigo-600/20" />
                          ) : (
                            <Square className="w-4 h-4 text-indigo-400" />
                          );
                        })()}
                      </button>
                      <span className="text-sm font-medium text-indigo-900">Core Content</span>
                      <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                        {getAvailableCoreContent(activeProject).length}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-indigo-100">
                    {getAvailableCoreContent(activeProject).map(contentType => {
                      const isSelected = selectedCoreContent[activeProject.id]?.has(contentType);
                      const config: Record<CoreContentType, { label: string; icon: any; description: string }> = {
                        transcript: { label: 'Raw Transcript', icon: FileText, description: 'Full transcription text' },
                        conversation: { label: 'Conversation Transcript', icon: MessageCircle, description: 'Speakers + timestamps + roles' },
                        summary: { label: 'Summary', icon: Sparkles, description: 'AI-generated summary' },
                        chapters: { label: 'Chapters', icon: BookOpen, description: `${activeProject.chapters?.length || 0} chapters` },
                        takeaways: { label: 'Key Takeaways', icon: Lightbulb, description: `${activeProject.key_takeaways?.length || 0} insights` },
                        quotes: { label: 'Quotes', icon: Quote, description: `${activeProject.social_quotes?.length || 0} quotes` },
                      };
                      const { label, icon: Icon, description } = config[contentType];

                      return (
                        <div
                          key={contentType}
                          onClick={() => toggleCoreContent(activeProject.id, contentType)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-100/50' : 'hover:bg-indigo-900/20'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-indigo-400" />
                            )}
                          </div>
                          <Icon className="w-4 h-4 text-indigo-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-indigo-900">{label}</p>
                            <p className="text-xs text-indigo-600">{description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Generated Content Section */}
              {activeProject && activeProject.outputs.length === 0 && getAvailableCoreContent(activeProject).length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No content available</p>
                  <p className="text-xs text-slate-500 mt-1">Generate content first to export</p>
                </div>
              ) : activeProject && activeProject.outputs.length > 0 ? (
                <>
                  {/* Section header for generated content */}
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Generated Content</span>
                    <div className="flex-1 h-px bg-slate-700"></div>
                  </div>
                  {Object.entries(groupedOutputs).map(([groupName, outputs]) => {
                  const isExpanded = expandedGroups.has(groupName) || Object.keys(groupedOutputs).length <= 3;
                  const allSelected = outputs.every(o => selectedBlocks[activeProject?.id || '']?.has(o.id));
                  const someSelected = outputs.some(o => selectedBlocks[activeProject?.id || '']?.has(o.id));

                  return (
                    <div key={groupName} className="border border-slate-700 rounded-lg overflow-hidden">
                      {/* Group Header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors"
                        onClick={() => toggleGroupExpansion(groupName)}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(groupName);
                            }}
                            className="flex-shrink-0"
                          >
                            {allSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : someSelected ? (
                              <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-600/20" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          <span className="text-sm font-medium text-slate-50">{groupName}</span>
                          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                            {outputs.length}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      {/* Group Items */}
                      {isExpanded && (
                        <div className="divide-y divide-slate-800">
                          {outputs.map(output => {
                            const isSelected = selectedBlocks[activeProject?.id || '']?.has(output.id);
                            return (
                              <div
                                key={output.id}
                                onClick={() => activeProject && toggleBlock(activeProject.id, output.id)}
                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                  isSelected ? 'bg-blue-900/20/50' : 'hover:bg-slate-800/50'
                                }`}
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-50 truncate">
                                    {output.title}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                                    {output.content.slice(0, 120)}...
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            {/* Format Selection */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-300">Format:</label>
              <div className="relative">
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ExportPayload['format'])}
                  className="appearance-none bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {FORMAT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Selection Stats & Actions */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">
                {selectionStats.totalCoreSelected > 0 && (
                  <span className="text-indigo-600">{selectionStats.totalCoreSelected} core</span>
                )}
                {selectionStats.totalCoreSelected > 0 && selectionStats.totalSelected > 0 && ' + '}
                {selectionStats.totalSelected > 0 && `${selectionStats.totalSelected} generated`}
                {selectionStats.totalCoreSelected === 0 && selectionStats.totalSelected === 0 && 'Nothing selected'}
                {isBulkExport && selectionStats.projectsWithSelections.length > 0 && ` across ${selectionStats.projectsWithSelections.length} projects`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={isExporting}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-900 border border-slate-600 rounded-lg hover:bg-slate-800/50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting || !selectionStats.hasSelections}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export ({selectionStats.totalSelected + selectionStats.totalCoreSelected})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
