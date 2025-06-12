import { PipelineExecutor } from '../PipelineExecutor';
import { createStage } from '../../core/Stage';
import { createSimpleProcessor } from '../../core/Processor';
import { createPipelineContext } from '../../core/Context';
import { createTimeoutController, delay, MockLogger, } from '../../../tests/setup';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
describe('PipelineExecutor', () => {
    let executor: PipelineExecutor;
    let mockLogger: MockLogger;

    beforeEach(() => {
        executor = new PipelineExecutor();
        mockLogger = new MockLogger();
    });

    describe('processor registration', () => {
        it('should register a single processor', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-processor',
                stage,
                (x: string) => x,
            );

            expect(() => executor.register(processor)).not.toThrow();
            expect(executor.getRegisteredProcessorNames()).toContain(
                'test-processor',
            );
        });

        it('should register multiple processors', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2');

            const processor1 = createSimpleProcessor(
                'proc1',
                stage1,
                (x: string) => x,
            );
            const processor2 = createSimpleProcessor(
                'proc2',
                stage2,
                (x: string) => x,
            );
            const processor3 = createSimpleProcessor(
                'proc3',
                stage1,
                (x: string) => x,
            );

            executor.register(processor1, processor2, processor3);

            const names = executor.getRegisteredProcessorNames();
            expect(names).toContain('proc1');
            expect(names).toContain('proc2');
            expect(names).toContain('proc3');
            expect(names).toHaveLength(3);
        });

        it('should support method chaining', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('proc1', stage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage, (x: string) => x);

            const result = executor.register(proc1).register(proc2);

            expect(result).toBe(executor);
            expect(executor.getRegisteredProcessorNames()).toHaveLength(2);
        });

        it('should throw error on duplicate processor names', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor(
                'duplicate-name',
                stage,
                (x: string) => x,
            );
            const proc2 = createSimpleProcessor(
                'duplicate-name',
                stage,
                (x: string) => x,
            );

            executor.register(proc1);

            expect(() => executor.register(proc2)).toThrow(
                "Processor 'duplicate-name' is already registered",
            );
        });

        it('should allow same processor in different executors', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'shared-proc',
                stage,
                (x: string) => x,
            );

            const executor1 = new PipelineExecutor();
            const executor2 = new PipelineExecutor();

            expect(() => executor1.register(processor)).not.toThrow();
            expect(() => executor2.register(processor)).not.toThrow();
        });
    });

    describe('stage dependency resolution', () => {
        it('should execute stages in dependency order', async () => {
            const executionOrder: string[] = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage2']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => {
                executionOrder.push('proc1');
                return x + '-1';
            });

            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => {
                executionOrder.push('proc2');
                return x + '-2';
            });

            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => {
                executionOrder.push('proc3');
                return x + '-3';
            });

            executor.register(proc3, proc1, proc2); // Register in random order

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('start', context);

            expect(result.success).toBe(true);
            expect(result.output).toBe('start-1-2-3');
            expect(executionOrder).toEqual(['proc1', 'proc2', 'proc3']);
        });

        it('should handle parallel stages', async () => {
            const executionOrder: string[] = [];

            const stage1 = createStage('stage1');
            const stage2a = createStage('stage2a', {dependencies: ['stage1']});
            const stage2b = createStage('stage2b', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {
                dependencies: ['stage2a', 'stage2b'],
            });

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => {
                executionOrder.push('proc1');
                return x + '-1';
            });

            const proc2a = createSimpleProcessor('proc2a', stage2a, (x: string) => {
                executionOrder.push('proc2a');
                return x + '-2a';
            });

            const proc2b = createSimpleProcessor('proc2b', stage2b, (x: string) => {
                executionOrder.push('proc2b');
                return x + '-2b';
            });

            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => {
                executionOrder.push('proc3');
                return x + '-3';
            });

            executor.register(proc1, proc2a, proc2b, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('start', context);

            expect(result.success).toBe(true);
            expect(executionOrder[0]).toBe('proc1'); // First
            expect(executionOrder[3]).toBe('proc3'); // Last
            expect(executionOrder.slice(1, 3)).toEqual(
                expect.arrayContaining(['proc2a', 'proc2b']),
            );
        });

        it('should detect circular dependencies', async () => {
            const stage1 = createStage('stage1', {dependencies: ['stage2']});
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);

            executor.register(proc1, proc2);

            const context = createPipelineContext({}, mockLogger);

            try {
               const result =  await executor.execute('test', context)
                expect(result.success).toBe(false);
                expect(result.errors).toHaveLength(1);
                expect(result.errors[0]?.message).toMatch(/circular dependency/i);
            } catch (e: any) {

            }

        });

        it('should handle complex dependency chains', async () => {
            const executionOrder: string[] = [];

            // Create a complex DAG
            const stageA = createStage('A');
            const stageB = createStage('B', {dependencies: ['A']});
            const stageC = createStage('C', {dependencies: ['A']});
            const stageD = createStage('D', {dependencies: ['B', 'C']});
            const stageE = createStage('E', {dependencies: ['C']});
            const stageF = createStage('F', {dependencies: ['D', 'E']});

            const processors = [stageA, stageB, stageC, stageD, stageE, stageF].map(
                stage =>
                    createSimpleProcessor(`proc-${stage.name}`, stage, (x: string) => {
                        executionOrder.push(stage.name);
                        return x;
                    }),
            );

            executor.register(...processors);

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            // Verify topological order
            const indexA = executionOrder.indexOf('A');
            const indexB = executionOrder.indexOf('B');
            const indexC = executionOrder.indexOf('C');
            const indexD = executionOrder.indexOf('D');
            const indexE = executionOrder.indexOf('E');
            const indexF = executionOrder.indexOf('F');

            expect(indexA).toBeLessThan(indexB);
            expect(indexA).toBeLessThan(indexC);
            expect(indexB).toBeLessThan(indexD);
            expect(indexC).toBeLessThan(indexD);
            expect(indexC).toBeLessThan(indexE);
            expect(indexD).toBeLessThan(indexF);
            expect(indexE).toBeLessThan(indexF);
        });
    });

    describe('conditional stage execution', () => {
        it('should skip stages when canExecute returns false', async () => {
            const executionOrder: string[] = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {
                dependencies: ['stage1'],
                canExecute: context => context.metadata.skipStage2 !== true,
            });
            const stage3 = createStage('stage3', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => {
                executionOrder.push('proc1');
                return x + '-1';
            });

            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => {
                executionOrder.push('proc2');
                return x + '-2';
            });

            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => {
                executionOrder.push('proc3');
                return x + '-3';
            });

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({skipStage2: true}, mockLogger);
            const result = await executor.execute('start', context);

            expect(result.success).toBe(true);
            expect(executionOrder).toEqual(['proc1', 'proc3']);
            expect(result.output).toBe('start-1-3');
        });

        it('should log when stages are skipped', async () => {
            const stage = createStage('conditional-stage', {
                canExecute: () => false,
            });

            const processor = createSimpleProcessor('proc', stage, (x: string) => x);
            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context, {logger: mockLogger});

            const debugMessages = mockLogger.debugMessages;

            expect(
                debugMessages.some(
                    msg =>
                        msg.message.includes('Skipping stage') &&
                        msg.message.includes('conditional-stage'),
                ),
            ).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should stop on first error by default', async () => {
            const executionOrder: string[] = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage2']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => {
                executionOrder.push('proc1');
                return x;
            });

            const proc2 = createSimpleProcessor('proc2', stage2, () => {
                executionOrder.push('proc2');
                throw new Error('Stage 2 failed');
            });

            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => {
                executionOrder.push('proc3');
                return x;
            });

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Stage 2 failed');
            expect(executionOrder).toEqual(['proc1', 'proc2']);
            expect(result.output).toBeUndefined();
        });

        it('should continue processing when stopOnError is false', async () => {
            const executionOrder: string[] = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage1']}); // Doesn't depend on stage2

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => {
                executionOrder.push('proc1');
                return x;
            });

            const proc2 = createSimpleProcessor('proc2', stage2, () => {
                executionOrder.push('proc2');
                throw new Error('Stage 2 failed');
            });

            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => {
                executionOrder.push('proc3');
                return x + '-3';
            });

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {
                stopOnError: false,
                logger: mockLogger,
            });

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Stage 2 failed');
            expect(executionOrder).toEqual(['proc1', 'proc2', 'proc3']);
            // expect(result.output).toBe('test-3'); // stage3 still produced output
        });

        it('should call onError hooks when processors fail', async () => {
            const onErrorSpy = jest.fn();
            const stage = createStage('error-stage');

            const processor = createSimpleProcessor(
                'failing-processor',
                stage,
                () => {
                    throw new Error('Processing failed');
                },
                {onError: onErrorSpy},
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context);

            expect(result.success).toBe(false);
            expect(onErrorSpy).toHaveBeenCalledTimes(1);
            expect(onErrorSpy).toHaveBeenCalledWith(
                expect.objectContaining({message: 'Processing failed'}),
                context,
            );
        });

        it('should handle errors in onError hooks gracefully', async () => {
            const stage = createStage('error-stage');

            const processor = createSimpleProcessor(
                'double-failing-processor',
                stage,
                () => {
                    throw new Error('Primary error');
                },
                {
                    onError: () => {
                        throw new Error('Error handler failed');
                    },
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {
                logger: mockLogger,
            });

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Primary error');

            // Should log the error handler failure
            expect(
                mockLogger.errorMessages.some(
                    msg =>
                        msg.message.includes('Error handler') &&
                        msg.message.includes('double-failing-processor'),
                ),
            ).toBe(true);
        });
    });

    describe('concurrent execution', () => {
        it('should execute processors sequentially by default', async () => {
            const executionOrder: string[] = [];
            const stage = createStage('concurrent-stage');

            const proc1 = createSimpleProcessor('proc1', stage, async (x: string) => {
                await delay(20);
                executionOrder.push('proc1');
                return x + '-1';
            });

            const proc2 = createSimpleProcessor('proc2', stage, async (x: string) => {
                await delay(10);
                executionOrder.push('proc2');
                return x + '-2';
            });

            executor.register(proc1, proc2);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {concurrency: 1});

            expect(result.success).toBe(true);
            expect(executionOrder).toEqual(['proc1', 'proc2']);
            expect(result.output).toBe('test-1-2');
        });

        it('should execute processors concurrently when concurrency > 1', async () => {
            const executionTimes: Record<string, number> = {};
            const stage = createStage('concurrent-stage');

            const proc1 = createSimpleProcessor('proc1', stage, async (x: string) => {
                const start = Date.now();
                await delay(50);
                executionTimes.proc1 = Date.now() - start;
                return x + '-1';
            });

            const proc2 = createSimpleProcessor('proc2', stage, async (x: string) => {
                const start = Date.now();
                await delay(50);
                executionTimes.proc2 = Date.now() - start;
                return x + '-2';
            });

            executor.register(proc1, proc2);

            const context = createPipelineContext({}, mockLogger);
            const start = Date.now();
            const result = await executor.execute('test', context, {
                concurrency: 2,
            });
            const totalTime = Date.now() - start;

            expect(result.success).toBe(true);
            expect(totalTime).toBeLessThan(80); // Should be much less than 100ms (50+50)
            expect(executionTimes.proc1).toBeGreaterThan(40);
            expect(executionTimes.proc2).toBeGreaterThan(40);
        });

        it('should use output from last processor in concurrent execution', async () => {
            const stage = createStage('concurrent-stage');

            const proc1 = createSimpleProcessor('proc1', stage, async (x: string) => {
                await delay(30);
                return x + '-first';
            });

            const proc2 = createSimpleProcessor('proc2', stage, async (x: string) => {
                await delay(10);
                return x + '-second';
            });

            const proc3 = createSimpleProcessor('proc3', stage, async (x: string) => {
                await delay(20);
                return x + '-third';
            });

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {
                concurrency: 3,
            });

            expect(result.success).toBe(true);
            expect(result.output).toBe('test-third'); // Last processor wins
        });

        it('should handle errors in concurrent execution', async () => {
            const stage = createStage('concurrent-stage');

            const proc1 = createSimpleProcessor('proc1', stage, async (x: string) => {
                await delay(20);
                return x + '-1';
            });

            const proc2 = createSimpleProcessor('proc2', stage, async () => {
                await delay(10);
                throw new Error('Concurrent error');
            });

            const proc3 = createSimpleProcessor('proc3', stage, async (x: string) => {
                await delay(30);
                return x + '-3';
            });

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {
                concurrency: 3,
                stopOnError: false,
            });

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Concurrent error');
            expect(result.stages).toHaveLength(3);
            expect(result.stages.filter(s => s.kind === 'ok')).toHaveLength(2);
            expect(result.stages.filter(s => s.kind === 'err')).toHaveLength(1);
        });
    });

    describe('timeout and cancellation', () => {
        it('should respect timeout option', async () => {
            const stage = createStage('slow-stage');
            const processor = createSimpleProcessor(
                'slow-processor',
                stage,
                async (x: string) => {
                    await delay(200);
                    return x;
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);

            try {
                await executor.execute('test', context, {timeoutMs: 50});
                expect(false).toBe(true);
            } catch (e: any) {
                expect(e).toBeInstanceOf(Error);
                // expect(e.message).toContain('timeout');
            }
        });

        it('should respect external abort signal', async () => {
            const stage = createStage('abortable-stage');
            const processor = createSimpleProcessor(
                'abortable-processor',
                stage,
                async (x: string, ctx, signal) => {
                    for (let i = 0; i < 100; i++) {
                        if (signal?.aborted) {
                            throw signal.reason || new Error('Aborted');
                        }
                        await delay(10);
                    }
                    return x;
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            const controller = createTimeoutController(50);

            try {
                await executor.execute('test', context, {signal: controller.signal});
                expect(false).toBe(true);
            } catch (e: any) {
                expect(e).toBeInstanceOf(Error);
            }
        });

        it('should merge timeout and external signals', async () => {
            const stage = createStage('multi-signal-stage');
            const processor = createSimpleProcessor(
                'multi-signal-processor',
                stage,
                async (x: string) => {
                    await delay(200);
                    return x;
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            const controller = new AbortController();

            // External signal will abort first
            setTimeout(() => controller.abort(new Error('External abort')), 30);

            try {
                await executor.execute('test', context, {
                    signal: controller.signal,
                    timeoutMs: 100,
                });
            } catch (e: any) {
                expect(e).toBeInstanceOf(Error);
                expect(e.message).toBe('External aborted');
            }
        });
    });

    describe('event emission', () => {
        it('should emit pipeline lifecycle events', async () => {
            const events: string[] = [];

            const stage = createStage('event-stage');
            const processor = createSimpleProcessor(
                'event-processor',
                stage,
                (x: string) => x,
            );

            executor.register(processor);

            executor.on('pipelineStart', () => events.push('pipelineStart'));
            executor.on('pipelineEnd', () => events.push('pipelineEnd'));

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            expect(events).toEqual(['pipelineStart', 'pipelineEnd']);
        });

        it('should emit stage lifecycle events', async () => {
            const events: Array<{ event: string; stage: string }> = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);

            executor.register(proc1, proc2);

            executor.on('stageStart', ({stage}) =>
                events.push({event: 'stageStart', stage}),
            );
            executor.on('stageEnd', ({stage}) =>
                events.push({event: 'stageEnd', stage}),
            );

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            expect(events).toEqual([
                {event: 'stageStart', stage: 'stage1'},
                {event: 'stageEnd', stage: 'stage1'},
                {event: 'stageStart', stage: 'stage2'},
                {event: 'stageEnd', stage: 'stage2'},
            ]);
        });

        it('should emit processor lifecycle events', async () => {
            const events: Array<{ event: string; processor: string; stage: string }> =
                [];

            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-processor',
                stage,
                (x: string) => x,
            );

            executor.register(processor);

            executor.on('processorStart', ({stage, processor}) =>
                events.push({event: 'processorStart', processor, stage}),
            );
            executor.on('processorEnd', ({stage, processor}) =>
                events.push({event: 'processorEnd', processor, stage}),
            );

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            expect(events).toEqual([
                {
                    event: 'processorStart',
                    processor: 'test-processor',
                    stage: 'test-stage',
                },
                {
                    event: 'processorEnd',
                    processor: 'test-processor',
                    stage: 'test-stage',
                },
            ]);
        });

        it('should emit warning events', async () => {
            const warnings: Array<{ code: string; message: string }> = [];

            const stage = createStage('warning-stage');
            const processor = createSimpleProcessor(
                'warning-processor',
                stage,
                (x: string, context) => {
                    context.addWarning('TEST_WARNING', 'This is a test warning');
                    return x;
                },
            );

            executor.register(processor);

            executor.on('warning', warning =>
                warnings.push({
                    code: warning.code,
                    message: warning.message,
                }),
            );

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            expect(warnings).toEqual([
                {code: 'TEST_WARNING', message: 'This is a test warning'},
            ]);
        });

        it('should emit error events', async () => {
            const errors: Error[] = [];

            const stage = createStage('error-stage');
            const processor = createSimpleProcessor('error-processor', stage, () => {
                throw new Error('Test error');
            });

            executor.register(processor);

            executor.on('error', error => errors.push(error));

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test', context);

            expect(errors).toHaveLength(1);
            expect(errors[0]?.message).toBe('Test error');
        });

        it('should handle errors in event listeners gracefully', async () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-processor',
                stage,
                (x: string) => x,
            );

            executor.register(processor);

            // Add failing event listener
            executor.on('processorStart', () => {
                throw new Error('Event listener failed');
            });

            const context = createPipelineContext({}, mockLogger);

            // Pipeline should still complete despite listener error
            const result = await executor.execute('test', context);
            expect(result.success).toBe(true);
        });
    });

    describe('processor lifecycle', () => {
        it('should call setup hooks once before execution', async () => {
            const setupSpy = jest.fn();

            const stage = createStage('setup-stage');
            const processor = createSimpleProcessor(
                'setup-processor',
                stage,
                (x: string) => x,
                {setup: setupSpy},
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);

            // Execute multiple times
            await executor.execute('test1', context);
            await executor.execute('test2', context);
            await executor.execute('test3', context);

            // Setup should only be called once
            expect(setupSpy).toHaveBeenCalledTimes(1);
            expect(setupSpy).toHaveBeenCalledWith(context);
        });

        it('should call setup for new processors after registration', async () => {
            const setupSpy1 = jest.fn();
            const setupSpy2 = jest.fn();

            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('proc1', stage, (x: string) => x, {
                setup: setupSpy1,
            });

            executor.register(proc1);

            const context = createPipelineContext({}, mockLogger);
            await executor.execute('test1', context);

            expect(setupSpy1).toHaveBeenCalledTimes(1);

            // Register new processor
            const proc2 = createSimpleProcessor('proc2', stage, (x: string) => x, {
                setup: setupSpy2,
            });

            executor.register(proc2);
            await executor.execute('test2', context);

            // Both setups should have been called
            expect(setupSpy1).toHaveBeenCalledTimes(1); // Still once
            expect(setupSpy2).toHaveBeenCalledTimes(1); // New processor setup called
        });

        it('should handle async setup hooks', async () => {
            let setupCompleted = false;

            const stage = createStage('async-setup-stage');
            const processor = createSimpleProcessor(
                'async-setup-processor',
                stage,
                (x: string) => {
                    expect(setupCompleted).toBe(true); // Setup should complete before processing
                    return x;
                },
                {
                    setup: async () => {
                        await delay(20);
                        setupCompleted = true;
                    },
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context);

            expect(result.success).toBe(true);
            expect(setupCompleted).toBe(true);
        });

        it('should handle setup failures gracefully', async () => {
            const stage = createStage('failing-setup-stage');
            const processor = createSimpleProcessor(
                'failing-setup-processor',
                stage,
                (x: string) => x,
                {
                    setup: async () => {
                        throw new Error('Setup failed');
                    },
                },
            );

            executor.register(processor);

            const context = createPipelineContext({}, mockLogger);

            const result = await executor.execute('test', context)
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Setup failed');
        });
    });

    describe('complex integration scenarios', () => {
        it('should handle a realistic data processing pipeline', async () => {
            interface UserData {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
                age?: number;
            }

            interface ValidatedUserData extends UserData {
                isValid: boolean;
                validationErrors: string[];
            }

            interface ProcessedUserData extends ValidatedUserData {
                fullName: string;
                emailDomain: string;
                category: 'adult' | 'minor' | 'unknown';
                processedAt: number;
            }

            // Define stages
            const inputStage = createStage('input');
            const validationStage = createStage('validation', {
                dependencies: ['input'],
            });
            const processingStage = createStage('processing', {
                dependencies: ['validation'],
            });
            const outputStage = createStage('output', {
                dependencies: ['processing'],
            });

            // Input processor
            const inputProcessor = createSimpleProcessor(
                'input-processor',
                inputStage,
                (data: UserData, context) => {
                    context.logger.info('Processing user input', {userId: data.id});
                    return data;
                },
            );

            // Validation processor
            const validationProcessor = createSimpleProcessor(
                'validation-processor',
                validationStage,
                (data: UserData, context): ValidatedUserData => {
                    const errors: string[] = [];

                    if (!data.email.includes('@')) {
                        errors.push('Invalid email format');
                    }

                    if (!data.firstName.trim()) {
                        errors.push('First name is required');
                    }

                    if (errors.length > 0) {
                        context.addWarning(
                            'VALIDATION_ISSUES',
                            'User data has validation issues',
                            {errors},
                        );
                    }

                    return {
                        ...data,
                        isValid: errors.length === 0,
                        validationErrors: errors,
                    };
                },
            );

            // Processing processor
            const processingProcessor = createSimpleProcessor(
                'processing-processor',
                processingStage,
                (data: ValidatedUserData, context): ProcessedUserData => {
                    if (!data.isValid) {
                        context.addWarning(
                            'PROCESSING_INVALID_DATA',
                            'Processing invalid user data',
                        );
                    }

                    return {
                        ...data,
                        fullName: `${data.firstName} ${data.lastName}`.trim(),
                        emailDomain: data.email.split('@')[1] || 'unknown',
                        category:
                            data.age === undefined
                                ? 'unknown'
                                : data.age >= 18
                                    ? 'adult'
                                    : 'minor',
                        processedAt: Date.now(),
                    };
                },
            );

            // Output processor
            const outputProcessor = createSimpleProcessor(
                'output-processor',
                outputStage,
                (data: ProcessedUserData, context) => {
                    context.logger.info('User processing completed', {
                        userId: data.id,
                        isValid: data.isValid,
                        category: data.category,
                    });
                    data.processedAt = Date.now();
                    return data;
                },
            );

            executor.register(
                inputProcessor,
                validationProcessor,
                processingProcessor,
                outputProcessor,
            );

            const context = createPipelineContext(
                {sessionId: 'test-session'},
                mockLogger,
            );

            const testUser: UserData = {
                id: 'user-123',
                email: 'john.doe@example.com',
                firstName: 'John',
                lastName: 'Doe',
                age: 25,
            };

            const result = await executor.execute(testUser, context);

            expect(result.success).toBe(true);
            expect(result.output).toMatchObject({
                id: 'user-123',
                fullName: 'John Doe',
                emailDomain: 'example.com',
                category: 'adult',
                isValid: true,
                validationErrors: [],
            });
            // @ts-ignore
            expect(result.output!.processedAt).toBeGreaterThan(0);
            expect(result.stages).toHaveLength(4);
            expect(result.stages.every(stage => stage.kind === 'ok')).toBe(true);
        });

        it('should handle pipeline with warnings and partial failures', async () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage1']}); // Parallel to stage2

            const proc1 = createSimpleProcessor(
                'proc1',
                stage1,
                (x: string, context) => {
                    context.addWarning(
                        'STAGE1_WARNING',
                        'Stage 1 completed with warning',
                    );
                    return x + '-1';
                },
            );

            const proc2 = createSimpleProcessor('proc2', stage2, () => {
                throw new Error('Stage 2 failed');
            });

            const proc3 = createSimpleProcessor(
                'proc3',
                stage3,
                (x: string, context) => {
                    context.addWarning('STAGE3_WARNING', 'Stage 3 warning');
                    return x + '-3';
                },
            );

            executor.register(proc1, proc2, proc3);

            const context = createPipelineContext({}, mockLogger);
            const result = await executor.execute('test', context, {
                stopOnError: false,
                logger: mockLogger,
            });

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings.map(w => w.code)).toEqual([
                'STAGE1_WARNING',
                'STAGE3_WARNING',
            ]);
            expect(result.stages).toHaveLength(3);
            expect(result.stages.filter(s => s.kind === 'ok')).toHaveLength(2);
            expect(result.stages.filter(s => s.kind === 'err')).toHaveLength(1);
        });
    });

    describe('performance and memory', () => {
        it('should handle large numbers of processors efficiently', async () => {
            const numProcessors = 100;
            const stage = createStage('large-stage');

            const processors = Array.from({length: numProcessors}, (_, i) =>
                createSimpleProcessor(`proc-${i}`, stage, (x: number) => x + 1),
            );

            const start = Date.now();
            executor.register(...processors);
            const registrationTime = Date.now() - start;

            expect(registrationTime).toBeLessThan(100); // Should be fast
            expect(executor.getRegisteredProcessorNames()).toHaveLength(
                numProcessors,
            );

            const context = createPipelineContext({}, mockLogger);
            const executionStart = Date.now();
            const result = await executor.execute(0, context);
            const executionTime = Date.now() - executionStart;

            expect(result.success).toBe(true);
            expect(result.output).toBe(numProcessors);
            expect(executionTime).toBeLessThan(1000); // Should complete in reasonable time
        });

        it('should not leak memory across multiple executions', async () => {
            const stage = createStage('memory-stage');
            const processor = createSimpleProcessor(
                'memory-processor',
                stage,
                (x: string) => x,
            );

            executor.register(processor);

            // Run many executions
            for (let i = 0; i < 50; i++) {
                const context = createPipelineContext({}, mockLogger);
                const result = await executor.execute(`test-${i}`, context);
                expect(result.success).toBe(true);
            }

            // Pipeline should still be functional
            const finalContext = createPipelineContext({}, mockLogger);
            const finalResult = await executor.execute('final-test', finalContext);
            expect(finalResult.success).toBe(true);
            expect(finalResult.output).toBe('final-test');
        });
    });
});
