# AudioRepurpose Testing Suite

A comprehensive testing framework for the AudioRepurpose application, designed to catch issues early and ensure reliable deployment.

## 🎯 Overview

This testing suite provides comprehensive coverage for:

- **API Endpoints** - All REST API routes and their functionality
- **Database Integration** - Schema validation, RLS policies, and data integrity
- **File Upload Pipeline** - File validation, storage, and processing
- **Authentication Flow** - User registration, login, and authorization
- **AI Processing** - OpenAI integration and content generation
- **Frontend Components** - User interface and interactions
- **End-to-End Workflows** - Complete user journeys

## 🚀 Quick Start

### Prerequisites

1. **Environment Setup**:
   ```bash
   cp .env.example .env.local
   # Configure your test environment variables
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Verify Configuration**:
   ```bash
   npm run test:agent -- --help
   ```

### Running Tests

#### Quick Test Run
```bash
# Run all tests with the testing agent
npm run test:agent

# Run with verbose output
npm run test:agent -- --verbose

# Run with coverage report
npm run test:agent -- --coverage
```

#### Specific Test Suites
```bash
# API tests only
npm run test:api

# Database tests only
npm run test:database

# Integration tests only
npm run test:integration

# End-to-end tests
npm run test:e2e
```

#### Development Testing
```bash
# Watch mode for development
npm run test:watch

# Run tests on file changes
npm test -- --watch
```

## 📁 Test Structure

```
tests/
├── setup.js                 # Global test setup and configuration
├── test-agent.js            # Main testing orchestrator
├── utils/
│   └── test-helpers.js      # Shared utilities and mock generators
├── api/                     # API endpoint tests
│   ├── upload.test.js       # File upload endpoint
│   ├── transcribe.test.js   # Transcription endpoint
│   ├── generate-content.test.js # Content generation endpoint
│   └── status.test.js       # Project status endpoint
├── database/                # Database integration tests
│   ├── schema-validation.test.js # Table structure and constraints
│   └── rls-policies.test.js     # Row Level Security tests
├── file-upload/             # File processing tests
│   ├── validation.test.js   # File type and size validation
│   └── storage.test.js      # Supabase Storage integration
├── auth/                    # Authentication tests
│   ├── authentication.test.js   # Login/signup flows
│   └── protected-routes.test.js # Authorization checks
├── ai-pipeline/             # AI processing tests
│   ├── openai-integration.test.js # OpenAI API integration
│   └── content-generation.test.js # Content quality validation
├── integration/             # End-to-end integration tests
│   └── full-pipeline.test.js   # Complete workflow testing
└── e2e/                     # Playwright end-to-end tests
    └── user-workflow.spec.ts   # Browser-based user journeys
```

## 🧪 Test Categories

### 1. API Endpoint Tests (`tests/api/`)

Tests all API routes for:
- Input validation and sanitization
- Authentication and authorization
- Error handling and edge cases
- Response format validation
- Rate limiting and security

**Key Features**:
- Mock external services (OpenAI, Supabase)
- Test with valid and invalid inputs
- Verify error messages and status codes
- Check data consistency

### 2. Database Integration Tests (`tests/database/`)

Validates database functionality:
- Table structure and relationships
- Foreign key constraints
- Row Level Security (RLS) policies
- Data validation and integrity
- Performance with large datasets

**Key Features**:
- Real database operations (test environment)
- Cleanup after each test
- RLS policy validation
- Cross-user access prevention

### 3. File Upload Pipeline Tests (`tests/file-upload/`)

Comprehensive file handling validation:
- File type and size validation
- Filename sanitization
- Storage bucket operations
- Upload progress tracking
- Error recovery

**Key Features**:
- Mock file objects for testing
- Test all allowed audio formats
- Validate security restrictions
- Storage integration testing

### 4. Authentication Tests (`tests/auth/`)

Complete authentication flow testing:
- User registration and login
- Session management
- Token validation
- Protected route access
- Password security

**Key Features**:
- Real Supabase Auth integration
- Token lifecycle testing
- Security vulnerability checks
- Cross-user isolation

### 5. AI Pipeline Tests (`tests/ai-pipeline/`)

AI processing and content generation:
- OpenAI API integration
- Content analysis quality
- Platform-specific generation
- Error handling and retries
- Cost tracking simulation

**Key Features**:
- Mock OpenAI responses
- Content quality validation
- Performance benchmarking
- Rate limiting simulation

### 6. Integration Tests (`tests/integration/`)

End-to-end workflow validation:
- Complete user journeys
- Cross-component integration
- Performance under load
- Data consistency across services
- Error recovery scenarios

**Key Features**:
- Full pipeline simulation
- Real-time status checking
- Concurrent user simulation
- Rollback testing

### 7. E2E Tests (`tests/e2e/`)

Browser-based user interface testing:
- User interactions
- Visual regression testing
- Accessibility compliance
- Mobile responsiveness
- Performance metrics

**Key Features**:
- Playwright automation
- Cross-browser testing
- Screenshot comparison
- Accessibility audits

## 🔧 Configuration

### Environment Variables

Required for testing:

```env
# Supabase Configuration (Test Environment)
NEXT_PUBLIC_SUPABASE_URL=your_test_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_test_service_role_key

# OpenAI Configuration (Test/Mock)
OPENAI_API_KEY=your_test_openai_key

# Test Configuration
NODE_ENV=test
VERBOSE_TESTS=false
```

### Jest Configuration (`jest.config.js`)

- **Test Environment**: Node.js for API/backend tests
- **Setup Files**: Global mocks and utilities
- **Coverage**: Comprehensive code coverage reporting
- **Timeout**: 30-second timeout for integration tests
- **Module Mapping**: Support for absolute imports

### Playwright Configuration (`playwright.config.ts`)

- **Browsers**: Chrome, Firefox, Safari
- **Viewports**: Desktop and mobile testing
- **Screenshots**: On failure for debugging
- **Video**: Test execution recording
- **Parallel Execution**: Faster test runs

## 🛠️ Testing Agent

The `test-agent.js` provides a comprehensive testing orchestrator:

### Features

- **Environment Validation**: Checks required variables and dependencies
- **Test Suite Orchestration**: Runs tests in logical order
- **Progress Reporting**: Real-time test progress and results
- **Error Aggregation**: Collects and reports all failures
- **Performance Metrics**: Tracks test execution time
- **Coverage Reports**: Generates code coverage statistics

### Command Line Options

```bash
# Basic usage
node tests/test-agent.js

# Advanced options
node tests/test-agent.js --verbose --coverage --fail-fast

# Include E2E tests
node tests/test-agent.js --e2e

# Help and documentation
node tests/test-agent.js --help
```

### Output Example

```
🚀 Starting AudioRepurpose Testing Agent...
============================================================

🔍 Validating test environment...
✅ All required environment variables are present
✅ Using test/development environment

📦 Checking test dependencies...
✅ All test dependencies are installed

🧪 Running API Endpoint Tests...
✅ API Endpoint Tests completed: 45/45 tests passed (3240ms)

🧪 Running Database Integration Tests...
✅ Database Integration Tests completed: 23/23 tests passed (1890ms)

📊 TESTING REPORT
============================================================

📈 Overall Results:
   Status: ✅ PASSED
   Success Rate: 100.0%
   Total Tests: 127
   Passed: 127
   Failed: 0
   Skipped: 3
   Duration: 12.45s

💡 Recommendations:
   • All tests passing! Ready for deployment 🚀
```

## 🎯 Best Practices

### Writing Tests

1. **Descriptive Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow the AAA pattern
3. **Isolation**: Each test should be independent
4. **Cleanup**: Always clean up test data
5. **Mocking**: Mock external services appropriately

### Test Data Management

1. **Mock Generators**: Use provided helper functions
2. **Unique Identifiers**: Generate unique test data
3. **Cleanup**: Always clean up after tests
4. **Environment Separation**: Use test-specific databases

### Performance Considerations

1. **Parallel Execution**: Tests run in parallel where safe
2. **Database Tests**: Run serially to avoid conflicts
3. **Timeouts**: Reasonable timeouts for CI environments
4. **Resource Management**: Proper cleanup of resources

## 🐛 Debugging Tests

### Common Issues

1. **Environment Variables**: Ensure all required variables are set
2. **Database Permissions**: Check RLS policies and permissions
3. **Network Timeouts**: Increase timeout for slow environments
4. **Race Conditions**: Some tests may need to run serially

### Debugging Commands

```bash
# Verbose output with detailed logs
npm run test:agent -- --verbose

# Run specific test file
npx jest tests/api/upload.test.js --verbose

# Debug specific test
npx jest tests/api/upload.test.js --testNamePattern="should upload valid file" --verbose

# Coverage report
npm run test:coverage
```

### Log Analysis

The testing agent provides structured logging:
- `INFO`: General progress and status
- `WARN`: Non-critical issues (missing optional configs)
- `ERROR`: Test failures and critical issues
- `DEBUG`: Detailed execution information (with --verbose)

## 📊 Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- **HTML Report**: `coverage/lcov-report/index.html`
- **Text Summary**: Displayed in terminal
- **LCOV Format**: `coverage/lcov.info`

### Coverage Targets

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## 🚀 CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run test suite
      run: npm run test:agent -- --coverage
      env:
        NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SERVICE_ROLE_KEY }}
        OPENAI_API_KEY: ${{ secrets.TEST_OPENAI_API_KEY }}
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

## 🤝 Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow existing naming conventions
3. Include proper setup/teardown
4. Add to test agent if needed
5. Update documentation

### Test Categories

- **Unit Tests**: Single function/component testing
- **Integration Tests**: Multi-component interaction
- **E2E Tests**: Full user workflow simulation
- **Performance Tests**: Load and stress testing

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Supabase Testing Guide](https://supabase.com/docs/guides/getting-started/testing)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## 🆘 Support

For testing issues:

1. Check environment configuration
2. Review test logs with `--verbose`
3. Ensure test database is accessible
4. Verify all dependencies are installed
5. Check for known issues in documentation

---

**Happy Testing!** 🧪✨

This comprehensive testing suite ensures the AudioRepurpose application is robust, reliable, and ready for production deployment.