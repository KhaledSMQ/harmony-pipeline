# Contributing to Harmony Pipeline

Thank you for your interest in contributing to Harmony Pipeline! This document provides guidelines and information for
contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Standards](#documentation-standards)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and
constructive in all interactions.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm 7.0.0 or higher
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/harmony-pipeline.git
   cd harmony-pipeline
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/KhaledSMQ/harmony-pipeline.git
   ```

## Development Setup

### Installation

```bash
# Install dependencies
npm install

# Verify setup
npm run type-check
npm test
```

### Available Scripts

```bash
# Development
npm run dev              # Watch mode for development
npm run type-check       # TypeScript type checking
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage

# Building
npm run build            # Build for development
npm run build:prod       # Build for production
npm run clean            # Clean build artifacts

# Quality
npm run docs             # Generate documentation
npm run size-check       # Check bundle size
```

### Project Structure

```
harmony-pipeline/
├── src/
│   ├── core/               # Core interfaces and types
│   │   ├── Context.ts      # Pipeline context and warnings
│   │   ├── Logger.ts       # Logging interface
│   │   ├── Processor.ts    # Processor interface and factory
│   │   ├── Result.ts       # Result types and type guards
│   │   ├── Stage.ts        # Stage interface and factory
│   │   └── ExecutionOptions.ts
│   ├── executor/           # Pipeline execution engine
│   │   └── PipelineExecutor.ts
│   ├── builder/            # Pipeline builder
│   │   └── PipelineBuilder.ts
│   ├── _utility/           # Internal utilities
│   │   └── object.ts
│   └── index.ts            # Public API exports
├── tests/                  # Test files
├── docs/                   # Generated documentation
└── examples/               # Usage examples
```

## Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

1. **Bug Reports**: Help us identify and fix issues
2. **Feature Requests**: Suggest new functionality
3. **Code Contributions**: Implement fixes or features
4. **Documentation**: Improve or expand documentation
5. **Examples**: Add usage examples or tutorials

### Before You Start

1. **Check existing issues** to avoid duplicating effort
2. **Create an issue** for significant changes to discuss the approach
3. **Keep changes focused** - one feature or fix per pull request
4. **Follow coding standards** outlined below

### Issue Guidelines

When creating issues:

- **Use descriptive titles** that clearly explain the problem or request
- **Provide context** including use case and expected behavior
- **Include reproduction steps** for bugs
- **Add relevant labels** if you have permission

#### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**Reproduction steps**

1. Create a pipeline with...
2. Execute with data...
3. Observe error...

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment**

- Node.js version:
- TypeScript version:
- harmony-pipeline version:

**Additional context**
Any other relevant information.
```

#### Feature Request Template

```markdown
**Feature description**
Clear description of the proposed feature.

**Use case**
Why this feature would be valuable.

**Proposed API**
If applicable, show how the API might look.

**Alternative solutions**
Other approaches you've considered.
```

## Code Standards

### TypeScript Guidelines

- **Strict mode**: All code must pass TypeScript strict mode checks
- **Explicit types**: Use explicit types for public APIs
- **Type safety**: Avoid `any` types unless absolutely necessary
- **Interfaces over types**: Prefer interfaces for object shapes
- **Readonly properties**: Use readonly for immutable data structures

### Code Style

- **Functional programming**: Prefer pure functions and immutable data
- **Error handling**: Use proper error types and comprehensive error messages
- **Documentation**: Include JSDoc comments for all public APIs
- **Naming conventions**: Use descriptive names that clearly indicate purpose

#### Example Code Style

```typescript
/**
 * Creates a processor that validates user input data.
 * 
 * @param validationRules - Rules to apply during validation
 * @returns A configured validation processor
 * @throws ValidationError when rules are invalid
 */
export function createValidationProcessor(
  validationRules: ValidationRules
): PipelineProcessor<UserInput, ValidatedUser> {
  if (!validationRules || Object.keys(validationRules).length === 0) {
    throw new ValidationError('Validation rules cannot be empty');
  }

  return createSimpleProcessor(
    'user-validator',
    validationStage,
    (input: UserInput, context: PipelineContext): ValidatedUser => {
      // Implementation here
      return validateUser(input, validationRules);
    },
    { version: '1.0.0' }
  );
}
```

### Architecture Principles

Follow these key principles:

1. **Single Responsibility Principle**: Each class/function has one reason to change
2. **Open/Closed Principle**: Open for extension, closed for modification
3. **Dependency Inversion**: Depend on abstractions, not concretions
4. **DRY (Don't Repeat Yourself)**: Avoid code duplication
5. **KISS (Keep It Simple)**: Simple solutions over complex ones

### Performance Considerations

- **Avoid premature optimization**: Profile before optimizing
- **Memory efficiency**: Use object pooling for frequently created objects
- **Async patterns**: Use proper async/await patterns
- **Error boundaries**: Isolate errors to prevent cascade failures

## Testing Guidelines

### Test Requirements

- **Coverage**: Maintain minimum 85% coverage across all metrics
- **Test types**: Include unit, integration, and error scenario tests
- **Isolation**: Tests should be independent and idempotent
- **Descriptive**: Test names should clearly describe what is being tested

### Testing Patterns

```typescript
describe('PipelineExecutor', () => {
    let executor: PipelineExecutor;
    let mockLogger: MockLogger;

    beforeEach(() => {
        executor = new PipelineExecutor();
        mockLogger = new MockLogger();
    });

    describe('processor registration', () => {
        it('should register processors with unique names', () => {
            const processor = createSimpleProcessor('test', stage, identity);

            expect(() => executor.register(processor)).not.toThrow();
            expect(executor.getRegisteredProcessorNames()).toContain('test');
        });

        it('should reject duplicate processor names', () => {
            const processor1 = createSimpleProcessor('duplicate', stage, identity);
            const processor2 = createSimpleProcessor('duplicate', stage, identity);

            executor.register(processor1);

            expect(() => executor.register(processor2))
                .toThrow('Processor \'duplicate\' is already registered');
        });
    });

    describe('error handling', () => {
        it('should collect errors when stopOnError is false', async () => {
            const failingProcessor = createSimpleProcessor(
                'failing',
                stage,
                () => {
                    throw new Error('Test error');
                }
            );

            executor.register(failingProcessor);

            const result = await executor.execute(
                'input',
                context,
                {stopOnError: false}
            );

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toBe('Test error');
        });
    });
});
```

### Test Organization

- **Unit tests**: Test individual functions and classes in isolation
- **Integration tests**: Test interaction between components
- **Error scenario tests**: Test error handling and edge cases
- **Performance tests**: Validate performance characteristics

## Documentation Standards

### JSDoc Requirements

All public APIs must include comprehensive JSDoc comments:

```typescript
/**
 * Executes the pipeline with the given input and context.
 *
 * The pipeline processes data through stages in dependency order,
 * collecting results, warnings, and errors along the way.
 *
 * @template I - Type of the initial input data
 * @param input - Initial data to process through the pipeline
 * @param context - Execution context containing metadata and logging
 * @param options - Optional configuration for execution behavior
 * @returns Promise resolving to comprehensive execution results
 * @throws AbortError when cancelled via signal or timeout
 *
 * @example
 * ```typescript
 * const result = await pipeline.execute(userData, context, {
 *   stopOnError: false,
 *   timeoutMs: 5000
 * });
 *
 * if (result.success) {
 *   console.log('Processed:', result.output);
 * }
 * ```

*/
async execute<I>(
input: I,
context: PipelineContext,
options: ExecutionOptions = {}
): Promise<PipelineResult<O>>

```

### Code Examples

- **Include realistic examples** that demonstrate actual usage
- **Show error handling** patterns in examples
- **Provide context** for when to use different approaches
- **Keep examples focused** on the specific feature being documented

## Pull Request Process

### Before Submitting

1. **Create a feature branch** from the main branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Run the full test suite**:
   ```bash
   npm run type-check
   npm test
   npm run build
   ```

4. **Update documentation** if you've changed public APIs

5. **Add tests** for new functionality

### Pull Request Guidelines

- **Descriptive title**: Clearly describe what the PR does
- **Detailed description**: Explain the changes and their rationale
- **Reference issues**: Link to related issues using keywords (fixes #123)
- **Keep it focused**: One feature or fix per pull request
- **Update CHANGELOG**: Add entry for significant changes

#### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Related Issues
Fixes #(issue number)

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated documentation

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-reviewed the code
- [ ] Added appropriate comments
- [ ] Updated relevant documentation
- [ ] No breaking changes (or breaking changes documented)
```

### Review Process

1. **Automated checks** must pass (tests, linting, type checking)
2. **Code review** by maintainers
3. **Discussion** and iteration if needed
4. **Approval** and merge by maintainers

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Create release tag
4. Publish to npm
5. Create GitHub release

## Getting Help

### Resources

- **Documentation**: [API Documentation](https://khaledsmq.github.io/harmony-pipeline/)
- **Examples**: Check the `/examples` directory
- **Issues**: [GitHub Issues](https://github.com/KhaledSMQ/harmony-pipeline/issues)
- **Discussions**: [GitHub Discussions](https://github.com/KhaledSMQ/harmony-pipeline/discussions)

### Questions

For questions about contributing:

1. **Check existing issues** and discussions first
2. **Create a discussion** for general questions
3. **Create an issue** for specific problems or feature requests
4. **Be specific** about your use case and what you're trying to achieve

### Mentorship

New contributors are welcome! If you're new to open source or this project:

- Start with issues labeled `good first issue`
- Ask questions in discussions
- Request code review feedback
- Pair with experienced contributors

## Recognition

Contributors will be recognized in:

- `CONTRIBUTORS.md` file
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to Harmony Pipeline! Your efforts help make this library better for everyone.
