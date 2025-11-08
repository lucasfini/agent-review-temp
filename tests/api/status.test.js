/**
 * Status API Endpoint Tests
 * Tests for /api/projects/[id]/status route functionality
 */

import { NextRequest } from 'next/server';
import { GET } from '../../../app/api/projects/[id]/status/route';
import {
  generateMockProject,
  mockSupabaseSuccess,
  mockSupabaseError,
  validateApiResponse,
  validateErrorResponse,
  validateSuccessResponse,
} from '../../utils/test-helpers';

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
        head: jest.fn(),
      })),
    })),
  },
}));

describe('/api/projects/[id]/status', () => {
  let mockProject;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProject = generateMockProject();
  });

  describe('Input Validation', () => {
    it('should return 400 when project ID is missing', async () => {
      const params = Promise.resolve({ id: '' });
      
      const request = new NextRequest('http://localhost:3000/api/projects//status');
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID is required');
    });

    it('should accept valid project ID', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(mockProject)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toHaveProperty('status');
    });
  });

  describe('Project Status Retrieval', () => {
    it('should return 404 when project is not found', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseError('Project not found', 'PGRST116')
      );
      
      const params = Promise.resolve({ id: 'non-existent-project' });
      
      const request = new NextRequest('http://localhost:3000/api/projects/non-existent-project/status');
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 404);
      
      validateErrorResponse(data, 'Project not found');
    });

    it('should return project status for uploading project', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const uploadingProject = {
        ...mockProject,
        status: 'uploading',
        transcription_text: null,
        processing_time_seconds: null,
      };
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(uploadingProject)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toMatchObject({
        status: 'uploading',
        progress: 20,
        transcription_text: null,
        processing_time: null,
        outputs_generated: 0,
      });
    });

    it('should return project status for processing project', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const processingProject = {
        ...mockProject,
        status: 'processing',
        transcription_text: null,
        processing_time_seconds: null,
      };
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(processingProject)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toMatchObject({
        status: 'processing',
        progress: 60,
        transcription_text: null,
        processing_time: null,
        outputs_generated: 0,
      });
    });

    it('should return project status for completed project', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const completedProject = {
        ...mockProject,
        status: 'completed',
        transcription_text: 'This is the completed transcription.',
        processing_time_seconds: 45,
      };
      
      // Mock project query
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(completedProject)
      );
      
      // Mock outputs count query
      const mockOutputsQuery = {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ count: 12 }),
        })),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'projects') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue(mockSupabaseSuccess(completedProject)),
              })),
            })),
          };
        } else if (table === 'outputs') {
          return mockOutputsQuery;
        }
        return {};
      });
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toMatchObject({
        status: 'completed',
        progress: 100,
        transcription_text: 'This is the completed transcription.',
        processing_time: 45,
        outputs_generated: 12,
      });
    });

    it('should return project status for failed project', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const failedProject = {
        ...mockProject,
        status: 'failed',
        transcription_text: null,
        processing_time_seconds: null,
      };
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(failedProject)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toMatchObject({
        status: 'failed',
        progress: 0,
        transcription_text: null,
        processing_time: null,
        outputs_generated: 0,
      });
    });
  });

  describe('Progress Calculation', () => {
    it.each([
      ['uploading', 20],
      ['processing', 60],
      ['completed', 100],
      ['failed', 0],
      ['unknown_status', 0],
    ])('should return correct progress for status: %s', async (status, expectedProgress) => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const projectWithStatus = {
        ...mockProject,
        status,
      };
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(projectWithStatus)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data.progress).toBe(expectedProgress);
    });
  });

  describe('Outputs Count Handling', () => {
    it('should only fetch outputs count for completed projects', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const processingProject = {
        ...mockProject,
        status: 'processing',
      };
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseSuccess(processingProject)
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data.outputs_generated).toBe(0);
      
      // Verify outputs table was not queried for non-completed projects
      const calls = supabase.from.mock.calls;
      const outputsCalls = calls.filter(call => call[0] === 'outputs');
      expect(outputsCalls.length).toBe(0);
    });

    it('should handle errors in outputs count gracefully', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const completedProject = {
        ...mockProject,
        status: 'completed',
        transcription_text: 'Completed transcription',
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'projects') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue(mockSupabaseSuccess(completedProject)),
              })),
            })),
          };
        } else if (table === 'outputs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ count: null, error: 'Count failed' }),
            })),
          };
        }
        return {};
      });
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data.outputs_generated).toBe(0); // Should fallback to 0
    });
  });

  describe('Database Error Handling', () => {
    it('should handle database connection errors', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      supabase.from().select().eq().single.mockResolvedValue(
        mockSupabaseError('Connection failed', 'CONNECTION_ERROR')
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 404);
      
      validateErrorResponse(data, 'Project not found');
    });

    it('should handle unexpected database errors', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      supabase.from().select().eq().single.mockRejectedValue(
        new Error('Unexpected database error')
      );
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Internal server error');
    });
  });

  describe('Response Format', () => {
    it('should include all required fields in response', async () => {
      const { supabase } = require('../../../lib/supabase/client');
      
      const completeProject = {
        ...mockProject,
        status: 'completed',
        transcription_text: 'Full transcription',
        processing_time_seconds: 120,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:02:00Z',
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'projects') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue(mockSupabaseSuccess(completeProject)),
              })),
            })),
          };
        } else if (table === 'outputs') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ count: 15 }),
            })),
          };
        }
        return {};
      });
      
      const params = Promise.resolve({ id: mockProject.id });
      
      const request = new NextRequest(`http://localhost:3000/api/projects/${mockProject.id}/status`);
      
      const response = await GET(request, { params });
      const data = await validateApiResponse(response, 200);
      
      expect(data).toMatchObject({
        status: 'completed',
        progress: 100,
        transcription_text: 'Full transcription',
        processing_time: 120,
        outputs_generated: 15,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:02:00Z',
      });
      
      // Ensure all expected fields are present
      const expectedFields = [
        'status',
        'progress',
        'transcription_text',
        'processing_time',
        'outputs_generated',
        'created_at',
        'updated_at',
      ];
      
      expectedFields.forEach(field => {
        expect(data).toHaveProperty(field);
      });
    });
  });
});