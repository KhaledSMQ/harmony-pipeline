import { createPipelineContext, type PipelineContext } from '../Context';
import { MockLogger } from '../../../tests/setup';

describe('Context', () => {
    describe('createPipelineContext', () => {
        it('should create a context with provided metadata', () => {
            const metadata = {userId: '123', requestId: 'req-456'};
            const context = createPipelineContext(metadata);

            expect(context.metadata).toEqual(metadata);
            expect(context.metadata).toBe(metadata); // Should be the same reference but frozen
        });

        it('should generate a unique execution ID', () => {
            const context1 = createPipelineContext({});
            const context2 = createPipelineContext({});

            expect(context1.executionId).toBeDefined();
            expect(context2.executionId).toBeDefined();
            expect(context1.executionId).not.toBe(context2.executionId);
            expect(typeof context1.executionId).toBe('string');
            expect(context1.executionId.length).toBeGreaterThan(0);
        });

        it('should set startTime to current timestamp', () => {
            const before = Date.now();
            const context = createPipelineContext({});
            const after = Date.now();

            expect(context.startTime).toBeGreaterThanOrEqual(before);
            expect(context.startTime).toBeLessThanOrEqual(after);
        });

        it('should use provided logger', () => {
            const mockLogger = new MockLogger();
            const context = createPipelineContext({}, mockLogger);

            expect(context.logger).toBe(mockLogger);
        });

        it('should use NullLogger by default', () => {
            const context = createPipelineContext({});

            // Should not throw when calling logger methods
            expect(() => context.logger.debug('test')).not.toThrow();
            expect(() => context.logger.info('test')).not.toThrow();
            expect(() => context.logger.warn('test')).not.toThrow();
            expect(() => context.logger.error('test')).not.toThrow();
        });

        it('should freeze metadata to prevent mutations', () => {
            const metadata = {userId: '123'};
            const context = createPipelineContext(metadata);

            expect(() => {
                (context.metadata as any).userId = '456';
            }).toThrow();

            expect(() => {
                (context.metadata as any).newProperty = 'value';
            }).toThrow();
        });

        it('should freeze the context object itself', () => {
            const context = createPipelineContext({});

            expect(() => {
                (context as any).executionId = 'new-id';
            }).toThrow();

            expect(() => {
                (context as any).newProperty = 'value';
            }).toThrow();
        });
    });

    describe('PipelineContext warning system', () => {
        let context: PipelineContext;
        let mockLogger: MockLogger;

        beforeEach(() => {
            mockLogger = new MockLogger();
            context = createPipelineContext({test: true}, mockLogger);
        });

        it('should add warnings with timestamp', () => {
            const before = Date.now();
            context.addWarning('TEST_CODE', 'Test message', {extra: 'data'});
            const after = Date.now();

            const warnings = context._getWarnings();
            expect(warnings).toHaveLength(1);

            const warning = warnings[0];
            expect(warning?.code).toBe('TEST_CODE');
            expect(warning?.message).toBe('Test message');
            expect(warning?.details).toEqual({extra: 'data'});
            expect(warning?.timestamp).toBeGreaterThanOrEqual(before);
            expect(warning?.timestamp).toBeLessThanOrEqual(after);
        });

        it('should log warnings when added', () => {
            context.addWarning('TEST_CODE', 'Test message', {extra: 'data'});

            expect(mockLogger.warnMessages).toHaveLength(1);
            expect(mockLogger.warnMessages[0]?.message).toBe(
                'TEST_CODE: Test message',
            );
            expect(mockLogger.warnMessages[0]?.data).toEqual({extra: 'data'});
        });

        it('should handle warnings without details', () => {
            context.addWarning('SIMPLE_WARNING', 'Simple message');

            const warnings = context._getWarnings();
            expect(warnings).toHaveLength(1);
            expect(warnings[0]?.details).toBeUndefined();
        });

        it('should accumulate multiple warnings', () => {
            context.addWarning('WARNING_1', 'First warning');
            context.addWarning('WARNING_2', 'Second warning');
            context.addWarning('WARNING_3', 'Third warning');

            const warnings = context._getWarnings();
            expect(warnings).toHaveLength(3);
            expect(warnings.map(w => w.code)).toEqual([
                'WARNING_1',
                'WARNING_2',
                'WARNING_3',
            ]);
        });

        it('should return immutable warnings array', () => {
            context.addWarning('TEST', 'Test');
            const warnings = context._getWarnings();

            expect(() => {
                (warnings as any)[0].code = 'MODIFIED';
            }).toThrow();

            expect(() => {
                (warnings as any).push({
                    code: 'NEW',
                    message: 'New',
                    timestamp: Date.now(),
                });
            }).toThrow();
        });

        it('should maintain warning order', () => {
            const codes = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];

            codes.forEach(code => {
                context.addWarning(code, `Message for ${code}`);
            });

            const warnings = context._getWarnings();
            expect(warnings.map(w => w.code)).toEqual(codes);
        });

        it('should handle concurrent warning additions', async () => {
            const promises = Array.from({length: 10}, (_, i) =>
                Promise.resolve().then(() =>
                    context.addWarning(`CODE_${i}`, `Message ${i}`),
                ),
            );

            await Promise.all(promises);

            const warnings = context._getWarnings();
            expect(warnings).toHaveLength(10);

            const codes = warnings.map(w => w.code);
            expect(codes).toEqual(
                expect.arrayContaining(
                    Array.from({length: 10}, (_, i) => `CODE_${i}`),
                ),
            );
        });
    });

    describe('execution ID generation', () => {
        it('should use crypto.randomUUID when available', () => {
            const originalCrypto = global.crypto;

            // Mock crypto with randomUUID
            global.crypto = {
                randomUUID: jest.fn(() => 'mocked-uuid-12345'),
            } as any;

            const context = createPipelineContext({});
            expect(context.executionId).toBe('mocked-uuid-12345');

            // Restore original crypto
            global.crypto = originalCrypto;
        });

        it('should fallback to random string when crypto is not available', () => {
            const originalCrypto = global.crypto;

            // Remove crypto
            (global as any).crypto = undefined;

            const context = createPipelineContext({});
            expect(context.executionId).toBeDefined();
            expect(typeof context.executionId).toBe('string');
            expect(context.executionId.length).toBeGreaterThan(10);

            //@ts-ignore
            global.crypto = originalCrypto;
        });

        it('should generate different IDs for different contexts', () => {
            const ids = new Set();

            for (let i = 0; i < 100; i++) {
                const context = createPipelineContext({});
                ids.add(context.executionId);
            }

            expect(ids.size).toBe(100); // All should be unique
        });
    });
});
