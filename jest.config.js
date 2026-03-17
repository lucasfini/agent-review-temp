const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

const runFullSuite = process.env.RUN_FULL_TEST_SUITE === '1';

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'jest-environment-node',
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
  ],
  testPathIgnorePatterns: runFullSuite ? [] : [
    '<rootDir>/tests/ai-pipeline/',
    '<rootDir>/tests/api/',
    '<rootDir>/tests/auth/',
    '<rootDir>/tests/database/',
    '<rootDir>/tests/file-upload/',
    '<rootDir>/tests/integration/',
    '<rootDir>/tests/billing/cost-map.test.ts',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,ts,tsx}',
    'lib/**/*.{js,ts,tsx}',
    'components/**/*.{js,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  verbose: true,
  watchman: false,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
