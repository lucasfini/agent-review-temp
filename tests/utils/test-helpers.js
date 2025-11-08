const fs = require('fs');
const path = require('path');

// Mock data generators
export const generateMockUser = () => ({
  id: `test-user-${Date.now()}`,
  email: `test${Date.now()}@example.com`,
  full_name: 'Test User',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const generateMockProject = (userId = 'test-user-123') => ({
  id: `test-project-${Date.now()}`,
  user_id: userId,
  title: 'Test Audio Project',
  description: 'Test description',
  audio_file_name: 'test-audio.mp3',
  audio_file_size: 1024000,
  audio_duration: 180,
  status: 'uploading',
  transcription_text: null,
  processing_started_at: null,
  processing_completed_at: null,
  processing_time_seconds: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const generateMockOutput = (projectId = 'test-project-123') => ({
  id: `test-output-${Date.now()}`,
  project_id: projectId,
  type: 'social_post',
  platform: 'twitter',
  title: 'Test Twitter Thread',
  content: 'This is a test twitter thread content...',
  metadata: { thread_number: 1, hook_strength: 8 },
  status: 'generated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Create mock audio file for testing
export const createMockAudioFile = (filename = 'test-audio.mp3', size = 1024000) => {
  const buffer = Buffer.alloc(size);
  buffer.fill('mock audio data');
  
  return new File([buffer], filename, {
    type: 'audio/mpeg',
    lastModified: Date.now(),
  });
};

// Create mock FormData for file uploads
export const createMockFormData = (audioFile, title = 'Test Audio') => {
  const formData = new FormData();
  formData.append('audio', audioFile);
  formData.append('title', title);
  return formData;
};

// Mock Supabase responses
export const mockSupabaseSuccess = (data = {}) => ({
  data,
  error: null,
});

export const mockSupabaseError = (message = 'Database error', code = '42P01') => ({
  data: null,
  error: {
    message,
    code,
    details: null,
    hint: null,
  },
});

// Mock OpenAI responses
export const mockOpenAITranscriptionResponse = () => ({
  text: 'This is a mock transcription of the audio file.',
  duration: 180.5,
  segments: [
    {
      id: 0,
      text: 'This is a mock transcription',
      start: 0.0,
      end: 2.5,
    },
    {
      id: 1,
      text: 'of the audio file.',
      start: 2.5,
      end: 4.0,
    },
  ],
});

export const mockOpenAICompletionResponse = (content = 'Mock AI response') => ({
  choices: [
    {
      message: {
        content,
      },
    },
  ],
});

// Test validation helpers
export const validateApiResponse = (response, expectedStatus = 200) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get('content-type')).toContain('application/json');
  return response.json();
};

export const validateErrorResponse = (data, expectedError) => {
  expect(data).toHaveProperty('error');
  if (expectedError) {
    expect(data.error).toContain(expectedError);
  }
};

export const validateSuccessResponse = (data, requiredFields = []) => {
  expect(data).toHaveProperty('success', true);
  requiredFields.forEach(field => {
    expect(data).toHaveProperty(field);
  });
};

// File validation helpers
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav', 
  'audio/mp4',
  'audio/m4a',
  'audio/flac',
  'audio/ogg',
  'audio/webm'
];

export const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'];

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Database schema validation
export const validateDatabaseSchema = {
  users: ['id', 'email', 'created_at'],
  profiles: ['id', 'email', 'full_name', 'subscription_plan', 'subscription_status'],
  projects: ['id', 'user_id', 'title', 'status', 'created_at'],
  outputs: ['id', 'project_id', 'type', 'platform', 'content', 'status'],
};

// Environment validation
export const validateEnvironmentVariables = () => {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
};

// Test cleanup helpers
export const cleanupTestData = async (supabase, testIds = {}) => {
  const { projectIds = [], outputIds = [], userIds = [] } = testIds;
  
  try {
    // Clean up outputs first (foreign key dependency)
    if (outputIds.length > 0) {
      await supabase.from('outputs').delete().in('id', outputIds);
    }
    
    // Clean up projects
    if (projectIds.length > 0) {
      await supabase.from('projects').delete().in('id', projectIds);
    }
    
    // Clean up users last
    if (userIds.length > 0) {
      await supabase.from('profiles').delete().in('id', userIds);
    }
  } catch (error) {
    console.warn('Cleanup failed:', error.message);
  }
};

// Request helpers
export const createAuthenticatedRequest = (token) => ({
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

export const createMultipartRequest = (token) => ({
  headers: {
    'Authorization': `Bearer ${token}`,
    // Don't set Content-Type for multipart, let browser set it with boundary
  },
});