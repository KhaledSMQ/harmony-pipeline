import type { PipelineWarning } from "./Context";

/**
 * Represents a successful processor execution within a stage.
 * Contains the output data and execution metadata.
 */
export interface StageSuccess<O = unknown> {
    /** Discriminator for type narrowing */
    readonly kind: "ok";
    /** Name of the stage that executed */
    readonly stageName: string;
    /** Name of the specific processor that executed */
    readonly processorName: string;
    /** The output data produced by the processor */
    readonly output: O;
    /** Warnings collected during processor execution */
    readonly warnings: ReadonlyArray<PipelineWarning>;
    /** Execution time in milliseconds */
    readonly elapsed: number;
}

/**
 * Represents a failed processor execution within a stage.
 * Contains error information and execution metadata.
 */
export interface StageFailure {
    /** Discriminator for type narrowing */
    readonly kind: "err";
    /** Name of the stage that failed */
    readonly stageName: string;
    /** Name of the specific processor that failed */
    readonly processorName: string;
    /** The error that caused the failure */
    readonly error: Error;
    /** Warnings collected before the failure occurred */
    readonly warnings: ReadonlyArray<PipelineWarning>;
    /** Execution time in milliseconds before failure */
    readonly elapsed: number;
}

/**
 * Union type representing the outcome of a stage execution.
 * Use the 'kind' discriminator to determine success or failure.
 */
export type StageOutcome<O = unknown> = StageSuccess<O> | StageFailure;

/**
 * Failure reason enumeration for better error categorization.
 */
export type FailureReason =
    | 'processor_error'    // Regular processor execution error
    | 'timeout'           // Pipeline or processor timeout
    | 'cancellation'      // External cancellation via AbortSignal
    | 'validation_error'  // Configuration or validation error
    | 'dependency_error'; // Stage dependency resolution error

/**
 * Complete result of a pipeline execution containing all outcomes and metadata.
 * This is the final result returned to the caller after pipeline completion.
 */
export interface PipelineResult<O = unknown> {
    /** Whether the entire pipeline executed successfully */
    readonly success: boolean;

    /**
     * Final output data from the pipeline.
     * Only present when success is true and no errors occurred.
     */
    readonly output?: O | undefined;

    /** All errors that occurred during pipeline execution */
    readonly errors: ReadonlyArray<Error>;

    /** All warnings collected across all stages and processors */
    readonly warnings: ReadonlyArray<PipelineWarning>;

    /** Detailed outcomes for each stage that executed */
    readonly stages: ReadonlyArray<StageOutcome>;

    /** Total pipeline execution time in milliseconds */
    readonly executionTime: number;

    /**
     * Indicates if the pipeline was cancelled (timeout or external signal).
     * This helps distinguish between failures and intentional cancellation.
     */
    readonly wasCancelled?: boolean;

    /**
     * The reason for cancellation if the pipeline was cancelled.
     */
    readonly cancellationReason?: 'timeout' | 'signal' | 'user' | undefined;
}

/**
 * Type guard to check if a stage outcome represents success.
 */
export function isStageSuccess<O>(
    outcome: StageOutcome<O>,
): outcome is StageSuccess<O> {
    return outcome.kind === "ok";
}

/**
 * Type guard to check if a stage outcome represents failure.
 */
export function isStageFailure(outcome: StageOutcome): outcome is StageFailure {
    return outcome.kind === "err";
}

/**
 * Type guard to check if a pipeline result represents a cancelled execution.
 */
export function isPipelineCancelled<O>(
    result: PipelineResult<O>
): result is PipelineResult<O> & { wasCancelled: true } {
    return result.wasCancelled === true;
}

/**
 * Type guard to check if an error is a cancellation-related error.
 */
export function isCancellationError(error: Error): boolean {
    return error.name === 'PipelineCancellationError' ||
        error.message.includes('timeout') ||
        error.message.includes('cancelled') ||
        error.message.includes('aborted');
}

/**
 * Utility function to extract failure reasons from pipeline results.
 * Analyzes errors and outcomes to categorize the types of failures that occurred.
 */
export function extractFailureReasons<O>(
    result: PipelineResult<O>
): ReadonlyArray<FailureReason> {
    const reasons = new Set<FailureReason>();

    // Check for cancellation
    if (result.wasCancelled) {
        if (result.cancellationReason === 'timeout') {
            reasons.add('timeout');
        } else {
            reasons.add('cancellation');
        }
    }

    // Analyze errors
    for (const error of result.errors) {
        if (isCancellationError(error)) {
            if (error.message.includes('timeout')) {
                reasons.add('timeout');
            } else {
                reasons.add('cancellation');
            }
        } else if (error.message.includes('dependency') || error.message.includes('circular')) {
            reasons.add('dependency_error');
        } else if (error.message.includes('validation') || error.message.includes('configuration')) {
            reasons.add('validation_error');
        } else {
            reasons.add('processor_error');
        }
    }

    // Analyze stage outcomes
    for (const outcome of result.stages) {
        if (isStageFailure(outcome)) {
            if (isCancellationError(outcome.error)) {
                if (outcome.error.message.includes('timeout')) {
                    reasons.add('timeout');
                } else {
                    reasons.add('cancellation');
                }
            } else {
                reasons.add('processor_error');
            }
        }
    }

    return Array.from(reasons);
}

/**
 * Utility function to create a summary of pipeline execution results.
 * Provides a high-level overview of what happened during execution.
 */
export function createExecutionSummary<O>(
    result: PipelineResult<O>
): {
    readonly status: 'success' | 'failed' | 'cancelled';
    readonly totalStages: number;
    readonly successfulStages: number;
    readonly failedStages: number;
    readonly totalWarnings: number;
    readonly totalErrors: number;
    readonly executionTime: number;
    readonly failureReasons: ReadonlyArray<FailureReason>;
} {
    const totalStages = result.stages.length;
    const successfulStages = result.stages.filter(isStageSuccess).length;
    const failedStages = result.stages.filter(isStageFailure).length;

    let status: 'success' | 'failed' | 'cancelled';
    if (result.wasCancelled) {
        status = 'cancelled';
    } else if (result.success) {
        status = 'success';
    } else {
        status = 'failed';
    }

    return {
        status,
        totalStages,
        successfulStages,
        failedStages,
        totalWarnings: result.warnings.length,
        totalErrors: result.errors.length,
        executionTime: result.executionTime,
        failureReasons: extractFailureReasons(result),
    };
}
