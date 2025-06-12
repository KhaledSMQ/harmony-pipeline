import type { PipelineContext } from './Context';
import type { PipelineStage } from './Stage';
import { deepFreeze } from '../_utility/object';

/**
 * A processor performs a single unit of work within a stage.
 */
export interface PipelineProcessor<
    I = unknown,
    O = unknown,
    TCtx extends PipelineContext = PipelineContext,
> {
    readonly name: string;
    /** Semantic‑version for change tracking. */
    readonly version: `${number}.${number}.${number}`;
    readonly stage: PipelineStage<TCtx>;

    /** Unit of work. May be async. Honour the AbortSignal. */
    process(input: I, context: TCtx, signal?: AbortSignal): O | Promise<O>;

    /* Optional lifecycle hooks */
    setup?(context: TCtx): void | Promise<void>;

    teardown?(context: TCtx): void | Promise<void>;

    onError?(error: Error, context: TCtx): void | Promise<void>;
}

/**
 * Functional‑style helper to create a processor without a class.
 */
export function createSimpleProcessor<
    I = unknown,
    O = unknown,
    TCtx extends PipelineContext = PipelineContext,
>(
    name: string,
    stage: PipelineStage<TCtx>,
    process: (input: I, ctx: TCtx, signal?: AbortSignal) => O | Promise<O>,
    options: {
        version?: `${number}.${number}.${number}`;
        setup?(ctx: TCtx): void | Promise<void>;
        teardown?(ctx: TCtx): void | Promise<void>;
        onError?(err: Error, ctx: TCtx): void | Promise<void>;
    } = {},
): PipelineProcessor<I, O, TCtx> {
    return deepFreeze({
        name,
        stage,
        process,
        version: options.version ?? '1.0.0',
        ...options,
    });
}
