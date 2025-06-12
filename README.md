<p align="center">
<a href="https://harmonytype.com" target="_blank"><img src="https://raw.githubusercontent.com/KhaledSMQ/harmony-art/main/harmony-pipeline.png" width="400" alt="Harmony Pipeline post">
</a>
</p>

<p align="center">

[![npm version](https://badge.fury.io/js/harmony-pipeline.svg)](https://badge.fury.io/js/harmony-pipeline)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

</p>

# Harmony Pipeline

A robust TypeScript pipeline execution library with stage-based processing, dependency resolution, and comprehensive
error handling.

## Features

- **Stage-based execution** with automatic dependency resolution
- **Type-safe processor composition** with full TypeScript support
- **Concurrent execution** support within stages
- **Comprehensive error handling** with graceful recovery options
- **Event-driven monitoring** for observability and debugging
- **Graceful cancellation** and timeout handling
- **Warning system** for non-fatal issues
- **Zero dependencies** and lightweight design

## Installation

```bash
npm install harmony-pipeline
```

## Quick Start

```typescript
import {
    createPipelineBuilder,
    createStage,
    createSimpleProcessor,
    createPipelineContext
} from 'harmony-pipeline';

// Define stages with dependencies
const inputStage = createStage('input');
const processStage = createStage('process', {dependencies: ['input']});
const outputStage = createStage('output', {dependencies: ['process']});

// Create processors
const validator = createSimpleProcessor(
    'validator',
    inputStage,
    (data: string) => {
        if (!data || data.trim().length === 0) {
            throw new Error('Input cannot be empty');
        }
        return data.trim();
    }
);

const transformer = createSimpleProcessor(
    'transformer',
    processStage,
    (data: string) => ({
        original: data,
        transformed: data.toUpperCase(),
        timestamp: Date.now()
    })
);

const formatter = createSimpleProcessor(
    'formatter',
    outputStage,
    (data: { original: string; transformed: string; timestamp: number }) =>
        `[${new Date(data.timestamp).toISOString()}] ${data.original} → ${data.transformed}`
);

// Build and execute pipeline
const pipeline = createPipelineBuilder<string, string>()
    .withProcessor(validator, transformer, formatter)
    .build();

const context = createPipelineContext({
    userId: '123',
    environment: 'production'
});

const result = await pipeline.execute('  hello world  ', context);

if (result.success) {
    console.log(result.output);
    // Output: [2024-01-15T10:30:00.000Z] hello world → HELLO WORLD
}
```

## Core Concepts

### Stages

Stages define execution order through dependency relationships, forming a Directed Acyclic Graph (DAG):

```typescript
const preprocessStage = createStage('preprocess');
const validationStage = createStage('validation', { 
  dependencies: ['preprocess'] 
});
const transformStage = createStage('transform', { 
  dependencies: ['validation'] 
});
const postprocessStage = createStage('postprocess', { 
  dependencies: ['transform'] 
});
```

### Processors

Processors contain the actual business logic and belong to specific stages:

```typescript
interface UserData {
  id: string;
  email: string;
  name: string;
}

const emailValidator = createSimpleProcessor(
  'email-validator',
  validationStage,
  (user: UserData, context) => {
    if (!user.email.includes('@')) {
      context.addWarning('INVALID_EMAIL', `Invalid email: ${user.email}`);
    }
    return user;
  }
);

const userNormalizer = createSimpleProcessor(
  'user-normalizer',
  transformStage,
  (user: UserData) => ({
    ...user,
    email: user.email.toLowerCase(),
    name: user.name.trim()
  })
);
```

### Context and Metadata

The pipeline context carries metadata and provides logging throughout execution:

```typescript
const context = createPipelineContext({
  correlationId: 'req-123',
  environment: 'production',
  features: ['validation', 'transformation']
});

// Processors can access metadata
const processor = createSimpleProcessor(
  'conditional-processor',
  stage,
  (data, context) => {
    if (context.metadata.features.includes('validation')) {
      // Perform validation
    }
    return data;
  }
);
```

## Advanced Usage

### Custom Processors with Lifecycle Hooks

```typescript
class DatabaseProcessor implements PipelineProcessor<UserData, UserData> {
    name = 'database-processor';
    version = '1.0.0' as const;
    stage = createStage('persistence');

    private connection?: DatabaseConnection;

    async setup(context: PipelineContext): Promise<void> {
        this.connection = await createDatabaseConnection(
            context.metadata.databaseUrl
        );
        context.logger.info('Database connection established');
    }

    async process(
        user: UserData,
        context: PipelineContext,
        signal?: AbortSignal
    ): Promise<UserData> {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        await this.connection!.save(user);
        context.logger.info(`User ${user.id} saved to database`);
        return user;
    }

    async teardown(context: PipelineContext): Promise<void> {
        await this.connection?.close();
        context.logger.info('Database connection closed');
    }

    async onError(error: Error, context: PipelineContext): Promise<void> {
        context.logger.error('Database operation failed', {error: error.message});
        // Perform cleanup or recovery logic
    }
}
```

### Event Monitoring

```typescript
const pipeline = createPipelineBuilder()
    .withProcessor(processor1, processor2)
    .build();

// Monitor pipeline execution
pipeline.on('pipelineStart', () => {
    console.log('Pipeline execution started');
});

pipeline.on('stageStart', ({stage}) => {
    console.log(`Stage '${stage}' started`);
});

pipeline.on('processorEnd', ({processor, outcome}) => {
    if (outcome.kind === 'ok') {
        console.log(`Processor '${processor}' completed in ${outcome.elapsed}ms`);
    } else {
        console.log(`Processor '${processor}' failed: ${outcome.error.message}`);
    }
});

pipeline.on('warning', (warning) => {
    console.warn(`Warning ${warning.code}: ${warning.message}`);
});
```

### Error Handling and Recovery

```typescript
const options: ExecutionOptions = {
    stopOnError: false,        // Continue execution after errors
    concurrency: 3,            // Run up to 3 processors concurrently per stage
    timeoutMs: 30000,          // 30 second timeout
    logger: customLogger       // Custom logger implementation
};

const result = await pipeline.execute(data, context, options);

if (!result.success) {
    console.log('Pipeline failed with errors:');
    result.errors.forEach(error => {
        console.error(`- ${error.message}`);
    });

    console.log('Warnings generated:');
    result.warnings.forEach(warning => {
        console.warn(`- ${warning.code}: ${warning.message}`);
    });
}

// Check individual stage outcomes
result.stages.forEach(outcome => {
    if (outcome.kind === 'err') {
        console.error(`Stage ${outcome.stageName} failed: ${outcome.error.message}`);
    }
});
```

### Conditional Stage Execution

```typescript
const conditionalStage = createStage('conditional', {
  canExecute: (context) => context.metadata.environment === 'production'
});

const productionProcessor = createSimpleProcessor(
  'production-only',
  conditionalStage,
  (data) => {
    // This only runs in production
    return enhanceDataForProduction(data);
  }
);
```

### Pipeline Composition and Reuse

```typescript
// Create reusable processor collections
const validationProcessors = [
  emailValidator,
  phoneValidator,
  addressValidator
];

const transformationProcessors = [
  normalizer,
  enricher,
  formatter
];

// Build specialized pipelines
const userRegistrationPipeline = createPipelineBuilder<UserInput, UserOutput>()
  .withProcessors(validationProcessors)
  .withProcessors(transformationProcessors)
  .withProcessor(registrationProcessor)
  .build();

const userUpdatePipeline = createPipelineBuilder<UserInput, UserOutput>()
  .withProcessors(validationProcessors)
  .withProcessors(transformationProcessors)
  .withProcessor(updateProcessor)
  .build();
```

## API Reference

### Core Functions

- `createPipelineBuilder<I, O, TCtx>()` - Creates a new pipeline builder
- `createStage(name, options?)` - Creates a stage with optional dependencies
- `createSimpleProcessor(name, stage, processFunction, options?)` - Creates a processor
- `createPipelineContext(metadata, logger?)` - Creates an execution context
- `createExecutionOptions(options?)` - Creates execution options with defaults

### Types

- `PipelineProcessor<I, O, TCtx>` - Interface for custom processors
- `PipelineStage<TCtx>` - Stage definition interface
- `PipelineContext<M>` - Execution context interface
- `PipelineResult<O>` - Pipeline execution result
- `ExecutionOptions` - Configuration for pipeline execution

### Builder Methods

- `withProcessor(...processors)` - Add processors to the pipeline
- `withProcessors(processors[])` - Add an array of processors
- `withProcessorIf(condition, processor)` - Conditionally add a processor
- `withProcessorFactory(factory)` - Add a processor using a factory function
- `build(options?)` - Build the pipeline executor
- `clone()` - Create a copy of the builder

## Error Handling

The library provides comprehensive error handling at multiple levels:

1. **Processor-level**: Individual processors can fail without stopping the pipeline
2. **Stage-level**: Warnings and errors are collected per stage
3. **Pipeline-level**: Overall success/failure with detailed error information

```typescript
const result = await pipeline.execute(data, context);

// Check overall success
if (result.success) {
    console.log('Pipeline completed successfully');
} else {
    console.log('Pipeline failed');

    // Access specific errors
    result.errors.forEach(error => {
        console.error(error.message);
    });
}

// Access warnings (non-fatal issues)
result.warnings.forEach(warning => {
    console.warn(`${warning.code}: ${warning.message}`);
});
```

## Performance Considerations

- **Memory**: Each pipeline execution creates a new context and result objects
- **Concurrency**: Use the `concurrency` option carefully - only beneficial when processors are independent
- **Event listeners**: Remove event listeners when no longer needed to prevent memory leaks
- **Large data**: Consider streaming or chunking for large datasets

## TypeScript Support

The library is built with TypeScript and provides full type safety:

```typescript
// Type-safe pipeline with specific input/output types
const typedPipeline = createPipelineBuilder<UserInput, ProcessedUser>()
  .withProcessor(validator)  // UserInput → ValidatedUser
  .withProcessor(enricher)   // ValidatedUser → EnrichedUser  
  .withProcessor(formatter)  // EnrichedUser → ProcessedUser
  .build();

// Context with typed metadata
interface AppMetadata {
  userId: string;
  permissions: string[];
  environment: 'dev' | 'staging' | 'prod';
}

const context = createPipelineContext<AppMetadata>({
  userId: '123',
  permissions: ['read', 'write'],
  environment: 'prod'
});
```

## Examples

Check out the `/examples` directory for complete working examples:

- Basic data processing pipeline
- User registration workflow
- File processing with error recovery
- Real-time data transformation
- Microservice integration patterns

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/KhaledSMQ/harmony-pipeline/issues)
- **Discussions**: [GitHub Discussions](https://github.com/KhaledSMQ/harmony-pipeline/discussions)
- **Documentation**: [Full API Documentation](https://khaledsmq.github.io/harmony-pipeline/)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and breaking changes.
