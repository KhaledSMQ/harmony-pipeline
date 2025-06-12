import { createSimpleProcessor, type PipelineProcessor } from '../Processor';
import { createStage } from '../Stage';
import { createPipelineContext } from '../Context';
import { createTimeoutController, delay, MockLogger, } from '../../../tests/setup';

describe('Processor', () => {
    let testStage: ReturnType<typeof createStage>;
    let mockLogger: MockLogger;

    beforeEach(() => {
        testStage = createStage('test-stage');
        mockLogger = new MockLogger();
    });

    describe('createSimpleProcessor', () => {
        it('should create a processor with basic configuration', () => {
            const processFunction = jest.fn((input: string) => input.toUpperCase());
            const processor = createSimpleProcessor(
                'test-processor',
                testStage,
                processFunction,
            );

            expect(processor.name).toBe('test-processor');
            expect(processor.version).toBe('1.0.0'); // Default version
            expect(processor.stage).toBe(testStage);
            expect(processor.process).toBe(processFunction);
        });

        it('should create a processor with custom version', () => {
            const processor = createSimpleProcessor(
                'versioned-processor',
                testStage,
                (input: string) => input,
                {version: '2.1.3'},
            );

            expect(processor.version).toBe('2.1.3');
        });

        it('should create a processor with lifecycle hooks', () => {
            const setupFn = jest.fn();
            const teardownFn = jest.fn();
            const onErrorFn = jest.fn();

            const processor = createSimpleProcessor(
                'full-processor',
                testStage,
                (input: string) => input,
                {
                    setup: setupFn,
                    teardown: teardownFn,
                    onError: onErrorFn,
                },
            );

            expect(processor.setup).toBe(setupFn);
            expect(processor.teardown).toBe(teardownFn);
            expect(processor.onError).toBe(onErrorFn);
        });

        it('should freeze the processor object', () => {
            const processor = createSimpleProcessor(
                'immutable-processor',
                testStage,
                (input: string) => input,
            );

            expect(() => {
                (processor as any).name = 'modified-name';
            }).toThrow();

            expect(() => {
                (processor as any).newProperty = 'value';
            }).toThrow();
        });
    });

    describe('processor execution', () => {
        it('should execute synchronous process function', async () => {
            const processor = createSimpleProcessor(
                'sync-processor',
                testStage,
                (input: string) => input.toUpperCase(),
            );

            const context = createPipelineContext({}, mockLogger);
            const result = await processor.process('hello world', context);

            expect(result).toBe('HELLO WORLD');
        });

        it('should execute asynchronous process function', async () => {
            const processor = createSimpleProcessor(
                'async-processor',
                testStage,
                async (input: string) => {
                    await delay(10);
                    return input.toLowerCase();
                },
            );

            const context = createPipelineContext({}, mockLogger);
            const result = await processor.process('HELLO WORLD', context);

            expect(result).toBe('hello world');
        });

        it('should pass context to process function', async () => {
            let receivedContext: any;
            const processor = createSimpleProcessor(
                'context-processor',
                testStage,
                (input: string, context) => {
                    receivedContext = context;
                    return input;
                },
            );

            const context = createPipelineContext({userId: '123'}, mockLogger);
            await processor.process('test', context);

            expect(receivedContext).toBe(context);
            expect(receivedContext.metadata.userId).toBe('123');
        });

        it('should pass abort signal to process function', async () => {
            let receivedSignal: AbortSignal | undefined;
            const processor = createSimpleProcessor(
                'signal-processor',
                testStage,
                (input: string, context, signal) => {
                    receivedSignal = signal;
                    return input;
                },
            );

            const context = createPipelineContext({}, mockLogger);
            const controller = new AbortController();
            await processor.process('test', context, controller.signal);

            expect(receivedSignal).toBe(controller.signal);
        });

        it('should handle process function throwing synchronous errors', async () => {
            const mockError = new Error('Synchronous error');
            const processor = createSimpleProcessor(
                'error-processor',
                testStage,
                () => {
                    throw mockError;
                },
            );

            const context = createPipelineContext({}, mockLogger);
            try {
                await processor.process('test', context);
                expect(true).toBe(true);
            } catch (e) {
                expect(e).toBe(mockError);
            }
        });

        it('should handle process function throwing asynchronous errors', async () => {
            const processor = createSimpleProcessor(
                'async-error-processor',
                testStage,
                async () => {
                    await delay(10);
                    throw new Error('Asynchronous error');
                },
            );

            const context = createPipelineContext({}, mockLogger);

            await expect(processor.process('test', context)).rejects.toThrow(
                'Asynchronous error',
            );
        });

        it('should respect abort signal in process function', async () => {
            const processor = createSimpleProcessor(
                'abortable-processor',
                testStage,
                async (input: string, context, signal) => {
                    for (let i = 0; i < 100; i++) {
                        if (signal?.aborted) {
                            throw signal.reason || new Error('Aborted');
                        }
                        await delay(10);
                    }
                    return input;
                },
            );

            const context = createPipelineContext({}, mockLogger);
            const controller = createTimeoutController(50);

            await expect(
                processor.process('test', context, controller.signal),
            ).rejects.toThrow();
        });
    });

    describe('lifecycle hooks', () => {
        it('should call setup hook before processing', async () => {
            const setupSpy = jest.fn();
            const processor = createSimpleProcessor(
                'setup-processor',
                testStage,
                (input: string) => input,
                {setup: setupSpy},
            );

            const context = createPipelineContext({}, mockLogger);

            if (processor.setup) {
                await processor.setup(context);
            }

            expect(setupSpy).toHaveBeenCalledTimes(1);
            expect(setupSpy).toHaveBeenCalledWith(context);
        });

        it('should call teardown hook after processing', async () => {
            const teardownSpy = jest.fn();
            const processor = createSimpleProcessor(
                'teardown-processor',
                testStage,
                (input: string) => input,
                {teardown: teardownSpy},
            );

            const context = createPipelineContext({}, mockLogger);

            if (processor.teardown) {
                await processor.teardown(context);
            }

            expect(teardownSpy).toHaveBeenCalledTimes(1);
            expect(teardownSpy).toHaveBeenCalledWith(context);
        });

        it('should call onError hook when processing fails', async () => {
            const onErrorSpy = jest.fn();
            const testError = new Error('Test error');

            const processor = createSimpleProcessor(
                'error-handling-processor',
                testStage,
                () => {
                    throw testError;
                },
                {onError: onErrorSpy},
            );

            const context = createPipelineContext({}, mockLogger);

            try {
                await processor.process('test', context);
            } catch {
                // Expected to throw
            }

            if (processor.onError) {
                await processor.onError(testError, context);
            }

            expect(onErrorSpy).toHaveBeenCalledTimes(1);
            expect(onErrorSpy).toHaveBeenCalledWith(testError, context);
        });

        it('should handle async lifecycle hooks', async () => {
            const setupSpy = jest.fn(async () => {
                await delay(10);
            });

            const teardownSpy = jest.fn(async () => {
                await delay(10);
            });

            const processor = createSimpleProcessor(
                'async-hooks-processor',
                testStage,
                (input: string) => input,
                {setup: setupSpy, teardown: teardownSpy},
            );

            const context = createPipelineContext({}, mockLogger);

            if (processor.setup) {
                await processor.setup(context);
            }

            if (processor.teardown) {
                await processor.teardown(context);
            }

            expect(setupSpy).toHaveBeenCalledTimes(1);
            expect(teardownSpy).toHaveBeenCalledTimes(1);
        });

        it('should handle errors in lifecycle hooks', async () => {
            const setupError = new Error('Setup failed');
            const teardownError = new Error('Teardown failed');
            const onErrorError = new Error('OnError failed');

            const processor = createSimpleProcessor(
                'failing-hooks-processor',
                testStage,
                (input: string) => input,
                {
                    setup: async () => {
                        throw setupError;
                    },
                    teardown: async () => {
                        throw teardownError;
                    },
                    onError: async () => {
                        throw onErrorError;
                    },
                },
            );

            const context = createPipelineContext({}, mockLogger);

            if (processor.setup) {
                await expect(processor.setup(context)).rejects.toThrow('Setup failed');
            }

            if (processor.teardown) {
                await expect(processor.teardown(context)).rejects.toThrow(
                    'Teardown failed',
                );
            }

            if (processor.onError) {
                await expect(
                    processor.onError(new Error('Test'), context),
                ).rejects.toThrow('OnError failed');
            }
        });
    });

    describe('type safety', () => {
        it('should maintain type safety for input and output', () => {
            interface InputType {
                id: string;
                value: number;
            }

            interface OutputType {
                id: string;
                processedValue: number;
                timestamp: number;
            }

            const processor: PipelineProcessor<InputType, OutputType> =
                createSimpleProcessor(
                    'typed-processor',
                    testStage,
                    (input: InputType): OutputType => ({
                        id: input.id,
                        processedValue: input.value * 2,
                        timestamp: Date.now(),
                    }),
                );

            expect(processor.name).toBe('typed-processor');
            expect(typeof processor.process).toBe('function');
        });

        it('should maintain type safety for context metadata', () => {
            interface CustomMetadata {
                sessionId: string;
                userId: number;
            }

            const processor = createSimpleProcessor(
                'context-typed-processor',
                testStage,
                (input: string, context) => {
                    // TypeScript should provide proper typing here
                    const sessionId: string | unknown = context.metadata.sessionId;
                    const userId: number | unknown = context.metadata.userId;
                    return `${input}-${sessionId}-${userId}`;
                },
            );

            expect(typeof processor.process).toBe('function');
        });
    });

    describe('complex processing scenarios', () => {
        it('should handle complex data transformations', async () => {
            interface User {
                id: string;
                firstName: string;
                lastName: string;
                email: string;
            }

            interface ProcessedUser {
                id: string;
                fullName: string;
                emailDomain: string | undefined;
                processedAt: number;
            }

            const processor = createSimpleProcessor(
                'user-processor',
                testStage,
                (user: User): ProcessedUser => ({
                    id: user.id,
                    fullName: `${user.firstName} ${user.lastName}`,
                    emailDomain: user.email.split('@')[1],
                    processedAt: Date.now(),
                }),
            );

            const context = createPipelineContext({}, mockLogger);
            const input: User = {
                id: 'user-123',
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
            };

            const result = await processor.process(input, context);

            expect(result.id).toBe('user-123');
            expect(result.fullName).toBe('John Doe');
            expect(result.emailDomain).toBe('example.com');
            expect(result.processedAt).toBeGreaterThan(0);
        });

        it('should handle batch processing', async () => {
            const processor = createSimpleProcessor(
                'batch-processor',
                testStage,
                async (items: string[]): Promise<string[]> => {
                    const results: string[] = [];
                    for (const item of items) {
                        await delay(1); // Simulate async processing
                        results.push(item.toUpperCase());
                    }
                    return results;
                },
            );

            const context = createPipelineContext({}, mockLogger);
            const input = ['hello', 'world', 'test'];

            const result = await processor.process(input, context);

            expect(result).toEqual(['HELLO', 'WORLD', 'TEST']);
        });

        it('should handle stateful processing with context warnings', async () => {
            const processor = createSimpleProcessor(
                'stateful-processor',
                testStage,
                (input: number[], context) => {
                    const sum = input.reduce((acc, val) => acc + val, 0);
                    const average = sum / input.length;

                    if (average > 100) {
                        context.addWarning(
                            'HIGH_AVERAGE',
                            'Average value is unusually high',
                            {average},
                        );
                    }

                    if (input.length > 1000) {
                        context.addWarning('LARGE_DATASET', 'Processing large dataset', {
                            size: input.length,
                        });
                    }

                    return {
                        sum,
                        average,
                        count: input.length,
                        max: Math.max(...input),
                        min: Math.min(...input),
                    };
                },
            );

            const context = createPipelineContext({}, mockLogger);
            const input = [150, 200, 250, 300]; // Average = 225

            const result = await processor.process(input, context);

            expect(result.average).toBe(225);
            expect(result.sum).toBe(900);
            expect(result.count).toBe(4);

            const warnings = context._getWarnings();
            expect(warnings).toHaveLength(1);
            expect(warnings[0]?.code).toBe('HIGH_AVERAGE');
        });
    });
});
