export class LruTtlCache {
    _map = new Map();
    _maxSize;
    _ttlMs;
    constructor(maxSize, ttlMs) {
        this._maxSize = maxSize;
        this._ttlMs = ttlMs;
    }
    get size() {
        return this._map.size;
    }
    get(key) {
        let returnValue;
        const entry = this._map.get(key);
        if (undefined !== entry) {
            if (Date.now() < entry.expiresAt) {
                this._map.delete(key);
                this._map.set(key, entry);
                returnValue = entry.value;
            }
            else {
                this._map.delete(key);
            }
        }
        return returnValue;
    }
    set(key, value) {
        this._map.delete(key);
        if (this._maxSize <= this._map.size) {
            const firstKey = this._map.keys().next().value;
            this._map.delete(firstKey);
        }
        this._map.set(key, {
            value,
            expiresAt: Date.now() + this._ttlMs
        });
    }
    has(key) {
        let returnValue = false;
        const entry = this._map.get(key);
        if (undefined !== entry) {
            returnValue = (Date.now() < entry.expiresAt);
            if (!returnValue) {
                this._map.delete(key);
            }
        }
        return returnValue;
    }
    delete(key) {
        return this._map.delete(key);
    }
    deleteByPrefix(prefix) {
        let returnValue = 0;
        for (const key of this._map.keys()) {
            if (key.includes(prefix)) {
                this._map.delete(key);
                returnValue++;
            }
        }
        return returnValue;
    }
    cleanup() {
        let removed = 0;
        const now = Date.now();
        for (const [key, entry] of this._map) {
            if (now >= entry.expiresAt) {
                this._map.delete(key);
                removed++;
            }
        }
        return removed;
    }
    clear() {
        this._map.clear();
    }
}
