import { type Logger, NullLogger } from './Logger';
import { deepFreeze } from '../_utility/object';

/**
 * Represents a non-fatal warning emitted during pipeline execution.
 * Warnings allow processors to report issues without stopping execution.
 */
export interface PipelineWarning {
    /** Unique identifier for the warning type */
    readonly code: string;
    /** Human-readable description of the warning */
    readonly message: string;
    /** Optional structured data providing additional context */
    readonly details?: unknown;
    /** Timestamp when the warning was created (milliseconds since epoch) */
    readonly timestamp: number;
}

/**
 * Execution context shared across all processors in a pipeline run.
 * Provides access to metadata, logging, and warning collection.
 *
 * @template M - Shape of the metadata object for type safety
 */
export interface PipelineContext<
    M extends Record<string, unknown> = Record<string, unknown>,
> {
    /** Unique identifier for this pipeline execution */
    readonly executionId: string;
    /** Timestamp when the pipeline execution started */
    readonly startTime: number;
    /** Immutable metadata available to all processors */
    readonly metadata: Readonly<M>;
    /** Logger instance bound to this pipeline execution */
    readonly logger: Logger;

    /**
     * Records a non-fatal warning without stopping execution.
     * The warning is logged and stored for inclusion in the final result.
     *
     * @param code - Unique identifier for the warning type
     * @param message - Human-readable description
     * @param details - Optional structured data for additional context
     */
    addWarning(code: string, message: string, details?: unknown): void;

    /**
     * @internal
     * Returns all warnings collected during execution.
     * This method is intended for internal use by the pipeline executor.
     */
    _getWarnings(): ReadonlyArray<PipelineWarning>;
}

/**
 * Creates a new pipeline context with the specified metadata.
 * Generates a unique execution ID and sets up warning collection.
 *
 * @template M - Type of the metadata object
 * @param metadata - Metadata to attach to this execution context
 * @param logger - Logger instance (defaults to NullLogger)
 * @returns A new pipeline context ready for execution
 */
export function createPipelineContext<
    M extends Record<string, unknown> = Record<string, unknown>,
>(metadata: M, logger: Logger = NullLogger): PipelineContext<M> {
    const warnings: PipelineWarning[] = [];
    const executionId = generateExecutionId();

    return Object.freeze({
        executionId,
        startTime: Date.now(),
        metadata: deepFreeze(metadata),
        logger,
        addWarning(code: string, message: string, details?: unknown): void {
            const warning: PipelineWarning = {
                code,
                message,
                details,
                timestamp: Date.now(),
            };
            warnings.push(warning);
            logger.warn(`${code}: ${message}`, details);
        },
        _getWarnings(): ReadonlyArray<PipelineWarning> {
            return deepFreeze([...warnings]);
        },
    });
}

/**
 * Generates a unique execution ID using crypto.randomUUID when available,
 * falling back to a random string for environments without crypto support.
 */
function generateExecutionId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
    );
}
