/**
 * Transcribe API Endpoint Tests
 * Tests for /api/transcribe route functionality
 */

import { NextRequest } from 'next/server';
import { POST } from '../../app/api/transcribe/route';
import {
  generateMockProject,
  mockSupabaseSuccess,
  mockSupabaseError,
  mockOpenAITranscriptionResponse,
  validateApiResponse,
  validateErrorResponse,
  validateSuccessResponse,
} from '../utils/test-helpers';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn(),
      },
    },
  }));
});

// Mock Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        download: jest.fn(),
      })),
    },
    from: jest.fn(() => ({
      update: jest.fn(() => ({
        eq: jest.fn(),
      })),
    })),
  },
}));

// Mock fetch for async content generation call
global.fetch = jest.fn();

const OpenAI = require('openai');

describe('/api/transcribe', () => {
  let mockProject;
  let mockTranscriptionResponse;
  let mockOpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock data
    mockProject = generateMockProject();
    mockTranscriptionResponse = mockOpenAITranscriptionResponse();
    
    // Setup OpenAI mock
    mockOpenAI = new OpenAI();
    OpenAI.mockClear();
  });

  describe('Input Validation', () => {
    it('should return 400 when projectId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'test.mp3' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID and file name are required');
    });

    it('should return 400 when fileName is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'test-123' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID and file name are required');
    });

    it('should return 400 when both projectId and fileName are missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID and file name are required');
    });
  });

  describe('File Download Handling', () => {
    it('should handle file download errors', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseError('File not found')
      );
      
      supabase.from().update().eq.mockResolvedValue(mockSupabaseSuccess());

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Failed to download audio file');
      
      // Verify project status was updated to failed
      expect(supabase.from).toHaveBeenCalledWith('projects');
      expect(supabase.from().update).toHaveBeenCalledWith({ status: 'failed' });
    });

    it('should successfully download file when available', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      const mockBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
      
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseSuccess(mockBlob)
      );
      
      supabase.from().update().eq.mockResolvedValue(mockSupabaseSuccess());
      
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockTranscriptionResponse);

      // Mock fetch for content generation
      fetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test-folder/test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId', 'transcription', 'duration']);
      expect(data.transcription).toBe(mockTranscriptionResponse.text);
      expect(data.duration).toBe(mockTranscriptionResponse.duration);
    });
  });

  describe('OpenAI Integration', () => {
    beforeEach(() => {
      const { supabase } = require('../../lib/supabase/client');
      
      const mockBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseSuccess(mockBlob)
      );
      
      supabase.from().update().eq.mockResolvedValue(mockSupabaseSuccess());
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('OpenAI API rate limit exceeded')
      );

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Transcription failed');
    });

    it('should create transcription with correct parameters', async () => {
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockTranscriptionResponse);
      fetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'folder/test-audio.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.any(File),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });
      
      // Verify the file name is extracted correctly
      const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.file.name).toBe('test-audio.mp3');
    });

    it('should handle transcription response with segments', async () => {
      const extendedResponse = {
        ...mockTranscriptionResponse,
        segments: [
          { id: 0, text: 'First segment', start: 0.0, end: 2.0 },
          { id: 1, text: 'Second segment', start: 2.0, end: 4.0 },
          { id: 2, text: 'Third segment', start: 4.0, end: 6.0 },
        ],
      };
      
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(extendedResponse);
      fetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      expect(data.segments).toBe(3);
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      const { supabase } = require('../../lib/supabase/client');
      
      const mockBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseSuccess(mockBlob)
      );
      
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockTranscriptionResponse);
    });

    it('should update project with transcription results', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      supabase.from().update().eq.mockResolvedValue(mockSupabaseSuccess());
      fetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      expect(supabase.from().update).toHaveBeenCalledWith({
        transcription_text: mockTranscriptionResponse.text,
        status: 'completed',
        processing_completed_at: expect.any(String),
        processing_time_seconds: expect.any(Number),
      });
    });

    it('should handle database update errors', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      supabase.from().update().eq.mockResolvedValue(
        mockSupabaseError('Failed to update project')
      );

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Failed to save transcription');
    });
  });

  describe('Content Generation Integration', () => {
    beforeEach(() => {
      const { supabase } = require('../../lib/supabase/client');
      
      const mockBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseSuccess(mockBlob)
      );
      
      supabase.from().update().eq.mockResolvedValue(mockSupabaseSuccess());
      
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockTranscriptionResponse);
    });

    it('should trigger content generation after successful transcription', async () => {
      fetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate-content'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: mockProject.id,
            transcription: mockTranscriptionResponse.text,
            segments: mockTranscriptionResponse.segments || [],
          }),
        })
      );
    });

    it('should handle content generation fetch errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Should still return success even if content generation fails
      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId', 'transcription']);
    });
  });

  describe('Error Recovery', () => {
    it('should update project status to failed on transcription error', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      const mockBlob = new Blob(['audio data'], { type: 'audio/mpeg' });
      supabase.storage.from().download.mockResolvedValue(
        mockSupabaseSuccess(mockBlob)
      );
      
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('Transcription failed')
      );
      
      const updateMock = jest.fn().mockResolvedValue(mockSupabaseSuccess());
      supabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: updateMock,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          fileName: 'test.mp3',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      expect(updateMock).toHaveBeenCalledWith('id', mockProject.id);
    });
  });
});