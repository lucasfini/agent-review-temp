"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Download, Share2, RefreshCw, Trash2, Zap, Play, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import ContentSelectionModal from '@/components/ContentSelectionModal';
import ConversationView from '@/components/ConversationView';

interface Project {
  id: string;
  title: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  created_at: string;
  audio_duration?: number;
  audio_file_size?: number;
  audio_file_name?: string;
  processing_time_seconds?: number;
  transcription_text?: string;
  selected_content_types?: string[];
  estimated_cost?: number;
  transcription_segments?: string;
  speaker_data?: string;
}

interface Output {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [showContentSelection, setShowContentSelection] = useState(false);
  const [selectedProjectForGeneration, setSelectedProjectForGeneration] = useState<Project | null>(null);
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [showConversationFormat, setShowConversationFormat] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const { user } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
    if (selectedProject) {
      await fetchProjectOutputs(selectedProject.id);
    }
    setRefreshing(false);
  };

  const handleGenerateContent = (project: Project) => {
    if (!project.transcription_text) {
      alert('Transcription not available for this project.');
      return;
    }
    setSelectedProjectForGeneration(project);
    setShowContentSelection(true);
  };

  const handleConfirmGeneration = async (selectedTypes: string[], estimate: any) => {
    if (!selectedProjectForGeneration) return;

    try {
      const response = await fetch('/api/generate-selected-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectForGeneration.id,
          selectedContentTypes: selectedTypes,
          estimatedCost: estimate.totalCost
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start content generation');
      }

      // Refresh projects to show updated status
      await fetchProjects();
      
      // Show success message
      alert(`Content generation started! ${estimate.totalPieces} pieces will be generated for approximately $${estimate.totalCost.toFixed(2)}.`);
      
    } catch (error) {
      console.error('Error starting content generation:', error);
      throw error;
    }
  };


  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This will also delete all generated content and cannot be undone.')) {
      return;
    }

    setDeletingProject(projectId);
    
    try {
      // Delete all outputs first (due to foreign key constraints)
      const { error: outputsError } = await supabase
        .from('outputs')
        .delete()
        .eq('project_id', projectId);

      if (outputsError) {
        console.error('Error deleting outputs:', outputsError);
        alert('Failed to delete project outputs. Please try again.');
        return;
      }

      // Delete the project
      const { error: projectError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user?.id); // Ensure user can only delete their own projects

      if (projectError) {
        console.error('Error deleting project:', projectError);
        alert('Failed to delete project. Please try again.');
        return;
      }

      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      
      // Clear selected project if it was the deleted one
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setOutputs([]);
      }

      // Optional: Delete audio file from storage
      const project = projects.find(p => p.id === projectId);
      if (project?.audio_file_name) {
        const fileName = `${projectId}/${project.audio_file_name}`;
        await supabase.storage
          .from('audio-files')
          .remove([fileName]);
      }

    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
      
      // Set up real-time updates for projects
      const projectsSubscription = supabase
        .channel('projects_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'projects',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Project change detected:', payload);
            fetchProjects(); // Refresh projects when changes occur
          }
        )
        .subscribe();

      // Set up real-time updates for outputs if a project is selected
      let outputsSubscription: any = null;
      if (selectedProject) {
        outputsSubscription = supabase
          .channel('outputs_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'outputs',
              filter: `project_id=eq.${selectedProject.id}`,
            },
            (payload) => {
              console.log('Output change detected:', payload);
              fetchProjectOutputs(selectedProject.id);
            }
          )
          .subscribe();
      }

      return () => {
        projectsSubscription.unsubscribe();
        if (outputsSubscription) {
          outputsSubscription.unsubscribe();
        }
      };
    }
  }, [user, selectedProject?.id]);

  const fetchProjects = async () => {
    try {
      console.log('Fetching projects for user:', user?.id);
      
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*, transcription_segments, speaker_data')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        return;
      }

      console.log('Fetched projects:', projectsData);
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectOutputs = async (projectId: string) => {
    try {
      console.log('Fetching outputs for project:', projectId);
      
      const { data: outputsData, error } = await supabase
        .from('outputs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching outputs:', error);
        return;
      }

      console.log('Fetched outputs:', outputsData);
      setOutputs(outputsData || []);
    } catch (error) {
      console.error('Failed to fetch outputs:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const toggleOutputExpansion = (outputId: string) => {
    setExpandedOutputs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(outputId)) {
        newSet.delete(outputId);
      } else {
        newSet.add(outputId);
      }
      return newSet;
    });
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'twitter':
        return 'bg-blue-100 text-blue-800';
      case 'linkedin':
        return 'bg-blue-100 text-blue-700';
      case 'instagram':
        return 'bg-pink-100 text-pink-800';
      case 'general':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                Projects
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                View your uploaded podcasts and generated content
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          // Empty state
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No projects yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by uploading your first podcast episode.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Upload Podcast
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Projects List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-lg font-medium text-gray-900">Your Projects</h2>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    selectedProject?.id === project.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 
                      className="text-sm font-medium text-gray-900 truncate cursor-pointer flex-1"
                      onClick={() => {
                        setSelectedProject(project);
                        setShowFullTranscription(false); // Reset transcription view
                        setShowConversationFormat(false); // Reset conversation format
                        fetchProjectOutputs(project.id);
                      }}
                    >
                      {project.title}
                    </h3>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(project.status)}
                      
                      {/* Generate Content Button */}
                      {project.status === 'completed' && project.transcription_text && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateContent(project);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Generate content"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        disabled={deletingProject === project.id}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete project"
                      >
                        {deletingProject === project.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>
                      Created: {new Date(project.created_at).toLocaleDateString()}
                    </div>
                    {project.audio_duration && (
                      <div>Duration: {formatDuration(project.audio_duration)}</div>
                    )}
                    {project.audio_file_size && (
                      <div>Size: {formatFileSize(project.audio_file_size)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Content Outputs */}
            <div className="lg:col-span-2">
              {selectedProject ? (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-medium text-gray-900">
                      Generated Content
                    </h2>
                    {selectedProject.status === 'completed' && (
                      <span className="text-sm text-green-600 font-medium">
                        {outputs.length} pieces generated
                      </span>
                    )}
                  </div>

                  {/* Transcription Section */}
                  {selectedProject.transcription_text && (
                    <div className="mb-6 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-gray-900">
                          Transcription
                        </h4>
                        <div className="flex items-center space-x-3">
                          {/* Format Toggle */}
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setShowConversationFormat(false)}
                              className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                !showConversationFormat
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              Text
                            </button>
                            <button
                              onClick={() => setShowConversationFormat(true)}
                              disabled={!selectedProject.speaker_data}
                              className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                showConversationFormat && selectedProject.speaker_data
                                  ? 'bg-blue-100 text-blue-700'
                                  : selectedProject.speaker_data
                                  ? 'text-gray-600 hover:bg-gray-100'
                                  : 'text-gray-400 cursor-not-allowed'
                              }`}
                              title={!selectedProject.speaker_data ? 'Speaker analysis in progress...' : 'Switch to conversation format'}
                            >
                              <MessageCircle className="w-3 h-3 mr-1" />
                              Conversation
                              {!selectedProject.speaker_data && (
                                <span className="ml-1 text-xs">⏳</span>
                              )}
                            </button>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleGenerateContent(selectedProject)}
                              className="inline-flex items-center px-3 py-1 border border-blue-600 text-xs font-medium rounded-md text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              <Zap className="w-3 h-3 mr-1" />
                              Generate Content
                            </button>
                            
                          </div>
                        </div>
                      </div>

                      {/* Display Content Based on Format */}
                      {showConversationFormat && selectedProject.speaker_data ? (
                        // Conversation Format
                        <ConversationView
                          speakerData={JSON.parse(selectedProject.speaker_data)}
                          transcriptionText={selectedProject.transcription_text}
                          className="bg-gray-50 rounded-md"
                          projectId={selectedProject.id}
                          onSpeakerUpdate={(updatedSpeakerData) => {
                            // Update the selected project with new speaker data
                            setSelectedProject(prev => prev ? {
                              ...prev,
                              speaker_data: JSON.stringify(updatedSpeakerData)
                            } : null);
                            
                            // Also update the projects list
                            setProjects(prev => prev.map(project => 
                              project.id === selectedProject.id 
                                ? { ...project, speaker_data: JSON.stringify(updatedSpeakerData) }
                                : project
                            ));
                          }}
                        />
                      ) : (
                        // Traditional Text Format
                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                          <div className={`${showFullTranscription ? '' : 'max-h-32 overflow-hidden'}`}>
                            {showFullTranscription 
                              ? selectedProject.transcription_text 
                              : selectedProject.transcription_text.substring(0, 1000)
                            }
                            {!showFullTranscription && selectedProject.transcription_text.length > 1000 && '...'}
                          </div>
                          {selectedProject.transcription_text.length > 1000 && (
                            <button
                              onClick={() => setShowFullTranscription(!showFullTranscription)}
                              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {showFullTranscription ? 'Show Less' : 'Show More'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {outputs.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <Clock className="mx-auto h-8 w-8 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-500">
                        {selectedProject.status === 'processing' 
                          ? 'Content is being generated...'
                          : selectedProject.transcription_text 
                          ? 'Ready to generate content - click the button above!'
                          : 'No content generated yet'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {outputs.map((output) => (
                        <div
                          key={output.id}
                          className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <h3 className="text-sm font-medium text-gray-900">
                                {output.title}
                              </h3>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPlatformColor(output.platform)}`}>
                                {output.platform}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <button className="p-1 text-gray-400 hover:text-gray-600">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button className="p-1 text-gray-400 hover:text-gray-600">
                                <Download className="h-4 w-4" />
                              </button>
                              <button className="p-1 text-gray-400 hover:text-gray-600">
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                            <div className={expandedOutputs.has(output.id) ? '' : 'line-clamp-4'}>
                              {output.content}
                            </div>
                            {output.content.length > 200 && (
                              <button
                                onClick={() => toggleOutputExpansion(output.id)}
                                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {expandedOutputs.has(output.id) ? 'Show Less' : 'Show More'}
                              </button>
                            )}
                          </div>
                          
                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                            <span>Type: {output.type.replace('_', ' ')}</span>
                            <span>
                              Generated: {new Date(output.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Select a project
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose a project from the left to view its generated content
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Selection Modal */}
        <ContentSelectionModal
          isOpen={showContentSelection && selectedProjectForGeneration !== null}
          onClose={() => {
            setShowContentSelection(false);
            setSelectedProjectForGeneration(null);
          }}
          onConfirm={handleConfirmGeneration}
          projectId={selectedProjectForGeneration?.id || ''}
          transcriptionLength={selectedProjectForGeneration?.transcription_text?.length || 0}
          transcriptionText={selectedProjectForGeneration?.transcription_text || ''}
        />
      </div>
    </div>
  );
}