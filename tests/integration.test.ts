/**
 * Integration tests for the harmony-pipeline library.
 * These tests verify end-to-end functionality and real-world usage scenarios.
 */

import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    isStageFailure,
    isStageSuccess,
} from '../src';
import { delay, MockLogger } from './setup';

describe('Integration Tests', () => {
    describe('Data Processing Pipeline', () => {
        interface RawData {
            id: string;
            email: string;
            name: string;
            age: string; // Raw string input
            tags: string; // Comma-separated
        }

        interface ValidatedData {
            id: string;
            email: string;
            name: string;
            age: number;
            tags: string[];
            isValid: boolean;
            errors: string[];
        }

        interface EnrichedData extends ValidatedData {
            emailDomain: string;
            ageCategory: 'child' | 'teen' | 'adult' | 'senior';
            tagCount: number;
            processedAt: Date;
        }

        interface ProcessedData extends EnrichedData {
            summary: string;
            riskScore: number;
            recommendations: string[];
        }

        it('should process data through multiple stages successfully', async () => {
            // Define stages
            const inputStage = createStage('input');
            const validationStage = createStage('validation', {dependencies: ['input']});
            const enrichmentStage = createStage('enrichment', {dependencies: ['validation']});
            const processingStage = createStage('processing', {dependencies: ['enrichment']});

            // Input processor
            const inputProcessor = createSimpleProcessor(
                'data-input',
                inputStage,
                (data: RawData, context) => {
                    context.logger.info('Processing raw data', {id: data.id});
                    return data;
                }
            );

            // Validation processor
            const validationProcessor = createSimpleProcessor(
                'data-validation',
                validationStage,
                (data: RawData, context): ValidatedData => {
                    const errors: string[] = [];

                    if (!data.email.includes('@')) {
                        errors.push('Invalid email format');
                    }

                    if (!data.name.trim()) {
                        errors.push('Name is required');
                    }

                    const age = parseInt(data.age, 10);
                    if (isNaN(age) || age < 0 || age > 150) {
                        errors.push('Invalid age');
                    }

                    if (errors.length > 0) {
                        context.addWarning('VALIDATION_ERRORS', 'Data validation issues found', {errors});
                    }

                    return {
                        id: data.id,
                        email: data.email.toLowerCase(),
                        name: data.name.trim(),
                        age: isNaN(age) ? 0 : age,
                        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                        isValid: errors.length === 0,
                        errors,
                    };
                }
            );

            // Enrichment processor
            const enrichmentProcessor = createSimpleProcessor(
                'data-enrichment',
                enrichmentStage,
                (data: ValidatedData, context): EnrichedData => {
                    const emailDomain = data.email.split('@')[1] || 'unknown';

                    let ageCategory: EnrichedData['ageCategory'];
                    if (data.age < 13) ageCategory = 'child';
                    else if (data.age < 20) ageCategory = 'teen';
                    else if (data.age < 65) ageCategory = 'adult';
                    else ageCategory = 'senior';

                    if (emailDomain === 'tempmail.com') {
                        context.addWarning('SUSPICIOUS_EMAIL', 'Temporary email domain detected', {domain: emailDomain});
                    }

                    return {
                        ...data,
                        emailDomain,
                        ageCategory,
                        tagCount: data.tags.length,
                        processedAt: new Date(),
                    };
                }
            );

            // Processing processor
            const processingProcessor = createSimpleProcessor(
                'data-processing',
                processingStage,
                (data: EnrichedData, context): ProcessedData => {
                    const summary = `${data.name} (${data.age}y, ${data.ageCategory}) - ${data.email}`;

                    let riskScore = 0;
                    const recommendations: string[] = [];

                    if (!data.isValid) {
                        riskScore += 50;
                        recommendations.push('Review and fix validation errors');
                    }

                    if (data.emailDomain === 'tempmail.com') {
                        riskScore += 30;
                        recommendations.push('Verify email address');
                    }

                    if (data.tagCount === 0) {
                        riskScore += 10;
                        recommendations.push('Add relevant tags');
                    }

                    if (riskScore > 50) {
                        context.addWarning('HIGH_RISK_SCORE', 'High risk score detected', {riskScore});
                    }

                    context.logger.info('Data processing completed', {
                        id: data.id,
                        riskScore,
                        recommendations: recommendations.length
                    });

                    return {
                        ...data,
                        summary,
                        riskScore,
                        recommendations,
                    };
                }
            );

            // Build pipeline
            const pipeline = createPipelineBuilder<RawData, ProcessedData>()
                .withProcessor(inputProcessor)
                .withProcessor(validationProcessor)
                .withProcessor(enrichmentProcessor)
                .withProcessor(processingProcessor)
                .build();

            // Test data
            const rawData: RawData = {
                id: 'user-123',
                email: 'John.Doe@Example.COM',
                name: '  John Doe  ',
                age: '30',
                tags: 'developer, typescript, node.js',
            };

            const mockLogger = new MockLogger();
            const context = createPipelineContext(
                {sessionId: 'test-session', environment: 'test'},
                mockLogger
            );

            // Execute pipeline
            const result = await pipeline.execute(rawData, context);

            // Verify results
            expect(result).toBeSuccessfulPipelineResult();
            expect(result.output).toBeDefined();
            expect(result.output!.id).toBe('user-123');
            expect(result.output!.email).toBe('john.doe@example.com');
            expect(result.output!.name).toBe('John Doe');
            expect(result.output!.age).toBe(30);
            expect(result.output!.tags).toEqual(['developer', 'typescript', 'node.js']);
            expect(result.output!.ageCategory).toBe('adult');
            expect(result.output!.emailDomain).toBe('example.com');
            expect(result.output!.isValid).toBe(true);
            expect(result.output!.riskScore).toBeLessThan(20);
            expect(result.output!.summary).toContain('John Doe');

            // Verify execution metadata
            expect(result.stages).toHaveLength(4);
            expect(result.stages.every(stage => isStageSuccess(stage))).toBe(true);
            expect(result.executionTime).toBeGreaterThanOrEqual(0);

            // Verify logging
            expect(mockLogger.infoMessages).toHaveLength(2);
            expect(mockLogger?.infoMessages[0]?.message).toContain('Processing raw data');
            expect(mockLogger.infoMessages[1]?.message).toContain('Data processing completed');
        });

        it('should handle validation errors gracefully', async () => {
            // Simplified pipeline for error testing
            const stage = createStage('validation');
            const processor = createSimpleProcessor(
                'strict-validator',
                stage,
                (data: RawData, context): ValidatedData => {
                    const errors: string[] = [];

                    if (!data.email.includes('@')) errors.push('Invalid email');
                    if (!data.name.trim()) errors.push('Name required');
                    if (parseInt(data.age) < 0) errors.push('Invalid age');

                    if (errors.length > 0) {
                        context.addWarning('VALIDATION_FAILED', 'Validation failed', {errors});
                    }

                    return {
                        id: data.id,
                        email: data.email,
                        name: data.name,
                        age: parseInt(data.age) || 0,
                        tags: [],
                        isValid: errors.length === 0,
                        errors,
                    };
                }
            );

            const pipeline = createPipelineBuilder<RawData, ValidatedData>()
                .withProcessor(processor)
                .build();

            const invalidData: RawData = {
                id: 'invalid-user',
                email: 'not-an-email',
                name: '',
                age: '-5',
                tags: '',
            };

            // @ts-ignore
            const context = createPipelineContext({});
            const result = await pipeline.execute(invalidData, context);

            expect(result).toBeSuccessfulPipelineResult(); // Pipeline succeeds but data is invalid
            expect(result).toHaveWarning('VALIDATION_FAILED');
            expect(result.output!.isValid).toBe(false);
            expect(result.output!.errors).toHaveLength(3);
        });
    });

    describe('File Processing Pipeline', () => {
        interface FileData {
            filename: string;
            content: string;
            size: number;
        }

        interface ProcessedFile {
            filename: string;
            content: string;
            size: number;
            wordCount: number;
            lineCount: number;
            hash: string;
            processedAt: Date;
        }

        it('should process files through multiple stages', async () => {
            const inputStage = createStage('input');
            const validationStage = createStage('validation', {dependencies: ['input']});
            const processingStage = createStage('processing', {dependencies: ['validation']});

            const inputProcessor = createSimpleProcessor(
                'file-input',
                inputStage,
                async (file: FileData, context) => {
                    context.logger.info('Processing file', {filename: file.filename, size: file.size});
                    await delay(10); // Simulate I/O
                    return file;
                }
            );

            const validationProcessor = createSimpleProcessor(
                'file-validation',
                validationStage,
                (file: FileData, context) => {
                    if (file.size > 1000000) {
                        context.addWarning('LARGE_FILE', 'File is large', {size: file.size});
                    }

                    if (!file.filename.endsWith('.txt')) {
                        context.addWarning('UNSUPPORTED_FORMAT', 'Unsupported file format');
                    }

                    return file;
                }
            );

            const processingProcessor = createSimpleProcessor(
                'file-processing',
                processingStage,
                async (file: FileData, context): Promise<ProcessedFile> => {
                    context.logger.info('Processing file content');

                    await delay(20); // Simulate processing time

                    const words = file.content.split(/\s+/).filter(Boolean);
                    const lines = file.content.split('\n');

                    // Simple hash (not cryptographic)
                    const hash = file.content
                        .split('')
                        .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
                        .toString(16);

                    return {
                        ...file,
                        wordCount: words.length,
                        lineCount: lines.length,
                        hash,
                        processedAt: new Date(),
                    };
                }
            );

            const pipeline = createPipelineBuilder<FileData, ProcessedFile>()
                .withProcessor(inputProcessor)
                .withProcessor(validationProcessor)
                .withProcessor(processingProcessor)
                .build();

            const fileData: FileData = {
                filename: 'test.txt',
                content: 'Hello world\nThis is a test file\nWith multiple lines',
                size: 100,
            };

            const mockLogger = new MockLogger();
            const context = createPipelineContext({userId: 'test-user'}, mockLogger);

            const result = await pipeline.execute(fileData, context, {logger: mockLogger});

            expect(result).toBeSuccessfulPipelineResult();
            expect(result.output!.wordCount).toBe(10);
            expect(result.output!.lineCount).toBe(3);
            expect(result.output!.hash).toBeDefined();
            expect(result.output!.processedAt).toBeInstanceOf(Date);

            // Verify logging occurred
            expect(mockLogger.infoMessages).toHaveLength(2);
        });
    });

    describe('Error Recovery Pipeline', () => {
        it('should continue processing with error recovery', async () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage1']}); // Parallel to stage2

            let stage2Attempts = 0;

            const proc1 = createSimpleProcessor(
                'reliable-proc',
                stage1,
                (x: string) => x + '-stage1'
            );

            const proc2 = createSimpleProcessor(
                'unreliable-proc',
                stage2,
                (x: string) => {
                    stage2Attempts++;
                    if (stage2Attempts <= 2) {
                        throw new Error(`Attempt ${stage2Attempts} failed`);
                    }
                    return x + '-stage2';
                },
                {
                    onError: async (error, context) => {
                        context.addWarning('RETRY_NEEDED', 'Processor will be retried', {error: error.message});
                    }
                }
            );

            const proc3 = createSimpleProcessor(
                'backup-proc',
                stage3,
                (x: string) => x + '-stage3'
            );

            const pipeline = createPipelineBuilder<string, string>()
                .withProcessor(proc1, proc2, proc3)
                .build();

            const mockLogger = new MockLogger();
            const context = createPipelineContext({}, mockLogger);

            // First execution should fail at stage2
            let result = await pipeline.execute('test', context, {stopOnError: false});
            expect(result).toBeFailedPipelineResult();
            expect(result.stages.filter(s => isStageSuccess(s))).toHaveLength(2); // stage1 and stage3
            expect(result.stages.filter(s => isStageFailure(s))).toHaveLength(1); // stage2

            // Reset for retry
            stage2Attempts = 1;

            // Second execution should still fail
            result = await pipeline.execute('test', context, {stopOnError: false});
            expect(result).toBeFailedPipelineResult();

            // Third execution should succeed
            result = await pipeline.execute('test', context, {stopOnError: false});
            expect(result).toBeSuccessfulPipelineResult();
        });
    });

    describe('Concurrent Processing Pipeline', () => {
        it('should handle concurrent processing efficiently', async () => {
            const stage = createStage('concurrent-stage');

            const processors = Array.from({length: 5}, (_, i) =>
                createSimpleProcessor(
                    `proc-${i}`,
                    stage,
                    async (x: number) => {
                        const delay = Math.random() * 50 + 10; // 10-60ms
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return x + i;
                    }
                )
            );

            const pipeline = createPipelineBuilder<number, number>()
                .withProcessor(...processors)
                .build();

            const context = createPipelineContext({});

            // Sequential execution
            const sequentialStart = Date.now();
            await pipeline.execute(0, context, {concurrency: 1});
            const sequentialTime = Date.now() - sequentialStart;

            // Concurrent execution
            const concurrentStart = Date.now();
            const result = await pipeline.execute(0, context, {concurrency: 5});
            const concurrentTime = Date.now() - concurrentStart;

            expect(result).toBeSuccessfulPipelineResult();
            expect(concurrentTime).toBeLessThan(sequentialTime * 0.8); // Should be significantly faster
        });
    });

    describe('Real-time Event Processing', () => {
        interface Event {
            id: string;
            type: 'user_action' | 'system_event' | 'error';
            timestamp: number;
            payload: Record<string, any>;
        }

        interface ProcessedEvent extends Event {
            processed: true;
            risk_level: 'low' | 'medium' | 'high';
            tags: string[];
            metadata: {
                processing_time: number;
                stage_count: number;
            };
        }

        it('should process events in real-time with proper monitoring', async () => {
            const filterStage = createStage('filter');
            const enrichStage = createStage('enrich', {dependencies: ['filter']});
            const scoreStage = createStage('score', {dependencies: ['enrich']});

            const events: Array<{ type: string; stage: string; timestamp: number }> = [];

            const filterProcessor = createSimpleProcessor(
                'event-filter',
                filterStage,
                (event: Event, context) => {
                    if (event.type === 'error') {
                        context.addWarning('ERROR_EVENT', 'Error event detected', {eventId: event.id});
                    }
                    return event;
                }
            );

            const enrichProcessor = createSimpleProcessor(
                'event-enricher',
                enrichStage,
                (event: Event): Event => ({
                    ...event,
                    payload: {
                        ...event.payload,
                        enriched_at: Date.now(),
                        source: 'pipeline',
                    }
                })
            );

            const scoreProcessor = createSimpleProcessor(
                'event-scorer',
                scoreStage,
                (event: Event): ProcessedEvent => {
                    const processingTime = Date.now() - event.timestamp;

                    let risk_level: ProcessedEvent['risk_level'] = 'low';
                    if (event.type === 'error') risk_level = 'high';
                    else if (processingTime > 100) risk_level = 'medium';

                    const tags: string[] = [event.type];
                    if (risk_level !== 'low') tags.push('flagged');

                    return {
                        ...event,
                        processed: true,
                        risk_level,
                        tags,
                        metadata: {
                            processing_time: processingTime,
                            stage_count: 3,
                        }
                    };
                }
            );

            const pipeline = createPipelineBuilder<Event, ProcessedEvent>()
                .withProcessor(filterProcessor)
                .withProcessor(enrichProcessor)
                .withProcessor(scoreProcessor)
                .build();

            // Monitor events
            pipeline.on('stageStart', ({stage}) => {
                events.push({type: 'stage_start', stage, timestamp: Date.now()});
            });

            pipeline.on('stageEnd', ({stage}) => {
                events.push({type: 'stage_end', stage, timestamp: Date.now()});
            });

            const testEvent: Event = {
                id: 'event-123',
                type: 'user_action',
                timestamp: Date.now(),
                payload: {action: 'click', element: 'button'}
            };

            const context = createPipelineContext({traceId: 'trace-123'});
            const result = await pipeline.execute(testEvent, context);

            expect(result).toBeSuccessfulPipelineResult();
            expect(result.output!.processed).toBe(true);
            expect(result.output!.risk_level).toBe('low');
            expect(result.output!.tags).toContain('user_action');
            expect(result.output!.metadata.processing_time).toBeGreaterThanOrEqual(0);

            // Verify event monitoring
            expect(events).toHaveLength(6); // 3 start + 3 end events
            expect(events.filter(e => e.type === 'stage_start')).toHaveLength(3);
            expect(events.filter(e => e.type === 'stage_end')).toHaveLength(3);
        });
    });

    describe('Pipeline Composition and Reusability', () => {
        it('should support composing pipelines from reusable components', () => {
            // Common stages
            const createInputStage = () => createStage('input');
            const createValidationStage = () => createStage('validation', {dependencies: ['input']});
            const createOutputStage = (deps: string[] = ['validation']) =>
                createStage('output', {dependencies: deps});

            // Common processors
            const createInputProcessor = <T>(name: string, stage: ReturnType<typeof createStage>) =>
                createSimpleProcessor(name, stage, (data: T, context) => {
                    context.logger.info(`Input processed by ${name}`);
                    return data;
                });

            const createValidationProcessor = <T>(
                name: string,
                stage: ReturnType<typeof createStage>,
                validator: (data: T) => boolean
            ) =>
                createSimpleProcessor(name, stage, (data: T, context) => {
                    if (!validator(data)) {
                        context.addWarning('VALIDATION_FAILED', 'Validation failed');
                    }
                    return data;
                });

            // String processing pipeline
            const stringPipeline = createPipelineBuilder<string, string>()
                .withProcessor(createInputProcessor('string-input', createInputStage()))
                .withProcessor(createValidationProcessor(
                    'string-validator',
                    createValidationStage(),
                    (s: string) => s.length > 0
                ))
                .withProcessor(createSimpleProcessor(
                    'string-output',
                    createOutputStage(),
                    (s: string) => s.toUpperCase()
                ))
                .build();

            // Number processing pipeline
            const numberPipeline = createPipelineBuilder<number, number>()
                .withProcessor(createInputProcessor('number-input', createInputStage()))
                .withProcessor(createValidationProcessor(
                    'number-validator',
                    createValidationStage(),
                    (n: number) => !isNaN(n) && n >= 0
                ))
                .withProcessor(createSimpleProcessor(
                    'number-output',
                    createOutputStage(),
                    (n: number) => n * 2
                ))
                .build();

            expect(stringPipeline.getRegisteredProcessorNames()).toHaveLength(3);
            expect(numberPipeline.getRegisteredProcessorNames()).toHaveLength(3);
            expect(stringPipeline.getStageExecutionOrder()).toEqual(['input', 'validation', 'output']);
            expect(numberPipeline.getStageExecutionOrder()).toEqual(['input', 'validation', 'output']);
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle high-throughput processing', async () => {
            const stage = createStage('high-throughput');

            const processor = createSimpleProcessor(
                'throughput-processor',
                stage,
                async (batch: number[]) => {
                    // Simulate batch processing
                    await delay(1);
                    return batch.map(n => n * 2);
                }
            );

            const pipeline = createPipelineBuilder<number[], number[]>()
                .withProcessor(processor)
                .build();

            const batchSize = 1000;
            const numBatches = 10;
            const results: number[][] = [];

            const startTime = Date.now();

            // Process multiple batches
            for (let i = 0; i < numBatches; i++) {
                const batch = Array.from({length: batchSize}, (_, j) => i * batchSize + j);
                const context = createPipelineContext({batchId: i});
                const result = await pipeline.execute(batch, context);

                expect(result).toBeSuccessfulPipelineResult();
                results.push(result.output!);
            }

            const totalTime = Date.now() - startTime;
            const throughput = (numBatches * batchSize) / (totalTime / 1000); // items per second

            expect(results).toHaveLength(numBatches);
            expect(results.flat()).toHaveLength(numBatches * batchSize);
            expect(throughput).toBeGreaterThan(1000); // Should process at least 1000 items/sec
        });
    });
});
