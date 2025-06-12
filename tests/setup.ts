/**
 * Global test setup and utilities for the harmony-pipeline test suite.
 */

import { type Logger } from '../src';

/**
 * Mock logger that captures log messages for testing.
 */
export class MockLogger implements Logger {
    public readonly debugMessages: Array<{ message: string; data?: unknown }> = [];
    public readonly infoMessages: Array<{ message: string; data?: unknown }> = [];
    public readonly warnMessages: Array<{ message: string; data?: unknown }> = [];
    public readonly errorMessages: Array<{ message: string; data?: unknown }> = [];

    debug(message: string, data?: unknown): void {
        this.debugMessages.push({message, data});
    }

    info(message: string, data?: unknown): void {
        this.infoMessages.push({message, data});
    }

    warn(message: string, data?: unknown): void {
        this.warnMessages.push({message, data});
    }

    error(message: string, data?: unknown): void {
        this.errorMessages.push({message, data});
    }

    clear(): void {
        this.debugMessages.length = 0;
        this.infoMessages.length = 0;
        this.warnMessages.length = 0;
        this.errorMessages.length = 0;
    }

    getAllMessages(): Array<{ level: string; message: string; data?: unknown }> {
        return [
            ...this.debugMessages.map(m => ({level: 'debug', ...m})),
            ...this.infoMessages.map(m => ({level: 'info', ...m})),
            ...this.warnMessages.map(m => ({level: 'warn', ...m})),
            ...this.errorMessages.map(m => ({level: 'error', ...m})),
        ];
    }
}

/**
 * Creates a promise that resolves after the specified delay.
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates an AbortController that will abort after the specified delay.
 */
export function createTimeoutController(timeoutMs: number): AbortController {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    return controller;
}

/**
 * Waits for a condition to be true with a timeout.
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 10
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await delay(intervalMs);
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Test data interfaces and factories.
 */
export interface TestUser {
    id: string;
    name: string;
    email: string;
    age?: number;
}

export interface TestMetadata {
    correlationId: string;
    environment: 'test' | 'dev' | 'prod';
    features: string[];
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        ...overrides,
    };
}

export function createTestMetadata(overrides: Partial<TestMetadata> = {}): TestMetadata {
    return {
        correlationId: 'test-correlation-id',
        environment: 'test',
        features: ['feature-a', 'feature-b'],
        ...overrides,
    };
}

/**
 * Custom Jest matchers for pipeline testing.
 */
declare global {
    namespace jest {
        interface Matchers<R> {
            toBeSuccessfulPipelineResult(): R;

            toBeFailedPipelineResult(): R;

            toHaveWarning(code: string): R;

            toHaveError(message: string): R;
        }
    }
}

expect.extend({
    toBeSuccessfulPipelineResult(received) {
        const pass = received && received.success === true && received.output !== undefined;

        if (pass) {
            return {
                message: () => `expected pipeline result not to be successful`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected pipeline result to be successful, but got: ${JSON.stringify(received, null, 2)}`,
                pass: false,
            };
        }
    },

    toBeFailedPipelineResult(received) {
        const pass = received && received.success === false && received.errors.length > 0;

        if (pass) {
            return {
                message: () => `expected pipeline result not to be failed`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected pipeline result to be failed, but got: ${JSON.stringify(received, null, 2)}`,
                pass: false,
            };
        }
    },

    toHaveWarning(received, code: string) {
        const hasWarning = received.warnings?.some((w: any) => w.code === code) ?? false;

        if (hasWarning) {
            return {
                message: () => `expected not to have warning with code "${code}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected to have warning with code "${code}", but warnings were: ${JSON.stringify(received.warnings?.map((w: any) => w.code) ?? [])}`,
                pass: false,
            };
        }
    },

    toHaveError(received, message: string) {
        const hasError = received.errors?.some((e: Error) => e.message.includes(message)) ?? false;

        if (hasError) {
            return {
                message: () => `expected not to have error containing "${message}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected to have error containing "${message}", but errors were: ${JSON.stringify(received.errors?.map((e: Error) => e.message) ?? [])}`,
                pass: false,
            };
        }
    },
});

// Global test timeout
jest.setTimeout(10000);
