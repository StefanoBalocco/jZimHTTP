import type { Undefinedable } from './types.js';
export declare class LruTtlCache<T> {
    private readonly _map;
    private readonly _maxSize;
    private readonly _ttlMs;
    constructor(maxSize: number, ttlMs: number);
    get size(): number;
    get(key: string): Undefinedable<T>;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    deleteByPrefix(prefix: string): number;
    cleanup(): number;
    clear(): void;
}
