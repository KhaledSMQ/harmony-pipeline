/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.test.ts',
        '<rootDir>/tests/**/*.test.ts'
    ],

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/__tests__/**',
        '!src/index.ts' // Index file is just exports
    ],

    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json'],

    coverageThreshold: {
        global: {
            branches: 85,
            functions: 85,
            lines: 85,
            statements: 85
        }
    },


    // Transform configuration
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                target: 'ES2020',
                module: 'CommonJS'
            }
        }]
    },

    // Test timeout
    testTimeout: 10000,

    // Verbose output
    verbose: true,

    // Error handling
    errorOnDeprecated: true,

    // Performance
    maxWorkers: '50%',

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
    resetMocks: true
};
