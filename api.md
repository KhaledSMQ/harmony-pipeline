# Harmony Pipeline API Documentation

A robust TypeScript pipeline execution library with stage-based processing, dependency resolution, and comprehensive
error handling.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Pipeline Context](#pipeline-context)
  - [Stages](#stages)
  - [Processors](#processors)
  - [Pipeline Builder](#pipeline-builder)
  - [Pipeline Executor](#pipeline-executor)
  - [Execution Options](#execution-options)
  - [Results and Outcomes](#results-and-outcomes)
  - [Logging](#logging)
- [Advanced Features](#advanced-features)
- [Error Handling](#error-handling)
- [Examples](#examples)

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

// Define stages
const inputStage = createStage('input');
const processStage = createStage('process', {dependencies: ['input']});

// Create processors
const validator = createSimpleProcessor(
        'validator',
        inputStage,
        (data: string) => data.trim()
);

const transformer = createSimpleProcessor(
        'transformer',
        processStage,
        (data: string) => data.toUpperCase()
);

// Build and execute pipeline
const pipeline = createPipelineBuilder<string, string>()
        .withProcessor(validator, transformer)
        .build();

const context = createPipelineContext({userId: '123'});
const result = await pipeline.execute('  hello world  ', context);

console.log(result.output); // "HELLO WORLD"
```

## Core Concepts

### Pipeline

A pipeline is a series of processing stages that transform data through a sequence of processors. Each pipeline has:

- **Input**: Initial data to process
- **Stages**: Logical groupings of processors with dependency relationships
- **Processors**: Individual units of work that transform data
- **Output**: Final processed result

### Stage

A stage represents a logical phase in the pipeline execution. Stages can have dependencies on other stages, forming a
Directed Acyclic Graph (DAG).

### Processor

A processor is a single unit of work within a stage. It takes input data, processes it, and produces output data.

### Context

A context provides shared metadata, logging, and warning collection across all processors in a pipeline execution.

## API Reference

### Pipeline Context

#### `PipelineContext<M>`

Execution context shared across all processors in a pipeline run.

```typescript
interface PipelineContext<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly executionId: string;
  readonly startTime: number;
  readonly metadata: Readonly<M>;
  readonly logger: Logger;

  addWarning(code: string, message: string, details?: unknown): void;

  _getWarnings(): ReadonlyArray<PipelineWarning>;
}
```

#### `createPipelineContext<M>(metadata, logger?)`

Creates a new pipeline context with the specified metadata.

**Parameters:**

- `metadata: M` - Metadata to attach to this execution context
- `logger?: Logger` - Logger instance (defaults to NullLogger)

**Returns:** `PipelineContext<M>`

```typescript
const context = createPipelineContext({
  userId: '123',
  requestId: 'req-456',
  enableFeatureX: true
});
```

#### `PipelineWarning`

Represents a non-fatal warning emitted during pipeline execution.

```typescript
interface PipelineWarning {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly timestamp: number;
}
```

### Stages

#### `PipelineStage<TCtx>`

Represents a stage in the pipeline execution graph.

```typescript
interface PipelineStage<TCtx extends PipelineContext = PipelineContext> {
  readonly name: string;
  readonly dependencies?: ReadonlyArray<string>;

  canExecute(context: TCtx): boolean;
}
```

#### `createStage<TCtx>(name, options?)`

Creates a new pipeline stage with the specified name and options.

**Parameters:**

- `name: string` - Unique name for the stage
- `options?: StageOptions<TCtx>` - Configuration options

**Returns:** `PipelineStage<TCtx>`

```typescript
const validationStage = createStage('validation');

const processingStage = createStage('processing', {
  dependencies: ['validation'],
  canExecute: (ctx) => ctx.metadata.enableProcessing
});
```

#### `StageOptions<TCtx>`

Configuration options for creating a pipeline stage.

```typescript
interface StageOptions<TCtx extends PipelineContext = PipelineContext> {
  dependencies?: ReadonlyArray<string>;

  canExecute?(context: TCtx): boolean;
}
```

### Processors

#### `PipelineProcessor<I, O, TCtx>`

A processor performs a single unit of work within a stage.

```typescript
interface PipelineProcessor<I = unknown, O = unknown, TCtx extends PipelineContext = PipelineContext> {
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly stage: PipelineStage<TCtx>;

  process(input: I, context: TCtx, signal?: AbortSignal): O | Promise<O>;

  setup?(context: TCtx): void | Promise<void>;

  teardown?(context: TCtx): void | Promise<void>;

  onError?(error: Error, context: TCtx): void | Promise<void>;
}
```

#### `createSimpleProcessor<I, O, TCtx>(name, stage, process, options?)`

Functional-style helper to create a processor without a class.

**Parameters:**

- `name: string` - Unique processor name
- `stage: PipelineStage<TCtx>` - Stage this processor belongs to
- `process: (input: I, ctx: TCtx, signal?: AbortSignal) => O | Promise<O>` - Processing function
- `options?: ProcessorOptions` - Optional lifecycle hooks and version

**Returns:** `PipelineProcessor<I, O, TCtx>`

```typescript
const processor = createSimpleProcessor(
        'data-validator',
        validationStage,
        async (data: UserData, ctx, signal) => {
          // Processing logic
          return validatedData;
        },
        {
          version: '2.1.0',
          setup: async (ctx) => {
            // Initialize resources
          },
          teardown: async (ctx) => {
            // Cleanup resources
          },
          onError: async (error, ctx) => {
            // Handle errors
          }
        }
);
```

### Pipeline Builder

#### `PipelineBuilder<I, O, TCtx>`

Fluent builder for constructing pipeline executors with processors.

```typescript
class PipelineBuilder<I = unknown, O = unknown, TCtx extends PipelineContext = PipelineContext> {
  withProcessor(...processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>): this;

  withProcessors(processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>): this;

  withProcessorIf(condition: boolean, processor: PipelineProcessor<any, any, TCtx>): this;

  withProcessorFactory(factory: () => PipelineProcessor<any, any, TCtx>): this;

  getRegisteredProcessorNames(): ReadonlyArray<string>;

  getStageExecutionOrder(): ReadonlyArray<string>;

  validate(): void;

  build(options?: BuildOptions): PipelineExecutor<I, O, TCtx>;

  clone(): PipelineBuilder<I, O, TCtx>;
}
```

#### `createPipelineBuilder<I, O, TCtx>()`

Creates a new pipeline builder instance.

**Returns:** `PipelineBuilder<I, O, TCtx>`

```typescript
const pipeline = createPipelineBuilder<InputData, OutputData>()
        .withProcessor(processor1)
        .withProcessor(processor2)
        .withProcessorIf(config.enableOptionalFeature, optionalProcessor)
        .build();
```

#### Builder Methods

**`withProcessor(...processors)`**

- Registers one or more processors
- Returns builder for chaining

**`withProcessors(processors)`**

- Adds multiple processors from an array
- Returns builder for chaining

**`withProcessorIf(condition, processor)`**

- Conditionally adds a processor
- Returns builder for chaining

**`withProcessorFactory(factory)`**

- Adds a processor using a factory function
- Returns builder for chaining

**`getRegisteredProcessorNames()`**

- Returns names of all registered processors
- Useful for debugging

**`getStageExecutionOrder()`**

- Returns stage execution order based on dependencies
- Helpful for visualizing pipeline structure

**`validate()`**

- Validates pipeline configuration
- Throws error if validation fails

**`build(options?)`**

- Builds and returns configured pipeline executor
- Options: `{ validate?: boolean }`

**`clone()`**

- Creates new builder with same processor configuration
- Returns independent builder instance

### Pipeline Executor

#### `PipelineExecutor<I, O, TCtx>`

Core pipeline execution engine with comprehensive error handling and monitoring.

```typescript
class PipelineExecutor<I = unknown, O = unknown, TCtx extends PipelineContext = PipelineContext> {
  register(...processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>): this;

  execute(input: I, context: TCtx, options?: ExecutionOptions): Promise<PipelineResult<O>>;

  getRegisteredProcessorNames(): ReadonlyArray<string>;

  getStageExecutionOrder(): ReadonlyArray<string>;

  readonly on: <K extends keyof PipelineEvents>(
          event: K,
          listener: (payload: PipelineEvents[K]) => void
  ) => () => void;
}
```

#### Event Monitoring

The executor emits events throughout the execution lifecycle:

```typescript
interface PipelineEvents {
  pipelineStart: undefined;
  pipelineEnd: PipelineResult<unknown>;
  stageStart: { stage: string };
  stageEnd: { stage: string };
  processorStart: { stage: string; processor: string };
  processorEnd: { stage: string; processor: string; outcome: StageOutcome };
  warning: PipelineWarning;
  error: Error;
  cancelled: { reason: 'timeout' | 'signal' | 'user'; message: string };
}
```

```typescript
const unsubscribe = executor.on('processorStart', ({stage, processor}) => {
  console.log(`Starting ${processor} in ${stage}`);
});

// Clean up listener
unsubscribe();
```

### Execution Options

#### `ExecutionOptions`

Configuration options that control pipeline execution behavior.

```typescript
interface ExecutionOptions {
  readonly stopOnError?: boolean;           // Default: true
  readonly concurrency?: number;            // Default: 1
  readonly signal?: AbortSignal;            // Default: undefined
  readonly timeoutMs?: number;              // Default: undefined
  readonly logger?: Logger;                 // Default: undefined
}
```

#### `createExecutionOptions(options?)`

Creates execution options with defaults applied.

**Parameters:**

- `options?: ExecutionOptions` - Partial options to merge with defaults

**Returns:** `ResolvedExecutionOptions`

```typescript
const options = createExecutionOptions({
  stopOnError: false,
  concurrency: 3,
  timeoutMs: 30000,
  logger: myLogger
});
```

#### Option Details

**`stopOnError`**

- Controls whether pipeline stops on first error
- `true`: Stop immediately on any processor failure
- `false`: Continue executing remaining stages after errors

**`concurrency`**

- Maximum concurrent processors within a single stage
- Values > 1 only make sense for independent processors
- Use with caution as it may complicate error handling

**`signal`**

- AbortSignal for external cancellation
- Integrates with user cancellation, request timeouts, etc.

**`timeoutMs`**

- Maximum pipeline execution time in milliseconds
- Pipeline cancelled if exceeded
- `undefined` means no timeout

**`logger`**

- Logger instance for recording execution events
- Receives debug, info, warning, and error messages

### Results and Outcomes

#### `PipelineResult<O>`

Complete result of a pipeline execution.

```typescript
interface PipelineResult<O = unknown> {
  readonly success: boolean;
  readonly output?: O;
  readonly errors: ReadonlyArray<Error>;
  readonly warnings: ReadonlyArray<PipelineWarning>;
  readonly stages: ReadonlyArray<StageOutcome>;
  readonly executionTime: number;
  readonly wasCancelled?: boolean;
  readonly cancellationReason?: 'timeout' | 'signal' | 'user';
}
```

#### `StageOutcome<O>`

Union type representing the outcome of a stage execution.

```typescript
type StageOutcome<O = unknown> = StageSuccess<O> | StageFailure;
```

#### `StageSuccess<O>`

Represents successful processor execution.

```typescript
interface StageSuccess<O = unknown> {
  readonly kind: "ok";
  readonly stageName: string;
  readonly processorName: string;
  readonly output: O;
  readonly warnings: ReadonlyArray<PipelineWarning>;
  readonly elapsed: number;
}
```

#### `StageFailure`

Represents failed processor execution.

```typescript
interface StageFailure {
  readonly kind: "err";
  readonly stageName: string;
  readonly processorName: string;
  readonly error: Error;
  readonly warnings: ReadonlyArray<PipelineWarning>;
  readonly elapsed: number;
}
```

#### Type Guards

```typescript
function isStageSuccess<O>(outcome: StageOutcome<O>): outcome is StageSuccess<O>;

function isStageFailure(outcome: StageOutcome): outcome is StageFailure;

function isPipelineCancelled<O>(result: PipelineResult<O>): boolean;

function isCancellationError(error: Error): boolean;
```

#### Utility Functions

```typescript
function extractFailureReasons<O>(result: PipelineResult<O>): ReadonlyArray<FailureReason>;

function createExecutionSummary<O>(result: PipelineResult<O>): ExecutionSummary;
```

**`FailureReason`**

```typescript
type FailureReason =
        | 'processor_error'
        | 'timeout'
        | 'cancellation'
        | 'validation_error'
        | 'dependency_error';
```

### Logging

#### `Logger`

Logging interface for pipeline operations.

```typescript
interface Logger {
  debug(message: string, data?: unknown): void;

  info(message: string, data?: unknown): void;

  warn(message: string, data?: unknown): void;

  error(message: string, data?: unknown): void;
}
```

#### `NullLogger`

No-operation logger that silently discards all log messages.

```typescript
const NullLogger: Logger;
```

## Advanced Features

### Dependency Management

Stages can declare dependencies on other stages, forming a DAG:

```typescript
const stage1 = createStage('input');
const stage2 = createStage('validation', {dependencies: ['input']});
const stage3 = createStage('processing', {dependencies: ['validation']});
const stage4 = createStage('output', {dependencies: ['processing']});
```

### Conditional Execution

Stages can have conditional execution logic:

```typescript
const conditionalStage = createStage('optional', {
  dependencies: ['input'],
  canExecute: (ctx) => ctx.metadata.enableOptionalProcessing
});
```

### Concurrent Execution

Execute multiple processors within a stage concurrently:

```typescript
const result = await pipeline.execute(input, context, {
  concurrency: 3, // Up to 3 processors run simultaneously
  stopOnError: false // Continue despite individual failures
});
```

### Cancellation and Timeouts

```typescript
// Timeout after 30 seconds
const result = await pipeline.execute(input, context, {
  timeoutMs: 30000
});

// External cancellation
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);

const result = await pipeline.execute(input, context, {
  signal: controller.signal
});
```

### Event Monitoring

Monitor pipeline execution in real-time:

```typescript
executor.on('processorStart', ({stage, processor}) => {
  console.log(`Starting ${processor} in stage ${stage}`);
});

executor.on('warning', (warning) => {
  console.warn(`Warning: ${warning.code} - ${warning.message}`);
});

executor.on('error', (error) => {
  console.error('Pipeline error:', error);
});
```

## Error Handling

### Error Types

**`PipelineCancellationError`**

- Thrown when pipeline is cancelled
- Contains cancellation reason: 'timeout' | 'signal' | 'user'

### Error Recovery

Processors can implement error handlers:

```typescript
const processor = createSimpleProcessor(
        'resilient-processor',
        stage,
        async (input, ctx) => {
          // Processing logic
        },
        {
          onError: async (error, ctx) => {
            ctx.addWarning('RECOVERY_ATTEMPTED', 'Attempting error recovery');
            // Recovery logic
          }
        }
);
```

### Warning Collection

Non-fatal issues can be reported as warnings:

```typescript
const processor = createSimpleProcessor(
        'validator',
        stage,
        async (input, ctx) => {
          if (someCondition) {
            ctx.addWarning('VALIDATION_ISSUE', 'Non-critical validation issue', {
              field: 'email',
              value: input.email
            });
          }
          return processedInput;
        }
);
```

## Examples

### Basic Data Processing Pipeline

```typescript
interface UserData {
  id: string;
  email: string;
  name: string;
}

interface ProcessedUser {
  id: string;
  email: string;
  displayName: string;
  isValid: boolean;
}

// Define stages
const inputStage = createStage('input');
const validationStage = createStage('validation', {dependencies: ['input']});
const transformStage = createStage('transform', {dependencies: ['validation']});

// Create processors
const validator = createSimpleProcessor<UserData, UserData>(
        'user-validator',
        validationStage,
        async (user, ctx) => {
          if (!user.email.includes('@')) {
            ctx.addWarning('INVALID_EMAIL', 'Email format is invalid', {email: user.email});
          }
          return user;
        }
);

const transformer = createSimpleProcessor<UserData, ProcessedUser>(
        'user-transformer',
        transformStage,
        async (user, ctx) => {
          return {
            id: user.id,
            email: user.email.toLowerCase(),
            displayName: user.name.trim(),
            isValid: user.email.includes('@')
          };
        }
);

// Build pipeline
const pipeline = createPipelineBuilder<UserData, ProcessedUser>()
        .withProcessor(validator)
        .withProcessor(transformer)
        .build();

// Execute
const context = createPipelineContext({
  requestId: 'req-123',
  userId: 'user-456'
});

const result = await pipeline.execute(
        {id: '1', email: 'user@example.com', name: ' John Doe '},
        context
);

if (result.success) {
  console.log('Processed user:', result.output);
  console.log('Warnings:', result.warnings);
}
```

### Complex Multi-Stage Pipeline

```typescript
// Define processing stages
const stages = {
  input: createStage('input'),
  validation: createStage('validation', {dependencies: ['input']}),
  enrichment: createStage('enrichment', {dependencies: ['validation']}),
  transform: createStage('transform', {dependencies: ['enrichment']}),
  output: createStage('output', {dependencies: ['transform']})
};

// Create specialized processors
const processors = [
  createSimpleProcessor('schema-validator', stages.validation, validateSchema),
  createSimpleProcessor('business-validator', stages.validation, validateBusinessRules),
  createSimpleProcessor('data-enricher', stages.enrichment, enrichWithExternalData),
  createSimpleProcessor('data-transformer', stages.transform, transformData),
  createSimpleProcessor('result-formatter', stages.output, formatResult)
];

// Build pipeline with monitoring
const pipeline = createPipelineBuilder()
        .withProcessors(processors)
        .build();

// Setup comprehensive monitoring
pipeline.on('stageStart', ({stage}) => {
  console.log(`📋 Starting stage: ${stage}`);
});

pipeline.on('processorEnd', ({processor, outcome}) => {
  if (outcome.kind === 'ok') {
    console.log(`✅ ${processor} completed in ${outcome.elapsed}ms`);
  } else {
    console.log(`❌ ${processor} failed: ${outcome.error.message}`);
  }
});

// Execute with custom options
const result = await pipeline.execute(inputData, context, {
  concurrency: 2,
  timeoutMs: 60000,
  stopOnError: false,
  logger: customLogger
});

// Analyze results
const summary = createExecutionSummary(result);
console.log('Execution Summary:', summary);
```

### Pipeline with Conditional Processing

```typescript
interface ProcessingContext extends PipelineContext<{
  enableAdvancedProcessing: boolean;
  userTier: 'basic' | 'premium' | 'enterprise';
}> {
}

const advancedStage = createStage<ProcessingContext>('advanced', {
  dependencies: ['basic'],
  canExecute: (ctx) => ctx.metadata.enableAdvancedProcessing
});

const premiumStage = createStage<ProcessingContext>('premium', {
  dependencies: ['advanced'],
  canExecute: (ctx) => ['premium', 'enterprise'].includes(ctx.metadata.userTier)
});

const pipeline = createPipelineBuilder<Input, Output, ProcessingContext>()
        .withProcessor(basicProcessor)
        .withProcessorIf(true, advancedProcessor) // Always include
        .withProcessorIf(config.enablePremiumFeatures, premiumProcessor)
        .build();
```
