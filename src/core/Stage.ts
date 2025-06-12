import type { PipelineContext } from './Context';

/**
 * Represents a stage in the pipeline execution graph.
 * Stages form a Directed Acyclic Graph (DAG) where dependencies define execution order.
 * Each stage can contain multiple processors that execute within that stage.
 *
 * @template TCtx - Type of the pipeline context
 */
export interface PipelineStage<TCtx extends PipelineContext = PipelineContext> {
    /** Unique name identifying this stage */
    readonly name: string;

    /**
     * Names of other stages that must complete before this stage can execute.
     * Used to build the execution DAG and ensure proper ordering.
     */
    readonly dependencies?: ReadonlyArray<string>;

    /**
     * Optional predicate to determine if this stage should execute.
     * When this function returns false, the stage is skipped entirely.
     * Useful for conditional execution based on context or metadata.
     *
     * @param context - The current pipeline execution context
     * @returns true if the stage should execute, false to skip
     */
    canExecute(context: TCtx): boolean;
}

/**
 * Configuration options for creating a pipeline stage.
 *
 * @template TCtx - Type of the pipeline context
 */
export interface StageOptions<TCtx extends PipelineContext = PipelineContext> {
    /** Names of stages that must complete before this stage can run */
    dependencies?: ReadonlyArray<string>;

    /** Optional predicate to conditionally execute this stage */
    canExecute?(context: TCtx): boolean;
}

/**
 * Creates a new pipeline stage with the specified name and options.
 * This is a convenience function for creating stage objects without
 * implementing the interface directly.
 *
 * @template TCtx - Type of the pipeline context
 * @param name - Unique name for the stage
 * @param options - Configuration options for the stage
 * @returns A new pipeline stage instance
 *
 * @example
 * ```typescript
 * const validationStage = createStage('validation', {
 *   dependencies: ['preprocessing'],
 *   canExecute: (ctx) => ctx.metadata.enableValidation
 * });
 * ```
 */
export function createStage<TCtx extends PipelineContext = PipelineContext>(
    name: string,
    options: StageOptions<TCtx> = {},
): PipelineStage<TCtx> {
    return Object.freeze({
        name,
        dependencies: options?.dependencies
            ? Object.freeze([...options.dependencies])
            : [],
        canExecute: options.canExecute
            ? options.canExecute
            : () => true,
    });
}
