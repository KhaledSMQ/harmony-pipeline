// @ts-nocheck

import {
    createPipelineBuilder,
    createPipelineContext,
    createSimpleProcessor,
    createStage,
    type Logger,
    type PipelineContext,
    type PipelineProcessor,
} from '../../src';

/**
 * Example: API Integration Pipeline
 *
 * This example demonstrates API integration workflow:
 * 1. Request preparation and validation
 * 2. Authentication and authorization
 * 3. API calls with retry logic
 * 4. Response validation and transformation
 * 5. Data aggregation and caching
 */

// Define our data types
interface ApiRequest {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    params?: Record<string, any>;
    body?: any;
    timeout?: number;
}

interface AuthenticatedRequest extends ApiRequest {
    authorization: string;
    requestId: string;
    timestamp: number;
}

interface ApiResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    requestId: string;
    responseTime: number;
}

interface ValidatedResponse extends ApiResponse {
    isValid: boolean;
    validationErrors: string[];
    parsedData: any;
}

interface ProcessedApiData {
    requestId: string;
    sourceEndpoint: string;
    processedAt: number;
    data: any;
    metadata: {
        responseTime: number;
        retryCount: number;
        cacheHit: boolean;
        validationPassed: boolean;
    };
}

// Pipeline metadata
interface ApiIntegrationMetadata {
    apiConfig: {
        baseUrl: string;
        timeout: number;
        retryAttempts: number;
        retryDelayMs: number;
    };
    authentication: {
        type: 'bearer' | 'apikey' | 'basic';
        credentials: string;
    };
    features: {
        enableCache: boolean;
        enableRetry: boolean;
        validateResponses: boolean;
    };
    correlationId: string;
}

// Simple HTTP client simulation
class MockHttpClient {
    private cache = new Map<string, { data: any; timestamp: number }>();
    private requestCount = 0;

    async request(
        config: AuthenticatedRequest,
        signal?: AbortSignal
    ): Promise<ApiResponse> {
        this.requestCount++;

        // Simulate network delay
        await this.delay(100 + Math.random() * 200);

        // Check for cancellation
        if (signal?.aborted) {
            throw new Error('Request cancelled');
        }

        // Simulate different responses based on endpoint
        if (config.endpoint.includes('/users')) {
            return this.simulateUsersResponse(config);
        } else if (config.endpoint.includes('/posts')) {
            return this.simulatePostsResponse(config);
        } else if (config.endpoint.includes('/error')) {
            throw new Error('Simulated API error');
        }

        return this.simulateGenericResponse(config);
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private simulateUsersResponse(config: AuthenticatedRequest): ApiResponse {
        const startTime = Date.now();

        const users = [
            {id: 1, name: 'John Doe', email: 'john@example.com'},
            {id: 2, name: 'Jane Smith', email: 'jane@example.com'},
            {id: 3, name: 'Bob Wilson', email: 'bob@example.com'},
        ];

        return {
            status: 200,
            statusText: 'OK',
            headers: {'content-type': 'application/json'},
            data: users,
            requestId: config.requestId,
            responseTime: Date.now() - startTime,
        };
    }

    private simulatePostsResponse(config: AuthenticatedRequest): ApiResponse {
        const startTime = Date.now();

        const posts = [
            {id: 1, title: 'First Post', content: 'Content 1', userId: 1},
            {id: 2, title: 'Second Post', content: 'Content 2', userId: 2},
        ];

        return {
            status: 200,
            statusText: 'OK',
            headers: {'content-type': 'application/json'},
            data: posts,
            requestId: config.requestId,
            responseTime: Date.now() - startTime,
        };
    }

    private simulateGenericResponse(config: AuthenticatedRequest): ApiResponse {
        const startTime = Date.now();

        return {
            status: 200,
            statusText: 'OK',
            headers: {'content-type': 'application/json'},
            data: {message: 'Success', endpoint: config.endpoint},
            requestId: config.requestId,
            responseTime: Date.now() - startTime,
        };
    }
}

// Logger implementation
class ApiLogger implements Logger {
    debug(message: string, data?: unknown): void {
        console.log(`[API] [DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }

    info(message: string, data?: unknown): void {
        console.log(`[API] [INFO] ${message}`, data || '');
    }

    warn(message: string, data?: unknown): void {
        console.warn(`[API] [WARN] ${message}`, data || '');
    }

    error(message: string, data?: unknown): void {
        console.error(`[API] [ERROR] ${message}`, data || '');
    }
}

// Define pipeline stages
const stages = {
    preparation: createStage('preparation'),
    authentication: createStage('authentication', {
        dependencies: ['preparation']
    }),
    request: createStage('request', {
        dependencies: ['authentication']
    }),
    validation: createStage('validation', {
        dependencies: ['request']
    }),
    processing: createStage('processing', {
        dependencies: ['validation']
    }),
};

// Request preparation processor
const requestPreparator = createSimpleProcessor<
    ApiRequest,
    ApiRequest,
    PipelineContext<ApiIntegrationMetadata>
>(
    'request-preparator',
    stages.preparation,
    (input, context) => {
        context.logger.info('Preparing API request', {endpoint: input.endpoint});

        // Validate required fields
        if (!input.endpoint?.trim()) {
            throw new Error('Endpoint is required');
        }

        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(input.method)) {
            throw new Error(`Invalid HTTP method: ${input.method}`);
        }

        // Apply default configurations
        const baseUrl = context.metadata.apiConfig.baseUrl;
        const fullEndpoint = input.endpoint.startsWith('http')
            ? input.endpoint
            : `${baseUrl}${input.endpoint}`;

        const preparedRequest: ApiRequest = {
            ...input,
            endpoint: fullEndpoint,
            timeout: input.timeout || context.metadata.apiConfig.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'harmony-pipeline/1.0.0',
                ...input.headers,
            },
        };

        context.logger.debug('Request preparation complete', {
            endpoint: preparedRequest.endpoint,
            method: preparedRequest.method,
        });

        return preparedRequest;
    }
);

// Authentication processor
const authenticator = createSimpleProcessor<
    ApiRequest,
    AuthenticatedRequest,
    PipelineContext<ApiIntegrationMetadata>
>(
    'authenticator',
    stages.authentication,
    (input, context) => {
        context.logger.info('Adding authentication', {endpoint: input.endpoint});

        const {type, credentials} = context.metadata.authentication;

        let authorization: string;
        switch (type) {
            case 'bearer':
                authorization = `Bearer ${credentials}`;
                break;
            case 'apikey':
                authorization = `ApiKey ${credentials}`;
                break;
            case 'basic':
                authorization = `Basic ${credentials}`;
                break;
            default:
                throw new Error(`Unsupported authentication type: ${type}`);
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const authenticatedRequest: AuthenticatedRequest = {
            ...input,
            authorization,
            requestId,
            timestamp: Date.now(),
            headers: {
                ...input.headers,
                'Authorization': authorization,
                'X-Request-ID': requestId,
            },
        };

        context.logger.debug('Authentication added', {
            requestId,
            authType: type,
        });

        return authenticatedRequest;
    }
);

// HTTP client with retry logic
class RetryableHttpProcessor implements PipelineProcessor<
    AuthenticatedRequest,
    ApiResponse,
    PipelineContext<ApiIntegrationMetadata>
> {
    readonly name = 'http-client';
    readonly version = '1.0.0' as const;
    readonly stage = stages.request;

    private httpClient = new MockHttpClient();

    async process(
        input: AuthenticatedRequest,
        context: PipelineContext<ApiIntegrationMetadata>,
        signal?: AbortSignal
    ): Promise<ApiResponse> {
        context.logger.info('Making HTTP request', {
            endpoint: input.endpoint,
            requestId: input.requestId,
        });

        const {retryAttempts, retryDelayMs} = context.metadata.apiConfig;
        const enableRetry = context.metadata.features.enableRetry;

        let lastError: Error | undefined;
        const maxAttempts = enableRetry ? retryAttempts + 1 : 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (attempt > 1) {
                    context.logger.info(`Retry attempt ${attempt - 1}/${retryAttempts}`, {
                        requestId: input.requestId,
                    });

                    // Wait before retry
                    await this.delay(retryDelayMs * attempt);
                }

                const response = await this.httpClient.request(input, signal);

                if (attempt > 1) {
                    context.addWarning(
                        'REQUEST_RETRIED',
                        `Request succeeded after ${attempt - 1} retries`,
                        {requestId: input.requestId, attempts: attempt}
                    );
                }

                context.logger.debug('HTTP request successful', {
                    status: response.status,
                    responseTime: response.responseTime,
                });

                return response;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === maxAttempts) {
                    context.logger.error('HTTP request failed after all retries', {
                        requestId: input.requestId,
                        attempts: attempt,
                        error: lastError.message,
                    });
                    break;
                }

                context.logger.warn(`HTTP request failed, will retry`, {
                    requestId: input.requestId,
                    attempt,
                    error: lastError.message,
                });
            }
        }

        throw lastError || new Error('Request failed');
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Response validator processor
const responseValidator = createSimpleProcessor<
    ApiResponse,
    ValidatedResponse,
    PipelineContext<ApiIntegrationMetadata>
>(
    'response-validator',
    stages.validation,
    (input, context) => {
        context.logger.info('Validating API response', {
            requestId: input.requestId,
            status: input.status,
        });

        const validationErrors: string[] = [];
        let isValid = true;
        let parsedData = input.data;

        // Validate HTTP status
        if (input.status < 200 || input.status >= 400) {
            validationErrors.push(`Invalid HTTP status: ${input.status}`);
            isValid = false;
        }

        // Validate content type if validation is enabled
        if (context.metadata.features.validateResponses) {
            const contentType = input.headers['content-type'] || '';

            if (!contentType.includes('application/json')) {
                context.addWarning(
                    'UNEXPECTED_CONTENT_TYPE',
                    'Response content type is not JSON',
                    {contentType, requestId: input.requestId}
                );
            }

            // Try to parse JSON data
            if (typeof input.data === 'string') {
                try {
                    parsedData = JSON.parse(input.data);
                } catch (error) {
                    validationErrors.push('Invalid JSON in response body');
                    isValid = false;
                }
            }

            // Validate response structure
            if (parsedData && typeof parsedData === 'object') {
                if (Array.isArray(parsedData)) {
                    context.logger.debug('Response contains array data', {
                        length: parsedData.length
                    });
                } else {
                    context.logger.debug('Response contains object data', {
                        keys: Object.keys(parsedData)
                    });
                }
            }
        }

        const result: ValidatedResponse = {
            ...input,
            isValid,
            validationErrors,
            parsedData,
        };

        if (!isValid) {
            context.logger.warn('Response validation failed', {
                errors: validationErrors
            });
        } else {
            context.logger.debug('Response validation passed');
        }

        return result;
    }
);

// Data processor with caching
const dataProcessor = createSimpleProcessor<
    ValidatedResponse,
    ProcessedApiData,
    PipelineContext<ApiIntegrationMetadata>
>(
    'data-processor',
    stages.processing,
    (input, context) => {
        context.logger.info('Processing API data', {
            requestId: input.requestId
        });

        if (!input.isValid) {
            throw new Error(`Cannot process invalid response: ${input.validationErrors.join(', ')}`);
        }

        // Transform the data based on endpoint type
        let processedData = input.parsedData;

        if (input.requestId.includes('users')) {
            processedData = this.processUsersData(input.parsedData);
        } else if (input.requestId.includes('posts')) {
            processedData = this.processPostsData(input.parsedData);
        }

        const result: ProcessedApiData = {
            requestId: input.requestId,
            sourceEndpoint: input.data?.endpoint || 'unknown',
            processedAt: Date.now(),
            data: processedData,
            metadata: {
                responseTime: input.responseTime,
                retryCount: 0, // Would be tracked by retry processor
                cacheHit: false, // Would be tracked by cache processor
                validationPassed: input.isValid,
            },
        };

        context.logger.debug('Data processing complete', {
            requestId: input.requestId,
            dataType: Array.isArray(processedData) ? 'array' : typeof processedData,
        });

        return result;
    },
    {
        // Helper methods for data transformation
        processUsersData(data: any): any {
            if (Array.isArray(data)) {
                return data.map(user => ({
                    ...user,
                    displayName: user.name?.toUpperCase() || 'Unknown',
                    emailDomain: user.email?.split('@')[1] || 'unknown',
                }));
            }
            return data;
        },

        processPostsData(data: any): any {
            if (Array.isArray(data)) {
                return data.map(post => ({
                    ...post,
                    slug: post.title?.toLowerCase().replace(/\s+/g, '-') || 'untitled',
                    contentLength: post.content?.length || 0,
                }));
            }
            return data;
        },
    }
);

// Build the pipeline
export function createApiIntegrationPipeline() {
    return createPipelineBuilder<
        ApiRequest,
        ProcessedApiData,
        PipelineContext<ApiIntegrationMetadata>
    >()
        .withProcessor(requestPreparator)
        .withProcessor(authenticator)
        .withProcessor(new RetryableHttpProcessor())
        .withProcessor(responseValidator)
        .withProcessor(dataProcessor)
        .build();
}

// Example usage
export async function runApiIntegrationExample() {
    console.log('🌐 Starting API Integration Pipeline Example\n');

    const pipeline = createApiIntegrationPipeline();
    const logger = new ApiLogger();

    // Create execution context
    const context = createPipelineContext<ApiIntegrationMetadata>({
        apiConfig: {
            baseUrl: 'https://api.example.com',
            timeout: 5000,
            retryAttempts: 3,
            retryDelayMs: 1000,
        },
        authentication: {
            type: 'bearer',
            credentials: 'example-token-123',
        },
        features: {
            enableCache: true,
            enableRetry: true,
            validateResponses: true,
        },
        correlationId: 'api-example-001',
    }, logger);

    // Test different API calls
    const testRequests: ApiRequest[] = [
        {
            endpoint: '/users',
            method: 'GET',
            params: {limit: 10, offset: 0},
        },
        {
            endpoint: '/posts',
            method: 'GET',
            params: {userId: 1},
        },
        {
            endpoint: '/error',
            method: 'GET',
        },
    ];

    // Process each request
    for (const [index, request] of testRequests.entries()) {
        console.log(`\n--- Processing API Request ${index + 1} ---`);
        console.log(`🎯 ${request.method} ${request.endpoint}`);

        try {
            const result = await pipeline.execute(request, context, {
                stopOnError: false, // Continue processing other requests even if one fails
                timeoutMs: 15000,
                logger,
            });

            if (result.success) {
                console.log('✅ API request successful!');
                console.log('📊 Data summary:', {
                    requestId: result.output?.requestId,
                    processedAt: new Date(result.output?.processedAt || 0).toISOString(),
                    dataType: Array.isArray(result.output?.data) ? 'array' : typeof result.output?.data,
                    itemCount: Array.isArray(result.output?.data) ? result.output.data.length : 1,
                });
            } else {
                console.log('❌ API request failed!');
                console.log('🚨 Errors:', result.errors.map(e => e.message));
            }

            if (result.warnings.length > 0) {
                console.log('⚠️  Warnings:', result.warnings.map(w => `${w.code}: ${w.message}`));
            }

            console.log(`⏱️  Execution time: ${result.executionTime}ms`);

            // Show detailed stage results
            console.log('📈 Stage breakdown:');
            for (const stage of result.stages) {
                const status = stage.kind === 'ok' ? '✅' : '❌';
                const time = `${stage.elapsed}ms`;
                console.log(`  ${status} ${stage.stageName}.${stage.processorName}: ${time}`);

                if (stage.kind === 'err') {
                    console.log(`    Error: ${stage.error.message}`);
                }
            }

        } catch (error) {
            console.error('💥 Unexpected error:', error);
        }
    }

    console.log('\n🏁 API Integration Pipeline Example Complete\n');
}

// Run the example if this file is executed directly
if (require.main === module) {
    runApiIntegrationExample().catch(console.error);
}
