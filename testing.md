# Testing Guide for Harmony Pipeline

This document describes the comprehensive testing strategy and setup for the harmony-pipeline library.

## Test Structure

```
tests/
├── setup.ts                    # Global test utilities and matchers
├── integration.test.ts         # End-to-end integration tests
src/
├── core/
│   └── __tests__/
│       ├── Logger.test.ts      # Logger interface tests
│       ├── Context.test.ts     # Pipeline context tests
│       ├── Stage.test.ts       # Stage creation and dependency tests
│       ├── Processor.test.ts   # Processor functionality tests
│       ├── Result.test.ts      # Result types and type guards tests
│       └── ExecutionOptions.test.ts # Execution options tests
├── executor/
│   └── __tests__/
│       └── PipelineExecutor.test.ts # Core executor functionality
└── builder/
    └── __tests__/
        └── PipelineBuilder.test.ts  # Builder pattern tests
```

## Test Categories

### Unit Tests

Located in `src/**/__tests__/`, these test individual components in isolation:

- **Logger Tests**: Verify NullLogger behavior and interface compliance
- **Context Tests**: Test context creation, warning system, and immutability
- **Stage Tests**: Validate stage creation, dependencies, and conditional execution
- **Processor Tests**: Test processor creation, lifecycle hooks, and execution
- **Result Tests**: Verify result types, type guards, and data structures
- **ExecutionOptions Tests**: Test configuration options and defaults
- **PipelineExecutor Tests**: Core execution logic, error handling, concurrency
- **PipelineBuilder Tests**: Builder pattern, method chaining, validation

### Integration Tests

Located in `tests/integration.test.ts`, these test complete workflows:

- **Data Processing Pipeline**: Multi-stage data transformation and validation
- **File Processing Pipeline**: File handling with I/O simulation
- **Error Recovery Pipeline**: Error handling and recovery strategies
- **Concurrent Processing**: Performance and concurrency testing
- **Real-time Event Processing**: Event handling with monitoring
- **Pipeline Composition**: Reusable component composition
- **Performance Testing**: High-throughput and load testing

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests for CI (no watch, with coverage)
npm run test:ci

# Debug tests
npm run test:debug
```

### Test Filtering

```bash
# Run specific test file
npx jest Logger.test.ts

# Run tests matching pattern
npx jest --testNamePattern="should handle"

# Run tests for specific module
npx jest Context

# Run only changed files
npx jest -o
```

## Test Utilities

### MockLogger

A test logger that captures all log messages for verification:

```typescript
import { MockLogger } from '../tests/setup';

const mockLogger = new MockLogger();
// ... use in tests
expect(mockLogger.infoMessages).toHaveLength(1);
expect(mockLogger.errorMessages[0].message).toContain('error');
```

### Custom Matchers

Extended Jest matchers for pipeline-specific assertions:

```typescript
// Check if pipeline result is successful
expect(result).toBeSuccessfulPipelineResult();

// Check if pipeline result failed
expect(result).toBeFailedPipelineResult();

// Check if result has specific warning
expect(result).toHaveWarning('WARNING_CODE');

// Check if result has specific error
expect(result).toHaveError('error message');
```

### Test Helpers

```typescript
import { delay, waitFor, createTimeoutController } from '../tests/setup';

// Simulate async delays
await delay(100);

// Wait for conditions
await waitFor(() => someCondition, 5000);

// Create abort controllers for timeout testing
const controller = createTimeoutController(1000);
```

## Writing Tests

### Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
describe('ComponentName', () => {
    describe('methodName', () => {
        it('should do something specific', () => {
            // Arrange
            const input = createTestInput();
            const expected = expectedOutput;

            // Act
            const result = component.method(input);

            // Assert
            expect(result).toEqual(expected);
        });
    });
});
```

### Testing Async Code

```typescript
it('should handle async operations', async () => {
    const processor = createSimpleProcessor(
        'async-proc',
        stage,
        async (input) => {
            await delay(10);
            return input.toUpperCase();
        }
    );

    const result = await processor.process('test', context);
    expect(result).toBe('TEST');
});
```

### Testing Error Conditions

```typescript
it('should handle errors gracefully', async () => {
    const failingProcessor = createSimpleProcessor(
        'failing-proc',
        stage,
        () => {
            throw new Error('Processing failed');
        }
    );

    await expect(
        failingProcessor.process('test', context)
    ).rejects.toThrow('Processing failed');
});
```

### Testing Event Emission

```typescript
it('should emit correct events', async () => {
    const events: string[] = [];

    executor.on('stageStart', ({stage}) => {
        events.push(`start:${stage}`);
    });

    await executor.execute('test', context);

    expect(events).toContain('start:test-stage');
});
```

### Testing Concurrency

```typescript
it('should handle concurrent execution', async () => {
    const executionTimes: number[] = [];

    const processor = createSimpleProcessor(
        'concurrent-proc',
        stage,
        async (input) => {
            const start = Date.now();
            await delay(50);
            executionTimes.push(Date.now() - start);
            return input;
        }
    );

    // Test with different concurrency levels
    const sequential = await executeWithConcurrency(1);
    const concurrent = await executeWithConcurrency(3);

    expect(concurrent.totalTime).toBeLessThan(sequential.totalTime);
});
```

## Coverage Requirements

The project maintains high test coverage standards:

- **Minimum Coverage**: 85% for all metrics
- **Branches**: 85% - All conditional logic paths tested
- **Functions**: 85% - All public and important private functions tested
- **Lines**: 85% - Most code lines executed in tests
- **Statements**: 85% - All significant statements covered

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML coverage report
open coverage/lcov-report/index.html
```

## Performance Testing

### Load Testing

Integration tests include performance benchmarks:

```typescript
it('should handle high-throughput processing', async () => {
    const batchSize = 1000;
    const numBatches = 10;

    const startTime = Date.now();

    for (let i = 0; i < numBatches; i++) {
        const batch = generateTestBatch(batchSize);
        const result = await pipeline.execute(batch, context);
        expect(result.success).toBe(true);
    }

    const totalTime = Date.now() - startTime;
    const throughput = (numBatches * batchSize) / (totalTime / 1000);

    expect(throughput).toBeGreaterThan(1000); // items/sec
});
```

### Memory Testing

Tests verify no memory leaks across multiple executions:

```typescript
it('should not leak memory across executions', async () => {
    // Run many executions
    for (let i = 0; i < 100; i++) {
        const result = await pipeline.execute(`test-${i}`, context);
        expect(result.success).toBe(true);
    }

    // Verify pipeline still functional
    const finalResult = await pipeline.execute('final', context);
    expect(finalResult.success).toBe(true);
});
```

## Debugging Tests

### Debug Mode

Run tests with Node.js debugger:

```bash
npm run test:debug
```

Then connect your debugger to `localhost:9229`.

### Verbose Output

Enable detailed test output:

```bash
npx jest --verbose --no-coverage
```

### Specific Test Debugging

Run a single test with full output:

```bash
npx jest --testNamePattern="specific test name" --verbose
```

## Continuous Integration

### CI Pipeline

Tests run automatically on:

- Pull requests
- Commits to main branch
- Release builds

### CI Configuration

```bash
# Full CI test suite
npm run ci

# This runs:
# 1. Type checking
# 2. Linting
# 3. All tests with coverage
# 4. Build verification
# 5. Bundle size check
```

## Best Practices

### Test Naming

- Use descriptive test names that explain the scenario
- Follow "should [expected behavior] when [condition]" pattern
- Group related tests in `describe` blocks

### Test Independence

- Each test should be independent and isolated
- Use `beforeEach`/`afterEach` for setup/cleanup
- Don't rely on test execution order

### Mock Usage

- Mock external dependencies, not internal logic
- Use the provided `MockLogger` for logging tests
- Keep mocks simple and focused

### Assertion Quality

- Use specific assertions over generic ones
- Test both positive and negative cases
- Verify error messages and types, not just that errors occur

### Performance Considerations

- Keep tests fast (< 100ms per test typically)
- Use `delay()` sparingly and with minimal values
- Group slow tests separately if needed

## Troubleshooting

### Common Issues

1. **Tests timing out**: Increase timeout or check for unresolved promises
2. **Coverage gaps**: Add tests for uncovered branches/functions
3. **Flaky tests**: Usually indicates timing issues or test dependencies
4. **Memory leaks**: Check for uncleared timers or event listeners

### Getting Help

1. Check test output for specific error messages
2. Run tests in debug mode for detailed investigation
3. Review similar tests for patterns and examples
4. Ensure all async operations are properly awaited

## Test Data

### Factories

Use test data factories for consistent test objects:

```typescript
import { createTestUser, createTestMetadata } from './setup';

const user = createTestUser({name: 'Custom Name'});
const metadata = createTestMetadata({environment: 'test'});
```

### Fixtures

For complex test data, consider external fixtures:

```typescript
// tests/fixtures/sample-data.json
{
    "users"
:
    [...],
        "events"
:
    [...]
}
```

This comprehensive testing approach ensures the harmony-pipeline library is robust, reliable, and ready for production
use.
