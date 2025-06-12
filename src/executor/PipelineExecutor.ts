import type { PipelineStage } from '../core/Stage';
import type { PipelineProcessor } from '../core/Processor';
import type { PipelineContext, PipelineWarning } from '../core/Context';
import type { PipelineResult, StageFailure, StageOutcome, StageSuccess, } from '../core/Result';
import type { ExecutionOptions } from '../core/ExecutionOptions';
import { NullLogger } from '../core/Logger';

/**
 * Events emitted during pipeline execution.
 * These events provide detailed visibility into pipeline execution flow.
 */
interface PipelineEvents {
    /** Emitted when pipeline execution begins */
    pipelineStart: undefined;
    /** Emitted when pipeline execution completes (success or failure) */
    pipelineEnd: PipelineResult<unknown>;
    /** Emitted when a stage begins execution */
    stageStart: { stage: string };
    /** Emitted when a stage completes execution */
    stageEnd: { stage: string };
    /** Emitted when a processor begins execution */
    processorStart: { stage: string; processor: string };
    /** Emitted when a processor completes execution */
    processorEnd: { stage: string; processor: string; outcome: StageOutcome };
    /** Emitted when a warning is recorded */
    warning: PipelineWarning;
    /** Emitted when an error occurs */
    error: Error;
}

/**
 * Lightweight event emitter for pipeline execution events.
 * Provides type-safe event handling for monitoring pipeline execution.
 */
class EventEmitter<TEvents extends Record<string, any>> {
    private readonly listeners: {
        [K in keyof TEvents]?: Array<(payload: TEvents[K]) => void>;
    } = {};

    /**
     * Registers an event listener for the specified event type.
     *
     * @param event - The event type to listen for
     * @param listener - Function to call when the event is emitted
     * @returns Unsubscribe function to remove the listener
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
     * Removes a specific event listener.
     *
     * @param event - The event type
     * @param listener - The listener function to remove
     */
    off<K extends keyof TEvents>(
        event: K,
        listener: (payload: TEvents[K]) => void,
    ): void {
        const currentListeners = this.listeners[event];
        if (currentListeners) {
            this.listeners[event] = currentListeners.filter(l => l !== listener);
        }
    }

    /**
     * Emits an event to all registered listeners.
     *
     * @param event - The event type to emit
     * @param payload - The event payload
     */
    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        const eventListeners = this.listeners[event];
        if (eventListeners) {
            eventListeners.forEach(listener => {
                try {
                    listener(payload);
                } catch (error) {
                    // Prevent listener errors from affecting pipeline execution
                    console.error('Event listener error:', error);
                }
            });
        }
    }
}

/**
 * Core pipeline execution engine that orchestrates processor execution.
 * Manages stage dependencies, concurrent execution, error handling, and event emission.
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
    private readonly processors = new Map<
        string,
        PipelineProcessor<any, any, TCtx>
    >();
    private readonly stages = new Map<string, PipelineStage<TCtx>>();
    private readonly stageProcessors = new Map<
        string,
        PipelineProcessor<any, any, TCtx>[]
    >();
    private readonly events = new EventEmitter<PipelineEvents>();
    /**
     * Registers an event listener for pipeline execution events.
     *
     * @param event - The event type to listen for
     * @param listener - Function to call when the event occurs
     * @returns Unsubscribe function to remove the listener
     */
    readonly on = this.events.on.bind(this.events);
    private readonly setupProcessors = new Set<string>();

    /**
     * Registers one or more processors with the executor.
     * Each processor must have a unique name within the executor.
     *
     * @param processors - Processors to register
     * @returns This executor instance for method chaining
     * @throws Error if a processor with the same name is already registered
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
     * Executes the pipeline with the given input and context.
     *
     * @param input - Initial data to process
     * @param context - Execution context
     * @param options - Execution configuration options
     * @returns Promise resolving to the pipeline execution result
     * @throws AbortError when cancelled or timed out
     */
    async execute(
        input: I,
        context: TCtx,
        options: ExecutionOptions = {},
    ): Promise<PipelineResult<O>> {
        const executionState = this.initializeExecution(options);
        const warningUnsubscribe = this.setupWarningCollection(executionState);

        try {
            this.events.emit('pipelineStart', undefined);
            await this.ensureProcessorsSetup(context);

            const result = await this.executeStages(input, context, executionState);

            this.events.emit('pipelineEnd', result);
            return result;
        } finally {
            warningUnsubscribe();
        }
    }

    /**
     * Returns the names of all registered processors.
     * Useful for debugging and testing.
     */
    getRegisteredProcessorNames(): ReadonlyArray<string> {
        return Array.from(this.processors.keys());
    }

    /**
     * Returns the execution order of stages based on dependency resolution.
     * Useful for debugging and visualization.
     */
    getStageExecutionOrder(): ReadonlyArray<string> {
        return this.resolveStageExecutionOrder().map(stage => stage.name);
    }

    private validateAndRegisterProcessor(
        processor: PipelineProcessor<any, any, TCtx>,
    ): void {
        if (this.processors.has(processor.name)) {
            throw new Error(
                `Processor '${processor.name}' is already registered. ` +
                'Each processor must have a unique name within the executor.',
            );
        }

        this.processors.set(processor.name, processor);
        this.stages.set(processor.stage.name, processor.stage);

        const stageProcessorList =
            this.stageProcessors.get(processor.stage.name) ?? [];
        stageProcessorList.push(processor);
        this.stageProcessors.set(processor.stage.name, stageProcessorList);
    }

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

        let abortController: AbortController | undefined;
        if (timeoutMs != null) {
            abortController = new AbortController();
            setTimeout(() => {
                abortController!.abort(
                    new Error(`Pipeline timeout of ${timeoutMs}ms exceeded`),
                );
            }, timeoutMs);
        }

        const combinedSignal = this.mergeAbortSignals(
            signal,
            abortController?.signal,
        );

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

    private setupWarningCollection(
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        return this.on('warning', warning => executionState.warnings.push(warning));
    }

    private async ensureProcessorsSetup(context: TCtx): Promise<void> {
        const setupPromises: unknown[] = [];

        for (const processor of this.processors.values()) {
            if (processor.setup && !this.setupProcessors.has(processor.name)) {
                setupPromises.push(processor.setup(context));
                this.setupProcessors.add(processor.name);
            }
        }

        if (setupPromises.length > 0) {
            await Promise.all(setupPromises);
        }
    }

    private async executeStages(
        input: I,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): Promise<PipelineResult<O>> {
        let currentData: unknown = input;

        for (const stage of this.resolveStageExecutionOrder()) {
            if (this.shouldSkipStage(stage, context, executionState)) {
                continue;
            }

            this.checkForCancellation(executionState.combinedSignal);
            this.events.emit('stageStart', {stage: stage.name});

            const stageResult = await this.executeStage(
                stage,
                currentData,
                context,
                executionState,
            );

            executionState.stageOutcomes.push(...stageResult.outcomes);

            // Collect warnings from the stage outcomes
            for (const outcome of stageResult.outcomes) {
                for (const warning of outcome.warnings) {
                    this.events.emit('warning', warning);
                }
            }

            if (stageResult.error) {
                executionState.errors.push(stageResult.error);
                if (executionState.stopOnError) {
                    break;
                }
            } else {
                currentData = stageResult.output;
            }

            this.events.emit('stageEnd', {stage: stage.name});
        }

        return this.createPipelineResult(currentData as O, executionState);
    }

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

    private async executeStage(
        stage: PipelineStage<TCtx>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        const processors = this.stageProcessors.get(stage.name) ?? [];

        if (processors.length === 0) {
            return {outcomes: [], output: input, error: undefined};
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
            const outcome = await this.executeProcessor(
                processor,
                currentOutput,
                context,
                executionState,
            );
            outcomes.push(outcome);

            if (outcome.kind === 'ok') {
                currentOutput = outcome.output;
            } else {
                firstError = outcome.error;
                if (executionState.stopOnError) {
                    break;
                }
            }
        }

        return {outcomes, output: currentOutput, error: firstError};
    }

    private async executeProcessorsConcurrently(
        processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ) {
        const outcomePromises = processors.map(processor =>
            this.executeProcessor(processor, input, context, executionState),
        );

        const outcomes = await Promise.all(outcomePromises);
        const firstError = outcomes.find(outcome => outcome.kind === 'err')?.error;

        // Use output from last successful processor, or original input if all failed
        const lastSuccessful = outcomes
            .filter(outcome => outcome.kind === 'ok')
            .pop();
        const output = lastSuccessful
            ? (lastSuccessful as StageSuccess).output
            : input;

        return {outcomes, output, error: firstError};
    }

    private async executeProcessor(
        processor: PipelineProcessor<any, any, TCtx>,
        input: unknown,
        context: TCtx,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): Promise<StageOutcome> {
        const startTime = Date.now();
        const initialWarningCount = context._getWarnings().length;

        this.events.emit('processorStart', {
            stage: processor.stage.name,
            processor: processor.name,
        });

        try {
            const output = await processor.process(
                input,
                context,
                executionState.combinedSignal,
            );
            const elapsed = Date.now() - startTime;

            // Get warnings that were added during this processor's execution
            const currentWarnings = context._getWarnings();
            const processorWarnings = currentWarnings.slice(initialWarningCount);

            const outcome: StageSuccess = {
                kind: 'ok',
                stageName: processor.stage.name,
                processorName: processor.name,
                output,
                warnings: processorWarnings,
                elapsed,
            };

            this.events.emit('processorEnd', {
                stage: processor.stage.name,
                processor: processor.name,
                outcome,
            });

            return outcome;
        } catch (error) {
            const processedError =
                error instanceof Error ? error : new Error(String(error));

            try {
                await processor.onError?.(processedError, context);
            } catch (handlerError) {
                executionState.logger.error(
                    `Error handler for processor '${processor.name}' failed`,
                    handlerError,
                );
            }

            const elapsed = Date.now() - startTime;

            // Get warnings that were added during this processor's execution (before failure)
            const currentWarnings = context._getWarnings();
            const processorWarnings = currentWarnings.slice(initialWarningCount);

            const outcome: StageFailure = {
                kind: 'err',
                stageName: processor.stage.name,
                processorName: processor.name,
                error: processedError,
                warnings: processorWarnings,
                elapsed,
            };

            this.events.emit('error', processedError);
            this.events.emit('processorEnd', {
                stage: processor.stage.name,
                processor: processor.name,
                outcome,
            });

            return outcome;
        }
    }

    private resolveStageExecutionOrder(): ReadonlyArray<PipelineStage<TCtx>> {
        const dependencyGraph = new Map<string, ReadonlyArray<string>>();

        this.stages.forEach((stage, name) => {
            dependencyGraph.set(name, stage.dependencies ?? []);
        });

        return this.topologicalSort(dependencyGraph);
    }

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
                    'Ensure stage dependencies form a valid DAG (Directed Acyclic Graph).',
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

        return sorted.map(name => this.stages.get(name)!);
    }

    private mergeAbortSignals(
        ...signals: (AbortSignal | undefined)[]
    ): AbortSignal | undefined {
        const validSignals = signals.filter(
            (signal): signal is AbortSignal => signal != null,
        );

        if (validSignals.length === 0) {
            return undefined;
        }
        if (validSignals.length === 1) {
            return validSignals[0];
        }

        const controller = new AbortController();

        const abortHandler = (reason: unknown) => {
            if (!controller.signal.aborted) {
                controller.abort(reason);
            }
        };

        validSignals.forEach(signal => {
            if (signal.aborted) {
                controller.abort(signal.reason);
            } else {
                signal.addEventListener('abort', () => abortHandler(signal.reason));
            }
        });

        return controller.signal;
    }

    private checkForCancellation(signal: AbortSignal | undefined): void {
        if (signal?.aborted) {
            throw signal.reason instanceof Error
                ? signal.reason
                : new Error('Pipeline execution was cancelled');
        }
    }

    private createPipelineResult<T>(
        output: T,
        executionState: ReturnType<typeof this.initializeExecution>,
    ): PipelineResult<T> {
        const hasErrors = executionState.errors.length > 0;

        return {
            success: !hasErrors,
            output: hasErrors ? undefined : output,
            errors: Object.freeze([...executionState.errors]),
            warnings: Object.freeze([...executionState.warnings]),
            stages: Object.freeze([...executionState.stageOutcomes]),
            executionTime: Date.now() - executionState.startTime,
        };
    }
}
