import type { PipelineExecutor } from '../executor/PipelineExecutor';
import { PipelineExecutor as ExecutorImpl } from '../executor/PipelineExecutor';
import type { PipelineProcessor } from '../core/Processor';
import type { PipelineContext } from '../core/Context';

/**
 * Configuration options for building a pipeline executor.
 */
interface BuildOptions {
    /** Whether to validate the pipeline configuration before building */
    readonly validate?: boolean;
}

/**
 * Configuration for cloning processor collections.
 */
interface ProcessorCollection<TCtx extends PipelineContext> {
    readonly processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>;
}

/**
 * Fluent builder for constructing pipeline executors with processors.
 * Provides a convenient API for registering processors and building the executor.
 *
 * The builder maintains a collection of processors and creates new executor instances
 * when building, ensuring each built pipeline is independent.
 *
 * @template I - Type of the initial input data
 * @template O - Type of the final output data
 * @template TCtx - Type of the pipeline context
 *
 * @example
 * ```typescript
 * const pipeline = new PipelineBuilder<string, ProcessedData>()
 *   .withProcessor(validationProcessor)
 *   .withProcessor(transformationProcessor)
 *   .withProcessor(enrichmentProcessor)
 *   .build();
 *
 * const result = await pipeline.execute(inputData, context);
 * ```
 */
export class PipelineBuilder<
    I = unknown,
    O = unknown,
    TCtx extends PipelineContext = PipelineContext,
> {
    private readonly registeredProcessors = new Map<
        string,
        PipelineProcessor<any, any, TCtx>
    >();

    /**
     * Registers one or more processors with the pipeline.
     * Processors are executed in the order of their stage dependencies,
     * not the order they are registered.
     *
     * @param processors - Processors to add to the pipeline
     * @returns This builder instance for method chaining
     * @throws Error if any processor has a duplicate name
     *
     * @example
     * ```typescript
     * builder
     *   .withProcessor(processor1, processor2)
     *   .withProcessor(processor3);
     * ```
     */
    withProcessor(
        ...processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>
    ): this {
        this.validateAndRegisterProcessors(processors);
        return this;
    }

    /**
     * Adds multiple processors from an array.
     * Convenience method for bulk processor registration.
     *
     * @param processors - Array of processors to add
     * @returns This builder instance for method chaining
     */
    withProcessors(
        processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>,
    ): this {
        return this.withProcessor(...processors);
    }

    /**
     * Conditionally adds a processor based on a predicate.
     * Useful for dynamic pipeline construction based on configuration.
     *
     * @param condition - Whether to add the processor
     * @param processor - Processor to add if condition is true
     * @returns This builder instance for method chaining
     *
     * @example
     * ```typescript
     * builder.withProcessorIf(config.enableValidation, validationProcessor);
     * ```
     */
    withProcessorIf(
        condition: boolean,
        processor: PipelineProcessor<any, any, TCtx>,
    ): this {
        if (condition) {
            this.withProcessor(processor);
        }
        return this;
    }

    /**
     * Adds a processor using a factory function.
     * The factory is called immediately and the returned processor is registered.
     *
     * @param factory - Function that returns a processor
     * @returns This builder instance for method chaining
     *
     * @example
     * ```typescript
     * builder.withProcessorFactory(() =>
     *   createProcessor('dynamic', stage, config)
     * );
     * ```
     */
    withProcessorFactory(factory: () => PipelineProcessor<any, any, TCtx>): this {
        return this.withProcessor(factory());
    }

    /**
     * Returns the names of all currently registered processors.
     * Useful for debugging or validation during pipeline construction.
     */
    getRegisteredProcessorNames(): ReadonlyArray<string> {
        return Array.from(this.registeredProcessors.keys());
    }

    /**
     * Returns the execution order of stages based on current processors.
     * Helpful for visualizing the pipeline structure before execution.
     */
    getStageExecutionOrder(): ReadonlyArray<string> {
        const executor = this.createExecutorInstance();
        return executor.getStageExecutionOrder();
    }

    /**
     * Validates the current pipeline configuration.
     * Checks for common issues like missing dependencies or circular dependencies.
     *
     * @throws Error if validation fails
     */
    validate(): void {
        this.validateProcessorCount();
        this.validateDependencyGraph();
    }

    /**
     * Builds and returns a new configured pipeline executor.
     * Each call creates a fresh executor instance with the registered processors.
     *
     * @param options - Optional build configuration
     * @returns New configured pipeline executor
     *
     * @example
     * ```typescript
     * const pipeline = builder.build({ validate: true });
     * const result = await pipeline.execute(data, context);
     * ```
     */
    build(options: BuildOptions = {}): PipelineExecutor<I, O, TCtx> {
        if (options.validate ?? true) {
            this.validate();
        }

        return this.createExecutorInstance();
    }

    /**
     * Creates a new builder instance with the same processor configuration.
     * The clone shares processor instances but maintains independent registration state.
     *
     * @returns New builder with copied processor registrations
     *
     * @example
     * ```typescript
     * const baseBuilder = createPipelineBuilder().withProcessor(commonProcessor);
     * const specializedBuilder = baseBuilder.clone().withProcessor(specialProcessor);
     * ```
     */
    clone(): PipelineBuilder<I, O, TCtx> {
        const cloned = new PipelineBuilder<I, O, TCtx>();
        this.copyProcessorsTo(cloned);
        return cloned;
    }

    /**
     * Validates and registers processors, checking for name conflicts.
     */
    private validateAndRegisterProcessors(
        processors: ReadonlyArray<PipelineProcessor<any, any, TCtx>>,
    ): void {
        for (const processor of processors) {
            this.validateProcessorNotDuplicate(processor);
            this.registeredProcessors.set(processor.name, processor);
        }
    }

    /**
     * Validates that a processor name is not already registered.
     */
    private validateProcessorNotDuplicate(
        processor: PipelineProcessor<any, any, TCtx>,
    ): void {
        if (this.registeredProcessors.has(processor.name)) {
            throw new Error(
                `Processor '${processor.name}' is already registered. ` +
                'Each processor must have a unique name within the builder.',
            );
        }
    }

    /**
     * Creates a new executor instance and registers all processors with it.
     */
    private createExecutorInstance(): PipelineExecutor<I, O, TCtx> {
        const executor = new ExecutorImpl<I, O, TCtx>();
        const processors = Array.from(this.registeredProcessors.values());

        if (processors.length > 0) {
            executor.register(...processors);
        }

        return executor;
    }

    /**
     * Validates that at least one processor is registered.
     */
    private validateProcessorCount(): void {
        if (this.registeredProcessors.size === 0) {
            throw new Error('Pipeline must have at least one processor');
        }
    }

    /**
     * Validates the dependency graph for circular dependencies and missing stages.
     */
    private validateDependencyGraph(): void {
        try {
            // Check for missing dependencies first
            this.validateMissingDependencies();

            // This will throw if there are circular dependencies
            this.getStageExecutionOrder();
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    /**
     * Validates that all stage dependencies reference existing stages.
     */
    private validateMissingDependencies(): void {
        const stageNames = new Set<string>();
        const dependencies = new Set<string>();

        // Collect all stage names and their dependencies
        for (const processor of this.registeredProcessors.values()) {
            stageNames.add(processor.stage.name);
            if (processor.stage.dependencies) {
                processor.stage.dependencies.forEach(dep => dependencies.add(dep));
            }
        }

        // Find missing dependencies
        const missingDependencies = Array.from(dependencies).filter(
            dep => !stageNames.has(dep),
        );

        if (missingDependencies.length > 0) {
            throw new Error(
                `Missing stages for dependencies: ${missingDependencies.join(', ')}`,
            );
        }
    }

    /**
     * Copies all registered processors to another builder instance.
     */
    private copyProcessorsTo(targetBuilder: PipelineBuilder<I, O, TCtx>): void {
        for (const processor of this.registeredProcessors.values()) {
            targetBuilder.registeredProcessors.set(processor.name, processor);
        }
    }
}

/**
 * Creates a new pipeline builder instance.
 * Convenience function for creating builders without using 'new'.
 *
 * @template I - Type of the initial input data
 * @template O - Type of the final output data
 * @template TCtx - Type of the pipeline context
 * @returns New pipeline builder instance
 *
 * @example
 * ```typescript
 * const pipeline = createPipelineBuilder<InputType, OutputType>()
 *   .withProcessor(processor1)
 *   .withProcessor(processor2)
 *   .build();
 * ```
 */
export function createPipelineBuilder<
    I = unknown,
    O = unknown,
    TCtx extends PipelineContext = PipelineContext,
>(): PipelineBuilder<I, O, TCtx> {
    return new PipelineBuilder<I, O, TCtx>();
}
