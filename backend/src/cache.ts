import type { Undefinedable } from './types.js';

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export class LruTtlCache<T> {
	private readonly _map: Map<string, CacheEntry<T>> = new Map<string, CacheEntry<T>>();
	private readonly _maxSize: number;
	private readonly _ttlMs: number;

	constructor( maxSize: number, ttlMs: number ) {
		this._maxSize = maxSize;
		this._ttlMs = ttlMs;
	}

	get size(): number {
		return this._map.size;
	}

	get( key: string ): Undefinedable<T> {
		let returnValue: Undefinedable<T>;

		const entry: Undefinedable<CacheEntry<T>> = this._map.get( key );

		if( undefined !== entry ) {
			if( Date.now() < entry.expiresAt ) {
				this._map.delete( key );
				this._map.set( key, entry );
				returnValue = entry.value;
			} else {
				this._map.delete( key );
			}
		}

		return returnValue;
	}

	set( key: string, value: T ): void {
		this._map.delete( key );

		if( this._maxSize <= this._map.size ) {
			const firstKey: string = this._map.keys().next().value as string;
			this._map.delete( firstKey );
		}

		this._map.set( key, {
			value,
			expiresAt: Date.now() + this._ttlMs
		} );
	}

	has( key: string ): boolean {
		let returnValue: boolean = false;
		const entry: Undefinedable<CacheEntry<T>> = this._map.get( key );

		if( undefined !== entry ) {
			returnValue = ( Date.now() < entry.expiresAt );
			if( !returnValue ) {
				this._map.delete( key );
			}
		}
		return returnValue;
	}

	delete( key: string ): boolean {
		return this._map.delete( key );
	}

	deleteByPrefix( prefix: string ): number {
		let returnValue: number = 0;
		for( const key of this._map.keys() ) {
			if( key.includes( prefix ) ) {
				this._map.delete( key );
				returnValue++;
			}
		}
		return returnValue;
	}

	cleanup(): number {
		let removed: number = 0;
		const now: number = Date.now();

		for( const [ key, entry ] of this._map ) {
			if( now >= entry.expiresAt ) {
				this._map.delete( key );
				removed++;
			}
		}

		return removed;
	}

	clear(): void {
		this._map.clear();
	}
}
