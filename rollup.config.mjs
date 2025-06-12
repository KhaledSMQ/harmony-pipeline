import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import {readFileSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for configuration
const packageJson = JSON.parse(
    readFileSync(join(__dirname, 'package.json'), 'utf8')
);

const isProduction = process.env.NODE_ENV === 'production';

// Copyright banner for output files
const createCopyrightBanner = () => {
    const currentYear = new Date().getFullYear();
    return `/*!
 * ${packageJson.name} v${packageJson.version}
 * ${packageJson.description}
 * 
 * Copyright (c) ${currentYear} ${packageJson.author}
 * Licensed under ${packageJson.license}
 * 
 * Repository: ${packageJson.repository.url}
 * 
 * Built: ${new Date().toISOString()}
 */`;
};

// External dependencies that should not be bundled
const external = [
    // Node.js built-ins
    'fs', 'path', 'util', 'events', 'stream', 'crypto',
    // Runtime dependencies (none currently, but keeping for future)
];

// Base configuration shared between builds
const createBaseConfig = () => ({
    input: 'src/index.ts',
    external,
    plugins: [
        nodeResolve({
            preferBuiltins: true,
            browser: false,
            exportConditions: ['node'],
        }),
        commonjs({
            sourceMap: !isProduction,
            ignoreDynamicRequires: true,
        }),
        typescript({
            tsconfig: './tsconfig.json',
            sourceMap: !isProduction,
            inlineSources: !isProduction,
            compilerOptions: {
                declaration: false,
                declarationMap: false,
                declarationDir: undefined,
            },
        }),
    ],
    onwarn: (warning, warn) => {
        // Filter out common warnings that are not actionable
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        if (warning.code === 'EVAL') return;

        // Use default for everything else
        warn(warning);
    },
});

// Production optimization configuration
const productionPlugins = [
    terser({
        compress: {
            drop_console: false, // Keep console for debugging
            drop_debugger: true,
            pure_funcs: ['console.debug'], // Remove debug logs in production
            passes: 2, // Multiple compression passes
        },
        mangle: {
            keep_classnames: true,
            keep_fnames: true, // Preserve function names for better stack traces
            properties: false, // Don't mangle properties
        },
        format: {
            comments: /^!/,  // Preserve existing copyright comments
        },
        ecma: 2020,
    }),
];

export default [
    // --- CommonJS Build ---
    {
        ...createBaseConfig(),
        output: {
            file: packageJson.main,
            format: 'cjs',
            sourcemap: !isProduction,
            exports: 'named',
            interop: 'auto',
            banner: createCopyrightBanner(),
            generatedCode: {
                preset: 'es2015',
                constBindings: true,
            },
        },
        plugins: [
            ...createBaseConfig().plugins,
            ...(isProduction ? productionPlugins : []),
        ],
    },

    // --- ES Module Build ---
    {
        ...createBaseConfig(),
        output: {
            file: packageJson.module,
            format: 'esm',
            sourcemap: !isProduction,
            exports: 'named',
            banner: createCopyrightBanner(),
            generatedCode: {
                preset: 'es2015',
                constBindings: true,
            },
        },
        plugins: [
            ...createBaseConfig().plugins,
            ...(isProduction ? productionPlugins : []),
        ],
    },

    // --- TypeScript Declaration Bundle ---
    {
        input: 'dist/types/index.d.ts',
        output: {
            file: packageJson.types,
            format: 'esm',
            banner: createCopyrightBanner(),
        },
        plugins: [
            dts({
                respectExternal: true,
                compilerOptions: {
                    removeComments: false,
                },
            }),
        ],
        external,
        onwarn: (warning, warn) => {
            // Skip type-only warnings that are not actionable
            if (warning.code === 'UNRESOLVED_IMPORT') return;
            if (warning.code === 'EMPTY_BUNDLE') return;
            warn(warning);
        },
    },
];
