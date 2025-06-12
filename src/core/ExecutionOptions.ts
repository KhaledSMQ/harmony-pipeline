import { type Logger } from './Logger';

/**
 * Configuration options that control pipeline execution behavior.
 * These options provide fine-grained control over how the pipeline runs,
 * including error handling, concurrency, timeouts, and logging.
 */
export interface ExecutionOptions {
    /**
     * Whether to stop pipeline execution immediately when any processor fails.
     * When true, the first error stops the entire pipeline.
     * When false, the pipeline continues executing remaining stages even after errors.
     *
     * @default true
     */
    readonly stopOnError?: boolean | undefined;

    /**
     * Maximum number of processors that can execute concurrently within a single stage.
     * Values greater than 1 only make sense when processors within a stage are independent.
     * Use with caution as concurrent execution may complicate error handling and debugging.
     *
     * @default 1
     */
    readonly concurrency?: number | undefined;

    /**
     * AbortSignal for externally cancelling the pipeline execution.
     * When the signal is aborted, the pipeline will stop processing and reject with an error.
     * This allows integration with user cancellation, request timeouts, etc.
     */
    readonly signal?: AbortSignal | undefined;

    /**
     * Maximum time in milliseconds the pipeline is allowed to run.
     * When exceeded, the pipeline execution is cancelled and rejects with a timeout error.
     * Set to undefined to disable timeout (pipeline runs until completion or error).
     *
     * @default undefined (no timeout)
     */
    readonly timeoutMs?: number | undefined;

    /**
     * Logger instance for recording pipeline execution events.
     * The logger receives debug, info, warning, and error messages throughout execution.
     * Use NullLogger to disable logging entirely.
     *
     * @default undefined (uses NullLogger internally)
     */
    readonly logger?: Logger | undefined;
}

/**
 * Default values for execution options.
 * These represent the most common and safe configuration for pipeline execution.
 */
const DEFAULT_VALUES = {
    stopOnError: true,
    concurrency: 1,
} as const;

/**
 * Resolved execution options with all defaults applied.
 * This type ensures that the required options always have values.
 */
export type ResolvedExecutionOptions = Required<
    Pick<ExecutionOptions, 'stopOnError' | 'concurrency'>
> &
    Pick<ExecutionOptions, 'signal' | 'timeoutMs' | 'logger'>;

/**
 * Creates execution options with defaults applied for any missing values.
 * Each call returns a new object instance with the specified values.
 *
 * @param options - Partial execution options to merge with defaults
 * @returns New execution options object with defaults applied
 *
 * @example
 * ```typescript
 * const options = createExecutionOptions({
 *   stopOnError: false,
 *   concurrency: 3,
 *   timeoutMs: 5000
 * });
 * ```
 */
export function createExecutionOptions(
    options: ExecutionOptions = {},
): ResolvedExecutionOptions {
    return {
        stopOnError: resolveStopOnError(options.stopOnError),
        concurrency: resolveConcurrency(options.concurrency),
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        logger: options.logger,
    };
}

/**
 * Resolves the stopOnError option with proper default handling.
 */
function resolveStopOnError(value: boolean | undefined): boolean {
    return value ?? DEFAULT_VALUES.stopOnError;
}

/**
 * Resolves the concurrency option with proper default handling.
 */
function resolveConcurrency(value: number | undefined): number {
    return value ?? DEFAULT_VALUES.concurrency;
}
