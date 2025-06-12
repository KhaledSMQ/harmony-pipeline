// @ts-nocheck

import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    type Logger,
    type PipelineContext,
} from '../../src';

/**
 * Example: Data Processing Pipeline
 *
 * This example demonstrates a typical data processing workflow:
 * 1. Input validation and normalization
 * 2. Data transformation and enrichment
 * 3. Business rule validation
 * 4. Output formatting
 */

// Define our data types
interface UserInput {
    name: string;
    email: string;
    age: string;
    preferences?: string[];
}

interface NormalizedUser {
    name: string;
    email: string;
    age: number;
    preferences: string[];
}

interface EnrichedUser extends NormalizedUser {
    id: string;
    emailDomain: string;
    ageGroup: 'young' | 'adult' | 'senior';
    isValidEmail: boolean;
}

interface ProcessedUser extends EnrichedUser {
    displayName: string;
    marketingSegment: string;
    canReceiveMarketing: boolean;
}

// Pipeline metadata
interface ProcessingMetadata {
    correlationId: string;
    environment: 'dev' | 'staging' | 'prod';
    enableMarketing: boolean;
    features: {
        emailValidation: boolean;
        ageGrouping: boolean;
        marketingSegmentation: boolean;
    };
}

// Custom logger for this example
class ConsoleLogger implements Logger {
    debug(message: string, data?: unknown): void {
        console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }

    info(message: string, data?: unknown): void {
        console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }

    warn(message: string, data?: unknown): void {
        console.warn(`[WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }

    error(message: string, data?: unknown): void {
        console.error(`[ERROR] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
}

// Define pipeline stages with clear dependencies
const stages = {
    validation: createStage('validation'),
    enrichment: createStage('enrichment', {
        dependencies: ['validation']
    }),
    businessRules: createStage('business-rules', {
        dependencies: ['enrichment']
    }),
    output: createStage('output', {
        dependencies: ['business-rules']
    }),
};

// Input normalization processor
const inputNormalizer = createSimpleProcessor<
    UserInput,
    NormalizedUser,
    PipelineContext<ProcessingMetadata>
>(
    'input-normalizer',
    stages.validation,
    (input, context) => {
        context.logger.info('Normalizing user input', {userId: input.email});

        // Validate required fields
        if (!input.name?.trim()) {
            throw new Error('Name is required');
        }
        if (!input.email?.trim()) {
            throw new Error('Email is required');
        }
        if (!input.age?.trim()) {
            throw new Error('Age is required');
        }

        const age = parseInt(input.age.trim(), 10);
        if (isNaN(age) || age < 0 || age > 150) {
            throw new Error('Age must be a valid number between 0 and 150');
        }

        return {
            name: input.name.trim(),
            email: input.email.trim().toLowerCase(),
            age,
            preferences: input.preferences || [],
        };
    }
);

// Email validation processor
const emailValidator = createSimpleProcessor<
    NormalizedUser,
    NormalizedUser,
    PipelineContext<ProcessingMetadata>
>(
    'email-validator',
    stages.validation,
    (input, context) => {
        if (!context.metadata.features.emailValidation) {
            context.addWarning(
                'EMAIL_VALIDATION_DISABLED',
                'Email validation is disabled in configuration'
            );
            return input;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input.email)) {
            throw new Error(`Invalid email format: ${input.email}`);
        }

        context.logger.debug('Email validation passed', {email: input.email});
        return input;
    }
);

// Data enrichment processor
const dataEnricher = createSimpleProcessor<
    NormalizedUser,
    EnrichedUser,
    PipelineContext<ProcessingMetadata>
>(
    'data-enricher',
    stages.enrichment,
    (input, context) => {
        context.logger.info('Enriching user data', {email: input.email});

        // Generate unique ID
        const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Extract email domain
        const emailDomain = input.email.split('@')[1];

        // Determine age group
        let ageGroup: 'young' | 'adult' | 'senior';
        if (context.metadata.features.ageGrouping) {
            if (input.age < 25) {
                ageGroup = 'young';
            } else if (input.age < 60) {
                ageGroup = 'adult';
            } else {
                ageGroup = 'senior';
            }
        } else {
            ageGroup = 'adult'; // Default when feature disabled
            context.addWarning(
                'AGE_GROUPING_DISABLED',
                'Age grouping feature is disabled, using default'
            );
        }

        // Validate email format (business rule)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidEmail = emailRegex.test(input.email);

        return {
            ...input,
            id,
            emailDomain,
            ageGroup,
            isValidEmail,
        };
    }
);

// Business rules processor
const businessRulesProcessor = createSimpleProcessor<
    EnrichedUser,
    EnrichedUser,
    PipelineContext<ProcessingMetadata>
>(
    'business-rules',
    stages.businessRules,
    (input, context) => {
        context.logger.info('Applying business rules', {userId: input.id});

        // Business rule: Block invalid emails
        if (!input.isValidEmail) {
            throw new Error('User data rejected: invalid email format');
        }

        // Business rule: Block suspicious domains
        const blockedDomains = ['tempmail.com', 'guerrillamail.com', '10minutemail.com'];
        if (blockedDomains.includes(input.emailDomain)) {
            throw new Error(`User data rejected: blocked email domain ${input.emailDomain}`);
        }

        // Business rule: Age restrictions
        if (input.age < 13) {
            throw new Error('User data rejected: minimum age requirement not met');
        }

        context.logger.debug('All business rules passed', {userId: input.id});
        return input;
    }
);

// Output formatter processor
const outputFormatter = createSimpleProcessor<
    EnrichedUser,
    ProcessedUser,
    PipelineContext<ProcessingMetadata>
>(
    'output-formatter',
    stages.output,
    (input, context) => {
        context.logger.info('Formatting output', {userId: input.id});

        // Create display name
        const displayName = input.name
            .split(' ')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');

        // Determine marketing segment
        let marketingSegment = 'general';
        if (context.metadata.features.marketingSegmentation) {
            if (input.ageGroup === 'young' && input.preferences.includes('technology')) {
                marketingSegment = 'tech-youth';
            } else if (input.ageGroup === 'adult' && input.preferences.includes('business')) {
                marketingSegment = 'business-professional';
            } else if (input.ageGroup === 'senior') {
                marketingSegment = 'senior-citizen';
            }
        }

        // Determine marketing eligibility
        const canReceiveMarketing = context.metadata.enableMarketing &&
            input.age >= 18 &&
            input.isValidEmail;

        return {
            ...input,
            displayName,
            marketingSegment,
            canReceiveMarketing,
        };
    }
);

// Build the pipeline
export function createDataProcessingPipeline() {
    return createPipelineBuilder<
        UserInput,
        ProcessedUser,
        PipelineContext<ProcessingMetadata>
    >()
        .withProcessor(inputNormalizer)
        .withProcessor(emailValidator)
        .withProcessor(dataEnricher)
        .withProcessor(businessRulesProcessor)
        .withProcessor(outputFormatter)
        .build();
}

// Example usage
export async function runDataProcessingExample() {
    console.log('🚀 Starting Data Processing Pipeline Example\n');

    const pipeline = createDataProcessingPipeline();
    const logger = new ConsoleLogger();

    // Create execution context
    const context = createPipelineContext<ProcessingMetadata>({
        correlationId: 'example-001',
        environment: 'dev',
        enableMarketing: true,
        features: {
            emailValidation: true,
            ageGrouping: true,
            marketingSegmentation: true,
        },
    }, logger);

    // Test data
    const testUsers: UserInput[] = [
        {
            name: 'john doe',
            email: 'John.Doe@Example.COM',
            age: '28',
            preferences: ['technology', 'business'],
        },
        {
            name: 'jane smith',
            email: 'jane.smith@company.org',
            age: '35',
            preferences: ['business', 'finance'],
        },
        {
            name: 'bob wilson',
            email: 'bob@tempmail.com', // This will fail business rules
            age: '45',
            preferences: ['sports'],
        },
    ];

    // Process each user
    for (const [index, userData] of testUsers.entries()) {
        console.log(`\n--- Processing User ${index + 1} ---`);

        try {
            const result = await pipeline.execute(userData, context, {
                stopOnError: true,
                timeoutMs: 5000,
                logger,
            });

            if (result.success) {
                console.log('✅ Processing successful!');
                console.log('📄 Result:', {
                    id: result.output?.id,
                    displayName: result.output?.displayName,
                    email: result.output?.email,
                    ageGroup: result.output?.ageGroup,
                    marketingSegment: result.output?.marketingSegment,
                    canReceiveMarketing: result.output?.canReceiveMarketing,
                });
            } else {
                console.log('❌ Processing failed!');
                console.log('🚨 Errors:', result.errors.map(e => e.message));
            }

            if (result.warnings.length > 0) {
                console.log('⚠️  Warnings:', result.warnings.map(w => `${w.code}: ${w.message}`));
            }

            console.log(`⏱️  Execution time: ${result.executionTime}ms`);

        } catch (error) {
            console.error('💥 Unexpected error:', error);
        }
    }

    console.log('\n🏁 Data Processing Pipeline Example Complete\n');
}

// Run the example if this file is executed directly
if (require.main === module) {
    runDataProcessingExample().catch(console.error);
}
