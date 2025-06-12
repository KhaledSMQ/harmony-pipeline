import { createStage } from '../Stage';
import { createPipelineContext } from '../Context';

describe('Stage', () => {
    describe('createStage', () => {
        it('should create a stage with just a name', () => {
            const stage = createStage('test-stage');

            expect(stage.name).toBe('test-stage');
            expect(stage.dependencies).toHaveLength(0);
            expect(stage.canExecute({} as any)).toBeTruthy();
        });

        it('should create a stage with dependencies', () => {
            const dependencies = ['stage1', 'stage2', 'stage3'];
            const stage = createStage('dependent-stage', {dependencies});

            expect(stage.name).toBe('dependent-stage');
            expect(stage.dependencies).toEqual(dependencies);
            expect(stage.dependencies).not.toBe(dependencies); // Should be a frozen copy
        });

        it('should create a stage with canExecute predicate', () => {
            const canExecute = (context: any) =>
                context.metadata.enableStage === true;
            const stage = createStage('conditional-stage', {canExecute});

            expect(stage.name).toBe('conditional-stage');
            expect(stage.canExecute).toBe(canExecute);
        });

        it('should create a stage with both dependencies and canExecute', () => {
            const dependencies = ['prerequisite'];
            const canExecute = () => true;
            const stage = createStage('full-stage', {dependencies, canExecute});

            expect(stage.name).toBe('full-stage');
            expect(stage.dependencies).toEqual(dependencies);
            expect(stage.canExecute).toBe(canExecute);
        });

        it('should freeze dependencies array', () => {
            const dependencies = ['stage1', 'stage2'];
            const stage = createStage('test-stage', {dependencies});

            expect(() => {
                // @ts-ignore
                stage.dependencies![0] = 'modified';
            }).toThrow();

            expect(() => {
                (stage.dependencies as any).push('new-stage');
            }).toThrow();
        });

        it('should freeze the stage object', () => {
            const stage = createStage('test-stage');

            expect(() => {
                (stage as any).name = 'modified-name';
            }).toThrow();

            expect(() => {
                (stage as any).newProperty = 'value';
            }).toThrow();
        });

        it('should handle empty dependencies array', () => {
            const stage = createStage('test-stage', {dependencies: []});

            expect(stage.dependencies).toEqual([]);
            expect(stage.dependencies).toHaveLength(0);
        });
    });

    describe('canExecute predicate', () => {
        it('should be called with the correct context', () => {
            const mockCanExecute = jest.fn(() => true);
            const stage = createStage('test-stage', {canExecute: mockCanExecute});
            const context = createPipelineContext({testFlag: true});

            const result = stage.canExecute!(context);

            expect(mockCanExecute).toHaveBeenCalledTimes(1);
            expect(mockCanExecute).toHaveBeenCalledWith(context);
            expect(result).toBe(true);
        });

        it('should support conditional execution based on metadata', () => {
            const stage = createStage('conditional-stage', {
                canExecute: context => context.metadata.enabled === true,
            });

            const enabledContext = createPipelineContext({enabled: true});
            const disabledContext = createPipelineContext({enabled: false});

            expect(stage.canExecute!(enabledContext)).toBe(true);
            expect(stage.canExecute!(disabledContext)).toBe(false);
        });

        it('should support complex conditional logic', () => {
            interface TestMetadata {
                environment: 'dev' | 'staging' | 'prod';
                features: string[];
                userRole: 'admin' | 'user' | 'guest';
            }

            const stage = createStage('advanced-stage', {
                canExecute: context => {
                    const {environment, features, userRole} =
                        // @ts-ignore
                        context.metadata as TestMetadata;
                    return (
                        environment === 'prod' &&
                        features.includes('advanced-processing') &&
                        userRole === 'admin'
                    );
                },
            });

            const validContext = createPipelineContext({
                environment: 'prod' as const,
                features: ['basic', 'advanced-processing'],
                userRole: 'admin' as const,
            });

            const invalidContext1 = createPipelineContext({
                environment: 'dev' as const,
                features: ['advanced-processing'],
                userRole: 'admin' as const,
            });

            const invalidContext2 = createPipelineContext({
                environment: 'prod' as const,
                features: ['basic'],
                userRole: 'admin' as const,
            });

            expect(stage.canExecute!(validContext)).toBe(true);
            expect(stage.canExecute!(invalidContext1)).toBe(false);
            expect(stage.canExecute!(invalidContext2)).toBe(false);
        });

        it('should handle exceptions in canExecute gracefully', () => {
            const stage = createStage('error-stage', {
                canExecute: () => {
                    throw new Error('Condition evaluation failed');
                },
            });

            const context = createPipelineContext({});

            expect(() => stage.canExecute!(context)).toThrow(
                'Condition evaluation failed',
            );
        });
    });

    describe('dependencies handling', () => {
        it('should preserve dependency order', () => {
            const dependencies = ['first', 'second', 'third'];
            const stage = createStage('ordered-stage', {dependencies});

            expect(stage.dependencies).toEqual(dependencies);
            expect(Array.from(stage.dependencies!)).toEqual(dependencies);
        });

        it('should handle duplicate dependencies', () => {
            const dependencies = ['stage1', 'stage2', 'stage1', 'stage3', 'stage2'];
            const stage = createStage('duplicate-deps-stage', {dependencies});

            expect(stage.dependencies).toEqual(dependencies); // Preserves duplicates as provided
        });

        it('should support self-referential dependency checking', () => {
            const stage = createStage('self-ref-stage', {
                dependencies: ['other-stage', 'self-ref-stage'],
            });

            // The stage should contain its own name in dependencies
            expect(stage.dependencies).toContain('self-ref-stage');
        });
    });

    describe('stage immutability', () => {
        it('should prevent modification of stage properties', () => {
            const stage = createStage('immutable-stage', {
                dependencies: ['dep1', 'dep2'],
                canExecute: () => true,
            });

            // Test immutability of all properties
            expect(() => {
                (stage as any).name = 'new-name';
            }).toThrow();

            expect(() => {
                (stage as any).dependencies = ['new-dep'];
            }).toThrow();

            expect(() => {
                (stage as any).canExecute = () => false;
            }).toThrow();

            expect(() => {
                (stage as any).newProperty = 'value';
            }).toThrow();
        });

        it('should prevent modification of nested dependency array', () => {
            const stage = createStage('nested-immutable-stage', {
                dependencies: ['dep1', 'dep2'],
            });

            expect(() => {
                // @ts-ignore
                stage.dependencies![0] = 'modified-dep';
            }).toThrow();

            expect(() => {
                (stage.dependencies as any).push('new-dep');
            }).toThrow();

            expect(() => {
                (stage.dependencies as any).splice(0, 1);
            }).toThrow();
        });
    });

    describe('TypeScript type checking', () => {
        it('should maintain proper typing for generic contexts', () => {
            interface CustomMetadata {
                customFlag: boolean;
                customValue: number;
            }

            // @ts-ignore
            const stage = createStage<{ metadata: CustomMetadata }>('typed-stage', {
                canExecute: context => {
                    // TypeScript should infer the correct type here
                    return (
                        context.metadata.customFlag && context.metadata.customValue > 0
                    );
                },
            });

            expect(stage.name).toBe('typed-stage');
            expect(typeof stage.canExecute).toBe('function');
        });
    });
});
