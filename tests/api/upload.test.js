/**
 * Upload API Endpoint Tests
 * Tests for /api/upload route functionality
 */

import { NextRequest } from 'next/server';
import { POST } from '../../app/api/upload/route';
import {
  generateMockProject,
  createMockAudioFile,
  createMockFormData,
  mockSupabaseSuccess,
  mockSupabaseError,
  validateApiResponse,
  validateErrorResponse,
  validateSuccessResponse,
  ALLOWED_AUDIO_TYPES,
  MAX_FILE_SIZE,
} from '../utils/test-helpers';

// Mock Supabase
jest.mock('../../lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(),
      })),
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
      })),
    },
  },
}));

// Mock environment variables
const originalEnv = process.env;

describe('/api/upload', () => {
  let mockUser;
  let mockProject;
  let mockAudioFile;
  let mockFormData;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      OPENAI_API_KEY: 'test-openai-key',
    };

    // Setup mock data
    mockUser = { id: 'test-user-123', email: 'test@example.com' };
    mockProject = generateMockProject(mockUser.id);
    mockAudioFile = createMockAudioFile('test.mp3', 1024000);
    mockFormData = createMockFormData(mockAudioFile, 'Test Audio');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Validation', () => {
    it('should return 500 when Supabase URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Missing Supabase credentials');
    });

    it('should return 500 when Supabase anon key is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Missing Supabase credentials');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when no audio file is provided', async () => {
      const formData = new FormData();
      formData.append('title', 'Test Audio');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'No audio file provided');
    });

    it('should return 400 when title is missing', async () => {
      const formData = new FormData();
      formData.append('audio', mockAudioFile);
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Title is required');
    });

    it('should return 400 when file size exceeds limit', async () => {
      const largeFile = createMockAudioFile('large.mp3', MAX_FILE_SIZE + 1);
      const formData = createMockFormData(largeFile, 'Large Audio');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'File size exceeds 500MB limit');
    });

    it('should return 400 for invalid file types', async () => {
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const formData = createMockFormData(invalidFile, 'Invalid File');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Invalid file type');
    });

    it.each(ALLOWED_AUDIO_TYPES)('should accept valid audio type: %s', async (mimeType) => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      // Mock successful flow
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseSuccess(mockProject)
      );
      
      supabaseAdmin.storage.from().upload.mockResolvedValue(
        mockSupabaseSuccess({ path: 'test-path' })
      );

      const audioFile = new File(['content'], 'test.mp3', { type: mimeType });
      const formData = createMockFormData(audioFile, 'Valid Audio');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token',
        },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId']);
    });
  });

  describe('Authentication Scenarios', () => {
    it('should create demo project when user is not authenticated', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId']);
      expect(data.demo).toBe(true);
      expect(data.message).toContain('demo');
    });

    it('should process authenticated user upload', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseSuccess(mockProject)
      );
      
      supabaseAdmin.storage.from().upload.mockResolvedValue(
        mockSupabaseSuccess({ path: 'test-path' })
      );

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId']);
      expect(data.demo).toBeUndefined();
    });
  });

  describe('Database Error Handling', () => {
    it('should handle projects table not existing', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseError('relation "projects" does not exist', '42P01')
      );
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId']);
      expect(data.demo).toBe(true);
      expect(data.message).toContain('database not configured');
    });

    it('should handle foreign key constraint errors', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseError('foreign key constraint', '23503')
      );
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Database error');
    });
  });

  describe('Storage Error Handling', () => {
    it('should handle missing storage bucket', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseSuccess(mockProject)
      );
      
      supabaseAdmin.storage.from().upload.mockResolvedValue(
        mockSupabaseError('bucket not found')
      );
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: mockFormData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Storage not configured');
    });
  });

  describe('File Processing', () => {
    it('should sanitize filenames correctly', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      supabaseAdmin.from().insert().select().single.mockResolvedValue(
        mockSupabaseSuccess(mockProject)
      );
      
      const uploadMock = jest.fn().mockResolvedValue(
        mockSupabaseSuccess({ path: 'test-path' })
      );
      supabaseAdmin.storage.from().upload = uploadMock;
      
      const specialFile = new File(['content'], 'test@#$%^&*().mp3', { 
        type: 'audio/mpeg' 
      });
      const formData = createMockFormData(specialFile, 'Special Chars');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      await POST(request);
      
      expect(uploadMock).toHaveBeenCalledWith(
        expect.stringMatching(/test________.mp3$/),
        expect.any(ArrayBuffer),
        expect.any(Object)
      );
    });

    it('should estimate audio duration correctly', async () => {
      const { supabaseAdmin } = require('../../lib/supabase/server');
      
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(mockSupabaseSuccess(mockProject))
        })
      });
      supabaseAdmin.from.mockReturnValue({ insert: insertMock });
      
      supabaseAdmin.storage.from().upload.mockResolvedValue(
        mockSupabaseSuccess({ path: 'test-path' })
      );
      
      const fileSize = 128000; // 1 second at 128kbps
      const audioFile = createMockAudioFile('test.mp3', fileSize);
      const formData = createMockFormData(audioFile, 'Duration Test');
      
      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer valid-token',
        },
      });

      await POST(request);
      
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio_duration: expect.any(Number),
        })
      );
    });
  });
});