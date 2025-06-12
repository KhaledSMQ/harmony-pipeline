// @ts-nocheck

import { promises as fs } from 'fs';
import { join } from 'path';
import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    type Logger,
    type PipelineContext,
} from '../../src';

/**
 * Example: File Processing Pipeline
 *
 * This example demonstrates file processing workflow:
 * 1. File validation and metadata extraction
 * 2. Content parsing and transformation
 * 3. Data validation and cleanup
 * 4. Output generation and storage
 */

// Define our data types
interface FileInput {
    filePath: string;
    encoding?: BufferEncoding;
    maxSizeBytes?: number;
}

interface FileMetadata {
    path: string;
    size: number;
    extension: string;
    mimeType: string;
    lastModified: Date;
}

interface ParsedContent {
    metadata: FileMetadata;
    content: string;
    lineCount: number;
    wordCount: number;
    encoding: BufferEncoding;
}

interface ProcessedData {
    metadata: FileMetadata;
    content: string;
    statistics: {
        lineCount: number;
        wordCount: number;
        characterCount: number;
        uniqueWords: number;
        avgWordsPerLine: number;
    };
    validation: {
        isValid: boolean;
        issues: string[];
    };
}

interface OutputResult {
    originalFile: string;
    processedFile: string;
    reportFile: string;
    processingTime: number;
    success: boolean;
}

// Pipeline metadata
interface FileProcessingMetadata {
    outputDirectory: string;
    processingId: string;
    configuration: {
        maxFileSize: number;
        allowedExtensions: string[];
        generateReport: boolean;
        cleanupTempFiles: boolean;
    };
}

// Simple logger implementation
class FileProcessingLogger implements Logger {
    private prefix: string;

    constructor(prefix = '[FILE-PROCESSOR]') {
        this.prefix = prefix;
    }

    debug(message: string, data?: unknown): void {
        console.log(`${this.prefix} [DEBUG] ${message}`, data || '');
    }

    info(message: string, data?: unknown): void {
        console.log(`${this.prefix} [INFO] ${message}`, data || '');
    }

    warn(message: string, data?: unknown): void {
        console.warn(`${this.prefix} [WARN] ${message}`, data || '');
    }

    error(message: string, data?: unknown): void {
        console.error(`${this.prefix} [ERROR] ${message}`, data || '');
    }
}

// Utility functions
function getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.csv': 'text/csv',
        '.md': 'text/markdown',
        '.xml': 'application/xml',
        '.log': 'text/plain',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

function extractFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? '' : filePath.substring(lastDot);
}

// Define pipeline stages
const stages = {
    validation: createStage('validation'),
    parsing: createStage('parsing', {
        dependencies: ['validation']
    }),
    analysis: createStage('analysis', {
        dependencies: ['parsing']
    }),
    output: createStage('output', {
        dependencies: ['analysis']
    }),
};

// File validator processor
const fileValidator = createSimpleProcessor<
    FileInput,
    FileInput,
    PipelineContext<FileProcessingMetadata>
>(
    'file-validator',
    stages.validation,
    async (input, context) => {
        context.logger.info('Validating file', {filePath: input.filePath});

        // Check if file exists
        try {
            await fs.access(input.filePath);
        } catch {
            throw new Error(`File not found: ${input.filePath}`);
        }

        // Get file stats
        const stats = await fs.stat(input.filePath);

        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${input.filePath}`);
        }

        // Check file size
        const maxSize = input.maxSizeBytes || context.metadata.configuration.maxFileSize;
        if (stats.size > maxSize) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
        }

        // Check file extension
        const extension = extractFileExtension(input.filePath);
        const allowedExtensions = context.metadata.configuration.allowedExtensions;
        if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
            throw new Error(`Unsupported file extension: ${extension}`);
        }

        context.logger.debug('File validation passed', {size: stats.size, extension});
        return input;
    }
);

// Content parser processor
const contentParser = createSimpleProcessor<
    FileInput,
    ParsedContent,
    PipelineContext<FileProcessingMetadata>
>(
    'content-parser',
    stages.parsing,
    async (input, context) => {
        context.logger.info('Parsing file content', {filePath: input.filePath});

        // Get file metadata
        const stats = await fs.stat(input.filePath);
        const extension = extractFileExtension(input.filePath);

        const metadata: FileMetadata = {
            path: input.filePath,
            size: stats.size,
            extension,
            mimeType: getMimeType(extension),
            lastModified: stats.mtime,
        };

        // Read file content
        const encoding = input.encoding || 'utf8';
        let content: string;

        try {
            content = await fs.readFile(input.filePath, encoding);
        } catch (error) {
            throw new Error(`Failed to read file: ${error}`);
        }

        // Basic content analysis
        const lines = content.split('\n');
        const lineCount = lines.length;
        const words = content.trim().split(/\s+/).filter(word => word.length > 0);
        const wordCount = words.length;

        context.logger.debug('Content parsed successfully', {
            lineCount,
            wordCount,
            contentLength: content.length
        });

        return {
            metadata,
            content,
            lineCount,
            wordCount,
            encoding,
        };
    }
);

// Content analyzer processor
const contentAnalyzer = createSimpleProcessor<
    ParsedContent,
    ProcessedData,
    PipelineContext<FileProcessingMetadata>
>(
    'content-analyzer',
    stages.analysis,
    (input, context) => {
        context.logger.info('Analyzing content', {filePath: input.metadata.path});

        const {content, lineCount, wordCount} = input;

        // Calculate statistics
        const characterCount = content.length;
        const words = content.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 0);

        const uniqueWords = new Set(words).size;
        const avgWordsPerLine = lineCount > 0 ? wordCount / lineCount : 0;

        // Content validation
        const validation = validateContent(content, context);

        const statistics = {
            lineCount,
            wordCount,
            characterCount,
            uniqueWords,
            avgWordsPerLine: Math.round(avgWordsPerLine * 100) / 100,
        };

        context.logger.debug('Content analysis complete', {statistics});

        return {
            metadata: input.metadata,
            content,
            statistics,
            validation,
        };
    }
);

// Content validation helper
function validateContent(
    content: string,
    context: PipelineContext<FileProcessingMetadata>
): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for empty content
    if (!content.trim()) {
        issues.push('File is empty');
    }

    // Check for very long lines (potential formatting issues)
    const lines = content.split('\n');
    const longLines = lines.filter(line => line.length > 1000);
    if (longLines.length > 0) {
        issues.push(`Found ${longLines.length} lines longer than 1000 characters`);
        context.addWarning(
            'LONG_LINES_DETECTED',
            'Some lines are unusually long',
            {count: longLines.length}
        );
    }

    // Check for binary content indicators
    const binaryIndicators = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/;
    if (binaryIndicators.test(content)) {
        issues.push('Content contains binary data');
    }

    // Check for unusual character encoding issues
    if (content.includes('�')) {
        issues.push('Content contains replacement characters (encoding issues)');
        context.addWarning(
            'ENCODING_ISSUES',
            'Replacement characters detected - possible encoding mismatch'
        );
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
}

// Output generator processor
const outputGenerator = createSimpleProcessor<
    ProcessedData,
    OutputResult,
    PipelineContext<FileProcessingMetadata>
>(
    'output-generator',
    stages.output,
    async (input, context) => {
        context.logger.info('Generating output files', {
            originalFile: input.metadata.path
        });

        const startTime = Date.now();
        const outputDir = context.metadata.outputDirectory;
        const processingId = context.metadata.processingId;

        // Ensure output directory exists
        await fs.mkdir(outputDir, {recursive: true});

        // Generate processed content file
        const processedFileName = `processed_${processingId}.txt`;
        const processedFilePath = join(outputDir, processedFileName);

        const processedContent = generateProcessedContent(input);
        await fs.writeFile(processedFilePath, processedContent, 'utf8');

        // Generate report file if enabled
        let reportFilePath = '';
        if (context.metadata.configuration.generateReport) {
            const reportFileName = `report_${processingId}.json`;
            reportFilePath = join(outputDir, reportFileName);

            const report = generateReport(input, context);
            await fs.writeFile(reportFilePath, JSON.stringify(report, null, 2), 'utf8');
        }

        const processingTime = Date.now() - startTime;

        context.logger.info('Output generation complete', {
            processedFile: processedFilePath,
            reportFile: reportFilePath,
            processingTime
        });

        return {
            originalFile: input.metadata.path,
            processedFile: processedFilePath,
            reportFile: reportFilePath,
            processingTime,
            success: true,
        };
    }
);

// Helper functions for output generation
function generateProcessedContent(data: ProcessedData): string {
    const header = `# Processed Content Report
Generated: ${new Date().toISOString()}
Original File: ${data.metadata.path}
File Size: ${data.metadata.size} bytes
Last Modified: ${data.metadata.lastModified.toISOString()}

## Statistics
- Lines: ${data.statistics.lineCount}
- Words: ${data.statistics.wordCount}
- Characters: ${data.statistics.characterCount}
- Unique Words: ${data.statistics.uniqueWords}
- Average Words per Line: ${data.statistics.avgWordsPerLine}

## Validation Status
Status: ${data.validation.isValid ? 'VALID' : 'INVALID'}
${data.validation.issues.length > 0 ? `Issues: ${data.validation.issues.join(', ')}` : ''}

## Content
---
`;

    return header + data.content;
}

function generateReport(
    data: ProcessedData,
    context: PipelineContext<FileProcessingMetadata>
) {
    return {
        processingId: context.metadata.processingId,
        timestamp: new Date().toISOString(),
        executionId: context.executionId,
        file: {
            path: data.metadata.path,
            size: data.metadata.size,
            extension: data.metadata.extension,
            mimeType: data.metadata.mimeType,
            lastModified: data.metadata.lastModified,
        },
        statistics: data.statistics,
        validation: data.validation,
        warnings: context._getWarnings(),
        configuration: context.metadata.configuration,
    };
}

// Pipeline factory
export function createFileProcessingPipeline() {
    return createPipelineBuilder<
        FileInput,
        OutputResult,
        PipelineContext<FileProcessingMetadata>
    >()
        .withProcessor(fileValidator)
        .withProcessor(contentParser)
        .withProcessor(contentAnalyzer)
        .withProcessor(outputGenerator)
        .build();
}

// Example usage
export async function runFileProcessingExample() {
    console.log('📁 Starting File Processing Pipeline Example\n');

    const pipeline = createFileProcessingPipeline();
    const logger = new FileProcessingLogger();

    // Create a sample file for processing
    const sampleFilePath = join(__dirname, 'sample.txt');
    const sampleContent = `# Sample Text File
This is a sample text file for demonstrating the file processing pipeline.

## Features Demonstrated
- File validation and metadata extraction
- Content parsing and analysis
- Statistical analysis of text content
- Validation rules and warnings
- Output generation

## Sample Data
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor 
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis 
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

This file contains multiple lines and various text patterns to demonstrate
the pipeline's analysis capabilities.

Total lines: This will be calculated by the pipeline.
Word count: This will also be calculated automatically.`;

    // Create sample file
    await fs.writeFile(sampleFilePath, sampleContent, 'utf8');
    console.log(`📝 Created sample file: ${sampleFilePath}`);

    // Create execution context
    const outputDirectory = join(__dirname, 'output');
    const processingId = `proc_${Date.now()}`;

    const context = createPipelineContext<FileProcessingMetadata>({
        outputDirectory,
        processingId,
        configuration: {
            maxFileSize: 1024 * 1024, // 1MB
            allowedExtensions: ['.txt', '.md', '.log', '.csv', '.json'],
            generateReport: true,
            cleanupTempFiles: true,
        },
    }, logger);

    try {
        console.log('\n🔄 Processing file...');

        const result = await pipeline.execute({
            filePath: sampleFilePath,
            encoding: 'utf8',
        }, context, {
            stopOnError: true,
            timeoutMs: 10000,
            logger,
        });

        if (result.success) {
            console.log('✅ File processing successful!');
            console.log('📊 Results:', {
                originalFile: result.output?.originalFile,
                processedFile: result.output?.processedFile,
                reportFile: result.output?.reportFile,
                processingTime: result.output?.processingTime,
            });
        } else {
            console.log('❌ File processing failed!');
            console.log('🚨 Errors:', result.errors.map(e => e.message));
        }

        if (result.warnings.length > 0) {
            console.log('⚠️  Warnings:', result.warnings.map(w => `${w.code}: ${w.message}`));
        }

        console.log(`⏱️  Total execution time: ${result.executionTime}ms`);

        // Show stage-by-stage results
        console.log('\n📈 Stage Results:');
        for (const stage of result.stages) {
            if (stage.kind === 'ok') {
                console.log(`  ✅ ${stage.stageName}.${stage.processorName}: ${stage.elapsed}ms`);
            } else {
                console.log(`  ❌ ${stage.stageName}.${stage.processorName}: ${stage.error.message}`);
            }
        }

    } catch (error) {
        console.error('💥 Unexpected error:', error);
    } finally {
        // Cleanup sample file
        try {
            await fs.unlink(sampleFilePath);
            console.log('\n🧹 Cleaned up sample file');
        } catch {
            // Ignore cleanup errors
        }
    }

    console.log('\n🏁 File Processing Pipeline Example Complete\n');
}

// Run the example if this file is executed directly
if (require.main === module) {
    runFileProcessingExample().catch(console.error);
}
