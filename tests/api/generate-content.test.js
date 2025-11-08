/**
 * Generate Content API Endpoint Tests
 * Tests for /api/generate-content route functionality
 */

import { NextRequest } from 'next/server';
import { POST } from '../../app/api/generate-content/route';
import {
  generateMockProject,
  generateMockOutput,
  mockSupabaseSuccess,
  mockSupabaseError,
  mockOpenAICompletionResponse,
  validateApiResponse,
  validateErrorResponse,
  validateSuccessResponse,
} from '../utils/test-helpers';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

// Mock Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(),
    })),
  },
}));

const OpenAI = require('openai');

describe('/api/generate-content', () => {
  let mockProject;
  let mockTranscription;
  let mockOpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock data
    mockProject = generateMockProject();
    mockTranscription = 'This is a sample podcast transcription with interesting insights about technology and business growth.';
    
    // Setup OpenAI mock
    mockOpenAI = new OpenAI();
    OpenAI.mockClear();
  });

  describe('Input Validation', () => {
    it('should return 400 when projectId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({ transcription: mockTranscription }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID and transcription are required');
    });

    it('should return 400 when transcription is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({ projectId: mockProject.id }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 400);
      
      validateErrorResponse(data, 'Project ID and transcription are required');
    });

    it('should accept valid input with segments', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      // Mock successful OpenAI responses
      const mockAnalysis = {
        keyTopics: ['technology', 'business'],
        quotes: [{ text: 'Great quote', speaker: 'Host' }],
        facts: [{ text: 'Important fact', context: 'Business' }],
        opinions: [{ text: 'Strong opinion', controversy_level: 7 }],
        humor: [{ text: 'Funny moment', type: 'joke' }],
        hooks: [{ text: 'Attention grabber', hook_strength: 9 }],
        actionable_insights: [{ text: 'Do this thing', value: 8 }],
      };
      
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse(JSON.stringify(mockAnalysis)))
        .mockResolvedValue(mockOpenAICompletionResponse('Generated content'));
      
      supabase.from().insert.mockResolvedValue(mockSupabaseSuccess());

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
          segments: [
            { id: 0, text: 'First segment', start: 0, end: 10 },
            { id: 1, text: 'Second segment', start: 10, end: 20 },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      validateSuccessResponse(data, ['projectId', 'analysis', 'contentPieces']);
    });
  });

  describe('Content Analysis', () => {
    beforeEach(() => {
      const { supabase } = require('../../lib/supabase/client');
      supabase.from().insert.mockResolvedValue(mockSupabaseSuccess());
    });

    it('should analyze content and extract all required categories', async () => {
      const mockAnalysis = {
        keyTopics: ['AI', 'Machine Learning', 'Technology'],
        quotes: [
          { text: 'AI is the future', speaker: 'Expert' },
          { text: 'Technology changes everything', speaker: 'Host' },
        ],
        facts: [
          { text: '70% of companies use AI', context: 'Business statistics' },
        ],
        opinions: [
          { text: 'AI will replace many jobs', controversy_level: 8 },
        ],
        humor: [
          { text: 'Robots taking over joke', type: 'observational' },
        ],
        hooks: [
          { text: 'You won\'t believe this AI stat', hook_strength: 9 },
        ],
        actionable_insights: [
          { text: 'Start learning AI now', value: 9 },
        ],
      };
      
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse(JSON.stringify(mockAnalysis)))
        .mockResolvedValue(mockOpenAICompletionResponse('Generated content'));

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      expect(data.analysis).toMatchObject({
        keyTopics: expect.arrayContaining(['AI', 'Machine Learning']),
        quotes: expect.arrayContaining([
          expect.objectContaining({ text: expect.any(String), speaker: expect.any(String) }),
        ]),
        facts: expect.arrayContaining([
          expect.objectContaining({ text: expect.any(String), context: expect.any(String) }),
        ]),
        opinions: expect.arrayContaining([
          expect.objectContaining({ text: expect.any(String), controversy_level: expect.any(Number) }),
        ]),
        actionable_insights: expect.arrayContaining([
          expect.objectContaining({ text: expect.any(String), value: expect.any(Number) }),
        ]),
      });
    });

    it('should handle malformed JSON response from analysis', async () => {
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse('Invalid JSON response'))
        .mockResolvedValue(mockOpenAICompletionResponse('Generated content'));

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      // Should fallback to empty analysis structure
      expect(data.analysis).toMatchObject({
        keyTopics: [],
        quotes: [],
        facts: [],
        opinions: [],
        humor: [],
        hooks: [],
        actionable_insights: [],
      });
    });
  });

  describe('Platform Content Generation', () => {
    beforeEach(() => {
      const { supabase } = require('../../lib/supabase/client');
      supabase.from().insert.mockResolvedValue(mockSupabaseSuccess());
      
      const mockAnalysis = {
        keyTopics: ['AI', 'Technology'],
        quotes: [{ text: 'Great quote', speaker: 'Host' }],
        facts: [{ text: 'Important fact', context: 'Tech' }],
        opinions: [{ text: 'Strong opinion', controversy_level: 7 }],
        humor: [{ text: 'Funny moment', type: 'joke' }],
        hooks: [
          { text: 'Hook 1', hook_strength: 9 },
          { text: 'Hook 2', hook_strength: 8 },
          { text: 'Hook 3', hook_strength: 7 },
          { text: 'Hook 4', hook_strength: 6 },
        ],
        actionable_insights: [
          { text: 'Insight 1', value: 9 },
          { text: 'Insight 2', value: 8 },
          { text: 'Insight 3', value: 7 },
        ],
      };
      
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse(JSON.stringify(mockAnalysis)))
        .mockResolvedValue(mockOpenAICompletionResponse('Generated platform content'));
    });

    it('should generate content for all platforms', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 200);
      
      expect(data.contentPieces).toBeGreaterThan(0);
      
      // Should call OpenAI multiple times for different content types
      const callCount = mockOpenAI.chat.completions.create.mock.calls.length;
      expect(callCount).toBeGreaterThan(5); // Analysis + multiple content generation calls
    });

    it('should generate Twitter threads based on hooks', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      // Check if Twitter thread prompts were called
      const calls = mockOpenAI.chat.completions.create.mock.calls;
      const twitterCalls = calls.filter(call => 
        call[0].messages[0].content.includes('Twitter/X thread')
      );
      
      expect(twitterCalls.length).toBeGreaterThan(0);
      expect(twitterCalls.length).toBeLessThanOrEqual(4); // Max 4 threads
    });

    it('should generate LinkedIn posts based on insights', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      // Check if LinkedIn prompts were called
      const calls = mockOpenAI.chat.completions.create.mock.calls;
      const linkedInCalls = calls.filter(call => 
        call[0].messages[0].content.includes('LinkedIn post')
      );
      
      expect(linkedInCalls.length).toBeGreaterThan(0);
      expect(linkedInCalls.length).toBeLessThanOrEqual(3); // Max 3 posts
    });

    it('should generate blog post content', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      // Check if blog post prompt was called
      const calls = mockOpenAI.chat.completions.create.mock.calls;
      const blogCalls = calls.filter(call => 
        call[0].messages[0].content.includes('blog post') && 
        call[0].messages[0].content.includes('3000+')
      );
      
      expect(blogCalls.length).toBe(1);
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      const mockAnalysis = {
        keyTopics: ['AI'],
        quotes: [{ text: 'Quote', speaker: 'Host' }],
        facts: [{ text: 'Fact', context: 'Tech' }],
        opinions: [{ text: 'Opinion', controversy_level: 5 }],
        humor: [{ text: 'Humor', type: 'joke' }],
        hooks: [{ text: 'Hook', hook_strength: 8 }],
        actionable_insights: [{ text: 'Insight', value: 7 }],
      };
      
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse(JSON.stringify(mockAnalysis)))
        .mockResolvedValue(mockOpenAICompletionResponse('Generated content'));
    });

    it('should save generated content to database', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      const insertMock = jest.fn().mockResolvedValue(mockSupabaseSuccess());
      supabase.from.mockReturnValue({ insert: insertMock });

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      expect(supabase.from).toHaveBeenCalledWith('outputs');
      expect(insertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            project_id: mockProject.id,
            type: expect.any(String),
            platform: expect.any(String),
            title: expect.any(String),
            content: expect.any(String),
            status: 'generated',
          }),
        ])
      );
    });

    it('should handle database insert errors', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      supabase.from().insert.mockResolvedValue(
        mockSupabaseError('Failed to insert outputs')
      );

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Content generation failed');
    });

    it('should include correct metadata for each content type', async () => {
      const { supabase } = require('../../lib/supabase/client');
      
      const insertMock = jest.fn().mockResolvedValue(mockSupabaseSuccess());
      supabase.from.mockReturnValue({ insert: insertMock });

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);
      
      const insertedContent = insertMock.mock.calls[0][0];
      
      // Check for Twitter content metadata
      const twitterContent = insertedContent.filter(item => item.platform === 'twitter');
      twitterContent.forEach(item => {
        expect(item.metadata).toHaveProperty('hook_strength');
        expect(item.metadata).toHaveProperty('thread_number');
      });
      
      // Check for LinkedIn content metadata
      const linkedInContent = insertedContent.filter(item => item.platform === 'linkedin');
      linkedInContent.forEach(item => {
        expect(item.metadata).toHaveProperty('insight_value');
        expect(item.metadata).toHaveProperty('post_number');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('OpenAI API rate limit exceeded')
      );

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Content generation failed');
    });

    it('should handle partial OpenAI failures gracefully', async () => {
      const { supabase } = require('../../lib/supabase/client');
      supabase.from().insert.mockResolvedValue(mockSupabaseSuccess());
      
      const mockAnalysis = {
        keyTopics: ['AI'],
        quotes: [{ text: 'Quote', speaker: 'Host' }],
        facts: [{ text: 'Fact', context: 'Tech' }],
        opinions: [{ text: 'Opinion', controversy_level: 5 }],
        humor: [{ text: 'Humor', type: 'joke' }],
        hooks: [{ text: 'Hook', hook_strength: 8 }],
        actionable_insights: [{ text: 'Insight', value: 7 }],
      };
      
      // First call (analysis) succeeds, subsequent calls fail
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(mockOpenAICompletionResponse(JSON.stringify(mockAnalysis)))
        .mockRejectedValue(new Error('Subsequent generation failed'));

      const request = new NextRequest('http://localhost:3000/api/generate-content', {
        method: 'POST',
        body: JSON.stringify({
          projectId: mockProject.id,
          transcription: mockTranscription,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await validateApiResponse(response, 500);
      
      validateErrorResponse(data, 'Content generation failed');
    });
  });
});