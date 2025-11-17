// Global test setup
// (env vars are loaded via tests/setup-env.js before this file runs)

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
