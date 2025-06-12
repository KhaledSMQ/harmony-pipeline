// @ts-nocheck

import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    type Logger,
    type PipelineContext,
    type PipelineResult,
} from '../../src';

/**
 * Example: Pipeline Monitoring and Observability
 *
 * This example demonstrates how to implement comprehensive monitoring:
 * 1. Event-driven monitoring with custom metrics
 * 2. Performance tracking and profiling
 * 3. Error tracking and alerting
 * 4. Health checks and circuit breakers
 * 5. Distributed tracing simulation
 */

// Define our data types for a simple data processing pipeline
interface InputData {
    id: string;
    type: 'user' | 'order' | 'product';
    payload: any;
    priority: 'low' | 'normal' | 'high';
}

interface ValidatedData extends InputData {
    validatedAt: number;
    schema: string;
}

interface EnrichedData extends ValidatedData {
    enrichedAt: number;
    metadata: {
        source: string;
        version: string;
        tags: string[];
    };
}

interface ProcessedData extends EnrichedData {
    processedAt: number;
    result: {
        status: 'success' | 'warning' | 'error';
        score: number;
        recommendations: string[];
    };
}

// Monitoring metadata
interface MonitoringMetadata {
    traceId: string;
    spanId: string;
    environment: 'dev' | 'staging' | 'prod';
    service: {
        name: string;
        version: string;
        instance: string;
    };
    monitoring: {
        enableMetrics: boolean;
        enableTracing: boolean;
        enableAlerting: boolean;
        metricsInterval: number;
    };
}

// Metrics collection system
interface Metrics {
    counters: Map<string, number>;
    gauges: Map<string, number>;
    histograms: Map<string, number[]>;
    timers: Map<string, { start: number; duration?: number }>;
}

class MetricsCollector {
    private metrics: Metrics = {
        counters: new Map(),
        gauges: new Map(),
        histograms: new Map(),
        timers: new Map(),
    };

    // Counter operations
    incrementCounter(name: string, value = 1, tags?: Record<string, string>): void {
        const key = this.createKey(name, tags);
        this.metrics.counters.set(key, (this.metrics.counters.get(key) || 0) + value);
    }

    // Gauge operations
    setGauge(name: string, value: number, tags?: Record<string, string>): void {
        const key = this.createKey(name, tags);
        this.metrics.gauges.set(key, value);
    }

    // Histogram operations
    recordValue(name: string, value: number, tags?: Record<string, string>): void {
        const key = this.createKey(name, tags);
        const values = this.metrics.histograms.get(key) || [];
        values.push(value);
        this.metrics.histograms.set(key, values);
    }

    // Timer operations
    startTimer(name: string, tags?: Record<string, string>): string {
        const key = this.createKey(name, tags);
        this.metrics.timers.set(key, {start: Date.now()});
        return key;
    }

    stopTimer(name: string, tags?: Record<string, string>): number {
        const key = this.createKey(name, tags);
        const timer = this.metrics.timers.get(key);
        if (timer && !timer.duration) {
            timer.duration = Date.now() - timer.start;
            this.recordValue('execution_time', timer.duration, {operation: name, ...tags});
            return timer.duration;
        }
        return 0;
    }

    // Get metrics summary
    getSummary(): Record<string, any> {
        const summary: Record<string, any> = {};

        // Counters
        summary.counters = Object.fromEntries(this.metrics.counters);

        // Gauges
        summary.gauges = Object.fromEntries(this.metrics.gauges);

        // Histograms with statistics
        summary.histograms = {};
        for (const [key, values] of this.metrics.histograms) {
            if (values.length > 0) {
                const sorted = values.sort((a, b) => a - b);
                summary.histograms[key] = {
                    count: values.length,
                    min: sorted[0],
                    max: sorted[sorted.length - 1],
                    avg: values.reduce((a, b) => a + b, 0) / values.length,
                    p50: sorted[Math.floor(sorted.length * 0.5)],
                    p95: sorted[Math.floor(sorted.length * 0.95)],
                    p99: sorted[Math.floor(sorted.length * 0.99)],
                };
            }
        }

        return summary;
    }

    clear(): void {
        this.metrics.counters.clear();
        this.metrics.gauges.clear();
        this.metrics.histograms.clear();
        this.metrics.timers.clear();
    }

    private createKey(name: string, tags?: Record<string, string>): string {
        if (!tags || Object.keys(tags).length === 0) {
            return name;
        }
        const tagString = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        return `${name}{${tagString}}`;
    }
}

// Monitoring logger with metrics integration
class MonitoringLogger implements Logger {
    constructor(
        private metrics: MetricsCollector,
        private service: string = 'harmony-pipeline'
    ) {
    }

    debug(message: string, data?: unknown): void {
        console.log(`[${this.service}] [DEBUG] ${message}`, this.formatData(data));
        this.metrics.incrementCounter('log_messages', 1, {level: 'debug', service: this.service});
    }

    info(message: string, data?: unknown): void {
        console.log(`[${this.service}] [INFO] ${message}`, this.formatData(data));
        this.metrics.incrementCounter('log_messages', 1, {level: 'info', service: this.service});
    }

    warn(message: string, data?: unknown): void {
        console.warn(`[${this.service}] [WARN] ${message}`, this.formatData(data));
        this.metrics.incrementCounter('log_messages', 1, {level: 'warn', service: this.service});
    }

    error(message: string, data?: unknown): void {
        console.error(`[${this.service}] [ERROR] ${message}`, this.formatData(data));
        this.metrics.incrementCounter('log_messages', 1, {level: 'error', service: this.service});
        this.metrics.incrementCounter('errors_total', 1, {service: this.service});
    }

    private formatData(data?: unknown): string {
        return data ? JSON.stringify(data, null, 2) : '';
    }
}

// Health check system
interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, {
        status: 'pass' | 'fail' | 'warn';
        message: string;
        timestamp: number;
        responseTime?: number;
    }>;
    uptime: number;
    version: string;
}

class HealthMonitor {
    private startTime = Date.now();
    private checks = new Map<string, () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>>();

    registerCheck(name: string, check: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>): void {
        this.checks.set(name, check);
    }

    async getHealth(): Promise<HealthStatus> {
        const checkResults: HealthStatus['checks'] = {};

        for (const [name, check] of this.checks) {
            const startTime = Date.now();
            try {
                const result = await check();
                checkResults[name] = {
                    ...result,
                    timestamp: Date.now(),
                    responseTime: Date.now() - startTime,
                };
            } catch (error) {
                checkResults[name] = {
                    status: 'fail',
                    message: error instanceof Error ? error.message : 'Health check failed',
                    timestamp: Date.now(),
                    responseTime: Date.now() - startTime,
                };
            }
        }

        // Determine overall status
        const statuses = Object.values(checkResults).map(check => check.status);
        let overallStatus: HealthStatus['status'] = 'healthy';

        if (statuses.includes('fail')) {
            overallStatus = 'unhealthy';
        } else if (statuses.includes('warn')) {
            overallStatus = 'degraded';
        }

        return {
            status: overallStatus,
            checks: checkResults,
            uptime: Date.now() - this.startTime,
            version: '1.0.0',
        };
    }
}

// Global monitoring system
const globalMetrics = new MetricsCollector();
const healthMonitor = new HealthMonitor();

// Setup basic health checks
healthMonitor.registerCheck('memory', async () => {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;

    if (heapUsedMB > 500) {
        return {status: 'fail', message: `High memory usage: ${heapUsedMB.toFixed(2)}MB`};
    } else if (heapUsedMB > 250) {
        return {status: 'warn', message: `Elevated memory usage: ${heapUsedMB.toFixed(2)}MB`};
    }

    return {status: 'pass', message: `Memory usage normal: ${heapUsedMB.toFixed(2)}MB`};
});

healthMonitor.registerCheck('metrics', async () => {
    const summary = globalMetrics.getSummary();
    const errorCount = summary.counters['errors_total'] || 0;

    if (errorCount > 10) {
        return {status: 'fail', message: `High error rate: ${errorCount} errors`};
    } else if (errorCount > 5) {
        return {status: 'warn', message: `Elevated error rate: ${errorCount} errors`};
    }

    return {status: 'pass', message: 'Error rate normal'};
});

// Define pipeline stages
const stages = {
    validation: createStage('validation'),
    enrichment: createStage('enrichment', {
        dependencies: ['validation']
    }),
    processing: createStage('processing', {
        dependencies: ['enrichment']
    }),
};

// Create monitored processors
const dataValidator = createSimpleProcessor<
    InputData,
    ValidatedData,
    PipelineContext<MonitoringMetadata>
>(
    'data-validator',
    stages.validation,
    (input, context) => {
        const timer = globalMetrics.startTimer('validation_duration', {
            type: input.type,
            priority: input.priority
        });

        try {
            context.logger.info('Validating data', {id: input.id, type: input.type});

            // Simulate validation logic
            if (!input.id || !input.type || !input.payload) {
                globalMetrics.incrementCounter('validation_failures', 1, {type: input.type});
                throw new Error('Missing required fields');
            }

            // Simulate schema validation
            const schema = `${input.type}_v1.0`;

            globalMetrics.incrementCounter('validation_success', 1, {
                type: input.type,
                schema: schema
            });

            const result: ValidatedData = {
                ...input,
                validatedAt: Date.now(),
                schema,
            };

            context.logger.debug('Validation completed', {
                id: input.id,
                schema,
                duration: globalMetrics.stopTimer('validation_duration', {
                    type: input.type,
                    priority: input.priority
                })
            });

            return result;

        } catch (error) {
            globalMetrics.stopTimer('validation_duration', {
                type: input.type,
                priority: input.priority
            });
            throw error;
        }
    }
);

const dataEnricher = createSimpleProcessor<
    ValidatedData,
    EnrichedData,
    PipelineContext<MonitoringMetadata>
>(
    'data-enricher',
    stages.enrichment,
    async (input, context, signal) => {
        const timer = globalMetrics.startTimer('enrichment_duration', {
            type: input.type
        });

        try {
            context.logger.info('Enriching data', {id: input.id});

            // Simulate async enrichment with cancellation support
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 100 + Math.random() * 200);

                signal?.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    globalMetrics.incrementCounter('enrichment_cancelled', 1, {type: input.type});
                    reject(new Error('Enrichment cancelled'));
                });
            });

            // Check for high priority items
            if (input.priority === 'high') {
                globalMetrics.incrementCounter('high_priority_items', 1, {type: input.type});
                context.addWarning(
                    'HIGH_PRIORITY_ITEM',
                    'Processing high priority item',
                    {id: input.id, type: input.type}
                );
            }

            const metadata = {
                source: 'data-pipeline',
                version: '1.0.0',
                tags: [input.type, input.priority, context.metadata.environment],
            };

            globalMetrics.incrementCounter('enrichment_success', 1, {type: input.type});
            globalMetrics.setGauge('last_enrichment_timestamp', Date.now());

            const result: EnrichedData = {
                ...input,
                enrichedAt: Date.now(),
                metadata,
            };

            const duration = globalMetrics.stopTimer('enrichment_duration', {type: input.type});
            context.logger.debug('Enrichment completed', {
                id: input.id,
                duration,
                tags: metadata.tags
            });

            return result;

        } catch (error) {
            globalMetrics.stopTimer('enrichment_duration', {type: input.type});
            throw error;
        }
    }
);

const dataProcessor = createSimpleProcessor<
    EnrichedData,
    ProcessedData,
    PipelineContext<MonitoringMetadata>
>(
    'data-processor',
    stages.processing,
    (input, context) => {
        const timer = globalMetrics.startTimer('processing_duration', {
            type: input.type
        });

        try {
            context.logger.info('Processing data', {id: input.id});

            // Simulate processing logic with scoring
            let score = Math.random() * 100;
            let status: 'success' | 'warning' | 'error' = 'success';
            const recommendations: string[] = [];

            // Business logic simulation
            if (input.type === 'user') {
                score += 10; // Users get bonus points
                recommendations.push('Enable user notifications');
            } else if (input.type === 'order') {
                score += 5; // Orders get some bonus
                recommendations.push('Track order fulfillment');
            }

            // Priority adjustments
            if (input.priority === 'high') {
                score += 15;
                recommendations.push('Fast-track processing');
            } else if (input.priority === 'low') {
                score -= 5;
            }

            // Determine status based on score
            if (score >= 80) {
                status = 'success';
                globalMetrics.incrementCounter('high_score_items', 1, {type: input.type});
            } else if (score >= 50) {
                status = 'warning';
                globalMetrics.incrementCounter('medium_score_items', 1, {type: input.type});
                context.addWarning(
                    'MEDIUM_SCORE',
                    'Item scored in medium range',
                    {id: input.id, score: Math.round(score)}
                );
            } else {
                status = 'error';
                globalMetrics.incrementCounter('low_score_items', 1, {type: input.type});
                throw new Error(`Processing failed: low score ${Math.round(score)}`);
            }

            globalMetrics.recordValue('processing_score', score, {
                type: input.type,
                status
            });

            const result: ProcessedData = {
                ...input,
                processedAt: Date.now(),
                result: {
                    status,
                    score: Math.round(score * 100) / 100,
                    recommendations,
                },
            };

            const duration = globalMetrics.stopTimer('processing_duration', {type: input.type});
            context.logger.debug('Processing completed', {
                id: input.id,
                score: result.result.score,
                status: result.result.status,
                duration
            });

            return result;

        } catch (error) {
            globalMetrics.stopTimer('processing_duration', {type: input.type});
            throw error;
        }
    }
);

// Pipeline factory with monitoring
export function createMonitoredPipeline() {
    const pipeline = createPipelineBuilder<
        InputData,
        ProcessedData,
        PipelineContext<MonitoringMetadata>
    >()
        .withProcessor(dataValidator)
        .withProcessor(dataEnricher)
        .withProcessor(dataProcessor)
        .build();

    // Add event listeners for monitoring
    pipeline.on('pipelineStart', () => {
        globalMetrics.incrementCounter('pipeline_executions_started', 1);
        globalMetrics.setGauge('pipeline_active', 1);
    });

    pipeline.on('pipelineEnd', (result: PipelineResult<ProcessedData>) => {
        globalMetrics.incrementCounter('pipeline_executions_completed', 1);
        globalMetrics.setGauge('pipeline_active', 0);
        globalMetrics.recordValue('pipeline_execution_time', result.executionTime);

        if (result.success) {
            globalMetrics.incrementCounter('pipeline_success', 1);
        } else {
            globalMetrics.incrementCounter('pipeline_failures', 1);
        }

        globalMetrics.setGauge('pipeline_warnings', result.warnings.length);
        globalMetrics.setGauge('pipeline_errors', result.errors.length);
    });

    pipeline.on('stageStart', ({stage}) => {
        globalMetrics.incrementCounter('stage_executions', 1, {stage});
    });

    pipeline.on('stageEnd', ({stage}) => {
        globalMetrics.incrementCounter('stage_completions', 1, {stage});
    });

    pipeline.on('processorStart', ({stage, processor}) => {
        globalMetrics.incrementCounter('processor_executions', 1, {stage, processor});
    });

    pipeline.on('processorEnd', ({stage, processor, outcome}) => {
        globalMetrics.incrementCounter('processor_completions', 1, {
            stage,
            processor,
            result: outcome.kind
        });
        globalMetrics.recordValue('processor_execution_time', outcome.elapsed, {
            stage,
            processor
        });
    });

    pipeline.on('warning', (warning) => {
        globalMetrics.incrementCounter('warnings_total', 1, {
            code: warning.code
        });
    });

    pipeline.on('error', (error) => {
        globalMetrics.incrementCounter('errors_total', 1);
    });

    return pipeline;
}

// Monitoring dashboard simulation
class MonitoringDashboard {
    private intervalId: NodeJS.Timeout | null = null;

    start(intervalMs = 5000): void {
        if (this.intervalId) {
            return; // Already running
        }

        console.log('📊 Starting monitoring dashboard...\n');

        this.intervalId = setInterval(async () => {
            await this.displayMetrics();
        }, intervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('📊 Monitoring dashboard stopped\n');
        }
    }

    private async displayMetrics(): Promise<void> {
        console.clear();
        console.log('🔍 HARMONY PIPELINE MONITORING DASHBOARD');
        console.log('='.repeat(60));
        console.log(`📅 ${new Date().toISOString()}\n`);

        // Health status
        console.log('🏥 HEALTH STATUS');
        console.log('-'.repeat(30));
        const health = await healthMonitor.getHealth();
        const statusEmoji = {
            healthy: '✅',
            degraded: '⚠️',
            unhealthy: '❌'
        }[health.status];

        console.log(`${statusEmoji} Overall Status: ${health.status.toUpperCase()}`);
        console.log(`⏱️  Uptime: ${Math.round(health.uptime / 1000)}s`);

        for (const [name, check] of Object.entries(health.checks)) {
            const checkEmoji = {
                pass: '✅',
                warn: '⚠️',
                fail: '❌'
            }[check.status];
            console.log(`${checkEmoji} ${name}: ${check.message} (${check.responseTime}ms)`);
        }

        // Metrics summary
        console.log('\n📈 METRICS SUMMARY');
        console.log('-'.repeat(30));
        const summary = globalMetrics.getSummary();

        if (Object.keys(summary.counters).length > 0) {
            console.log('📊 Counters:');
            for (const [key, value] of Object.entries(summary.counters)) {
                console.log(`  ${key}: ${value}`);
            }
        }

        if (Object.keys(summary.gauges).length > 0) {
            console.log('\n📏 Gauges:');
            for (const [key, value] of Object.entries(summary.gauges)) {
                if (key.includes('timestamp')) {
                    const date = new Date(value as number);
                    console.log(`  ${key}: ${date.toISOString()}`);
                } else {
                    console.log(`  ${key}: ${value}`);
                }
            }
        }

        if (Object.keys(summary.histograms).length > 0) {
            console.log('\n📊 Performance (ms):');
            for (const [key, stats] of Object.entries(summary.histograms)) {
                const s = stats as any;
                console.log(`  ${key}:`);
                console.log(`    Count: ${s.count}, Avg: ${s.avg.toFixed(2)}, P95: ${s.p95.toFixed(2)}`);
            }
        }

        console.log('\n' + '='.repeat(60));
    }
}

// Example usage
export async function runMonitoringExample() {
    console.log('📊 Starting Pipeline Monitoring Example\n');

    const pipeline = createMonitoredPipeline();
    const logger = new MonitoringLogger(globalMetrics, 'monitoring-example');
    const dashboard = new MonitoringDashboard();

    // Start monitoring dashboard
    dashboard.start(3000);

    // Create execution context
    const context = createPipelineContext<MonitoringMetadata>({
        traceId: `trace_${Date.now()}`,
        spanId: `span_${Math.random().toString(36).substr(2, 9)}`,
        environment: 'dev',
        service: {
            name: 'data-processor',
            version: '1.0.0',
            instance: 'instance-001',
        },
        monitoring: {
            enableMetrics: true,
            enableTracing: true,
            enableAlerting: true,
            metricsInterval: 1000,
        },
    }, logger);

    // Generate test data
    const testData: InputData[] = [
        {id: 'user_001', type: 'user', payload: {name: 'John Doe'}, priority: 'high'},
        {id: 'order_001', type: 'order', payload: {amount: 100}, priority: 'normal'},
        {id: 'product_001', type: 'product', payload: {name: 'Widget'}, priority: 'low'},
        {id: 'user_002', type: 'user', payload: {name: 'Jane Smith'}, priority: 'normal'},
        {id: 'order_002', type: 'order', payload: {amount: 50}, priority: 'high'},
    ];

    console.log('🚀 Processing data items with monitoring...\n');

    // Process data with some delays to see metrics in action
    for (const [index, data] of testData.entries()) {
        try {
            console.log(`Processing item ${index + 1}/${testData.length}: ${data.id}`);

            const result = await pipeline.execute(data, context, {
                stopOnError: false,
                timeoutMs: 5000,
                logger,
            });

            if (result.success) {
                console.log(`✅ ${data.id} processed successfully`);
            } else {
                console.log(`❌ ${data.id} failed: ${result.errors[0]?.message}`);
            }

            // Add delay between processing to see metrics change
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`💥 Unexpected error processing ${data.id}:`, error);
        }
    }

    // Let the dashboard run for a bit to show final metrics
    console.log('\n⏳ Showing final metrics for 10 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Stop monitoring
    dashboard.stop();

    // Show final summary
    console.log('📋 FINAL MONITORING SUMMARY');
    console.log('='.repeat(50));

    const finalHealth = await healthMonitor.getHealth();
    console.log(`Health Status: ${finalHealth.status}`);

    const finalSummary = globalMetrics.getSummary();
    console.log('\nKey Metrics:');
    console.log(`- Pipeline Executions: ${finalSummary.counters['pipeline_executions_completed'] || 0}`);
    console.log(`- Success Rate: ${((finalSummary.counters['pipeline_success'] || 0) / (finalSummary.counters['pipeline_executions_completed'] || 1) * 100).toFixed(1)}%`);
    console.log(`- Total Warnings: ${finalSummary.counters['warnings_total'] || 0}`);
    console.log(`- Total Errors: ${finalSummary.counters['errors_total'] || 0}`);

    if (finalSummary.histograms['pipeline_execution_time']) {
        const execTime = finalSummary.histograms['pipeline_execution_time'];
        console.log(`- Avg Execution Time: ${execTime.avg.toFixed(2)}ms`);
        console.log(`- P95 Execution Time: ${execTime.p95.toFixed(2)}ms`);
    }

    console.log('\n🏁 Pipeline Monitoring Example Complete\n');
}

// Export monitoring utilities for reuse
export {
    MetricsCollector,
    MonitoringLogger,
    HealthMonitor,
    MonitoringDashboard,
    globalMetrics,
    healthMonitor,
};

// Run the example if this file is executed directly
if (require.main === module) {
    runMonitoringExample().catch(console.error);
}
