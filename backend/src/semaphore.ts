export class Semaphore {
	private _available: number;
	private readonly _max: number;
	private readonly _queue: ( ( value: boolean ) => void )[] = [];

	constructor( max: number = 1 ) {
		this._max = max;
		this._available = max;
	}

	get availableSlots(): number {
		return this._available;
	}

	acquire( wait: boolean = true ): Promise<boolean> {
		let returnValue: Promise<boolean>;

		const available: boolean = ( 0 < this._available );
		if( !available && wait ) {
			returnValue = new Promise<boolean>( ( resolve: ( value: boolean ) => void ) => {
				this._queue.push( resolve );
			} );
		} else {
			if( available ) {
				this._available--;
			}
			returnValue = Promise.resolve( available );
		}
		return returnValue;
	}

	release(): void {
		if( 0 < this._queue.length ) {
			const next: ( value: boolean ) => void = this._queue.shift()!;
			next( true );
		} else if( this._available < this._max ) {
			this._available++;
		}
	}
}
