import { createPipelineBuilder, PipelineBuilder } from '../PipelineBuilder';
import { createStage } from '../../core/Stage';
import { createSimpleProcessor, type PipelineProcessor, } from '../../core/Processor';
import { createPipelineContext, type PipelineContext, } from '../../core/Context';
import { MockLogger } from '../../../tests/setup';

describe('PipelineBuilder', () => {
    describe('constructor and factory', () => {
        it('should create a new builder instance', () => {
            const builder = new PipelineBuilder();
            expect(builder).toBeInstanceOf(PipelineBuilder);
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should create builder using factory function', () => {
            const builder = createPipelineBuilder();
            expect(builder).toBeInstanceOf(PipelineBuilder);
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should create builder with type parameters', () => {
            const builder = createPipelineBuilder<string, number>();
            expect(builder).toBeInstanceOf(PipelineBuilder);
        });

        it('should create multiple independent builders', () => {
            const builder1 = createPipelineBuilder();
            const builder2 = createPipelineBuilder();

            expect(builder1).not.toBe(builder2);
            expect(builder1).toBeInstanceOf(PipelineBuilder);
            expect(builder2).toBeInstanceOf(PipelineBuilder);
        });

        it('should support generic type parameters', () => {
            interface CustomInput {
                id: string;
                value: number;
            }

            interface CustomOutput {
                id: string;
                result: string;
            }

            const builder = createPipelineBuilder<CustomInput, CustomOutput>();
            expect(builder).toBeInstanceOf(PipelineBuilder);
        });
    });

    describe('processor registration', () => {
        let builder: PipelineBuilder;
        let testStage: ReturnType<typeof createStage>;

        beforeEach(() => {
            builder = createPipelineBuilder();
            testStage = createStage('test-stage');
        });

        it('should register a single processor', () => {
            const processor = createSimpleProcessor(
                'test-proc',
                testStage,
                (x: string) => x,
            );

            const result = builder.withProcessor(processor);

            expect(result).toBe(builder); // Should return the same instance for chaining
            expect(builder.getRegisteredProcessorNames()).toContain('test-proc');
            expect(builder.getRegisteredProcessorNames()).toHaveLength(1);
        });

        it('should register multiple processors at once', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2');

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', testStage, (x: string) => x);

            builder.withProcessor(proc1, proc2, proc3);

            const names = builder.getRegisteredProcessorNames();
            expect(names).toContain('proc1');
            expect(names).toContain('proc2');
            expect(names).toContain('proc3');
            expect(names).toHaveLength(3);
        });

        it('should register processors from array', () => {
            const processors = [
                createSimpleProcessor('proc1', testStage, (x: string) => x),
                createSimpleProcessor('proc2', testStage, (x: string) => x),
                createSimpleProcessor('proc3', testStage, (x: string) => x),
            ];

            builder.withProcessors(processors);

            expect(builder.getRegisteredProcessorNames()).toHaveLength(3);
            expect(builder.getRegisteredProcessorNames()).toEqual([
                'proc1',
                'proc2',
                'proc3',
            ]);
        });

        it('should support method chaining', () => {
            const proc1 = createSimpleProcessor('proc1', testStage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', testStage, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', testStage, (x: string) => x);

            const result = builder
                .withProcessor(proc1)
                .withProcessor(proc2)
                .withProcessor(proc3);

            expect(result).toBe(builder);
            expect(builder.getRegisteredProcessorNames()).toHaveLength(3);
        });

        it('should throw error on duplicate processor names', () => {
            const proc1 = createSimpleProcessor(
                'duplicate',
                testStage,
                (x: string) => x,
            );
            const proc2 = createSimpleProcessor(
                'duplicate',
                testStage,
                (x: string) => x,
            );

            builder.withProcessor(proc1);

            expect(() => builder.withProcessor(proc2)).toThrow(/already registered/);
            expect(builder.getRegisteredProcessorNames()).toEqual(['duplicate']);
        });

        it('should handle processors with different input/output types', () => {
            const stringStage = createStage('string-stage');
            const numberStage = createStage('number-stage');

            const stringProc = createSimpleProcessor(
                'string-proc',
                stringStage,
                (x: string) => x.length,
            );
            const numberProc = createSimpleProcessor(
                'number-proc',
                numberStage,
                (x: number) => x.toString(),
            );

            builder.withProcessor(stringProc).withProcessor(numberProc);

            expect(builder.getRegisteredProcessorNames()).toHaveLength(2);
        });

        it('should preserve processor order in registration', () => {
            const processors = [
                createSimpleProcessor('first', testStage, (x: string) => x),
                createSimpleProcessor('second', testStage, (x: string) => x),
                createSimpleProcessor('third', testStage, (x: string) => x),
                createSimpleProcessor('fourth', testStage, (x: string) => x),
            ];

            processors.forEach(proc => builder.withProcessor(proc));

            const names = builder.getRegisteredProcessorNames();
            expect(names).toEqual(['first', 'second', 'third', 'fourth']);
        });

        it('should handle empty processor arrays', () => {
            expect(() => builder.withProcessors([])).not.toThrow();
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should handle mixed registration methods', () => {
            const proc1 = createSimpleProcessor('proc1', testStage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', testStage, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', testStage, (x: string) => x);
            const proc4 = createSimpleProcessor('proc4', testStage, (x: string) => x);

            builder
                .withProcessor(proc1)
                .withProcessors([proc2, proc3])
                .withProcessor(proc4);

            expect(builder.getRegisteredProcessorNames()).toHaveLength(4);
        });
    });

    describe('conditional processor registration', () => {
        let builder: PipelineBuilder;
        let testStage: ReturnType<typeof createStage>;

        beforeEach(() => {
            builder = createPipelineBuilder();
            testStage = createStage('test-stage');
        });

        it('should register processor when condition is true', () => {
            const processor = createSimpleProcessor(
                'conditional-proc',
                testStage,
                (x: string) => x,
            );

            builder.withProcessorIf(true, processor);

            expect(builder.getRegisteredProcessorNames()).toContain(
                'conditional-proc',
            );
            expect(builder.getRegisteredProcessorNames()).toHaveLength(1);
        });

        it('should not register processor when condition is false', () => {
            const processor = createSimpleProcessor(
                'conditional-proc',
                testStage,
                (x: string) => x,
            );

            builder.withProcessorIf(false, processor);

            expect(builder.getRegisteredProcessorNames()).not.toContain(
                'conditional-proc',
            );
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should support chaining with conditional registration', () => {
            const proc1 = createSimpleProcessor('proc1', testStage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', testStage, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', testStage, (x: string) => x);

            const result = builder
                .withProcessorIf(true, proc1)
                .withProcessorIf(false, proc2)
                .withProcessorIf(true, proc3);

            expect(result).toBe(builder);
            expect(builder.getRegisteredProcessorNames()).toEqual(['proc1', 'proc3']);
        });

        it('should work with dynamic conditions', () => {
            const config = {
                enableAdvanced: true,
                enableLegacy: false,
                enableExperimental: undefined,
                enableDebug: null,
            };

            const advancedProc = createSimpleProcessor(
                'advanced-proc',
                testStage,
                (x: string) => x,
            );
            const legacyProc = createSimpleProcessor(
                'legacy-proc',
                testStage,
                (x: string) => x,
            );
            const experimentalProc = createSimpleProcessor(
                'experimental-proc',
                testStage,
                (x: string) => x,
            );
            const debugProc = createSimpleProcessor(
                'debug-proc',
                testStage,
                (x: string) => x,
            );

            builder
                .withProcessorIf(config.enableAdvanced, advancedProc)
                .withProcessorIf(config.enableLegacy, legacyProc)
                .withProcessorIf(Boolean(config.enableExperimental), experimentalProc)
                .withProcessorIf(Boolean(config.enableDebug), debugProc);

            expect(builder.getRegisteredProcessorNames()).toEqual(['advanced-proc']);
        });

        it('should handle complex conditional logic', () => {
            const environment = 'production';
            const features = ['feature-a', 'feature-b'];
            const version = '2.1.0';

            const condition1 = environment === 'production';
            const condition2 =
                features.includes('feature-a') && features.includes('feature-c');
            const condition3 = parseFloat(version) >= 2.0;

            const proc1 = createSimpleProcessor(
                'prod-proc',
                testStage,
                (x: string) => x,
            );
            const proc2 = createSimpleProcessor(
                'feature-proc',
                testStage,
                (x: string) => x,
            );
            const proc3 = createSimpleProcessor(
                'version-proc',
                testStage,
                (x: string) => x,
            );

            builder
                .withProcessorIf(condition1, proc1)
                .withProcessorIf(condition2, proc2)
                .withProcessorIf(condition3, proc3);

            expect(builder.getRegisteredProcessorNames()).toEqual([
                'prod-proc',
                'version-proc',
            ]);
        });

        it('should handle function-based conditions', () => {
            const isFeatureEnabled = (feature: string) =>
                ['auth', 'logging'].includes(feature);
            const hasPermission = (permission: string) => permission === 'admin';

            const authProc = createSimpleProcessor(
                'auth-proc',
                testStage,
                (x: string) => x,
            );
            const loggingProc = createSimpleProcessor(
                'logging-proc',
                testStage,
                (x: string) => x,
            );
            const adminProc = createSimpleProcessor(
                'admin-proc',
                testStage,
                (x: string) => x,
            );
            const userProc = createSimpleProcessor(
                'user-proc',
                testStage,
                (x: string) => x,
            );

            builder
                .withProcessorIf(isFeatureEnabled('auth'), authProc)
                .withProcessorIf(isFeatureEnabled('logging'), loggingProc)
                .withProcessorIf(hasPermission('admin'), adminProc)
                .withProcessorIf(hasPermission('user'), userProc);

            expect(builder.getRegisteredProcessorNames()).toEqual([
                'auth-proc',
                'logging-proc',
                'admin-proc',
            ]);
        });

        it('should evaluate conditions at registration time', () => {
            let dynamicValue = true;
            const processor = createSimpleProcessor(
                'dynamic-proc',
                testStage,
                (x: string) => x,
            );

            builder.withProcessorIf(dynamicValue, processor);
            expect(builder.getRegisteredProcessorNames()).toContain('dynamic-proc');

            // Changing the value after registration should not affect the builder
            dynamicValue = false;
            expect(builder.getRegisteredProcessorNames()).toContain('dynamic-proc');
        });
    });

    describe('factory-based processor registration', () => {
        let builder: PipelineBuilder;
        let testStage: ReturnType<typeof createStage>;

        beforeEach(() => {
            builder = createPipelineBuilder();
            testStage = createStage('test-stage');
        });

        it('should register processor from factory function', () => {
            const factory = () =>
                createSimpleProcessor('factory-proc', testStage, (x: string) => x);

            builder.withProcessorFactory(factory);

            expect(builder.getRegisteredProcessorNames()).toContain('factory-proc');
            expect(builder.getRegisteredProcessorNames()).toHaveLength(1);
        });

        it('should call factory function immediately', () => {
            const factorySpy = jest.fn(() =>
                createSimpleProcessor('spy-proc', testStage, (x: string) => x),
            );

            builder.withProcessorFactory(factorySpy);

            expect(factorySpy).toHaveBeenCalledTimes(1);
            expect(factorySpy).toHaveBeenCalledWith();
            expect(builder.getRegisteredProcessorNames()).toContain('spy-proc');
        });

        it('should support chaining with factory registration', () => {
            const factory1 = () =>
                createSimpleProcessor('factory1', testStage, (x: string) => x);
            const factory2 = () =>
                createSimpleProcessor('factory2', testStage, (x: string) => x);

            const result = builder
                .withProcessorFactory(factory1)
                .withProcessorFactory(factory2);

            expect(result).toBe(builder);
            expect(builder.getRegisteredProcessorNames()).toHaveLength(2);
            expect(builder.getRegisteredProcessorNames()).toEqual([
                'factory1',
                'factory2',
            ]);
        });

        it('should handle factory functions with closure variables', () => {
            const createProcessor = (name: string, multiplier: number) => () =>
                createSimpleProcessor(name, testStage, (x: number) => x * multiplier);

            builder
                .withProcessorFactory(createProcessor('double', 2))
                .withProcessorFactory(createProcessor('triple', 3))
                .withProcessorFactory(createProcessor('quadruple', 4));

            expect(builder.getRegisteredProcessorNames()).toEqual([
                'double',
                'triple',
                'quadruple',
            ]);
        });

        it('should handle factory functions that create complex processors', () => {
            const createComplexProcessor =
                (config: { name: string; version: string; async: boolean }) => () => {
                    const processFunc = config.async
                        ? async (x: string) => {
                            await new Promise(resolve => setTimeout(resolve, 1));
                            return `${x}-${config.version}`;
                        }
                        : (x: string) => `${x}-${config.version}`;

                    return createSimpleProcessor(config.name, testStage, processFunc, {
                        version: config.version as any,
                    });
                };

            builder
                .withProcessorFactory(
                    createComplexProcessor({
                        name: 'sync-proc',
                        version: '1.0.0',
                        async: false,
                    }),
                )
                .withProcessorFactory(
                    createComplexProcessor({
                        name: 'async-proc',
                        version: '2.0.0',
                        async: true,
                    }),
                );

            const names = builder.getRegisteredProcessorNames();
            expect(names).toEqual(['sync-proc', 'async-proc']);
        });

        it('should throw error if factory returns duplicate processor name', () => {
            const factory1 = () =>
                createSimpleProcessor('duplicate', testStage, (x: string) => x);
            const factory2 = () =>
                createSimpleProcessor('duplicate', testStage, (x: string) => x);

            builder.withProcessorFactory(factory1);

            expect(() => builder.withProcessorFactory(factory2)).toThrow(
                /already registered/,
            );
        });

        it('should handle factory errors gracefully', () => {
            const failingFactory = () => {
                throw new Error('Factory failed');
            };

            expect(() => builder.withProcessorFactory(failingFactory)).toThrow(
                'Factory failed',
            );
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should handle factory functions that return different processor types', () => {
            class CustomProcessor implements PipelineProcessor<string, string> {
                readonly name = 'custom-processor';
                readonly version = '1.0.0' as const;
                readonly stage = testStage;

                async process(input: string): Promise<string> {
                    return input.toUpperCase();
                }
            }

            const simpleFactory = () =>
                createSimpleProcessor('simple', testStage, (x: string) => x);
            const customFactory = () => new CustomProcessor();

            builder
                .withProcessorFactory(simpleFactory)
                .withProcessorFactory(customFactory);

            expect(builder.getRegisteredProcessorNames()).toEqual([
                'simple',
                'custom-processor',
            ]);
        });

        it('should support conditional factory execution', () => {
            const shouldCreate = (feature: string) =>
                ['auth', 'validation'].includes(feature);

            const createConditionalFactory =
                (feature: string, name: string) => () => {
                    if (!shouldCreate(feature)) {
                        throw new Error(`Feature ${feature} not enabled`);
                    }
                    return createSimpleProcessor(name, testStage, (x: string) => x);
                };

            // These should succeed
            builder.withProcessorFactory(
                createConditionalFactory('auth', 'auth-proc'),
            );
            builder.withProcessorFactory(
                createConditionalFactory('validation', 'validation-proc'),
            );

            expect(builder.getRegisteredProcessorNames()).toEqual([
                'auth-proc',
                'validation-proc',
            ]);

            // This should fail
            expect(() =>
                builder.withProcessorFactory(
                    createConditionalFactory('unknown', 'unknown-proc'),
                ),
            ).toThrow('Feature unknown not enabled');
        });
    });

    describe('pipeline validation', () => {
        let builder: PipelineBuilder;

        beforeEach(() => {
            builder = createPipelineBuilder();
        });

        it('should validate successfully with valid pipeline', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);

            builder.withProcessor(proc1, proc2);

            expect(() => builder.validate()).not.toThrow();
        });

        it('should throw error when no processors are registered', () => {
            expect(() => builder.validate()).toThrow(/at least one processor/);
        });

        it('should throw error on circular dependencies', () => {
            const stage1 = createStage('stage1', {dependencies: ['stage2']});
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);

            builder.withProcessor(proc1, proc2);

            expect(() => builder.validate()).toThrow(/circular dependency/i);
        });

        it('should provide detailed error messages for validation failures', () => {
            const stage1 = createStage('stage1', {dependencies: ['stage2']});
            const stage2 = createStage('stage2', {dependencies: ['stage3']});
            const stage3 = createStage('stage3', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => x);

            builder.withProcessor(proc1, proc2, proc3);

            try {
                builder.validate();
                fail('Expected validation to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toMatch(/circular dependency/i);
            }
        });

        it('should validate complex dependency chains', () => {
            const stageA = createStage('A');
            const stageB = createStage('B', {dependencies: ['A']});
            const stageC = createStage('C', {dependencies: ['A']});
            const stageD = createStage('D', {dependencies: ['B', 'C']});
            const stageE = createStage('E', {dependencies: ['D']});

            const processors = [stageA, stageB, stageC, stageD, stageE].map(
                (stage, i) =>
                    createSimpleProcessor(`proc${i}`, stage, (x: string) => x),
            );

            builder.withProcessor(...processors);

            expect(() => builder.validate()).not.toThrow();
        });

        it('should validate with multiple processors in same stage', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1a = createSimpleProcessor('proc1a', stage1, (x: string) => x);
            const proc1b = createSimpleProcessor('proc1b', stage1, (x: string) => x);
            const proc2a = createSimpleProcessor('proc2a', stage2, (x: string) => x);
            const proc2b = createSimpleProcessor('proc2b', stage2, (x: string) => x);

            builder.withProcessor(proc1a, proc1b, proc2a, proc2b);

            expect(() => builder.validate()).not.toThrow();
        });

        it('should handle validation of isolated stages', () => {
            const isolatedStage = createStage('isolated');
            const connectedStage1 = createStage('connected1');
            const connectedStage2 = createStage('connected2', {
                dependencies: ['connected1'],
            });

            const isolatedProc = createSimpleProcessor(
                'isolated-proc',
                isolatedStage,
                (x: string) => x,
            );
            const connectedProc1 = createSimpleProcessor(
                'connected-proc1',
                connectedStage1,
                (x: string) => x,
            );
            const connectedProc2 = createSimpleProcessor(
                'connected-proc2',
                connectedStage2,
                (x: string) => x,
            );

            builder.withProcessor(isolatedProc, connectedProc1, connectedProc2);

            // Should not throw - isolated stages are allowed
            expect(() => builder.validate()).not.toThrow();
        });

        it('should handle self-referential dependencies', () => {
            const selfRefStage = createStage('self-ref', {
                dependencies: ['self-ref'],
            });
            const processor = createSimpleProcessor(
                'self-ref-proc',
                selfRefStage,
                (x: string) => x,
            );

            builder.withProcessor(processor);

            expect(() => builder.validate()).toThrow(/circular dependency/i);
        });
    });

    describe('stage execution order', () => {
        let builder: PipelineBuilder;

        beforeEach(() => {
            builder = createPipelineBuilder();
        });

        it('should return correct execution order for simple dependencies', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});
            const stage3 = createStage('stage3', {dependencies: ['stage2']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => x);

            builder.withProcessor(proc3, proc1, proc2); // Register in random order

            const order = builder.getStageExecutionOrder();
            expect(order).toEqual(['stage1', 'stage2', 'stage3']);
        });

        it('should return correct execution order for complex dependencies', () => {
            const stageA = createStage('A');
            const stageB = createStage('B', {dependencies: ['A']});
            const stageC = createStage('C', {dependencies: ['A']});
            const stageD = createStage('D', {dependencies: ['B', 'C']});
            const stageE = createStage('E', {dependencies: ['C']});
            const stageF = createStage('F', {dependencies: ['D', 'E']});

            const procA = createSimpleProcessor('procA', stageA, (x: string) => x);
            const procB = createSimpleProcessor('procB', stageB, (x: string) => x);
            const procC = createSimpleProcessor('procC', stageC, (x: string) => x);
            const procD = createSimpleProcessor('procD', stageD, (x: string) => x);
            const procE = createSimpleProcessor('procE', stageE, (x: string) => x);
            const procF = createSimpleProcessor('procF', stageF, (x: string) => x);

            builder.withProcessor(procF, procE, procD, procC, procB, procA); // Random order

            const order = builder.getStageExecutionOrder();
            const indexA = order.indexOf('A');
            const indexB = order.indexOf('B');
            const indexC = order.indexOf('C');
            const indexD = order.indexOf('D');
            const indexE = order.indexOf('E');
            const indexF = order.indexOf('F');

            expect(indexA).toBeLessThan(indexB);
            expect(indexA).toBeLessThan(indexC);
            expect(indexB).toBeLessThan(indexD);
            expect(indexC).toBeLessThan(indexD);
            expect(indexC).toBeLessThan(indexE);
            expect(indexD).toBeLessThan(indexF);
            expect(indexE).toBeLessThan(indexF);
        });

        it('should return empty array when no processors are registered', () => {
            const order = builder.getStageExecutionOrder();
            expect(order).toEqual([]);
        });

        it('should handle stages with no dependencies', () => {
            const stage1 = createStage('independent1');
            const stage2 = createStage('independent2');
            const stage3 = createStage('dependent', {
                dependencies: ['independent1', 'independent2'],
            });

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage3, (x: string) => x);

            builder.withProcessor(proc3, proc2, proc1);

            const order = builder.getStageExecutionOrder();
            const dependentIndex = order.indexOf('dependent');
            const independent1Index = order.indexOf('independent1');
            const independent2Index = order.indexOf('independent2');

            expect(independent1Index).toBeLessThan(dependentIndex);
            expect(independent2Index).toBeLessThan(dependentIndex);
            expect(order).toHaveLength(3);
        });

        it('should maintain consistent order across multiple calls', () => {
            const stageA = createStage('A');
            const stageB = createStage('B', {dependencies: ['A']});
            const stageC = createStage('C', {dependencies: ['A']});

            const procA = createSimpleProcessor('procA', stageA, (x: string) => x);
            const procB = createSimpleProcessor('procB', stageB, (x: string) => x);
            const procC = createSimpleProcessor('procC', stageC, (x: string) => x);

            builder.withProcessor(procC, procB, procA);

            const order1 = builder.getStageExecutionOrder();
            const order2 = builder.getStageExecutionOrder();
            const order3 = builder.getStageExecutionOrder();

            expect(order1).toEqual(order2);
            expect(order2).toEqual(order3);
        });

        it('should update execution order when new processors are added', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            builder.withProcessor(proc1);

            let order = builder.getStageExecutionOrder();
            expect(order).toEqual(['stage1']);

            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            builder.withProcessor(proc2);

            order = builder.getStageExecutionOrder();
            expect(order).toEqual(['stage1', 'stage2']);
        });
    });

    describe('pipeline building', () => {
        let builder: PipelineBuilder;

        beforeEach(() => {
            builder = createPipelineBuilder();
        });

        it('should build pipeline with default validation', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-proc',
                stage,
                (x: string) => x,
            );

            builder.withProcessor(processor);

            const pipeline = builder.build();
            expect(pipeline).toBeDefined();
            expect(pipeline.getRegisteredProcessorNames()).toContain('test-proc');
        });

        it('should build pipeline with validation disabled', () => {
            const pipeline = builder.build({validate: false});
            expect(pipeline).toBeDefined();
            // Should not throw even though no processors are registered
        });

        it('should build pipeline with validation enabled explicitly', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-proc',
                stage,
                (x: string) => x,
            );

            builder.withProcessor(processor);

            expect(() => builder.build({validate: true})).not.toThrow();
        });

        it('should throw validation error during build when enabled', () => {
            expect(() => builder.build({validate: true})).toThrow(
                /at least one processor/,
            );
        });

        it('should return working executor', async () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor('test-proc', stage, (x: string) =>
                x.toUpperCase(),
            );

            builder.withProcessor(processor);
            const pipeline = builder.build();

            const context = createPipelineContext({});
            const result = await pipeline.execute('test', context);

            expect(result.success).toBe(true);
            expect(result.output).toBe('TEST');
        });

        it('should preserve all registered processors in built pipeline', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2');

            const processors = [
                createSimpleProcessor('proc1', stage1, (x: string) => x),
                createSimpleProcessor('proc2', stage1, (x: string) => x),
                createSimpleProcessor('proc3', stage2, (x: string) => x),
                createSimpleProcessor('proc4', stage2, (x: string) => x),
            ];

            builder.withProcessor(...processors);
            const pipeline = builder.build();

            const builderNames = builder.getRegisteredProcessorNames();
            const pipelineNames = pipeline.getRegisteredProcessorNames();

            expect(pipelineNames).toEqual(builderNames);
            expect(pipelineNames).toHaveLength(4);
        });

        it('should build independent pipelines from same builder', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-proc',
                stage,
                (x: string) => x,
            );

            builder.withProcessor(processor);

            const pipeline1 = builder.build();
            const pipeline2 = builder.build();

            expect(pipeline1).not.toBe(pipeline2);
            expect(pipeline1.getRegisteredProcessorNames()).toEqual(
                pipeline2.getRegisteredProcessorNames(),
            );
        });

        it('should validate build options', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'test-proc',
                stage,
                (x: string) => x,
            );
            builder.withProcessor(processor);

            // Valid options
            expect(() => builder.build({validate: true})).not.toThrow();
            expect(() => builder.build({validate: false})).not.toThrow();
            expect(() => builder.build({})).not.toThrow();
            expect(() => builder.build()).not.toThrow();
        });
    });

    describe('builder cloning', () => {
        let builder: PipelineBuilder;

        beforeEach(() => {
            builder = createPipelineBuilder();
        });

        it('should create a clone with same processors', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('proc1', stage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage, (x: string) => x);

            builder.withProcessor(proc1, proc2);
            const clone = builder.clone();

            expect(clone).not.toBe(builder);
            expect(clone.getRegisteredProcessorNames()).toEqual(
                builder.getRegisteredProcessorNames(),
            );
            expect(clone.getStageExecutionOrder()).toEqual(
                builder.getStageExecutionOrder(),
            );
        });

        it('should create independent clones', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('proc1', stage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage, (x: string) => x);

            builder.withProcessor(proc1);
            const clone = builder.clone();

            builder.withProcessor(proc2);
            clone.withProcessor(proc3);

            expect(builder.getRegisteredProcessorNames()).toEqual(['proc1', 'proc2']);
            expect(clone.getRegisteredProcessorNames()).toEqual(['proc1', 'proc3']);
        });

        it('should clone empty builder', () => {
            const clone = builder.clone();

            expect(clone).not.toBe(builder);
            expect(clone.getRegisteredProcessorNames()).toEqual([]);
            expect(clone.getStageExecutionOrder()).toEqual([]);
        });

        it('should share processor instances between original and clone', () => {
            const stage = createStage('test-stage');
            const processor = createSimpleProcessor(
                'shared-proc',
                stage,
                (x: string) => x,
            );

            builder.withProcessor(processor);
            const clone = builder.clone();

            // Both should work with the same processor instance
            const pipeline1 = builder.build();
            const pipeline2 = clone.build();

            expect(pipeline1.getRegisteredProcessorNames()).toEqual(['shared-proc']);
            expect(pipeline2.getRegisteredProcessorNames()).toEqual(['shared-proc']);
        });

        it('should handle cloning with complex stage dependencies', () => {
            const stageA = createStage('A');
            const stageB = createStage('B', {dependencies: ['A']});
            const stageC = createStage('C', {dependencies: ['A', 'B']});

            const procA = createSimpleProcessor('procA', stageA, (x: string) => x);
            const procB = createSimpleProcessor('procB', stageB, (x: string) => x);
            const procC = createSimpleProcessor('procC', stageC, (x: string) => x);

            builder.withProcessor(procA, procB, procC);
            const clone = builder.clone();

            expect(clone.getStageExecutionOrder()).toEqual(['A', 'B', 'C']);
            expect(clone.getRegisteredProcessorNames()).toEqual([
                'procA',
                'procB',
                'procC',
            ]);

            // Validate that clone works independently
            expect(() => clone.validate()).not.toThrow();
        });

        it('should support chaining after cloning', () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2');

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage2, (x: string) => x);

            builder.withProcessor(proc1);
            const clone = builder.clone().withProcessor(proc2).withProcessor(proc3);

            expect(builder.getRegisteredProcessorNames()).toEqual(['proc1']);
            expect(clone.getRegisteredProcessorNames()).toEqual([
                'proc1',
                'proc2',
                'proc3',
            ]);
        });

        it('should handle cloning with conditional processors', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('proc1', stage, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage, (x: string) => x);
            const proc3 = createSimpleProcessor('proc3', stage, (x: string) => x);

            builder
                .withProcessor(proc1)
                .withProcessorIf(true, proc2)
                .withProcessorIf(false, proc3);

            const clone = builder.clone();

            expect(builder.getRegisteredProcessorNames()).toEqual(['proc1', 'proc2']);
            expect(clone.getRegisteredProcessorNames()).toEqual(['proc1', 'proc2']);

            // Adding to clone shouldn't affect original
            clone.withProcessorIf(true, proc3);
            expect(builder.getRegisteredProcessorNames()).toEqual(['proc1', 'proc2']);
            expect(clone.getRegisteredProcessorNames()).toEqual([
                'proc1',
                'proc2',
                'proc3',
            ]);
        });

        it('should maintain validation state across clones', () => {
            // Create invalid pipeline (circular dependency)
            const stage1 = createStage('stage1', {dependencies: ['stage2']});
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const proc1 = createSimpleProcessor('proc1', stage1, (x: string) => x);
            const proc2 = createSimpleProcessor('proc2', stage2, (x: string) => x);

            builder.withProcessor(proc1, proc2);
            const clone = builder.clone();

            // Both should fail validation
            expect(() => builder.validate()).toThrow(/circular dependency/i);
            expect(() => clone.validate()).toThrow(/circular dependency/i);
        });
    });

    describe('complex builder scenarios', () => {
        it('should support building data processing pipelines', () => {
            interface UserData {
                id: string;
                email: string;
                name: string;
            }

            interface ValidatedData extends UserData {
                isValid: boolean;
            }

            interface ProcessedData extends ValidatedData {
                processedAt: number;
                domain: string;
            }

            const inputStage = createStage('input');
            const validationStage = createStage('validation', {
                dependencies: ['input'],
            });
            const processingStage = createStage('processing', {
                dependencies: ['validation'],
            });

            const builder = createPipelineBuilder<UserData, ProcessedData>()
                .withProcessor(
                    createSimpleProcessor(
                        'input-validator',
                        inputStage,
                        (data: UserData) => data,
                    ),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'email-validator',
                        validationStage,
                        (data: UserData): ValidatedData => ({
                            ...data,
                            isValid: data.email.includes('@'),
                        }),
                    ),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'data-processor',
                        processingStage,
                        (data: ValidatedData): ProcessedData => ({
                            ...data,
                            processedAt: Date.now(),
                            domain: data.email.split('@')[1] || 'unknown',
                        }),
                    ),
                );

            const pipeline = builder.build();
            expect(pipeline.getRegisteredProcessorNames()).toHaveLength(3);
            expect(builder.getStageExecutionOrder()).toEqual([
                'input',
                'validation',
                'processing',
            ]);
        });

        it('should support conditional pipeline building based on configuration', () => {
            interface Config {
                enableValidation: boolean;
                enableLogging: boolean;
                enableMetrics: boolean;
                environment: 'dev' | 'staging' | 'prod';
            }

            const buildPipeline = (config: Config) => {
                const inputStage = createStage('input');
                const validationStage = createStage('validation', {
                    dependencies: ['input'],
                });
                const processingStage = createStage('processing', {
                    dependencies: config.enableValidation ? ['validation'] : ['input'],
                });
                const metricsStage = createStage('metrics', {
                    dependencies: ['processing'],
                });

                const builder = createPipelineBuilder<string, string>()
                    .withProcessor(
                        createSimpleProcessor('input-proc', inputStage, (x: string) =>
                            x.trim(),
                        ),
                    )
                    .withProcessorIf(
                        config.enableValidation,
                        createSimpleProcessor(
                            'validation-proc',
                            validationStage,
                            (x: string) => {
                                if (!x) {
                                    throw new Error('Empty input');
                                }
                                return x;
                            },
                        ),
                    )
                    .withProcessor(
                        createSimpleProcessor(
                            'processing-proc',
                            processingStage,
                            (x: string) => x.toUpperCase(),
                        ),
                    )
                    .withProcessorIf(
                        config.enableLogging,
                        createSimpleProcessor(
                            'logging-proc',
                            processingStage,
                            (x: string, context) => {
                                context.logger.info('Processing completed', {result: x});
                                return x;
                            },
                        ),
                    )
                    .withProcessorIf(
                        config.enableMetrics && config.environment === 'prod',
                        createSimpleProcessor(
                            'metrics-proc',
                            metricsStage,
                            (x: string, context) => {
                                context.addWarning('METRICS', 'Metrics collected');
                                return x;
                            },
                        ),
                    );

                return builder.build();
            };

            const devConfig: Config = {
                enableValidation: false,
                enableLogging: true,
                enableMetrics: false,
                environment: 'dev',
            };

            const prodConfig: Config = {
                enableValidation: true,
                enableLogging: false,
                enableMetrics: true,
                environment: 'prod',
            };

            const devPipeline = buildPipeline(devConfig);
            const prodPipeline = buildPipeline(prodConfig);

            expect(devPipeline.getRegisteredProcessorNames()).toEqual([
                'input-proc',
                'processing-proc',
                'logging-proc',
            ]);
            expect(prodPipeline.getRegisteredProcessorNames()).toEqual([
                'input-proc',
                'validation-proc',
                'processing-proc',
                'metrics-proc',
            ]);
        });

        it('should support pipeline variants and templates', () => {
            const baseStage = createStage('base');
            const enhancedStage = createStage('enhanced', {dependencies: ['base']});
            const advancedStage = createStage('advanced', {
                dependencies: ['enhanced'],
            });

            // Base template
            const baseTemplate = createPipelineBuilder<
                number,
                number
            >().withProcessor(
                createSimpleProcessor('base-proc', baseStage, (x: number) => x * 2),
            );

            // Create variants
            const simpleVariant = baseTemplate.clone();

            const enhancedVariant = baseTemplate
                .clone()
                .withProcessor(
                    createSimpleProcessor(
                        'enhanced-proc',
                        enhancedStage,
                        (x: number) => x + 10,
                    ),
                );

            const advancedVariant = enhancedVariant
                .clone()
                .withProcessor(
                    createSimpleProcessor('advanced-proc', advancedStage, (x: number) =>
                        Math.pow(x, 2),
                    ),
                );

            const customVariant = baseTemplate
                .clone()
                .withProcessor(
                    createSimpleProcessor(
                        'custom-proc',
                        enhancedStage,
                        (x: number) => x / 2,
                    ),
                );

            expect(simpleVariant.getRegisteredProcessorNames()).toEqual([
                'base-proc',
            ]);
            expect(enhancedVariant.getRegisteredProcessorNames()).toEqual([
                'base-proc',
                'enhanced-proc',
            ]);
            expect(advancedVariant.getRegisteredProcessorNames()).toEqual([
                'base-proc',
                'enhanced-proc',
                'advanced-proc',
            ]);
            expect(customVariant.getRegisteredProcessorNames()).toEqual([
                'base-proc',
                'custom-proc',
            ]);
        });

        it('should support factory-based dynamic processor creation', () => {
            interface ProcessorConfig {
                name: string;
                operation: 'multiply' | 'add' | 'power' | 'divide';
                value: number;
                stage?: string;
            }

            const createStageForOperation = (operation: string) => {
                return createStage(`${operation}-stage`);
            };

            const createMathProcessor = (config: ProcessorConfig) => () => {
                const stage = createStageForOperation(config.operation);
                const operation = (x: number) => {
                    switch (config.operation) {
                        case 'multiply':
                            return x * config.value;
                        case 'add':
                            return x + config.value;
                        case 'power':
                            return Math.pow(x, config.value);
                        case 'divide':
                            return x / config.value;
                        default:
                            return x;
                    }
                };

                return createSimpleProcessor(config.name, stage, operation);
            };

            const configs: ProcessorConfig[] = [
                {name: 'doubler', operation: 'multiply', value: 2},
                {name: 'incrementer', operation: 'add', value: 5},
                {name: 'squarer', operation: 'power', value: 2},
                {name: 'halver', operation: 'divide', value: 2},
            ];

            const builder = createPipelineBuilder<number, number>();

            configs.forEach(config => {
                builder.withProcessorFactory(createMathProcessor(config));
            });

            const pipeline = builder.build();
            expect(pipeline.getRegisteredProcessorNames()).toEqual([
                'doubler',
                'incrementer',
                'squarer',
                'halver',
            ]);
        });

        it('should handle complex branching and merging pipelines', () => {
            const inputStage = createStage('input');
            const branchA = createStage('branch-a', {dependencies: ['input']});
            const branchB = createStage('branch-b', {dependencies: ['input']});
            const branchC = createStage('branch-c', {dependencies: ['input']});
            const mergeAB = createStage('merge-ab', {
                dependencies: ['branch-a', 'branch-b'],
            });
            const finalMerge = createStage('final-merge', {
                dependencies: ['merge-ab', 'branch-c'],
            });

            const builder = createPipelineBuilder<number, number>()
                .withProcessor(
                    createSimpleProcessor('input-proc', inputStage, (x: number) => x),
                )
                .withProcessor(
                    createSimpleProcessor('branch-a-proc', branchA, (x: number) => x * 2),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'branch-b-proc',
                        branchB,
                        (x: number) => x + 10,
                    ),
                )
                .withProcessor(
                    createSimpleProcessor('branch-c-proc', branchC, (x: number) => x - 5),
                )
                .withProcessor(
                    createSimpleProcessor('merge-ab-proc', mergeAB, (x: number) => x),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'final-merge-proc',
                        finalMerge,
                        (x: number) => x,
                    ),
                );

            const executionOrder = builder.getStageExecutionOrder();

            expect(executionOrder[0]).toBe('input');
            expect(executionOrder[executionOrder.length - 1]).toBe('final-merge');

            const inputIndex = executionOrder.indexOf('input');
            const branchAIndex = executionOrder.indexOf('branch-a');
            const branchBIndex = executionOrder.indexOf('branch-b');
            const branchCIndex = executionOrder.indexOf('branch-c');
            const mergeABIndex = executionOrder.indexOf('merge-ab');
            const finalMergeIndex = executionOrder.indexOf('final-merge');

            expect(inputIndex).toBeLessThan(branchAIndex);
            expect(inputIndex).toBeLessThan(branchBIndex);
            expect(inputIndex).toBeLessThan(branchCIndex);
            expect(branchAIndex).toBeLessThan(mergeABIndex);
            expect(branchBIndex).toBeLessThan(mergeABIndex);
            expect(mergeABIndex).toBeLessThan(finalMergeIndex);
            expect(branchCIndex).toBeLessThan(finalMergeIndex);
        });
    });

    describe('integration with executor', () => {
        it('should build functional pipelines', async () => {
            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const pipeline = createPipelineBuilder<string, string>()
                .withProcessor(
                    createSimpleProcessor('proc1', stage1, (x: string) =>
                        x.toLowerCase(),
                    ),
                )
                .withProcessor(
                    createSimpleProcessor('proc2', stage2, (x: string) =>
                        x.toUpperCase(),
                    ),
                )
                .build();

            const context = createPipelineContext({});
            const result = await pipeline.execute('Hello World', context);

            expect(result.success).toBe(true);
            expect(result.output).toBe('HELLO WORLD');
            expect(result.stages).toHaveLength(2);
        });

        it('should pass through execution options correctly', async () => {
            const stage = createStage('test-stage');
            let receivedSignal: AbortSignal | undefined;
            let receivedContext: PipelineContext | undefined;

            const pipeline = createPipelineBuilder<string, string>()
                .withProcessor(
                    createSimpleProcessor(
                        'signal-test',
                        stage,
                        (x: string, context, signal) => {
                            receivedSignal = signal;
                            receivedContext = context;
                            return x;
                        },
                    ),
                )
                .build();

            const context = createPipelineContext({testId: '123'});
            const controller = new AbortController();

            await pipeline.execute('test', context, {
                signal: controller.signal,
                stopOnError: false,
                concurrency: 2,
                timeoutMs: 5000,
            });

            // expect(receivedSignal).toBe(controller.signal);
            expect(receivedContext).toBe(context);
            expect(receivedContext?.metadata.testId).toBe('123');
        });

        it('should handle errors in built pipelines', async () => {
            const stage = createStage('error-stage');

            const pipeline = createPipelineBuilder<string, string>()
                .withProcessor(
                    createSimpleProcessor('failing-proc', stage, () => {
                        throw new Error('Pipeline error');
                    }),
                )
                .build();

            const context = createPipelineContext({});
            const result = await pipeline.execute('test', context);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.message).toBe('Pipeline error');
            expect(result.output).toBeUndefined();
        });

        it('should support complex data transformations', async () => {
            interface User {
                id: number;
                firstName: string;
                lastName: string;
                email: string;
                age: number;
            }

            interface ProcessedUser {
                id: number;
                fullName: string;
                emailDomain: string;
                isAdult: boolean;
                category: string;
            }

            const inputStage = createStage('input');
            const validationStage = createStage('validation', {
                dependencies: ['input'],
            });
            const transformStage = createStage('transform', {
                dependencies: ['validation'],
            });
            const categorizationStage = createStage('categorization', {
                dependencies: ['transform'],
            });

            const pipeline = createPipelineBuilder<User, ProcessedUser>()
                .withProcessor(
                    createSimpleProcessor('input-processor', inputStage, (user: User) => {
                        if (!user.id || !user.email) {
                            throw new Error('Invalid user data');
                        }
                        return user;
                    }),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'validation-processor',
                        validationStage,
                        (user: User, context) => {
                            if (!user.email.includes('@')) {
                                context.addWarning(
                                    'INVALID_EMAIL',
                                    'User has invalid email format',
                                );
                            }
                            if (user.age < 0 || user.age > 150) {
                                context.addWarning('INVALID_AGE', 'User has invalid age');
                            }
                            return user;
                        },
                    ),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'transform-processor',
                        transformStage,
                        (user: User): Omit<ProcessedUser, 'category'> => ({
                            id: user.id,
                            fullName: `${user.firstName} ${user.lastName}`,
                            emailDomain: user.email.split('@')[1] || 'unknown',
                            isAdult: user.age >= 18,
                        }),
                    ),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'categorization-processor',
                        categorizationStage,
                        (user: Omit<ProcessedUser, 'category'>): ProcessedUser => ({
                            ...user,
                            category: user.isAdult ? 'adult' : 'minor',
                        }),
                    ),
                )
                .build();

            const testUser: User = {
                id: 1,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                age: 25,
            };

            const mockLogger = new MockLogger();
            const context = createPipelineContext(
                {sessionId: 'test-123'},
                mockLogger,
            );
            const result = await pipeline.execute(testUser, context);

            expect(result.success).toBe(true);
            expect(result.output).toEqual({
                id: 1,
                fullName: 'John Doe',
                emailDomain: 'example.com',
                isAdult: true,
                category: 'adult',
            });
            expect(result.warnings).toHaveLength(0);
            expect(result.stages).toHaveLength(4);
        });

        it('should handle pipeline events and monitoring', async () => {
            const events: Array<{ type: string; data: any }> = [];

            const stage1 = createStage('stage1');
            const stage2 = createStage('stage2', {dependencies: ['stage1']});

            const pipeline = createPipelineBuilder<string, string>()
                .withProcessor(
                    createSimpleProcessor('proc1', stage1, (x: string) => x + '-1'),
                )
                .withProcessor(
                    createSimpleProcessor('proc2', stage2, (x: string) => x + '-2'),
                )
                .build();

            // Monitor events
            pipeline.on('pipelineStart', () =>
                events.push({type: 'pipelineStart', data: null}),
            );
            pipeline.on('pipelineEnd', result =>
                events.push({type: 'pipelineEnd', data: result.success}),
            );
            pipeline.on('stageStart', ({stage}) =>
                events.push({type: 'stageStart', data: stage}),
            );
            pipeline.on('stageEnd', ({stage}) =>
                events.push({type: 'stageEnd', data: stage}),
            );
            pipeline.on('processorStart', ({processor}) =>
                events.push({type: 'processorStart', data: processor}),
            );
            pipeline.on('processorEnd', ({processor}) =>
                events.push({type: 'processorEnd', data: processor}),
            );

            const context = createPipelineContext({});
            await pipeline.execute('test', context);

            expect(events).toHaveLength(10); // 1 start + 1 end + 2*(2 stage events) + 2*(2 processor events)
            expect(events[0]).toEqual({type: 'pipelineStart', data: null});
            expect(events[events.length - 1]).toEqual({
                type: 'pipelineEnd',
                data: true,
            });
        });
    });

    describe('type safety and TypeScript integration', () => {
        it('should maintain type safety for input and output', () => {
            interface Input {
                value: number;
                metadata: string;
            }

            interface Output {
                result: number;
                processed: boolean;
            }

            const stage = createStage('typed-stage');

            const builder = createPipelineBuilder<Input, Output>().withProcessor(
                createSimpleProcessor(
                    'typed-proc',
                    stage,
                    (input: Input): Output => ({
                        result: input.value * 2,
                        processed: true,
                    }),
                ),
            );

            const pipeline = builder.build();
            expect(pipeline).toBeDefined();

            // TypeScript should enforce correct types at compile time
            // These would cause compilation errors if uncommented:
            // builder.withProcessor(createSimpleProcessor('wrong-input', stage, (x: string) => x));
            // builder.withProcessor(createSimpleProcessor('wrong-output', stage, (x: Input) => 'string'));
        });

        it('should support generic context types', () => {
            interface CustomMetadata {
                userId: string;
                sessionId: string;
                permissions: string[];
            }

            // @ts-ignore
            interface CustomContext extends PipelineContext<CustomMetadata> {
            }

            const stage = createStage<CustomContext>('context-stage');

            const builder = createPipelineBuilder<string, string>().withProcessor(
                createSimpleProcessor(
                    'context-proc',
                    stage,
                    (input: string, context: CustomContext) => {
                        // TypeScript should provide proper typing for metadata
                        const userId: string = context.metadata.userId;
                        const sessionId: string = context.metadata.sessionId;
                        const permissions: string[] = context.metadata.permissions;
                        return `${input}-${userId}-${sessionId}-${permissions.length}`;
                    },
                ),
            );

            expect(builder).toBeDefined();
            expect(builder.getRegisteredProcessorNames()).toEqual(['context-proc']);
        });

        it('should support complex generic type relationships', () => {
            interface BaseData {
                id: string;
                timestamp: number;
            }

            interface ProcessingResult<T extends BaseData> {
                original: T;
                processed: boolean;
                hash: string;
            }

            const createTypedProcessor = <T extends BaseData>(
                name: string,
                stage: ReturnType<typeof createStage>,
            ) =>
                createSimpleProcessor(
                    name,
                    stage,
                    (input: T): ProcessingResult<T> => ({
                        original: input,
                        processed: true,
                        hash: `hash-${input.id}`,
                    }),
                );

            interface UserData extends BaseData {
                username: string;
                email: string;
            }

            interface ProductData extends BaseData {
                name: string;
                price: number;
            }

            const userStage = createStage('user-stage');
            const productStage = createStage('product-stage');

            const userProcessor = createTypedProcessor<UserData>(
                'user-proc',
                userStage,
            );
            const productProcessor = createTypedProcessor<ProductData>(
                'product-proc',
                productStage,
            );

            const userBuilder = createPipelineBuilder<
                UserData,
                ProcessingResult<UserData>
            >().withProcessor(userProcessor);

            const productBuilder = createPipelineBuilder<
                ProductData,
                ProcessingResult<ProductData>
            >().withProcessor(productProcessor);

            expect(userBuilder.getRegisteredProcessorNames()).toEqual(['user-proc']);
            expect(productBuilder.getRegisteredProcessorNames()).toEqual([
                'product-proc',
            ]);
        });

        it('should enforce processor compatibility at compile time', () => {
            interface StepA {
                valueA: number;
            }

            interface StepB {
                valueB: string;
            }

            interface StepC {
                valueC: boolean;
            }

            const stageA = createStage('stage-a');
            const stageB = createStage('stage-b', {dependencies: ['stage-a']});
            const stageC = createStage('stage-c', {dependencies: ['stage-b']});

            // This should work - compatible types
            const builder = createPipelineBuilder<StepA, StepC>()
                .withProcessor(
                    createSimpleProcessor(
                        'proc-a',
                        stageA,
                        (input: StepA): StepB => ({
                            valueB: input.valueA.toString(),
                        }),
                    ),
                )
                .withProcessor(
                    createSimpleProcessor(
                        'proc-b',
                        stageB,
                        (input: StepB): StepC => ({
                            valueC: input.valueB.length > 0,
                        }),
                    ),
                );

            expect(builder.getRegisteredProcessorNames()).toHaveLength(2);
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle processor registration errors gracefully', () => {
            const stage = createStage('test-stage');
            const proc1 = createSimpleProcessor('duplicate', stage, (x: string) => x);
            const proc2 = createSimpleProcessor('duplicate', stage, (x: string) => x);

            const builder = createPipelineBuilder().withProcessor(proc1);

            expect(() => builder.withProcessor(proc2)).toThrow(/already registered/);
            expect(builder.getRegisteredProcessorNames()).toEqual(['duplicate']);
        });

        it('should handle factory function errors', () => {
            const builder = createPipelineBuilder();
            const failingFactory = () => {
                throw new Error('Factory creation failed');
            };

            expect(() => builder.withProcessorFactory(failingFactory)).toThrow(
                'Factory creation failed',
            );
            expect(builder.getRegisteredProcessorNames()).toHaveLength(0);
        });

        it('should handle circular dependencies gracefully', () => {
            const stageA = createStage('stage-a', {dependencies: ['stage-b']});
            const stageB = createStage('stage-b', {dependencies: ['stage-a']});

            const procA = createSimpleProcessor('proc-a', stageA, (x: string) => x);
            const procB = createSimpleProcessor('proc-b', stageB, (x: string) => x);

            const builder = createPipelineBuilder<string, string>()
                .withProcessor(procA)
                .withProcessor(procB);

            expect(() => builder.validate()).toThrow(/Circular dependency/);
        });

        it('should handle empty pipelines gracefully', () => {
            const builder = createPipelineBuilder<string, string>();

            expect(() => builder.build()).toThrow(/must have at least one processor/);
            expect(builder.getRegisteredProcessorNames()).toEqual([]);
        });

        it('should handle self-referential dependencies', () => {
            const selfRefStage = createStage('self-ref', {
                dependencies: ['self-ref'],
            });
            const processor = createSimpleProcessor(
                'self-ref-proc',
                selfRefStage,
                (x: string) => x,
            );

            const builder = createPipelineBuilder<string, string>().withProcessor(
                processor,
            );

            expect(() => builder.validate()).toThrow(/circular dependency/i);
        });

        it('should handle complex dependency validation', () => {
            const stageA = createStage('stage-a');
            const stageB = createStage('stage-b', {
                dependencies: ['stage-missing'],
            });

            const procA = createSimpleProcessor('proc-a', stageA, (x: string) => x);
            const procB = createSimpleProcessor('proc-b', stageB, (x: string) => x);

            const builder = createPipelineBuilder<string, string>()
                .withProcessor(procA)
                .withProcessor(procB);

            expect(() => builder.validate()).toThrow(
                /Missing stages for dependencies/,
            );
        });

        it('should maintain processor state isolation between builders', () => {
            const stage = createStage('shared-stage');
            const processor = createSimpleProcessor(
                'shared-proc',
                stage,
                (x: string) => x,
            );

            const builder1 = createPipelineBuilder<string, string>().withProcessor(
                processor,
            );
            const builder2 = createPipelineBuilder<string, string>().withProcessor(
                processor,
            );

            // Both builders should work independently
            expect(builder1.getRegisteredProcessorNames()).toEqual(['shared-proc']);
            expect(builder2.getRegisteredProcessorNames()).toEqual(['shared-proc']);

            const pipeline1 = builder1.build();
            const pipeline2 = builder2.build();

            expect(pipeline1).not.toBe(pipeline2);
        });
    });
});
