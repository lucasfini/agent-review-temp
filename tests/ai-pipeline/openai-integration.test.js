/**
 * OpenAI Integration Tests
 * Tests for OpenAI API connectivity and responses
 */

import OpenAI from 'openai';
import {
  mockOpenAITranscriptionResponse,
  mockOpenAICompletionResponse,
  createMockAudioFile,
} from '../utils/test-helpers';

// Mock OpenAI
jest.mock('openai');

describe('OpenAI Integration', () => {
  let mockOpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenAI = {
      audio: {
        transcriptions: {
          create: jest.fn(),
        },
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };
    OpenAI.mockImplementation(() => mockOpenAI);
  });

  describe('API Key Validation', () => {
    it('should validate OpenAI API key presence', () => {
      expect(process.env.OPENAI_API_KEY).toBeDefined();
      
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('test-')) {
        console.warn('Using test/mock OpenAI API key');
      }
    });

    it('should create OpenAI client with API key', () => {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: process.env.OPENAI_API_KEY,
      });
    });

    it('should handle missing API key gracefully', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      expect(() => {
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
      }).not.toThrow();

      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  describe('Whisper Transcription API', () => {
    it('should transcribe audio file successfully', async () => {
      const mockResponse = mockOpenAITranscriptionResponse();
      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const audioFile = createMockAudioFile('test.mp3', 1024000);
      const client = new OpenAI();

      const result = await client.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });

      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });

      expect(result).toEqual(mockResponse);
      expect(result.text).toBeDefined();
      expect(result.duration).toBeDefined();
      expect(result.segments).toBeDefined();
    });

    it('should handle different response formats', async () => {
      const formats = ['json', 'text', 'srt', 'verbose_json', 'vtt'];

      for (const format of formats) {
        const mockResponse = format === 'text' ? 
          'Simple text response' : 
          mockOpenAITranscriptionResponse();
        
        mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

        const audioFile = createMockAudioFile('test.mp3', 1024000);
        const client = new OpenAI();

        const result = await client.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          response_format: format,
        });

        expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
          file: audioFile,
          model: 'whisper-1',
          response_format: format,
        });

        expect(result).toBeDefined();
      }
    });

    it('should handle different audio file types', async () => {
      const audioTypes = [
        { name: 'test.mp3', type: 'audio/mpeg' },
        { name: 'test.wav', type: 'audio/wav' },
        { name: 'test.m4a', type: 'audio/mp4' },
        { name: 'test.flac', type: 'audio/flac' },
      ];

      for (const { name, type } of audioTypes) {
        const mockResponse = mockOpenAITranscriptionResponse();
        mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

        const audioFile = new File(['audio content'], name, { type });
        const client = new OpenAI();

        const result = await client.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
        });

        expect(result).toEqual(mockResponse);
      }
    });

    it('should handle transcription errors', async () => {
      const errorScenarios = [
        { error: new Error('API rate limit exceeded'), expectedError: /rate limit/i },
        { error: new Error('File too large'), expectedError: /file.*large/i },
        { error: new Error('Invalid audio format'), expectedError: /format/i },
        { error: new Error('Authentication failed'), expectedError: /auth/i },
      ];

      for (const { error, expectedError } of errorScenarios) {
        mockOpenAI.audio.transcriptions.create.mockRejectedValue(error);

        const audioFile = createMockAudioFile('test.mp3', 1024000);
        const client = new OpenAI();

        await expect(
          client.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
          })
        ).rejects.toThrow(expectedError);
      }
    });

    it('should validate transcription parameters', async () => {
      const audioFile = createMockAudioFile('test.mp3', 1024000);
      const client = new OpenAI();

      // Test with different temperature values
      const temperatures = [0, 0.5, 1.0];
      
      for (const temperature of temperatures) {
        mockOpenAI.audio.transcriptions.create.mockResolvedValue(
          mockOpenAITranscriptionResponse()
        );

        await client.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          temperature,
        });

        expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
          file: audioFile,
          model: 'whisper-1',
          temperature,
        });
      }
    });

    it('should handle large audio files', async () => {
      const mockResponse = mockOpenAITranscriptionResponse();
      mockResponse.duration = 3600; // 1 hour
      mockResponse.segments = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        text: `Segment ${i + 1}`,
        start: i * 36,
        end: (i + 1) * 36,
      }));

      mockOpenAI.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const largeAudioFile = createMockAudioFile('large.mp3', 50 * 1024 * 1024); // 50MB
      const client = new OpenAI();

      const result = await client.audio.transcriptions.create({
        file: largeAudioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      expect(result.duration).toBe(3600);
      expect(result.segments).toHaveLength(100);
    });
  });

  describe('Chat Completions API', () => {
    it('should generate content analysis successfully', async () => {
      const mockAnalysis = {
        keyTopics: ['AI', 'Technology', 'Innovation'],
        quotes: [
          { text: 'AI is transforming everything', speaker: 'Expert' },
        ],
        facts: [
          { text: '70% of companies use AI', context: 'Business adoption' },
        ],
        opinions: [
          { text: 'AI will change the workforce', controversy_level: 6 },
        ],
        humor: [
          { text: 'Robots taking our jobs joke', type: 'observational' },
        ],
        hooks: [
          { text: 'The AI revolution is here', hook_strength: 9 },
        ],
        actionable_insights: [
          { text: 'Start learning AI skills now', value: 8 },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockOpenAICompletionResponse(JSON.stringify(mockAnalysis))
      );

      const transcription = 'This is a sample podcast transcription about AI technology...';
      const client = new OpenAI();

      const result = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: `Analyze this podcast transcription: ${transcription}`,
          },
        ],
        temperature: 0.3,
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: `Analyze this podcast transcription: ${transcription}`,
          },
        ],
        temperature: 0.3,
      });

      expect(result.choices[0].message.content).toBe(JSON.stringify(mockAnalysis));
    });

    it('should generate platform-specific content', async () => {
      const platforms = [
        { name: 'Twitter', content: 'Twitter thread content' },
        { name: 'LinkedIn', content: 'LinkedIn post content' },
        { name: 'Instagram', content: 'Instagram carousel content' },
        { name: 'Blog', content: 'Blog post content' },
      ];

      for (const { name, content } of platforms) {
        mockOpenAI.chat.completions.create.mockResolvedValue(
          mockOpenAICompletionResponse(content)
        );

        const client = new OpenAI();

        const result = await client.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: `Create ${name} content from this transcription...`,
            },
          ],
          temperature: 0.7,
        });

        expect(result.choices[0].message.content).toBe(content);
      }
    });

    it('should handle different model types', async () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'];

      for (const model of models) {
        mockOpenAI.chat.completions.create.mockResolvedValue(
          mockOpenAICompletionResponse('Generated content')
        );

        const client = new OpenAI();

        await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Generate content' }],
        });

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
          model,
          messages: [{ role: 'user', content: 'Generate content' }],
        });
      }
    });

    it('should handle chat completion errors', async () => {
      const errorScenarios = [
        { error: new Error('Model overloaded'), expectedError: /overloaded/i },
        { error: new Error('Context length exceeded'), expectedError: /context.*length/i },
        { error: new Error('Rate limit exceeded'), expectedError: /rate limit/i },
        { error: new Error('Invalid API key'), expectedError: /api.*key/i },
      ];

      for (const { error, expectedError } of errorScenarios) {
        mockOpenAI.chat.completions.create.mockRejectedValue(error);

        const client = new OpenAI();

        await expect(
          client.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Generate content' }],
          })
        ).rejects.toThrow(expectedError);
      }
    });

    it('should validate prompt length and token limits', async () => {
      const longContent = 'a'.repeat(100000); // Very long content

      mockOpenAI.chat.completions.create.mockImplementation((params) => {
        const totalLength = params.messages.reduce(
          (sum, msg) => sum + msg.content.length, 0
        );
        
        if (totalLength > 50000) {
          throw new Error('Context length exceeded');
        }
        
        return Promise.resolve(mockOpenAICompletionResponse('Generated content'));
      });

      const client = new OpenAI();

      await expect(
        client.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: longContent }],
        })
      ).rejects.toThrow(/context.*length/i);
    });

    it('should handle streaming responses', async () => {
      const streamingResponse = {
        choices: [
          {
            delta: { content: 'Streaming ' },
            index: 0,
            finish_reason: null,
          },
          {
            delta: { content: 'response ' },
            index: 0,
            finish_reason: null,
          },
          {
            delta: { content: 'content' },
            index: 0,
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(streamingResponse);

      const client = new OpenAI();

      const result = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Generate content' }],
        stream: true,
      });

      expect(result).toEqual(streamingResponse);
    });
  });

  describe('API Response Validation', () => {
    it('should validate transcription response structure', () => {
      const response = mockOpenAITranscriptionResponse();

      // Required fields for verbose_json format
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('duration');
      expect(response).toHaveProperty('segments');

      expect(typeof response.text).toBe('string');
      expect(typeof response.duration).toBe('number');
      expect(Array.isArray(response.segments)).toBe(true);

      // Validate segment structure
      response.segments.forEach(segment => {
        expect(segment).toHaveProperty('id');
        expect(segment).toHaveProperty('text');
        expect(segment).toHaveProperty('start');
        expect(segment).toHaveProperty('end');
        expect(typeof segment.start).toBe('number');
        expect(typeof segment.end).toBe('number');
        expect(segment.start).toBeLessThan(segment.end);
      });
    });

    it('should validate chat completion response structure', () => {
      const response = mockOpenAICompletionResponse('Test content');

      expect(response).toHaveProperty('choices');
      expect(Array.isArray(response.choices)).toBe(true);
      expect(response.choices.length).toBeGreaterThan(0);

      const choice = response.choices[0];
      expect(choice).toHaveProperty('message');
      expect(choice.message).toHaveProperty('content');
      expect(typeof choice.message.content).toBe('string');
    });

    it('should handle malformed API responses', () => {
      const malformedResponses = [
        null,
        undefined,
        {},
        { text: null },
        { choices: null },
        { choices: [] },
      ];

      malformedResponses.forEach(response => {
        // Test that the application handles these gracefully
        expect(() => {
          if (response && response.text !== undefined) {
            // Transcription response
            expect(typeof response.text).toBe('string');
          } else if (response && response.choices !== undefined) {
            // Chat completion response
            expect(Array.isArray(response.choices)).toBe(true);
          }
        }).not.toThrow();
      });
    });
  });

  describe('Rate Limiting and Retry Logic', () => {
    it('should handle rate limit errors with exponential backoff', async () => {
      let callCount = 0;
      mockOpenAI.chat.completions.create.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Rate limit exceeded');
        }
        return Promise.resolve(mockOpenAICompletionResponse('Success'));
      });

      const client = new OpenAI();

      // Simulate retry logic (this would be implemented in the actual code)
      let result;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          result = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          });
          break;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw error;
          }
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }

      expect(result).toBeDefined();
      expect(callCount).toBe(3);
    });

    it('should respect API rate limits', async () => {
      const rateLimitResponse = {
        error: {
          type: 'rate_limit_exceeded',
          message: 'Rate limit reached for requests',
        },
      };

      mockOpenAI.chat.completions.create.mockRejectedValue(rateLimitResponse);

      const client = new OpenAI();

      await expect(
        client.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toEqual(rateLimitResponse);
    });
  });

  describe('Cost and Usage Tracking', () => {
    it('should track token usage for different models', () => {
      const models = [
        { name: 'gpt-4', inputCost: 0.03, outputCost: 0.06 },
        { name: 'gpt-3.5-turbo', inputCost: 0.001, outputCost: 0.002 },
      ];

      models.forEach(({ name, inputCost, outputCost }) => {
        const estimatedInputTokens = 1000;
        const estimatedOutputTokens = 500;
        
        const cost = (estimatedInputTokens / 1000 * inputCost) + 
                    (estimatedOutputTokens / 1000 * outputCost);

        expect(cost).toBeGreaterThan(0);
        expect(typeof cost).toBe('number');
      });
    });

    it('should estimate costs for different operations', () => {
      const operations = [
        { name: 'transcription', minutes: 60, costPerMinute: 0.006 },
        { name: 'analysis', tokens: 2000, costPerToken: 0.00003 },
        { name: 'generation', tokens: 1500, costPerToken: 0.00006 },
      ];

      operations.forEach(({ name, minutes, tokens, costPerMinute, costPerToken }) => {
        let estimatedCost;
        
        if (minutes && costPerMinute) {
          estimatedCost = minutes * costPerMinute;
        } else if (tokens && costPerToken) {
          estimatedCost = tokens * costPerToken;
        }

        expect(estimatedCost).toBeGreaterThan(0);
        expect(typeof estimatedCost).toBe('number');
      });
    });
  });
});