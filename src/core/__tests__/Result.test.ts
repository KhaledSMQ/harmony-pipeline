import {
    isStageFailure,
    isStageSuccess,
    type PipelineResult,
    type StageFailure,
    type StageOutcome,
    type StageSuccess,
} from '../Result';
import { type PipelineWarning } from '../Context';

describe('Result', () => {
    describe('StageSuccess', () => {
        it('should create a valid success outcome', () => {
            const warnings: PipelineWarning[] = [
                {
                    code: 'TEST_WARNING',
                    message: 'Test warning',
                    timestamp: Date.now(),
                },
            ];

            const success: StageSuccess<string> = {
                kind: 'ok',
                stageName: 'test-stage',
                processorName: 'test-processor',
                output: 'processed data',
                warnings,
                elapsed: 150,
            };

            expect(success.kind).toBe('ok');
            expect(success.stageName).toBe('test-stage');
            expect(success.processorName).toBe('test-processor');
            expect(success.output).toBe('processed data');
            expect(success.warnings).toBe(warnings);
            expect(success.elapsed).toBe(150);
        });

        it('should handle different output types', () => {
            const numericSuccess: StageSuccess<number> = {
                kind: 'ok',
                stageName: 'numeric-stage',
                processorName: 'numeric-processor',
                output: 42,
                warnings: [],
                elapsed: 100,
            };

            const objectSuccess: StageSuccess<{ id: string; value: number }> = {
                kind: 'ok',
                stageName: 'object-stage',
                processorName: 'object-processor',
                output: {id: 'test', value: 123},
                warnings: [],
                elapsed: 200,
            };

            expect(numericSuccess.output).toBe(42);
            expect(objectSuccess.output).toEqual({id: 'test', value: 123});
        });
    });

    describe('StageFailure', () => {
        it('should create a valid failure outcome', () => {
            const error = new Error('Processing failed');
            const warnings: PipelineWarning[] = [
                {
                    code: 'PRE_FAILURE_WARNING',
                    message: 'Warning before failure',
                    timestamp: Date.now() - 1000,
                },
            ];

            const failure: StageFailure = {
                kind: 'err',
                stageName: 'failing-stage',
                processorName: 'failing-processor',
                error,
                warnings,
                elapsed: 75,
            };

            expect(failure.kind).toBe('err');
            expect(failure.stageName).toBe('failing-stage');
            expect(failure.processorName).toBe('failing-processor');
            expect(failure.error).toBe(error);
            expect(failure.warnings).toBe(warnings);
            expect(failure.elapsed).toBe(75);
        });

        it('should handle different error types', () => {
            const customError = new Error('Custom error message');
            customError.name = 'CustomError';

            const failure: StageFailure = {
                kind: 'err',
                stageName: 'error-stage',
                processorName: 'error-processor',
                error: customError,
                warnings: [],
                elapsed: 50,
            };

            expect(failure.error.name).toBe('CustomError');
            expect(failure.error.message).toBe('Custom error message');
        });
    });

    describe('PipelineResult', () => {
        it('should create a successful pipeline result', () => {
            const stageOutcomes: StageOutcome[] = [
                {
                    kind: 'ok',
                    stageName: 'stage1',
                    processorName: 'processor1',
                    output: 'intermediate',
                    warnings: [],
                    elapsed: 100,
                },
                {
                    kind: 'ok',
                    stageName: 'stage2',
                    processorName: 'processor2',
                    output: 'final',
                    warnings: [],
                    elapsed: 150,
                },
            ];

            const result: PipelineResult<string> = {
                success: true,
                output: 'final',
                errors: [],
                warnings: [],
                stages: stageOutcomes,
                executionTime: 300,
            };

            expect(result.success).toBe(true);
            expect(result.output).toBe('final');
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
            expect(result.stages).toBe(stageOutcomes);
            expect(result.executionTime).toBe(300);
        });

        it('should create a failed pipeline result', () => {
            const error1 = new Error('First error');
            const error2 = new Error('Second error');
            const warning: PipelineWarning = {
                code: 'PIPELINE_WARNING',
                message: 'Pipeline warning',
                timestamp: Date.now(),
            };

            const stageOutcomes: StageOutcome[] = [
                {
                    kind: 'ok',
                    stageName: 'stage1',
                    processorName: 'processor1',
                    output: 'success',
                    warnings: [],
                    elapsed: 100,
                },
                {
                    kind: 'err',
                    stageName: 'stage2',
                    processorName: 'processor2',
                    error: error1,
                    warnings: [warning],
                    elapsed: 75,
                },
            ];

            const result: PipelineResult = {
                success: false,
                output: undefined,
                errors: [error1, error2],
                warnings: [warning],
                stages: stageOutcomes,
                executionTime: 250,
            };

            expect(result.success).toBe(false);
            expect(result.output).toBeUndefined();
            expect(result.errors).toHaveLength(2);
            expect(result.errors).toContain(error1);
            expect(result.errors).toContain(error2);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toBe(warning);
        });

        it('should handle mixed success and failure outcomes', () => {
            const warning1: PipelineWarning = {
                code: 'WARN_1',
                message: 'First warning',
                timestamp: Date.now() - 2000,
            };

            const warning2: PipelineWarning = {
                code: 'WARN_2',
                message: 'Second warning',
                timestamp: Date.now() - 1000,
            };

            const stageOutcomes: StageOutcome[] = [
                {
                    kind: 'ok',
                    stageName: 'preprocessing',
                    processorName: 'validator',
                    output: 'validated',
                    warnings: [warning1],
                    elapsed: 120,
                },
                {
                    kind: 'err',
                    stageName: 'processing',
                    processorName: 'transformer',
                    error: new Error('Transformation failed'),
                    warnings: [warning2],
                    elapsed: 80,
                },
                {
                    kind: 'ok',
                    stageName: 'cleanup',
                    processorName: 'cleaner',
                    output: 'cleaned',
                    warnings: [],
                    elapsed: 50,
                },
            ];

            const allWarnings = [warning1, warning2];
            const result: PipelineResult = {
                success: false,
                output: undefined,
                errors: [new Error('Transformation failed')],
                warnings: allWarnings,
                stages: stageOutcomes,
                executionTime: 300,
            };

            expect(result.stages).toHaveLength(3);
            expect(result.warnings).toHaveLength(2);
            expect(result.stages.filter(s => s.kind === 'ok')).toHaveLength(2);
            expect(result.stages.filter(s => s.kind === 'err')).toHaveLength(1);
        });
    });

    describe('type guards', () => {
        describe('isStageSuccess', () => {
            it('should correctly identify success outcomes', () => {
                const success: StageSuccess = {
                    kind: 'ok',
                    stageName: 'test-stage',
                    processorName: 'test-processor',
                    output: 'test-output',
                    warnings: [],
                    elapsed: 100,
                };

                expect(isStageSuccess(success)).toBe(true);

                // Type narrowing should work
                if (isStageSuccess(success)) {
                    expect(success.output).toBe('test-output');
                    // Should not have error property
                    expect((success as any).error).toBeUndefined();
                }
            });

            it('should correctly reject failure outcomes', () => {
                const failure: StageFailure = {
                    kind: 'err',
                    stageName: 'test-stage',
                    processorName: 'test-processor',
                    error: new Error('Test error'),
                    warnings: [],
                    elapsed: 50,
                };

                expect(isStageSuccess(failure)).toBe(false);
            });

            it('should work with different output types', () => {
                const numericSuccess: StageSuccess<number> = {
                    kind: 'ok',
                    stageName: 'numeric-stage',
                    processorName: 'numeric-processor',
                    output: 42,
                    warnings: [],
                    elapsed: 100,
                };

                const objectSuccess: StageSuccess<{ value: string }> = {
                    kind: 'ok',
                    stageName: 'object-stage',
                    processorName: 'object-processor',
                    output: {value: 'test'},
                    warnings: [],
                    elapsed: 100,
                };

                expect(isStageSuccess(numericSuccess)).toBe(true);
                expect(isStageSuccess(objectSuccess)).toBe(true);

                if (isStageSuccess(numericSuccess)) {
                    expect(typeof numericSuccess.output).toBe('number');
                }

                if (isStageSuccess(objectSuccess)) {
                    expect(typeof objectSuccess.output).toBe('object');
                    expect(objectSuccess.output.value).toBe('test');
                }
            });
        });

        describe('isStageFailure', () => {
            it('should correctly identify failure outcomes', () => {
                const failure: StageFailure = {
                    kind: 'err',
                    stageName: 'test-stage',
                    processorName: 'test-processor',
                    error: new Error('Test error'),
                    warnings: [],
                    elapsed: 50,
                };

                expect(isStageFailure(failure)).toBe(true);

                // Type narrowing should work
                if (isStageFailure(failure)) {
                    expect(failure.error).toBeInstanceOf(Error);
                    expect(failure.error.message).toBe('Test error');
                    // Should not have output property
                    expect((failure as any).output).toBeUndefined();
                }
            });

            it('should correctly reject success outcomes', () => {
                const success: StageSuccess = {
                    kind: 'ok',
                    stageName: 'test-stage',
                    processorName: 'test-processor',
                    output: 'test-output',
                    warnings: [],
                    elapsed: 100,
                };

                expect(isStageFailure(success)).toBe(false);
            });
        });

        describe('type guard usage in filtering', () => {
            it('should work correctly with array filtering', () => {
                const outcomes: StageOutcome[] = [
                    {
                        kind: 'ok',
                        stageName: 'stage1',
                        processorName: 'proc1',
                        output: 'output1',
                        warnings: [],
                        elapsed: 100,
                    },
                    {
                        kind: 'err',
                        stageName: 'stage2',
                        processorName: 'proc2',
                        error: new Error('Error 1'),
                        warnings: [],
                        elapsed: 50,
                    },
                    {
                        kind: 'ok',
                        stageName: 'stage3',
                        processorName: 'proc3',
                        output: 'output3',
                        warnings: [],
                        elapsed: 75,
                    },
                    {
                        kind: 'err',
                        stageName: 'stage4',
                        processorName: 'proc4',
                        error: new Error('Error 2'),
                        warnings: [],
                        elapsed: 25,
                    },
                ];

                const successes = outcomes.filter(isStageSuccess);
                const failures = outcomes.filter(isStageFailure);

                expect(successes).toHaveLength(2);
                expect(failures).toHaveLength(2);

                // Type narrowing should work in filtered arrays
                successes.forEach(success => {
                    expect(success.kind).toBe('ok');
                    expect(success.output).toBeDefined();
                });

                failures.forEach(failure => {
                    expect(failure.kind).toBe('err');
                    expect(failure.error).toBeInstanceOf(Error);
                });
            });

            it('should support chaining with map operations', () => {
                const outcomes: StageOutcome[] = [
                    {
                        kind: 'ok',
                        stageName: 'stage1',
                        processorName: 'proc1',
                        output: 'result1',
                        warnings: [],
                        elapsed: 100,
                    },
                    {
                        kind: 'err',
                        stageName: 'stage2',
                        processorName: 'proc2',
                        error: new Error('Failed'),
                        warnings: [],
                        elapsed: 50,
                    },
                    {
                        kind: 'ok',
                        stageName: 'stage3',
                        processorName: 'proc3',
                        output: 'result3',
                        warnings: [],
                        elapsed: 75,
                    },
                ];

                const successOutputs = outcomes
                    .filter(isStageSuccess)
                    .map(success => success.output);

                const errorMessages = outcomes
                    .filter(isStageFailure)
                    .map(failure => failure.error.message);

                expect(successOutputs).toEqual(['result1', 'result3']);
                expect(errorMessages).toEqual(['Failed']);
            });
        });
    });
});
