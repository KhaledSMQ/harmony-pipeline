import globals from 'globals';
import tseslint, * as eslint from 'typescript-eslint';
// 'eslint-plugin-import' configuration for flat config can be more complex
// and is omitted here for a cleaner base config. It can be added back if needed.

export default tseslint.config(
    // Global ignore patterns
    {
        ignores: [
            'node_modules/',
            'build/',
            'dist/',
            'docs/',
            'public/',
            'coverage/',
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/*.test.tsx',
            '**/*.spec.tsx',
            '**/*.stories.tsx',
            '**/*.mdx',
            'eslint.config.mjs',
            'postcss.config.js',
        ],
    },

    // Base configuration recommended by ESLint
    eslint.configs.recommended,

    // TypeScript configurations
    ...tseslint.configs.recommended,

    // React and JSX-A11y configurations
    {
        files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
        plugins: {},
        languageOptions: {
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {

            // Not needed with React 17+ new JSX transform
            'react/react-in-jsx-scope': 'off',
        },
        settings: {
            react: {
                // Automatically detects the React version
                version: 'detect',
            },
        },
    },

    // Custom project-specific rules
    {
        rules: {
            // Enforce using 'const' for variables that are never reassigned
            'prefer-const': 'error',
            // Allow 'any' type
            '@typescript-eslint/no-explicit-any': 'off',
            // Enforce single quotes
            'quotes': ['error', 'single'],
            // Require semicolons
            'semi': ['error', 'always'],
            // Warn about unused variables, with an exception for args starting with '_'
            '@typescript-eslint/no-unused-vars': ['warn', {'argsIgnorePattern': '^_'}],
        },
    }
);
