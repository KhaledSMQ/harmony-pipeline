/**
 * Harmony Pipeline - A robust TypeScript pipeline execution library
 *
 * This library provides a flexible and type-safe way to build and execute
 * data processing pipelines with support for:
 * - Stage-based execution with dependency resolution
 * - Concurrent processor execution within stages
 * - Comprehensive error handling and recovery
 * - Event-driven monitoring and observability
 * - Graceful cancellation and timeout handling
 *
 * @example Basic Usage
 * ```typescript
 * import {
 *   createPipelineBuilder,
 *   createStage,
 *   createSimpleProcessor,
 *   createPipelineContext
 * } from 'harmony-pipeline';
 *
 * // Define stages
 * const inputStage = createStage('input');
 * const processStage = createStage('process', { dependencies: ['input'] });
 *
 * // Create processors
 * const validator = createSimpleProcessor(
 *   'validator',
 *   inputStage,
 *   (data: string) => data.trim()
 * );
 *
 * const transformer = createSimpleProcessor(
 *   'transformer',
 *   processStage,
 *   (data: string) => data.toUpperCase()
 * );
 *
 * // Build and execute pipeline
 * const pipeline = createPipelineBuilder<string, string>()
 *   .withProcessor(validator, transformer)
 *   .build();
 *
 * const context = createPipelineContext({ userId: '123' });
 * const result = await pipeline.execute('  hello world  ', context);
 *
 * console.log(result.output); // "HELLO WORLD"
 * ```
 */

// Core types and interfaces
export type { Logger } from './core/Logger';
export type { PipelineContext, PipelineWarning } from './core/Context';
export type { PipelineStage, StageOptions } from './core/Stage';
export type { PipelineProcessor } from './core/Processor';
export type {
    StageSuccess,
    StageFailure,
    StageOutcome,
    PipelineResult,
} from './core/Result';
export type { ExecutionOptions } from './core/ExecutionOptions';

// Implementation exports
export { NullLogger } from './core/Logger';
export { isStageSuccess, isStageFailure } from './core/Result';
export { createExecutionOptions } from './core/ExecutionOptions';
export { PipelineExecutor } from './executor/PipelineExecutor';
export {
    PipelineBuilder,
    createPipelineBuilder,
} from './builder/PipelineBuilder';

// Factory functions for convenient object creation
export { createPipelineContext } from './core/Context';
export { createStage } from './core/Stage';
export { createSimpleProcessor } from './core/Processor';

/**
 * Version information for the harmony-pipeline library.
 * This can be used for compatibility checks or debugging.
 */
export const VERSION = '1.0.0' as const;

/**
 * Library metadata for introspection and debugging.
 */
export const LIBRARY_INFO = {
    name: 'harmony-pipeline',
    version: VERSION,
    description: 'A robust TypeScript pipeline execution library',
    features: [
        'Stage-based execution with dependency resolution',
        'Type-safe processor composition',
        'Concurrent execution support',
        'Comprehensive error handling',
        'Event-driven monitoring',
        'Graceful cancellation and timeouts',
    ],
} as const;
