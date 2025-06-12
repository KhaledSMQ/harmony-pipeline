import { createExecutionOptions, type ExecutionOptions, type ResolvedExecutionOptions, } from '../ExecutionOptions';
import { MockLogger } from '../../../tests/setup';

describe('ExecutionOptions', () => {
    describe('createExecutionOptions', () => {
        it('should return default options when no options provided', () => {
            const options = createExecutionOptions();

            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(1);
            expect(options.signal).toBeUndefined();
            expect(options.timeoutMs).toBeUndefined();
            expect(options.logger).toBeUndefined();
        });

        it('should return default options when empty object provided', () => {
            const options = createExecutionOptions({});

            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(1);
            expect(options.signal).toBeUndefined();
            expect(options.timeoutMs).toBeUndefined();
            expect(options.logger).toBeUndefined();
        });

        it('should override defaults with provided values', () => {
            const mockLogger = new MockLogger();
            const controller = new AbortController();

            const options = createExecutionOptions({
                stopOnError: false,
                concurrency: 5,
                signal: controller.signal,
                timeoutMs: 30000,
                logger: mockLogger,
            });

            expect(options.stopOnError).toBe(false);
            expect(options.concurrency).toBe(5);
            expect(options.signal).toBe(controller.signal);
            expect(options.timeoutMs).toBe(30000);
            expect(options.logger).toBe(mockLogger);
        });

        it('should partially override defaults', () => {
            const options = createExecutionOptions({
                stopOnError: false,
                concurrency: 3,
                // signal, timeoutMs, and logger remain undefined
            });

            expect(options.stopOnError).toBe(false);
            expect(options.concurrency).toBe(3);
            expect(options.signal).toBeUndefined();
            expect(options.timeoutMs).toBeUndefined();
            expect(options.logger).toBeUndefined();
        });

        it('should handle explicit undefined values', () => {
            const options = createExecutionOptions({
                stopOnError: undefined,
                concurrency: undefined,
                signal: undefined,
                timeoutMs: undefined,
                logger: undefined,
            });

            expect(options.stopOnError).toBe(true); // Should use default
            expect(options.concurrency).toBe(1); // Should use default
            expect(options.signal).toBeUndefined();
            expect(options.timeoutMs).toBeUndefined();
            expect(options.logger).toBeUndefined();
        });

        it('should handle falsy but defined values correctly', () => {
            const options = createExecutionOptions({
                stopOnError: false,
                concurrency: 0,
                timeoutMs: 0,
            });

            expect(options.stopOnError).toBe(false);
            expect(options.concurrency).toBe(0);
            expect(options.timeoutMs).toBe(0);
        });

        it('should handle null values gracefully', () => {
            const options = createExecutionOptions({
                stopOnError: null as any,
                concurrency: null as any,
                signal: null as any,
                timeoutMs: null as any,
                logger: null as any,
            });

            // null should be treated as falsy and use defaults for required fields
            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(1);
            expect(options.signal).toBeNull();
            expect(options.timeoutMs).toBeNull();
            expect(options.logger).toBeNull();
        });

        it('should preserve object references', () => {
            const mockLogger = new MockLogger();
            const controller = new AbortController();

            const options = createExecutionOptions({
                logger: mockLogger,
                signal: controller.signal,
            });

            expect(options.logger).toBe(mockLogger); // Same reference
            expect(options.signal).toBe(controller.signal); // Same reference
        });

        it('should not mutate input options', () => {
            const inputOptions: ExecutionOptions = {
                stopOnError: false,
                concurrency: 5,
                timeoutMs: 1000,
            };

            const originalInput = {...inputOptions};
            const result = createExecutionOptions(inputOptions);

            expect(inputOptions).toEqual(originalInput); // Input unchanged
            expect(result).not.toBe(inputOptions); // Different object
        });

        it('should create new object instances on each call', () => {
            const options1 = createExecutionOptions({});
            const options2 = createExecutionOptions({});

            expect(options1).not.toBe(options2); // Different objects
            expect(options1).toEqual(options2); // Same values
        });
    });

    describe('ExecutionOptions interface', () => {
        it('should support all valid option combinations', () => {
            // Test case 1: Minimal options
            const minimal: ExecutionOptions = {};
            expect(minimal).toBeDefined();

            // Test case 2: All options defined
            const complete: ExecutionOptions = {
                stopOnError: true,
                concurrency: 2,
                signal: new AbortController().signal,
                timeoutMs: 5000,
                logger: new MockLogger(),
            };
            expect(complete).toBeDefined();

            // Test case 3: Mixed options
            const mixed: ExecutionOptions = {
                stopOnError: false,
                timeoutMs: 10000,
                // Other options remain undefined
            };
            expect(mixed).toBeDefined();
        });

        it('should maintain readonly property immutability', () => {
            const options: ExecutionOptions = {
                stopOnError: true,
                concurrency: 1,
                timeoutMs: 5000,
            };

            // These should cause TypeScript compilation errors if uncommented:
            // options.stopOnError = false;
            // options.concurrency = 2;
            // options.timeoutMs = 10000;

            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(1);
            expect(options.timeoutMs).toBe(5000);
        });

        it('should support optional property patterns', () => {
            // All properties should be optional
            const options1: ExecutionOptions = {stopOnError: true};
            const options2: ExecutionOptions = {concurrency: 5};
            const options3: ExecutionOptions = {timeoutMs: 1000};
            const options4: ExecutionOptions = {
                signal: new AbortController().signal,
            };
            const options5: ExecutionOptions = {logger: new MockLogger()};

            expect(options1.stopOnError).toBe(true);
            expect(options2.concurrency).toBe(5);
            expect(options3.timeoutMs).toBe(1000);
            expect(options4.signal).toBeDefined();
            expect(options5.logger).toBeInstanceOf(MockLogger);
        });
    });

    describe('option validation', () => {
        it('should handle valid concurrency values', () => {
            const validValues = [1, 2, 5, 10, 100];

            validValues.forEach(concurrency => {
                const options = createExecutionOptions({concurrency});
                expect(options.concurrency).toBe(concurrency);
            });
        });

        it('should handle edge case concurrency values', () => {
            const edgeCases = [
                0,
                -1,
                Number.MAX_SAFE_INTEGER,
                Number.MIN_SAFE_INTEGER,
            ];

            edgeCases.forEach(concurrency => {
                const options = createExecutionOptions({concurrency});
                expect(options.concurrency).toBe(concurrency);
            });
        });

        it('should handle valid timeout values', () => {
            const validTimeouts = [0, 1000, 5000, 30000, 300000];

            validTimeouts.forEach(timeoutMs => {
                const options = createExecutionOptions({timeoutMs});
                expect(options.timeoutMs).toBe(timeoutMs);
            });
        });

        it('should handle edge case timeout values', () => {
            const edgeCases = [0, -1, Number.MAX_SAFE_INTEGER, Infinity, -Infinity];

            edgeCases.forEach(timeoutMs => {
                const options = createExecutionOptions({timeoutMs});
                expect(options.timeoutMs).toBe(timeoutMs);
            });
        });

        it('should handle AbortSignal correctly', () => {
            const controller = new AbortController();
            const options = createExecutionOptions({signal: controller.signal});

            expect(options.signal).toBe(controller.signal);
            expect(options.signal?.aborted).toBe(false);

            controller.abort();
            expect(options.signal?.aborted).toBe(true);
        });

        it('should handle pre-aborted signals', () => {
            const controller = new AbortController();
            const reason = new Error('Already aborted');
            controller.abort(reason);

            const options = createExecutionOptions({signal: controller.signal});

            expect(options.signal?.aborted).toBe(true);
            expect(options.signal?.reason).toBe(reason);
        });

        it('should handle different logger implementations', () => {
            const mockLogger = new MockLogger();
            const consoleLogger = {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            };

            const mockOptions = createExecutionOptions({logger: mockLogger});
            const consoleOptions = createExecutionOptions({logger: consoleLogger});

            expect(mockOptions.logger).toBe(mockLogger);
            expect(consoleOptions.logger).toBe(consoleLogger);
        });

        it('should handle custom logger with additional methods', () => {
            const customLogger = {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                trace: jest.fn(), // Additional method
                log: jest.fn(), // Additional method
            };

            const options = createExecutionOptions({logger: customLogger});
            expect(options.logger).toBe(customLogger);
        });
    });

    describe('boolean option handling', () => {
        it('should handle true/false for stopOnError', () => {
            const trueOptions = createExecutionOptions({stopOnError: true});
            const falseOptions = createExecutionOptions({stopOnError: false});

            expect(trueOptions.stopOnError).toBe(true);
            expect(falseOptions.stopOnError).toBe(false);
        });

        it('should handle truthy/falsy values for stopOnError', () => {
            const truthyOptions = createExecutionOptions({
                stopOnError: 'yes' as any,
            });
            const falsyOptions = createExecutionOptions({stopOnError: '' as any});

            expect(truthyOptions.stopOnError).toBe('yes');
            expect(falsyOptions.stopOnError).toBe('');
        });

        it('should handle boolean coercion scenarios', () => {
            const testCases = [
                {value: 1, expected: 1},
                {value: 0, expected: 0},
                {value: 'true', expected: 'true'},
                {value: 'false', expected: 'false'},
                {value: [], expected: []},
                {value: {}, expected: {}},
            ];

            testCases.forEach(({value, expected}) => {
                const options = createExecutionOptions({stopOnError: value as any});
                expect(options.stopOnError).toStrictEqual(expected);
            });
        });
    });

    describe('edge cases', () => {
        it('should handle negative concurrency values', () => {
            const options = createExecutionOptions({concurrency: -1});
            expect(options.concurrency).toBe(-1); // Library doesn't validate, up to executor
        });

        it('should handle very large concurrency values', () => {
            const options = createExecutionOptions({
                concurrency: Number.MAX_SAFE_INTEGER,
            });
            expect(options.concurrency).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('should handle floating point concurrency values', () => {
            const options = createExecutionOptions({concurrency: 3.14});
            expect(options.concurrency).toBe(3.14);
        });

        it('should handle NaN concurrency values', () => {
            const options = createExecutionOptions({concurrency: NaN});
            expect(options.concurrency).toBe(NaN);
        });

        it('should handle negative timeout values', () => {
            const options = createExecutionOptions({timeoutMs: -1000});
            expect(options.timeoutMs).toBe(-1000); // Library doesn't validate, up to executor
        });

        it('should handle very large timeout values', () => {
            const options = createExecutionOptions({
                timeoutMs: Number.MAX_SAFE_INTEGER,
            });
            expect(options.timeoutMs).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('should handle Infinity timeout values', () => {
            const options = createExecutionOptions({timeoutMs: Infinity});
            expect(options.timeoutMs).toBe(Infinity);
        });

        it('should handle NaN timeout values', () => {
            const options = createExecutionOptions({timeoutMs: NaN});
            expect(options.timeoutMs).toBe(NaN);
        });

        it('should handle circular object references in options', () => {
            const circularObj: any = {name: 'circular'};
            circularObj.self = circularObj;

            // Should not throw, just pass through
            expect(() =>
                createExecutionOptions({
                    logger: circularObj,
                }),
            ).not.toThrow();
        });

        it('should handle frozen input objects', () => {
            const frozenOptions = Object.freeze({
                stopOnError: false,
                concurrency: 3,
            });

            expect(() => createExecutionOptions(frozenOptions)).not.toThrow();
            const result = createExecutionOptions(frozenOptions);
            expect(result.stopOnError).toBe(false);
            expect(result.concurrency).toBe(3);
        });
    });

    describe('type safety', () => {
        it('should enforce readonly properties at compile time', () => {
            const options: ExecutionOptions = {
                stopOnError: true,
                concurrency: 2,
                timeoutMs: 5000,
            };

            // These should be readonly and cause TypeScript errors if uncommented:
            // options.stopOnError = false;
            // options.concurrency = 5;
            // options.timeoutMs = 10000;

            // Verify the values are as expected
            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(2);
            expect(options.timeoutMs).toBe(5000);
        });

        it('should support optional properties', () => {
            // All properties should be optional
            const emptyOptions: ExecutionOptions = {};
            const partialOptions: ExecutionOptions = {
                stopOnError: false,
            };
            const anotherPartialOptions: ExecutionOptions = {
                concurrency: 3,
                timeoutMs: 15000,
            };

            expect(emptyOptions).toBeDefined();
            expect(partialOptions.stopOnError).toBe(false);
            expect(anotherPartialOptions.concurrency).toBe(3);
            expect(anotherPartialOptions.timeoutMs).toBe(15000);
        });

        it('should maintain type compatibility with function parameters', () => {
            const testFunction = (options: ExecutionOptions) => {
                return createExecutionOptions(options);
            };

            // These should all be valid
            expect(() => testFunction({})).not.toThrow();
            expect(() => testFunction({stopOnError: true})).not.toThrow();
            expect(() =>
                testFunction({concurrency: 5, timeoutMs: 1000}),
            ).not.toThrow();
        });

        it('should work with interface inheritance', () => {
            interface ExtendedOptions extends ExecutionOptions {
                customProperty?: string;
            }

            const extendedOptions: ExtendedOptions = {
                stopOnError: false,
                concurrency: 3,
                customProperty: 'custom value',
            };

            // Should work with base function
            const result = createExecutionOptions(extendedOptions);
            expect(result.stopOnError).toBe(false);
            expect(result.concurrency).toBe(3);
            // Custom property should not be in result (not part of ExecutionOptions)
            expect((result as any).customProperty).toBeUndefined();
        });

        it('should support ResolvedExecutionOptions type', () => {
            const resolved: ResolvedExecutionOptions = createExecutionOptions({
                stopOnError: false,
                concurrency: 3,
                timeoutMs: 5000,
            });

            // These properties are guaranteed to be defined
            expect(typeof resolved.stopOnError).toBe('boolean');
            expect(typeof resolved.concurrency).toBe('number');

            // These can be undefined
            expect(resolved.signal).toBeUndefined();
            expect(resolved.timeoutMs).toBe(5000);
            expect(resolved.logger).toBeUndefined();
        });
    });

    describe('integration scenarios', () => {
        it('should work with realistic pipeline configurations', () => {
            // Fast processing scenario
            const fastOptions = createExecutionOptions({
                stopOnError: true,
                concurrency: 1,
                timeoutMs: 1000,
            });

            expect(fastOptions.stopOnError).toBe(true);
            expect(fastOptions.concurrency).toBe(1);
            expect(fastOptions.timeoutMs).toBe(1000);

            // Batch processing scenario
            const batchOptions = createExecutionOptions({
                stopOnError: false,
                concurrency: 5,
                timeoutMs: 300000, // 5 minutes
                logger: new MockLogger(),
            });

            expect(batchOptions.stopOnError).toBe(false);
            expect(batchOptions.concurrency).toBe(5);
            expect(batchOptions.timeoutMs).toBe(300000);
            expect(batchOptions.logger).toBeInstanceOf(MockLogger);

            // Real-time processing scenario
            const realtimeOptions = createExecutionOptions({
                stopOnError: true,
                concurrency: 10,
                timeoutMs: 500,
                signal: new AbortController().signal,
            });

            expect(realtimeOptions.stopOnError).toBe(true);
            expect(realtimeOptions.concurrency).toBe(10);
            expect(realtimeOptions.timeoutMs).toBe(500);
            expect(realtimeOptions.signal).toBeDefined();
        });

        it('should support dynamic option creation', () => {
            const createOptionsForEnvironment = (env: 'dev' | 'staging' | 'prod') => {
                const baseOptions: ExecutionOptions = {
                    logger: new MockLogger(),
                };

                switch (env) {
                    case 'dev':
                        return createExecutionOptions({
                            ...baseOptions,
                            stopOnError: false,
                            concurrency: 1,
                            timeoutMs: 10000,
                        });
                    case 'staging':
                        return createExecutionOptions({
                            ...baseOptions,
                            stopOnError: true,
                            concurrency: 3,
                            timeoutMs: 30000,
                        });
                    case 'prod':
                        return createExecutionOptions({
                            ...baseOptions,
                            stopOnError: true,
                            concurrency: 5,
                            timeoutMs: 60000,
                        });
                }
            };

            const devOptions = createOptionsForEnvironment('dev');
            const stagingOptions = createOptionsForEnvironment('staging');
            const prodOptions = createOptionsForEnvironment('prod');

            expect(devOptions.stopOnError).toBe(false);
            expect(devOptions.concurrency).toBe(1);
            expect(devOptions.timeoutMs).toBe(10000);

            expect(stagingOptions.stopOnError).toBe(true);
            expect(stagingOptions.concurrency).toBe(3);
            expect(stagingOptions.timeoutMs).toBe(30000);

            expect(prodOptions.stopOnError).toBe(true);
            expect(prodOptions.concurrency).toBe(5);
            expect(prodOptions.timeoutMs).toBe(60000);
        });

        it('should support conditional option building', () => {
            const buildOptions = (config: {
                enableConcurrency: boolean;
                enableTimeout: boolean;
                enableLogging: boolean;
                isProduction: boolean;
            }) => {
                // should be type of ExecutionOptions
                const options: any = {
                    stopOnError: config.isProduction,
                };

                if (config.enableConcurrency) {
                    options.concurrency = config.isProduction ? 5 : 2;
                }

                if (config.enableTimeout) {
                    options.timeoutMs = config.isProduction ? 30000 : 10000;
                }

                if (config.enableLogging) {
                    options.logger = new MockLogger();
                }

                return createExecutionOptions(options);
            };

            const devConfig = {
                enableConcurrency: true,
                enableTimeout: false,
                enableLogging: true,
                isProduction: false,
            };

            const prodConfig = {
                enableConcurrency: true,
                enableTimeout: true,
                enableLogging: false,
                isProduction: true,
            };

            const devOptions = buildOptions(devConfig);
            const prodOptions = buildOptions(prodConfig);

            expect(devOptions.stopOnError).toBe(false);
            expect(devOptions.concurrency).toBe(2);
            expect(devOptions.timeoutMs).toBeUndefined();
            expect(devOptions.logger).toBeInstanceOf(MockLogger);

            expect(prodOptions.stopOnError).toBe(true);
            expect(prodOptions.concurrency).toBe(5);
            expect(prodOptions.timeoutMs).toBe(30000);
            expect(prodOptions.logger).toBeUndefined();
        });

        it('should handle option merging scenarios', () => {
            const baseOptions: ExecutionOptions = {
                stopOnError: true,
                concurrency: 1,
            };

            const userOptions: ExecutionOptions = {
                concurrency: 3,
                timeoutMs: 5000,
            };

            const mergedOptions = createExecutionOptions({
                ...baseOptions,
                ...userOptions,
            });

            expect(mergedOptions.stopOnError).toBe(true); // From base
            expect(mergedOptions.concurrency).toBe(3); // Overridden by user
            expect(mergedOptions.timeoutMs).toBe(5000); // From user
            expect(mergedOptions.signal).toBeUndefined(); // Not in either
            expect(mergedOptions.logger).toBeUndefined(); // Not in either
        });

        it('should support factory pattern for option creation', () => {
            class ExecutionOptionsFactory {
                static development(): ResolvedExecutionOptions {
                    return createExecutionOptions({
                        stopOnError: false,
                        concurrency: 1,
                        timeoutMs: 10000,
                        logger: new MockLogger(),
                    });
                }

                static production(): ResolvedExecutionOptions {
                    return createExecutionOptions({
                        stopOnError: true,
                        concurrency: 5,
                        timeoutMs: 30000,
                    });
                }

                static testing(): ResolvedExecutionOptions {
                    return createExecutionOptions({
                        stopOnError: true,
                        concurrency: 1,
                        timeoutMs: 5000,
                        logger: new MockLogger(),
                    });
                }

                static custom(overrides: ExecutionOptions): ResolvedExecutionOptions {
                    const baseOptions = this.development();
                    return createExecutionOptions({
                        ...baseOptions,
                        ...overrides,
                    });
                }
            }

            const devOptions = ExecutionOptionsFactory.development();
            const prodOptions = ExecutionOptionsFactory.production();
            const testOptions = ExecutionOptionsFactory.testing();
            const customOptions = ExecutionOptionsFactory.custom({
                concurrency: 10,
                timeoutMs: 60000,
            });

            expect(devOptions.stopOnError).toBe(false);
            expect(prodOptions.stopOnError).toBe(true);
            expect(testOptions.logger).toBeInstanceOf(MockLogger);
            expect(customOptions.concurrency).toBe(10);
            expect(customOptions.timeoutMs).toBe(60000);
        });
    });

    describe('performance and memory considerations', () => {
        it('should not create unnecessary object references', () => {
            const options1 = createExecutionOptions({});
            const options2 = createExecutionOptions({});

            // Should be different objects
            expect(options1).not.toBe(options2);

            // But should have same structure
            expect(options1).toEqual(options2);
        });

        it('should handle large numbers of option objects', () => {
            const optionsArray: ResolvedExecutionOptions[] = [];

            // Create many option objects
            for (let i = 0; i < 1000; i++) {
                optionsArray.push(
                    createExecutionOptions({
                        stopOnError: i % 2 === 0,
                        concurrency: (i % 10) + 1,
                        timeoutMs: i * 100,
                    }),
                );
            }

            expect(optionsArray).toHaveLength(1000);
            expect(optionsArray[0]?.stopOnError).toBe(true);
            expect(optionsArray[1]?.stopOnError).toBe(false);
            expect(optionsArray[999]?.concurrency).toBe(10);
        });

        it('should maintain consistent behavior across many calls', () => {
            const sameInput = {
                stopOnError: false,
                concurrency: 3,
                timeoutMs: 5000,
            };

            const fakeResult = createExecutionOptions(sameInput);
            const results = Array.from({length: 100}, () =>
                createExecutionOptions(sameInput),
            );

            // All results should be equal
            results.forEach((result, i) => {
                expect(result).toEqual(fakeResult);
                // expect(result).not.toStrictEqual(fakeResult); // But different objects
            });
        });
    });

    describe('error conditions and robustness', () => {
        it('should handle function objects as options', () => {
            const functionObj = () => 'test';
            (functionObj as any).stopOnError = true;
            (functionObj as any).concurrency = 2;

            const options = createExecutionOptions(functionObj as any);
            expect(options.stopOnError).toBe(true);
            expect(options.concurrency).toBe(2);
        });

        it('should handle array-like objects as options', () => {
            const arrayLike = {
                0: 'first',
                1: 'second',
                length: 2,
                stopOnError: false,
                concurrency: 4,
            };

            const options = createExecutionOptions(arrayLike as any);
            expect(options.stopOnError).toBe(false);
            expect(options.concurrency).toBe(4);
        });

        it('should handle prototype pollution attempts gracefully', () => {
            const maliciousOptions = {
                stopOnError: true,
                __proto__: {polluted: true},
                constructor: {prototype: {polluted: true}},
            };

            const options = createExecutionOptions(maliciousOptions as any);
            expect(options.stopOnError).toBe(true);
            // Should not have polluted properties
            expect((options as any).polluted).toBeUndefined();
        });
    });
});
