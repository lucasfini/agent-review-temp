"use client";

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileAudio, X, AlertCircle, CheckCircle, Clock, History, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';

interface UploadedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface UploadHistory {
  id: string;
  title: string;
  audio_file_name: string;
  audio_file_size: number;
  audio_duration: number;
  status: string;
  created_at: string;
  processing_completed_at?: string;
}

export default function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchUploadHistory();
    }
  }, [user]);

  const fetchUploadHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, audio_file_name, audio_file_size, audio_duration, status, created_at, processing_completed_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching upload history:', error);
        return;
      }

      setUploadHistory(data || []);
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteHistoryItem = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this upload? This will also delete all generated content.')) {
      return;
    }

    try {
      // Delete outputs first (due to foreign key constraints)
      await supabase
        .from('outputs')
        .delete()
        .eq('project_id', projectId);

      // Delete the project
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete upload. Please try again.');
        return;
      }

      // Remove from local state
      setUploadHistory(prev => prev.filter(item => item.id !== projectId));
    } catch (error) {
      console.error('Failed to delete upload:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-yellow-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const handleFiles = (files: File[]) => {
    const audioFiles = files.filter(file => 
      file.type.startsWith('audio/') || 
      ['.mp3', '.wav', '.m4a', '.flac', '.ogg'].some(ext => file.name.toLowerCase().endsWith(ext))
    );

    // Check for oversized files
    const maxSize = 500 * 1024 * 1024; // 500MB
    const oversizedFiles = audioFiles.filter(file => file.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      alert(`Some files are too large (max 500MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    const newUploadedFiles: UploadedFile[] = audioFiles.map(file => {
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
      const status: UploadedFile['status'] = 'pending';
      
      // Warn about large files
      if (file.size > 25 * 1024 * 1024) {
        console.log(`Large file detected: ${file.name} (${fileSizeMB}MB) - upload may take several minutes`);
      }

      return {
        file,
        id: Math.random().toString(36).substr(2, 9),
        status,
        progress: 0
      };
    });

    setUploadedFiles(prev => [...prev, ...newUploadedFiles]);

    // Start processing each file
    newUploadedFiles.forEach(uploadedFile => {
      processFile(uploadedFile);
    });
  };

  const processFile = async (uploadedFile: UploadedFile) => {
    try {
      // Update status to uploading with file size info
      const fileSizeMB = (uploadedFile.file.size / 1024 / 1024).toFixed(2);
      setUploadedFiles(prev => 
        prev.map(f => f.id === uploadedFile.id ? { 
          ...f, 
          status: 'uploading',
          progress: 0 
        } : f)
      );

      // Show warning for large files
      if (uploadedFile.file.size > 25 * 1024 * 1024) {
        console.log(`Large file detected: ${fileSizeMB}MB - this may take a while`);
      }

      // Create FormData
      const formData = new FormData();
      formData.append('audio', uploadedFile.file);
      formData.append('title', uploadedFile.file.name.replace(/\.[^/.]+$/, ""));

      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      
      // Simulate progress for user feedback during upload
      const progressInterval = setInterval(() => {
        setUploadedFiles(prev => 
          prev.map(f => {
            if (f.id === uploadedFile.id && f.progress < 90) {
              return { ...f, progress: Math.min(f.progress + 5, 90) };
            }
            return f;
          })
        );
      }, 2000);

      // Upload file with longer timeout for large files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          ...(session?.access_token && {
            'Authorization': `Bearer ${session.access_token}`
          })
        },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();

      // Update status to processing
      setUploadedFiles(prev => 
        prev.map(f => f.id === uploadedFile.id ? { ...f, status: 'processing', progress: 100 } : f)
      );

      // Poll for transcription completion
      pollForCompletion(uploadedFile.id, result.projectId);

    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Upload timed out. The file may be too large or your connection is slow.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setUploadedFiles(prev => 
        prev.map(f => f.id === uploadedFile.id ? { 
          ...f, 
          status: 'error', 
          error: errorMessage,
          progress: 0
        } : f)
      );
    }
  };

  const pollForCompletion = async (fileId: string, projectId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/status`);
        const status = await response.json();

        if (status.status === 'completed') {
          setUploadedFiles(prev => 
            prev.map(f => f.id === fileId ? { ...f, status: 'completed' } : f)
          );
        } else if (status.status === 'failed') {
          setUploadedFiles(prev => 
            prev.map(f => f.id === fileId ? { 
              ...f, 
              status: 'error', 
              error: 'Processing failed' 
            } : f)
          );
        } else {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        setUploadedFiles(prev => 
          prev.map(f => f.id === fileId ? { 
            ...f, 
            status: 'error', 
            error: 'Status check failed' 
          } : f)
        );
      }
    };

    poll();
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
            Upload Podcast
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload your audio file and let AI transform it into 15+ social media posts
          </p>
        </div>

        {/* Upload Area */}
        <div className="mb-8">
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
              isDragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-4">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="mt-2 block text-sm font-medium text-gray-900">
                    Drop audio files here, or{' '}
                    <span className="text-blue-600 hover:text-blue-500">browse</span>
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    multiple
                    accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg"
                    onChange={onFileInputChange}
                  />
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  MP3, WAV, M4A, FLAC, OGG up to 500MB
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* File List */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Uploaded Files</h3>
            
            {uploadedFiles.map((uploadedFile) => (
              <div
                key={uploadedFile.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <FileAudio className="h-8 w-8 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
                      <p 
                        className="text-sm font-medium text-gray-900 truncate"
                        title={uploadedFile.file.name}
                      >
                        {uploadedFile.file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(uploadedFile.file.size)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {/* Status */}
                    <div className="flex items-center space-x-2 whitespace-nowrap">
                      {uploadedFile.status === 'pending' && (
                        <span className="text-xs text-gray-500">Pending</span>
                      )}
                      {uploadedFile.status === 'uploading' && (
                        <span className="text-xs text-blue-600">Uploading...</span>
                      )}
                      {uploadedFile.status === 'processing' && (
                        <span className="text-xs text-yellow-600">Processing...</span>
                      )}
                      {uploadedFile.status === 'completed' && (
                        <div className="flex items-center space-x-1">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-xs text-green-600 hidden sm:inline">Completed</span>
                        </div>
                      )}
                      {uploadedFile.status === 'error' && (
                        <div className="flex items-center space-x-1">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="text-xs text-red-600 hidden sm:inline">Error</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Remove button */}
                    <button
                      onClick={() => removeFile(uploadedFile.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Progress bar */}
                {(uploadedFile.status === 'uploading' || uploadedFile.status === 'processing') && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Error message */}
                {uploadedFile.status === 'error' && uploadedFile.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-xs text-red-800 break-words">{uploadedFile.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload History */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900">Upload History</h3>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showHistory && (
            <div className="bg-white shadow rounded-lg">
              {historyLoading ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gray-200 rounded"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : uploadHistory.length === 0 ? (
                <div className="p-6 text-center">
                  <FileAudio className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No uploads yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Your upload history will appear here once you start uploading audio files.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {uploadHistory.map((item) => (
                    <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {getStatusIcon(item.status)}
                          </div>
                          
                          <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
                            <h4 
                              className="text-sm font-medium text-gray-900 truncate"
                              title={item.title}
                            >
                              {item.title}
                            </h4>
                            <div className="mt-1 flex items-center space-x-2 sm:space-x-4 text-xs text-gray-500 flex-wrap">
                              <span>{formatFileSize(item.audio_file_size)}</span>
                              {item.audio_duration && (
                                <>
                                  <span className="hidden sm:inline">•</span>
                                  <span>{formatDuration(item.audio_duration)}</span>
                                </>
                              )}
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline">{new Date(item.created_at).toLocaleDateString()}</span>
                              {item.processing_completed_at && (
                                <>
                                  <span className="hidden md:inline">•</span>
                                  <span className="text-green-600 hidden md:inline">Completed</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            item.status === 'completed' ? 'bg-green-100 text-green-800' :
                            item.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                            item.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            <span className="hidden sm:inline">{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
                            <span className="sm:hidden">
                              {item.status === 'completed' ? '✓' : 
                               item.status === 'processing' ? '...' : 
                               item.status === 'failed' ? '✗' : '?'}
                            </span>
                          </span>
                          
                          <button
                            onClick={() => deleteHistoryItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                            title="Delete upload"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}