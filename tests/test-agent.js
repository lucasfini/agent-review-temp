#!/usr/bin/env node

/**
 * AudioRepurpose Testing Agent
 * Comprehensive testing suite for the AudioRepurpose application
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestingAgent {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testSuites: [],
      errors: [],
      warnings: [],
    };
    
    this.config = {
      verbose: process.argv.includes('--verbose'),
      failFast: process.argv.includes('--fail-fast'),
      coverage: process.argv.includes('--coverage'),
      parallel: !process.argv.includes('--no-parallel'),
      timeout: 300000, // 5 minutes
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level.toUpperCase().padEnd(7);
    
    if (level === 'error') {
      console.error(`[${timestamp}] ${prefix} ${message}`);
    } else if (level === 'warn') {
      console.warn(`[${timestamp}] ${prefix} ${message}`);
    } else if (this.config.verbose || level === 'info') {
      console.log(`[${timestamp}] ${prefix} ${message}`);
    }
  }

  async validateEnvironment() {
    this.log('🔍 Validating test environment...', 'info');
    
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      this.log(`❌ Missing environment variables: ${missingVars.join(', ')}`, 'warn');
      this.log('Some tests may be skipped or fail', 'warn');
      this.results.warnings.push(`Missing environment variables: ${missingVars.join(', ')}`);
    } else {
      this.log('✅ All required environment variables are present', 'info');
    }
    
    // Check if test database/environment is separate from production
    if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost') || 
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('test') ||
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('staging')) {
      this.log('✅ Using test/development environment', 'info');
    } else {
      this.log('⚠️  Warning: Make sure you\\'re not running tests against production!', 'warn');
    }
    
    return missingVars.length === 0;
  }

  async checkDependencies() {
    this.log('📦 Checking test dependencies...', 'info');
    
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
      );
      
      const testDeps = [
        'jest',
        '@playwright/test',
        'supertest',
        '@types/supertest',
        'msw',
        'nock',
      ];
      
      const missingDeps = testDeps.filter(dep => 
        !packageJson.devDependencies?.[dep] && !packageJson.dependencies?.[dep]
      );
      
      if (missingDeps.length > 0) {
        this.log(`❌ Missing test dependencies: ${missingDeps.join(', ')}`, 'error');
        this.log('Run: npm install to install missing dependencies', 'info');
        return false;
      }
      
      this.log('✅ All test dependencies are installed', 'info');
      return true;
    } catch (error) {
      this.log(`❌ Error checking dependencies: ${error.message}`, 'error');
      return false;
    }
  }

  async runTestSuite(suiteName, testPattern, options = {}) {
    this.log(`🧪 Running ${suiteName}...`, 'info');
    
    const startTime = Date.now();
    let success = false;
    let output = '';
    let error = '';
    
    try {
      const jestCommand = [
        'npx jest',
        testPattern,
        '--verbose',
        '--no-cache',
        `--testTimeout=${this.config.timeout}`,
        options.coverage && this.config.coverage ? '--coverage' : '',
        options.maxWorkers ? `--maxWorkers=${options.maxWorkers}` : '',
        '--passWithNoTests',
      ].filter(Boolean).join(' ');
      
      if (this.config.verbose) {
        this.log(`Executing: ${jestCommand}`, 'debug');
      }
      
      output = execSync(jestCommand, { 
        encoding: 'utf8',
        timeout: this.config.timeout,
        stdio: 'pipe',
      });
      
      success = true;
      
    } catch (err) {
      error = err.message;
      if (err.stdout) output += err.stdout;
      if (err.stderr) error += '\\n' + err.stderr;
      
      if (err.status === 1) {
        // Jest found test failures
        success = false;
      } else {
        // Jest couldn't run (configuration error, etc.)
        this.log(`❌ ${suiteName} failed to run: ${error}`, 'error');
        this.results.errors.push(`${suiteName}: ${error}`);
        return;
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Parse Jest output for results
    const suiteResults = this.parseJestOutput(output, error);
    
    this.results.testSuites.push({
      name: suiteName,
      success,
      duration,
      ...suiteResults,
    });
    
    this.results.total += suiteResults.total;
    this.results.passed += suiteResults.passed;
    this.results.failed += suiteResults.failed;
    this.results.skipped += suiteResults.skipped;
    
    if (success) {
      this.log(`✅ ${suiteName} completed: ${suiteResults.passed}/${suiteResults.total} tests passed (${duration}ms)`, 'info');
    } else {
      this.log(`❌ ${suiteName} failed: ${suiteResults.failed} tests failed, ${suiteResults.passed} passed (${duration}ms)`, 'error');
      
      if (this.config.failFast) {
        throw new Error(`Test suite ${suiteName} failed and --fail-fast is enabled`);
      }
    }
  }

  parseJestOutput(output, error) {
    const results = { passed: 0, failed: 0, skipped: 0, total: 0 };
    
    // Parse Jest summary line
    const summaryMatch = output.match(/Tests:\\s+(\\d+) failed,\\s+(\\d+) passed,\\s+(\\d+) total/) ||
                         output.match(/Tests:\\s+(\\d+) passed,\\s+(\\d+) total/) ||
                         error.match(/Tests:\\s+(\\d+) failed,\\s+(\\d+) passed,\\s+(\\d+) total/);
    
    if (summaryMatch) {
      if (summaryMatch.length === 4) {
        // Has failures
        results.failed = parseInt(summaryMatch[1]);
        results.passed = parseInt(summaryMatch[2]);
        results.total = parseInt(summaryMatch[3]);
      } else if (summaryMatch.length === 3) {
        // All passed
        results.passed = parseInt(summaryMatch[1]);
        results.total = parseInt(summaryMatch[2]);
      }
    }
    
    // Look for skipped tests
    const skippedMatch = output.match(/(\\d+) skipped/) || error.match(/(\\d+) skipped/);
    if (skippedMatch) {
      results.skipped = parseInt(skippedMatch[1]);
    }
    
    return results;
  }

  async runApiTests() {
    await this.runTestSuite(
      'API Endpoint Tests',
      'tests/api/**/*.test.js',
      { maxWorkers: this.config.parallel ? undefined : 1 }
    );
  }

  async runDatabaseTests() {
    await this.runTestSuite(
      'Database Integration Tests',
      'tests/database/**/*.test.js',
      { maxWorkers: 1 } // Database tests should run serially
    );
  }

  async runFileUploadTests() {
    await this.runTestSuite(
      'File Upload Pipeline Tests',
      'tests/file-upload/**/*.test.js',
      { maxWorkers: this.config.parallel ? undefined : 1 }
    );
  }

  async runAuthTests() {
    await this.runTestSuite(
      'Authentication Flow Tests',
      'tests/auth/**/*.test.js',
      { maxWorkers: 1 } // Auth tests may interfere with each other
    );
  }

  async runAIPipelineTests() {
    await this.runTestSuite(
      'AI Processing Pipeline Tests',
      'tests/ai-pipeline/**/*.test.js',
      { maxWorkers: this.config.parallel ? undefined : 1 }
    );
  }

  async runIntegrationTests() {
    await this.runTestSuite(
      'End-to-End Integration Tests',
      'tests/integration/**/*.test.js',
      { maxWorkers: 1 } // Integration tests should run serially
    );
  }

  async runE2ETests() {
    this.log('🎭 Running End-to-End tests with Playwright...', 'info');
    
    try {
      const output = execSync('npx playwright test', {
        encoding: 'utf8',
        timeout: this.config.timeout,
        stdio: 'pipe',
      });
      
      this.log('✅ E2E tests completed successfully', 'info');
      
      // Parse Playwright output (simplified)
      const passedMatch = output.match(/(\\d+) passed/);
      const failedMatch = output.match(/(\\d+) failed/);
      
      const e2eResults = {
        name: 'End-to-End Tests (Playwright)',
        success: !failedMatch || failedMatch[1] === '0',
        passed: passedMatch ? parseInt(passedMatch[1]) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]) : 0,
        total: (passedMatch ? parseInt(passedMatch[1]) : 0) + (failedMatch ? parseInt(failedMatch[1]) : 0),
      };
      
      this.results.testSuites.push(e2eResults);
      this.results.total += e2eResults.total;
      this.results.passed += e2eResults.passed;
      this.results.failed += e2eResults.failed;
      
    } catch (error) {
      this.log(`❌ E2E tests failed: ${error.message}`, 'error');
      this.results.errors.push(`E2E Tests: ${error.message}`);
    }
  }

  async runAllTests() {
    const startTime = Date.now();
    
    this.log('🚀 Starting AudioRepurpose Testing Agent...', 'info');
    this.log('=' * 60, 'info');
    
    try {
      // Pre-flight checks
      const envValid = await this.validateEnvironment();
      const depsValid = await this.checkDependencies();
      
      if (!depsValid) {
        throw new Error('Missing required dependencies');
      }
      
      // Run test suites
      await this.runApiTests();
      await this.runDatabaseTests();
      await this.runFileUploadTests();
      await this.runAuthTests();
      await this.runAIPipelineTests();
      await this.runIntegrationTests();
      
      // Optionally run E2E tests
      if (process.argv.includes('--e2e')) {
        await this.runE2ETests();
      }
      
    } catch (error) {
      this.log(`💥 Testing stopped due to error: ${error.message}`, 'error');
      this.results.errors.push(error.message);
    }
    
    const totalDuration = Date.now() - startTime;
    this.generateReport(totalDuration);
  }

  generateReport(totalDuration) {
    this.log('\\n📊 TESTING REPORT', 'info');
    this.log('=' * 60, 'info');
    
    // Overall summary
    const overallSuccess = this.results.failed === 0 && this.results.errors.length === 0;
    const successRate = this.results.total > 0 ? 
      ((this.results.passed / this.results.total) * 100).toFixed(1) : 0;
    
    this.log(`\\n📈 Overall Results:`, 'info');
    this.log(`   Status: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`, 'info');
    this.log(`   Success Rate: ${successRate}%`, 'info');
    this.log(`   Total Tests: ${this.results.total}`, 'info');
    this.log(`   Passed: ${this.results.passed}`, 'info');
    this.log(`   Failed: ${this.results.failed}`, 'info');
    this.log(`   Skipped: ${this.results.skipped}`, 'info');
    this.log(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'info');
    
    // Test suite breakdown
    if (this.results.testSuites.length > 0) {
      this.log(`\\n🧪 Test Suite Results:`, 'info');
      this.results.testSuites.forEach(suite => {
        const status = suite.success ? '✅' : '❌';
        const duration = suite.duration ? `(${suite.duration}ms)` : '';
        this.log(`   ${status} ${suite.name}: ${suite.passed}/${suite.total} ${duration}`, 'info');
      });
    }
    
    // Warnings
    if (this.results.warnings.length > 0) {
      this.log(`\\n⚠️  Warnings:`, 'warn');
      this.results.warnings.forEach(warning => {
        this.log(`   • ${warning}`, 'warn');
      });
    }
    
    // Errors
    if (this.results.errors.length > 0) {
      this.log(`\\n❌ Errors:`, 'error');
      this.results.errors.forEach(error => {
        this.log(`   • ${error}`, 'error');
      });
    }
    
    // Recommendations
    this.log(`\\n💡 Recommendations:`, 'info');
    
    if (this.results.failed > 0) {
      this.log('   • Fix failing tests before deployment', 'info');
      this.log('   • Run tests with --verbose for detailed output', 'info');
    }
    
    if (this.results.warnings.length > 0) {
      this.log('   • Address environment setup warnings', 'info');
    }
    
    if (overallSuccess) {
      this.log('   • All tests passing! Ready for deployment 🚀', 'info');
    }
    
    this.log('\\n=' * 60, 'info');
    
    // Exit with appropriate code
    process.exit(overallSuccess ? 0 : 1);
  }
}

// Command line interface
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
AudioRepurpose Testing Agent

Usage: node tests/test-agent.js [options]

Options:
  --verbose         Show detailed output
  --fail-fast       Stop on first test failure
  --coverage        Generate code coverage report
  --no-parallel     Run tests serially (slower but more stable)
  --e2e            Also run Playwright E2E tests
  --help, -h       Show this help message

Examples:
  node tests/test-agent.js
  node tests/test-agent.js --verbose --coverage
  node tests/test-agent.js --fail-fast --e2e
`);
    process.exit(0);
  }
  
  const agent = new TestingAgent();
  await agent.runAllTests();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Testing agent crashed:', error);
    process.exit(1);
  });
}

module.exports = TestingAgent;