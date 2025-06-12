import { deepFreeze } from '../_utility/object';

/**
 * Logging interface for pipeline operations.
 * Provides structured logging capabilities with optional metadata attachment.
 */
export interface Logger {
    /**
     * Log debug information for development and troubleshooting.
     * @param message - Human-readable debug message
     * @param data - Optional structured data for context
     */
    debug(message: string, data?: unknown): void;

    /**
     * Log informational messages about normal operations.
     * @param message - Human-readable information message
     * @param data - Optional structured data for context
     */
    info(message: string, data?: unknown): void;

    /**
     * Log warning messages for recoverable issues.
     * @param message - Human-readable warning message
     * @param data - Optional structured data for context
     */
    warn(message: string, data?: unknown): void;

    /**
     * Log error messages for critical issues.
     * @param message - Human-readable error message
     * @param data - Optional structured data for context
     */
    error(message: string, data?: unknown): void;
}

/**
 * No-operation logger that silently discards all log messages.
 * Useful for testing or when logging is explicitly disabled.
 */
export const NullLogger: Logger = deepFreeze({
    debug(): void {
    },
    info(): void {
    },
    warn(): void {
    },
    error(): void {
    },
});
