// Global test setup
require('dotenv').config({ path: '.env.local' });

// Mock environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

// Set test timeout
jest.setTimeout(30000);

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn((message) => {
    if (typeof message === 'string' && message.includes('Warning:')) {
      return;
    }
    originalConsoleError(message);
  });
  
  console.warn = jest.fn((message) => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    originalConsoleWarn(message);
  });

  console.log = jest.fn((message) => {
    if (process.env.NODE_ENV === 'test' && process.env.VERBOSE_TESTS !== 'true') {
      return;
    }
    originalConsoleLog(message);
  });
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});