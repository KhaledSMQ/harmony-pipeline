import type { PipelineWarning } from './Context';

/**
 * Represents a successful processor execution within a stage.
 * Contains the output data and execution metadata.
 *
 * @template O - Type of the output data
 */
export interface StageSuccess<O = unknown> {
    /** Discriminator for type narrowing */
    readonly kind: 'ok';
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
    readonly kind: 'err';
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
 *
 * @template O - Type of the output data for successful outcomes
 */
export type StageOutcome<O = unknown> = StageSuccess<O> | StageFailure;

/**
 * Complete result of a pipeline execution containing all outcomes and metadata.
 * This is the final result returned to the caller after pipeline completion.
 *
 * @template O - Type of the final output data
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
}

/**
 * Type guard to check if a stage outcome represents success.
 *
 * @param outcome - The stage outcome to check
 * @returns true if the outcome is a success
 */
export function isStageSuccess<O>(
    outcome: StageOutcome<O>,
): outcome is StageSuccess<O> {
    return outcome.kind === 'ok';
}

/**
 * Type guard to check if a stage outcome represents failure.
 *
 * @param outcome - The stage outcome to check
 * @returns true if the outcome is a failure
 */
export function isStageFailure(outcome: StageOutcome): outcome is StageFailure {
    return outcome.kind === 'err';
}
