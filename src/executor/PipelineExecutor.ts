import type { PipelineStage } from "../core/Stage";
import type { PipelineProcessor } from "../core/Processor";
import type { PipelineContext, PipelineWarning } from "../core/Context";
import type { PipelineResult, StageFailure, StageOutcome, StageSuccess, } from "../core/Result";
import type { ExecutionOptions } from "../core/ExecutionOptions";
import { NullLogger } from "../core/Logger";

/**
 * Specialized error class for pipeline cancellation scenarios.
 * Provides context about the cancellation reason for better error handling.
 */
export class PipelineCancellationError extends Error {
    constructor(
        message: string,
        public readonly reason: 'timeout' | 'signal' | 'user'
    ) {
        super(message);
        this.name = 'PipelineCancellationError';
    }
}

/**
 * Comprehensive event types emitted during pipeline execution lifecycle.
 * These events enable detailed monitoring, debugging, and observability.
 */
interface PipelineEvents {
    /** Pipeline execution lifecycle events */
    pipelineStart: undefined;
    pipelineEnd: PipelineResult<unknown>;

    /** Stage execution lifecycle events */
    stageStart: { stage: string };
    stageEnd: { stage: string };

    /** Processor execution lifecycle events */
    processorStart: { stage: string; processor: string };
    processorEnd: { stage: string; processor: string; outcome: StageOutcome };

    /** Error and warning events */
    warning: PipelineWarning;
    error: Error;

    /** Cancellation events with detailed context */
    cancelled: { reason: 'timeout' | 'signal' | 'user'; message: string };
}

/**
 * Type-safe event emitter implementation for pipeline monitoring.
 * Prevents listener errors from affecting pipeline execution flow.
 */
class EventEmitter<TEvents extends Record<string, any>> {
    private readonly listeners: {
        [K in keyof TEvents]?: Array<(payload: TEvents[K]) => void>;
    } = {};

    /**
     * Registers an event listener with automatic cleanup support.
     *
     * @param event - Event type to listen for
     * @param listener - Callback function for the event
     * @returns Unsubscribe function for cleanup
     */
    on<K extends keyof TEvents>(
        event: K,
        listener: (payload: TEvents[K]) => void,
    ): () => void {
        const currentListeners = this.listeners[event] ?? [];
        this.listeners[event] = [...currentListeners, listener];

        return () => this.off(event, listener);
    }

    /**
     * Removes a specific event listener from the registry.
     */
    off<K extends keyof TEvents>(
        event: K,
        listener: (payload: TEvents[K]) => void,
    ): void {
        const currentListeners = this.listeners[event];
        if (currentListeners) {
            this.listeners[event] = currentListeners.filter((l) => l !== listener);
        }
    }

    /**
     * Safely emits events to all registered listeners.
     * Isolates listener errors to prevent pipeline disruption.
     */
    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        const eventListeners = this.listeners[event];
        if (eventListeners) {
            eventListeners.forEach((listener) => {
                try {
                    listener(payload);
                } catch (error) {
                    console.error("Event listener error:", error);
                }
            });
        }
    }
}

/**
 * Wrapper that ensures processor execution respects cancellation signals.
 * Provides graceful cancellation even for processors that don't check abort signals internally.
 */
class CancellableProcessorExecution<I, O, TCtx extends PipelineContext> {
    private readonly checkInterval = 50;
    private cancellationTimeout?: NodeJS.Timeout | undefined;

    constructor(
        private readonly processor: PipelineProcessor<I, O, TCtx>,
        private readonly signal?: AbortSignal
    ) {}

    /**
     * Executes a processor with cancellation support.
     * Uses a polling mechanism to check for cancellation during long-running operations.
     */
    async execute(input: I, context: TCtx): Promise<O> {
        if (this.signal?.aborted) {
            throw this.createCancellationError();
        }

        const processorPromise = Promise.resolve(
            this.processor.process(input, context, this.signal)
        );

        if (!this.signal) {
            return processorPromise;
        }

        const cancellationChecker = this.createCancellationChecker();

        try {
            const result = await Promise.race([
                processorPromise,
                cancellationChecker
            ]);

            if (result === 'CANCELLED') {
                throw this.createCancellationError();
            }

            return result as O;
        } finally {
            this.cleanupCancellationChecker();
        }
    }

    /**
     * Creates a polling mechanism to check for cancellation.
     * This ensures responsive cancellation even for non-cooperative processors.
     */
    private createCancellationChecker(): Promise<'CANCELLED'> {
        return new Promise((resolve) => {
            const checkCancellation = () => {
                if (this.signal?.aborted) {
                    resolve('CANCELLED');
                    return;
                }
                this.cancellationTimeout = setTimeout(checkCancellation, this.checkInterval);
            };

            this.cancellationTimeout = setTimeout(checkCancellation, this.checkInterval);
        });
    }

    private cleanupCancellationChecker(): void {
        if (this.cancellationTimeout) {
            clearTimeout(this.cancellationTimeout);
            this.cancellationTimeout = undefined;
        }
    }

    /**
     * Creates appropriate cancellation error based on the abort signal reason.
     */
    private createCancellationError(): Error {
        const reason = this.signal?.reason;

        if (reason instanceof Error && reason.message.includes('timeout')) {
            return new PipelineCancellationError(
                `Processor '${this.processor.name}' was cancelled due to timeout`,
                'timeout'
            );
        }

        return new PipelineCancellationError(
            `Processor '${this.processor.name}' was cancelled`,
            'signal'
        );
    }
}

/**
 * Core pipeline execution engine orchestrating processor execution with comprehensive error handling,
 * cancellation support, and event-driven monitoring capabilities.
 *
 * Features:
 * - Dependency-based stage ordering through topological sorting
 * - Concurrent processor execution within stages
 * - Graceful cancellation and timeout handling
 * - Comprehensive event emission for monitoring
 * - Detailed error tracking and warning collection
 *
 * @template I - Type of the initial input data
 * @template O - Type of the final output data
 * @template TCtx - Type of the pipeline context
 */
export class PipelineExecutor<
    I = unknown,
    O = unknown,
    TCtx extends PipelineContext = PipelineContext,
> {
    /** Registry of all processors by name */
    private readonly processors = new Map<string, PipelineProcessor<any, any, TCtx>>();

    /** Registry of all stages by name */
    private readonly stages = new Map<string, PipelineStage<TCtx>>();

    /** Mapping of stage names to their associated processors */
    private readonly stageProcessors = new Map<string, PipelineProcessor<any, any, TCtx>[]>();

    /** Event emitter for pipeline execution monitoring */
    private readonly events = new EventEmitter<PipelineEvents>();

    /** Track which processors have completed setup to avoid duplicate initialization */
    private readonly setupProcessors = new Set<string>();

    /**
     * Registers an event listener for pipeline execution monitoring.
     * Enables external systems to observe pipeline execution flow.
     */
    readonly on = this.events.on.bind(this.events);

    /**
     * Registers processors with the executor and validates uniqueness.
     * Automatically organizes processors by their associated stages.
     *
     * @param processors - One or more processors to register
     * @returns This executor instance for method chaining
     * @throws Error if processor names are not unique
     */
    register(
        ...processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>
    ): this {
        for (const processor of processors) {
            this.validateAndRegisterProcessor(processor);
        }

        return this;
    }

    /**
     * Executes the complete pipeline with comprehensive error handling and monitoring.
     *
     * Execution flow:
     * 1. Initialize execution state and event monitoring
     * 2. Setup all processors (if needed)
     * 3. Execute stages in dependency order
     * 4. Collect results and emit completion events
     *
     * @param input - Initial data to process through the pipeline
     * @param context - Execution context shared across all processors
     * @param options - Configuration options for execution behavior
     * @returns Promise resolving to comprehensive execution results
     */
    async execute(
        input: I,
        context: TCtx,
        options: ExecutionOptions = {},
    ): Promise<PipelineResult<O>> {
        const executionState = this.initializeExecution(options);
        const warningUnsubscribe = this.setupWarningCollection(executionState);

        try {
            this.events.emit("pipelineStart", undefined);

            this.checkForCancellation(executionState.combinedSignal);
            await this.ensureProcessorsSetup(context, executionState.combinedSignal);

            const result = await this.executeStages(input, context, executionState);

            this.events.emit("pipelineEnd", result);
            return result;
        } catch (error) {
            const processedError = this.processExecutionError(error);

            if (processedError instanceof PipelineCancellationError) {
                this.events.emit("cancelled", {
                    reason: processedError.reason,
                    message: processedError.message
                });
            }

            const failureResult = this.createPipelineResult(
                undefined as O,
                { ...executionState, errors: [...executionState.errors, processedError] }
            );

            this.events.emit("pipelineEnd", failureResult);
            return failureResult;
        } finally {
            warningUnsubscribe();
        }
    }

    /**
     * Returns registered processor names for debugging and introspection.
     */
    getRegisteredProcessorNames(): ReadonlyArray<string> {
        return Array.from(this.processors.keys());
    }

    /**
     * Returns the computed stage execution order for visualization and debugging.
     */
    getStageExecutionOrder(): ReadonlyArray<string> {
        return this.resolveStageExecutionOrder().map((stage) => stage.name);
    }

    /**
     * Validates processor uniqueness and registers it with associated stage.
     */
    private validateAndRegisterProcessor(
        processor: PipelineProcessor<any, any, TCtx>,
    ): void {
        if (this.processors.has(processor.name)) {
            throw new Error(
                `Processor '${processor.name}' is already registered. ` +
                "Each processor must have a unique name within the executor.",
            );
        }

        this.processors.set(processor.name, processor);
        this.stages.set(processor.stage.name, processor.stage);

        const stageProcessorList = this.stageProcessors.get(processor.stage.name) ?? [];
        stageProcessorList.push(processor);
        this.stageProcessors.set(processor.stage.name, stageProcessorList);
    }

    /**
     * Initializes execution state with options resolution and signal merging.
     */
    private initializeExecution(options: ExecutionOptions) {
        const {
            stopOnError = true,
            concurrency = 1,
            signal,
            timeoutMs,
            logger = NullLogger,
        } = options;

        const startTime = Date.now();
        const warnings: PipelineWarning[] = [];
        const errors: Error[] = [];
        const stageOutcomes: StageOutcome[] = [];

        const combinedSignal = this.createCombinedAbortSignal(signal, timeoutMs);

        return {
            startTime,
            warnings,
            errors,
            stageOutcomes,
            stopOnError,
            concurrency,
            combinedSignal,
            logger,
        };
    }

    /**
     * Creates a unified abort signal from external signal and timeout.
     * Handles the complexity of merging multiple cancellation sources.
     */
    private createCombinedAbortSignal(
        externalSignal?: AbortSignal,
        timeoutMs?: number
    ): AbortSignal | undefined {
        const signals: AbortSignal[] = [];

        if (externalSignal) {
            signals.push(externalSignal);
        }

        if (timeoutMs != null) {
            const timeoutController = new AbortController();
            setTimeout(() => {
                timeoutController.abort(
                    new Error(`Pipeline timeout of ${timeoutMs}ms exceeded`)
                );
            }, timeoutMs);
            signals.push(timeoutController.signal);
        }

        return this.mergeAbortSignals(...signals);
    }

    /**
     * Sets up automatic warning collection from the event stream.
     */
    private setupWarningCollection(
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        return this.on("warning", (warning) =>
            executionState.warnings.push(warning),
        );
    }

    /**
     * Ensures all processors complete their setup phase before execution.
     * Prevents duplicate setup calls and handles setup failures gracefully.
     */
    private async ensureProcessorsSetup(
        context: TCtx,
        signal?: AbortSignal
    ): Promise<void> {
        const setupPromises: Promise<void>[] = [];

        for (const processor of this.processors.values()) {
            if (processor.setup && !this.setupProcessors.has(processor.name)) {
                this.checkForCancellation(signal);

                const setupPromise = Promise.resolve(processor.setup(context))
                    .then(() => {
                        this.setupProcessors.add(processor.name);
                    });

                setupPromises.push(setupPromise);
            }
        }

        if (setupPromises.length > 0) {
            await Promise.all(setupPromises);
        }
    }

    /**
     * Orchestrates execution of all stages in dependency order.
     * Handles data flow between stages and error propagation.
     */
    private async executeStages(
        input: I,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): Promise<PipelineResult<O>> {
        let currentData: unknown = input;

        for (const stage of this.resolveStageExecutionOrder()) {
            this.checkForCancellation(executionState.combinedSignal);

            if (this.shouldSkipStage(stage, context, executionState)) {
                continue;
            }

            this.events.emit("stageStart", { stage: stage.name });

            const stageResult = await this.executeStage(
                stage,
                currentData,
                context,
                executionState,
            );

            executionState.stageOutcomes.push(...stageResult.outcomes);

            // Forward warnings from processors to pipeline event stream
            for (const outcome of stageResult.outcomes) {
                for (const warning of outcome.warnings) {
                    this.events.emit("warning", warning);
                }
            }

            if (stageResult.error) {
                executionState.errors.push(stageResult.error);
                if (executionState.stopOnError) break;
            } else {
                currentData = stageResult.output;
            }

            this.events.emit("stageEnd", { stage: stage.name });
        }

        return this.createPipelineResult(currentData as O, executionState);
    }

    /**
     * Determines if a stage should be skipped based on its canExecute predicate.
     */
    private shouldSkipStage(
        stage: PipelineStage<TCtx>,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): boolean {
        if (stage.canExecute && !stage.canExecute(context)) {
            executionState.logger.debug(
                `Skipping stage '${stage.name}' (canExecute returned false)`,
            );
            return true;
        }
        return false;
    }

    /**
     * Executes all processors within a stage using the configured concurrency strategy.
     */
    private async executeStage(
        stage: PipelineStage<TCtx>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        const processors = this.stageProcessors.get(stage.name) ?? [];

        if (processors.length === 0) {
            return { outcomes: [], output: input, error: undefined };
        }

        if (executionState.concurrency <= 1) {
            return this.executeProcessorsSequentially(
                processors,
                input,
                context,
                executionState,
            );
        } else {
            return this.executeProcessorsConcurrently(
                processors,
                input,
                context,
                executionState,
            );
        }
    }

    /**
     * Executes processors sequentially with data flowing between them.
     * Each processor receives the output of the previous processor.
     */
    private async executeProcessorsSequentially(
        processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        const outcomes: StageOutcome[] = [];
        let currentOutput: unknown = input;
        let firstError: Error | undefined;

        for (const processor of processors) {
            this.checkForCancellation(executionState.combinedSignal);

            const outcome = await this.executeProcessor(
                processor,
                currentOutput,
                context,
                executionState,
            );
            outcomes.push(outcome);

            if (outcome.kind === "ok") {
                currentOutput = outcome.output;
            } else {
                firstError = outcome.error;
                if (executionState.stopOnError) break;
            }
        }

        return { outcomes, output: currentOutput, error: firstError };
    }

    /**
     * Executes processors concurrently with the same input.
     * Uses the output from the last successful processor or the original input.
     */
    private async executeProcessorsConcurrently(
        processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        const outcomePromises = processors.map((processor) =>
            this.executeProcessor(processor, input, context, executionState),
        );

        const outcomes = await Promise.all(outcomePromises);
        const firstError = outcomes.find(
            (outcome) => outcome.kind === "err",
        )?.error;

        // Select output from the last successful processor
        const lastSuccessful = outcomes
            .filter((outcome) => outcome.kind === "ok")
            .pop();
        const output = lastSuccessful
            ? (lastSuccessful as StageSuccess).output
            : input;

        return { outcomes, output, error: firstError };
    }

    /**
     * Executes a single processor with comprehensive error handling and monitoring.
     * Tracks execution time, warnings, and handles cancellation gracefully.
     */
    private async executeProcessor(
        processor: PipelineProcessor<any, any, TCtx>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): Promise<StageOutcome> {
        const startTime = Date.now();
        const initialWarningCount = context._getWarnings().length;

        this.events.emit("processorStart", {
            stage: processor.stage.name,
            processor: processor.name,
        });

        try {
            const cancellableExecution = new CancellableProcessorExecution(
                processor,
                executionState.combinedSignal
            );

            const output = await cancellableExecution.execute(input, context);
            const elapsed = Date.now() - startTime;

            // Capture warnings generated during processor execution
            const currentWarnings = context._getWarnings();
            const processorWarnings = currentWarnings.slice(initialWarningCount);

            const outcome: StageSuccess = {
                kind: "ok",
                stageName: processor.stage.name,
                processorName: processor.name,
                output,
                warnings: processorWarnings,
                elapsed,
            };

            this.events.emit("processorEnd", {
                stage: processor.stage.name,
                processor: processor.name,
                outcome,
            });

            return outcome;
        } catch (error) {
            const processedError = this.processExecutionError(error);

            // Attempt processor-specific error handling
            try {
                await processor.onError?.(processedError, context);
            } catch (handlerError) {
                executionState.logger.error(
                    `Error handler for processor '${processor.name}' failed`,
                    handlerError,
                );
            }

            const elapsed = Date.now() - startTime;

            // Capture warnings generated before the failure
            const currentWarnings = context._getWarnings();
            const processorWarnings = currentWarnings.slice(initialWarningCount);

            const outcome: StageFailure = {
                kind: "err",
                stageName: processor.stage.name,
                processorName: processor.name,
                error: processedError,
                warnings: processorWarnings,
                elapsed,
            };

            this.events.emit("error", processedError);
            this.events.emit("processorEnd", {
                stage: processor.stage.name,
                processor: processor.name,
                outcome,
            });

            return outcome;
        }
    }

    /**
     * Normalizes execution errors into appropriate error types.
     */
    private processExecutionError(error: unknown): Error {
        if (error instanceof PipelineCancellationError) {
            return error;
        }

        if (error instanceof Error) {
            return error;
        }

        return new Error(String(error));
    }

    /**
     * Resolves stage execution order using topological sorting of dependencies.
     */
    private resolveStageExecutionOrder(): ReadonlyArray<PipelineStage<TCtx>> {
        const dependencyGraph = new Map<string, ReadonlyArray<string>>();

        this.stages.forEach((stage, name) => {
            dependencyGraph.set(name, stage.dependencies ?? []);
        });

        return this.topologicalSort(dependencyGraph);
    }

    /**
     * Performs topological sort to determine valid execution order.
     * Detects circular dependencies and ensures proper stage ordering.
     */
    private topologicalSort(
        graph: Map<string, ReadonlyArray<string>>,
    ): ReadonlyArray<PipelineStage<TCtx>> {
        const sorted: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (stageName: string): void => {
            if (visiting.has(stageName)) {
                throw new Error(
                    `Circular dependency detected in stage dependencies involving '${stageName}'. ` +
                    "Ensure stage dependencies form a valid DAG (Directed Acyclic Graph).",
                );
            }

            if (visited.has(stageName) || !graph.has(stageName)) {
                return;
            }

            visiting.add(stageName);

            const dependencies = graph.get(stageName) ?? [];
            dependencies.forEach(visit);

            visiting.delete(stageName);
            visited.add(stageName);
            sorted.push(stageName);
        };

        Array.from(graph.keys()).forEach(visit);

        return sorted.map((name) => this.stages.get(name)!);
    }

    /**
     * Merges multiple abort signals into a single signal that triggers when any source is aborted.
     */
    private mergeAbortSignals(
        ...signals: AbortSignal[]
    ): AbortSignal | undefined {
        const validSignals = signals.filter(signal => signal != null);

        if (validSignals.length === 0) return undefined;
        if (validSignals.length === 1) return validSignals[0];

        const controller = new AbortController();

        const abortHandler = (reason: unknown) => {
            if (!controller.signal.aborted) {
                controller.abort(reason);
            }
        };

        validSignals.forEach((signal) => {
            if (signal.aborted) {
                controller.abort(signal.reason);
                return;
            }

            signal.addEventListener("abort", () => abortHandler(signal.reason), {
                once: true
            });
        });

        return controller.signal;
    }

    /**
     * Checks for cancellation and throws appropriate error if detected.
     */
    private checkForCancellation(signal: AbortSignal | undefined): void {
        if (signal?.aborted) {
            const reason = signal.reason;

            if (reason instanceof Error && reason.message.includes('timeout')) {
                throw new PipelineCancellationError(
                    "Pipeline execution timed out",
                    'timeout'
                );
            }

            throw new PipelineCancellationError(
                "Pipeline execution was cancelled",
                'signal'
            );
        }
    }

    /**
     * Creates comprehensive pipeline result with execution metadata and cancellation details.
     */
    private createPipelineResult<T>(
        output: T,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): PipelineResult<T> {
        const hasErrors = executionState.errors.length > 0;
        const wasCancelled = executionState.errors.some(error =>
            error instanceof PipelineCancellationError
        );

        let cancellationReason: 'timeout' | 'signal' | 'user' | undefined;
        if (wasCancelled) {
            const cancellationError = executionState.errors.find(
                error => error instanceof PipelineCancellationError
            ) as PipelineCancellationError;
            cancellationReason = cancellationError?.reason;
        }

        return {
            success: !hasErrors,
            output: hasErrors ? undefined : output,
            errors: Object.freeze([...executionState.errors]),
            warnings: Object.freeze([...executionState.warnings]),
            stages: Object.freeze([...executionState.stageOutcomes]),
            executionTime: Date.now() - executionState.startTime,
            wasCancelled,
            cancellationReason,
        };
    }
}
