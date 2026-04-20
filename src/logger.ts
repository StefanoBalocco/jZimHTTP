import type { Undefinedable } from './types.js';

export class Logger {
	private static _instance: Undefinedable<Logger>;

	static getInstance(): Logger {
		if( undefined === Logger._instance ) {
			Logger._instance = new Logger();
		}
		return Logger._instance;
	}

	stdout( functionName: string, command: string, params: string ): void {
		const ts: string = new Date().toISOString();
		process.stdout.write( `${ ts } ${ functionName } ${ command } ${ params }\n` );
	}
}
