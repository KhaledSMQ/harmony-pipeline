import { NullLogger } from '../Logger';

describe('Logger', () => {
    describe('NullLogger', () => {
        it('should provide all required methods', () => {
            expect(typeof NullLogger.debug).toBe('function');
            expect(typeof NullLogger.info).toBe('function');
            expect(typeof NullLogger.warn).toBe('function');
            expect(typeof NullLogger.error).toBe('function');
        });

        it('should not throw when calling any method', () => {
            expect(() => NullLogger.debug('test message')).not.toThrow();
            expect(() =>
                NullLogger.info('test message', {data: 'test'}),
            ).not.toThrow();
            expect(() => NullLogger.warn('test message')).not.toThrow();
            expect(() =>
                NullLogger.error('test message', new Error('test')),
            ).not.toThrow();
        });

        it('should return undefined for all methods', () => {
            expect(NullLogger.debug('test')).toBeUndefined();
            expect(NullLogger.info('test')).toBeUndefined();
            expect(NullLogger.warn('test')).toBeUndefined();
            expect(NullLogger.error('test')).toBeUndefined();
        });

        it('should be immutable', () => {
            expect(() => {
                NullLogger.debug = jest.fn();
            }).toThrow();
        });
    });
});
