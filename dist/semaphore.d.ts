export declare class Semaphore {
    private _available;
    private readonly _max;
    private readonly _queue;
    constructor(max?: number);
    get availableSlots(): number;
    acquire(wait?: boolean): Promise<boolean>;
    release(): void;
}
