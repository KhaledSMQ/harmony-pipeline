export const deepFreeze = <T extends object>(obj: T) => {
    Object.keys(obj).forEach(prop => {
        if (
            typeof obj[prop as keyof T] === 'object' &&
            !Object.isFrozen(obj[prop as keyof T])
        ) {

            // @ts-expect-error TypeScript doesn't know the type of obj[prop]
            deepFreeze(obj[prop as keyof T]);
        }
    });
    return Object.freeze(obj);
};
