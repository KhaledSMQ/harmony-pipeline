// @ts-nocheck

import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    type Logger,
    type PipelineContext,
    type PipelineProcessor,
} from '../../src';

/**
 * Example: Advanced Pipeline Patterns
 *
 * This example demonstrates advanced patterns and techniques:
 * 1. Dynamic processor creation and registration
 * 2. Pipeline composition and chaining
 * 3. Circuit breaker pattern implementation
 * 4. Batch processing with parallel execution
 * 5. Plugin system and extensibility
 * 6. Advanced error recovery strategies
 */

// Types for advanced patterns
interface BatchItem {
    id: string;
    data: any;
    priority: number;
    metadata?: Record<string, any>;
}

interface ProcessingResult {
    id: string;
    success: boolean;
    result?: any;
    error?: string;
    processingTime: number;
}

interface BatchResult {
    totalItems: number;
    successCount: number;
    failureCount: number;
    results: ProcessingResult[];
    batchProcessingTime: number;
}

// Advanced metadata
interface AdvancedMetadata {
    batchConfig: {
        batchSize: number;
        maxConcurrency: number;
        timeout: number;
    };
    circuitBreaker: {
        failureThreshold: number;
        resetTimeout: number;
        enabled: boolean;
    };
    features: {
        enableRetry: boolean;
        enableBatching: boolean;
        enableCircuitBreaker: boolean;
        enablePlugins: boolean;
    };
    plugins: PluginConfig[];
}

// Plugin system interfaces
interface PluginConfig {
    name: string;
    enabled: boolean;
    config: Record<string, any>;
}

interface Plugin {
    name: string;
    version: string;

    initialize(config: Record<string, any>): Promise<void>;

    beforeProcess?(data: any): Promise<any>;

    afterProcess?(data: any, result: any): Promise<any>;

    onError?(error: Error, data: any): Promise<void>;

    cleanup?(): Promise<void>;
}

// Circuit breaker implementation
class CircuitBreaker {
    private failureCount = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
        private failureThreshold: number,
        private resetTimeout: number
    ) {
    }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'half-open';
            } else {
                throw new Error('Circuit breaker is open');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    getState(): { state: string; failureCount: number; lastFailureTime: number } {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
        };
    }

    private onSuccess(): void {
        this.failureCount = 0;
        this.state = 'closed';
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'open';
        }
    }
}

// Plugin registry
class PluginRegistry {
    private plugins = new Map<string, Plugin>();
    private initialized = new Set<string>();

    register(plugin: Plugin): void {
        this.plugins.set(plugin.name, plugin);
    }

    async initialize(configs: PluginConfig[]): Promise<void> {
        for (const config of configs) {
            if (config.enabled) {
                const plugin = this.plugins.get(config.name);
                if (plugin && !this.initialized.has(plugin.name)) {
                    await plugin.initialize(config.config);
                    this.initialized.add(plugin.name);
                }
            }
        }
    }

    async beforeProcess(data: any): Promise<any> {
        let processedData = data;
        for (const plugin of this.plugins.values()) {
            if (this.initialized.has(plugin.name) && plugin.beforeProcess) {
                processedData = await plugin.beforeProcess(processedData);
            }
        }
        return processedData;
    }

    async afterProcess(data: any, result: any): Promise<any> {
        let processedResult = result;
        for (const plugin of this.plugins.values()) {
            if (this.initialized.has(plugin.name) && plugin.afterProcess) {
                processedResult = await plugin.afterProcess(data, processedResult);
            }
        }
        return processedResult;
    }

    async onError(error: Error, data: any): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (this.initialized.has(plugin.name) && plugin.onError) {
                try {
                    await plugin.onError(error, data);
                } catch (pluginError) {
                    console.error(`Plugin ${plugin.name} error handler failed:`, pluginError);
                }
            }
        }
    }

    async cleanup(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (this.initialized.has(plugin.name) && plugin.cleanup) {
                try {
                    await plugin.cleanup();
                } catch (error) {
                    console.error(`Plugin ${plugin.name} cleanup failed:`, error);
                }
            }
        }
        this.initialized.clear();
    }
}

// Sample plugins
class ValidationPlugin implements Plugin {
    name = 'validation';
    version = '1.0.0';
    private rules: Array<(data: any) => boolean> = [];

    async initialize(config: Record<string, any>): Promise<void> {
        if (config.requireId) {
            this.rules.push((data) => !!data.id);
        }
        if (config.requireData) {
            this.rules.push((data) => !!data.data);
        }
    }

    async beforeProcess(data: any): Promise<any> {
        for (const rule of this.rules) {
            if (!rule(data)) {
                throw new Error(`Validation failed for data: ${JSON.stringify(data)}`);
            }
        }
        return data;
    }

    async onError(error: Error, data: any): Promise<void> {
        console.log(`Validation plugin logged error for ${data.id}:`, error.message);
    }
}

class MetricsPlugin implements Plugin {
    name = 'metrics';
    version = '1.0.0';
    private metrics = new Map<string, number>();

    async initialize(config: Record<string, any>): Promise<void> {
        console.log('Metrics plugin initialized with config:', config);
    }

    async beforeProcess(data: any): Promise<any> {
        this.metrics.set('items_started', (this.metrics.get('items_started') || 0) + 1);
        return data;
    }

    async afterProcess(data: any, result: any): Promise<any> {
        this.metrics.set('items_completed', (this.metrics.get('items_completed') || 0) + 1);
        return result;
    }

    async onError(error: Error, data: any): Promise<void> {
        this.metrics.set('items_failed', (this.metrics.get('items_failed') || 0) + 1);
    }

    getMetrics(): Record<string, number> {
        return Object.fromEntries(this.metrics);
    }
}

// Advanced logger
class AdvancedLogger implements Logger {
    constructor(private service: string = 'advanced-pipeline') {
    }

    debug(message: string, data?: unknown): void {
        console.log(`[${this.service}] [DEBUG] ${message}`, this.formatData(data));
    }

    info(message: string, data?: unknown): void {
        console.log(`[${this.service}] [INFO] ${message}`, this.formatData(data));
    }

    warn(message: string, data?: unknown): void {
        console.warn(`[${this.service}] [WARN] ${message}`, this.formatData(data));
    }

    error(message: string, data?: unknown): void {
        console.error(`[${this.service}] [ERROR] ${message}`, this.formatData(data));
    }

    private formatData(data?: unknown): string {
        return data ? `\n${JSON.stringify(data, null, 2)}` : '';
    }
}

// Global plugin registry
const globalPluginRegistry = new PluginRegistry();

// Register plugins
globalPluginRegistry.register(new ValidationPlugin());
globalPluginRegistry.register(new MetricsPlugin());

// Circuit breaker instance
let circuitBreaker: CircuitBreaker;

// Pipeline stages
const stages = {
    preprocessing: createStage('preprocessing'),
    validation: createStage('validation', {
        dependencies: ['preprocessing']
    }),
    processing: createStage('processing', {
        dependencies: ['validation']
    }),
    postprocessing: createStage('postprocessing', {
        dependencies: ['processing']
    }),
};

// Advanced batch processor with circuit breaker and plugins
class AdvancedBatchProcessor implements PipelineProcessor<
    BatchItem[],
    BatchResult,
    PipelineContext<AdvancedMetadata>
> {
    readonly name = 'advanced-batch-processor';
    readonly version = '1.0.0';
    readonly stage = stages.processing;

    async setup(context: PipelineContext<AdvancedMetadata>): Promise<void> {
        context.logger.info('Setting up advanced batch processor');

        // Initialize circuit breaker
        const {failureThreshold, resetTimeout, enabled} = context.metadata.circuitBreaker;
        if (enabled) {
            circuitBreaker = new CircuitBreaker(failureThreshold, resetTimeout);
            context.logger.info('Circuit breaker initialized', {failureThreshold, resetTimeout});
        }

        // Initialize plugins
        if (context.metadata.features.enablePlugins) {
            await globalPluginRegistry.initialize(context.metadata.plugins);
            context.logger.info('Plugins initialized', {
                plugins: context.metadata.plugins.filter(p => p.enabled).map(p => p.name)
            });
        }
    }

    async process(
        input: BatchItem[],
        context: PipelineContext<AdvancedMetadata>,
        signal?: AbortSignal
    ): Promise<BatchResult> {
        const startTime = Date.now();
        const {batchSize, maxConcurrency} = context.metadata.batchConfig;

        context.logger.info('Starting batch processing', {
            itemCount: input.length,
            batchSize,
            maxConcurrency
        });

        const results: ProcessingResult[] = [];
        let successCount = 0;
        let failureCount = 0;

        // Process in batches
        for (let i = 0; i < input.length; i += batchSize) {
            const batch = input.slice(i, i + batchSize);
            context.logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
                batchSize: batch.length
            });

            // Check for cancellation
            if (signal?.aborted) {
                throw new Error('Batch processing cancelled');
            }

            // Process batch with limited concurrency
            const batchPromises = batch.map(item =>
                this.processItemWithLimits(item, context, maxConcurrency)
            );

            const batchResults = await Promise.allSettled(batchPromises);

            // Collect results
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                const item = batch[j];

                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.success) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                } else {
                    results.push({
                        id: item.id,
                        success: false,
                        error: result.reason?.message || 'Unknown error',
                        processingTime: 0,
                    });
                    failureCount++;
                }
            }

            // Add delay between batches to prevent overwhelming downstream systems
            if (i + batchSize < input.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const batchProcessingTime = Date.now() - startTime;

        context.logger.info('Batch processing completed', {
            totalItems: input.length,
            successCount,
            failureCount,
            processingTime: batchProcessingTime
        });

        return {
            totalItems: input.length,
            successCount,
            failureCount,
            results,
            batchProcessingTime,
        };
    }

    async onError(error: Error, context: PipelineContext<AdvancedMetadata>): Promise<void> {
        context.logger.error('Batch processor error', {error: error.message});

        // Get circuit breaker state if enabled
        if (context.metadata.features.enableCircuitBreaker && circuitBreaker) {
            const state = circuitBreaker.getState();
            context.logger.info('Circuit breaker state', state);
        }
    }

    async teardown(context: PipelineContext<AdvancedMetadata>): Promise<void> {
        context.logger.info('Cleaning up advanced batch processor');

        // Cleanup plugins
        if (context.metadata.features.enablePlugins) {
            await globalPluginRegistry.cleanup();
        }
    }

    private async processItemWithLimits(
        item: BatchItem,
        context: PipelineContext<AdvancedMetadata>,
        maxConcurrency: number
    ): Promise<ProcessingResult> {
        const startTime = Date.now();

        try {
            // Apply plugins before processing
            let processedItem = item;
            if (context.metadata.features.enablePlugins) {
                processedItem = await globalPluginRegistry.beforeProcess(item);
            }

            // Execute with circuit breaker if enabled
            let result: any;
            if (context.metadata.features.enableCircuitBreaker && circuitBreaker) {
                result = await circuitBreaker.execute(() => this.processItem(processedItem, context));
            } else {
                result = await this.processItem(processedItem, context);
            }

            // Apply plugins after processing
            if (context.metadata.features.enablePlugins) {
                result = await globalPluginRegistry.afterProcess(processedItem, result);
            }

            return {
                id: item.id,
                success: true,
                result,
                processingTime: Date.now() - startTime,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Notify plugins of error
            if (context.metadata.features.enablePlugins) {
                await globalPluginRegistry.onError(
                    error instanceof Error ? error : new Error(errorMessage),
                    item
                );
            }

            context.logger.warn('Item processing failed', {
                itemId: item.id,
                error: errorMessage
            });

            return {
                id: item.id,
                success: false,
                error: errorMessage,
                processingTime: Date.now() - startTime,
            };
        }
    }

    private async processItem(item: BatchItem, context: PipelineContext<AdvancedMetadata>): Promise<any> {
        // Simulate processing work
        const processingTime = 50 + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, processingTime));

        // Simulate occasional failures based on priority
        const failureRate = item.priority > 5 ? 0.1 : 0.05;
        if (Math.random() < failureRate) {
            throw new Error(`Simulated processing failure for item ${item.id}`);
        }

        return {
            id: item.id,
            processed: true,
            timestamp: Date.now(),
            priority: item.priority,
            score: Math.random() * 100,
        };
    }
}

// Simple preprocessor
const preprocessor = createSimpleProcessor<
    BatchItem[],
    BatchItem[],
    PipelineContext<AdvancedMetadata>
>(
    'preprocessor',
    stages.preprocessing,
    (input, context) => {
        context.logger.info('Preprocessing batch', {itemCount: input.length});

        // Sort by priority (higher priority first)
        const sorted = [...input].sort((a, b) => b.priority - a.priority);

        // Add metadata
        const processed = sorted.map(item => ({
            ...item,
            metadata: {
                ...item.metadata,
                preprocessedAt: Date.now(),
                originalIndex: input.indexOf(item),
            },
        }));

        context.logger.debug('Preprocessing completed', {
            sortedByPriority: true,
            highestPriority: processed[0]?.priority,
            lowestPriority: processed[processed.length - 1]?.priority
        });

        return processed;
    }
);

// Validation processor
const validator = createSimpleProcessor<
    BatchItem[],
    BatchItem[],
    PipelineContext<AdvancedMetadata>
>(
    'validator',
    stages.validation,
    (input, context) => {
        context.logger.info('Validating batch', {itemCount: input.length});

        const validItems = input.filter(item => {
            // Basic validation
            if (!item.id || !item.data) {
                context.addWarning(
                    'INVALID_ITEM',
                    'Item missing required fields',
                    {itemId: item.id || 'unknown'}
                );
                return false;
            }

            // Priority validation
            if (item.priority < 1 || item.priority > 10) {
                context.addWarning(
                    'INVALID_PRIORITY',
                    'Item priority out of range',
                    {itemId: item.id, priority: item.priority}
                );
                return false;
            }

            return true;
        });

        const invalidCount = input.length - validItems.length;
        if (invalidCount > 0) {
            context.logger.warn('Some items failed validation', {
                invalidCount,
                validCount: validItems.length
            });
        }

        return validItems;
    }
);

// Post-processor
const postprocessor = createSimpleProcessor<
    BatchResult,
    BatchResult,
    PipelineContext<AdvancedMetadata>
>(
    'postprocessor',
    stages.postprocessing,
    (input, context) => {
        context.logger.info('Post-processing results');

        // Calculate success rate
        const successRate = input.totalItems > 0
            ? (input.successCount / input.totalItems) * 100
            : 0;

        // Add warnings for low success rates
        if (successRate < 80) {
            context.addWarning(
                'LOW_SUCCESS_RATE',
                'Batch processing success rate is below threshold',
                {successRate: successRate.toFixed(2)}
            );
        }

        // Get plugin metrics if available
        const metricsPlugin = globalPluginRegistry['plugins']?.get('metrics') as MetricsPlugin;
        if (metricsPlugin) {
            const metrics = metricsPlugin.getMetrics();
            context.logger.info('Plugin metrics', metrics);
        }

        context.logger.info('Post-processing completed', {
            successRate: successRate.toFixed(2)
        });

        return input;
    }
);

// Pipeline factory
export function createAdvancedPipeline() {
    return createPipelineBuilder<
        BatchItem[],
        BatchResult,
        PipelineContext<AdvancedMetadata>
    >()
        .withProcessor(preprocessor)
        .withProcessor(validator)
        .withProcessor(new AdvancedBatchProcessor())
        .withProcessor(postprocessor)
        .build();
}

// Example usage
export async function runAdvancedPatternsExample() {
    console.log('🚀 Starting Advanced Pipeline Patterns Example\n');

    const pipeline = createAdvancedPipeline();
    const logger = new AdvancedLogger('advanced-patterns');

    // Create execution context with advanced configuration
    const context = createPipelineContext<AdvancedMetadata>({
        batchConfig: {
            batchSize: 5,
            maxConcurrency: 3,
            timeout: 5000,
        },
        circuitBreaker: {
            failureThreshold: 3,
            resetTimeout: 10000,
            enabled: true,
        },
        features: {
            enableRetry: true,
            enableBatching: true,
            enableCircuitBreaker: true,
            enablePlugins: true,
        },
        plugins: [
            {
                name: 'validation',
                enabled: true,
                config: {
                    requireId: true,
                    requireData: true,
                },
            },
            {
                name: 'metrics',
                enabled: true,
                config: {
                    collectTiming: true,
                    collectCounts: true,
                },
            },
        ],
    }, logger);

    // Generate test data
    const testItems: BatchItem[] = Array.from({length: 15}, (_, i) => ({
        id: `item_${i + 1}`,
        data: {
            name: `Test Item ${i + 1}`,
            value: Math.random() * 100,
            category: ['A', 'B', 'C'][i % 3],
        },
        priority: Math.floor(Math.random() * 10) + 1,
        metadata: {
            source: 'test-generator',
            created: new Date().toISOString(),
        },
    }));

    console.log(`📊 Generated ${testItems.length} test items`);
    console.log('🔧 Configuration:');
    console.log(`  - Batch size: ${context.metadata.batchConfig.batchSize}`);
    console.log(`  - Max concurrency: ${context.metadata.batchConfig.maxConcurrency}`);
    console.log(`  - Circuit breaker: ${context.metadata.features.enableCircuitBreaker ? 'enabled' : 'disabled'}`);
    console.log(`  - Plugins: ${context.metadata.features.enablePlugins ? 'enabled' : 'disabled'}`);

    try {
        console.log('\n🔄 Processing batch with advanced patterns...');

        const result = await pipeline.execute(testItems, context, {
            stopOnError: false,
            timeoutMs: 30000,
            logger,
        });

        console.log('\n📈 Results Summary:');
        console.log('='.repeat(50));

        if (result.success) {
            console.log('✅ Pipeline execution successful!');
            console.log(`📊 Batch Results:`);
            console.log(`  - Total items: ${result.output?.totalItems}`);
            console.log(`  - Successful: ${result.output?.successCount}`);
            console.log(`  - Failed: ${result.output?.failureCount}`);
            console.log(`  - Success rate: ${((result.output?.successCount || 0) / (result.output?.totalItems || 1) * 100).toFixed(1)}%`);
            console.log(`  - Processing time: ${result.output?.batchProcessingTime}ms`);
        } else {
            console.log('❌ Pipeline execution failed!');
            console.log('🚨 Errors:', result.errors.map(e => e.message));
        }

        if (result.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            result.warnings.forEach(warning => {
                console.log(`  - ${warning.code}: ${warning.message}`);
            });
        }

        // Show detailed stage results
        console.log('\n📋 Stage Breakdown:');
        result.stages.forEach(stage => {
            const status = stage.kind === 'ok' ? '✅' : '❌';
            console.log(`  ${status} ${stage.stageName}.${stage.processorName}: ${stage.elapsed}ms`);

            if (stage.kind === 'err') {
                console.log(`    Error: ${stage.error.message}`);
            }
        });

        // Show circuit breaker state if enabled
        if (context.metadata.features.enableCircuitBreaker && circuitBreaker) {
            const state = circuitBreaker.getState();
            console.log('\n🔌 Circuit Breaker State:');
            console.log(`  - State: ${state.state}`);
            console.log(`  - Failure count: ${state.failureCount}`);
            if (state.lastFailureTime > 0) {
                console.log(`  - Last failure: ${new Date(state.lastFailureTime).toISOString()}`);
            }
        }

        console.log(`\n⏱️  Total execution time: ${result.executionTime}ms`);

    } catch (error) {
        console.error('💥 Unexpected error:', error);
    }

    console.log('\n🏁 Advanced Pipeline Patterns Example Complete\n');
}

// Export advanced utilities
export {
    CircuitBreaker,
    PluginRegistry,
    ValidationPlugin,
    MetricsPlugin,
    AdvancedBatchProcessor,
    globalPluginRegistry,
};

// Run the example if this file is executed directly
if (require.main === module) {
    runAdvancedPatternsExample().catch(console.error);
}
