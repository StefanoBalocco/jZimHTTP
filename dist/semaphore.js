export class Semaphore {
    _available;
    _max;
    _queue = [];
    constructor(max = 1) {
        this._max = max;
        this._available = max;
    }
    get availableSlots() {
        return this._available;
    }
    acquire(wait = true) {
        let returnValue;
        const available = (0 < this._available);
        if (!available && wait) {
            returnValue = new Promise((resolve) => {
                this._queue.push(resolve);
            });
        }
        else {
            if (available) {
                this._available--;
            }
            returnValue = Promise.resolve(available);
        }
        return returnValue;
    }
    release() {
        if (0 < this._queue.length) {
            const next = this._queue.shift();
            next(true);
        }
        else if (this._available < this._max) {
            this._available++;
        }
    }
}
