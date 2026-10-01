import type { WriteStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import type { Undefinedable } from './types.js';

export interface ClfEntry {
	remoteHost: string;
	date: Date;
	method: string;
	path: string;
	protocol: string;
	status: number;
	bytes: number;
}

export interface ConsoleEntry {
	remoteHost: string;
	date: Date;
	httpMethod: string;
	path: string;
	marker: 'START' | 'SEMAC' | 'SEMRL';
	mcpMethod?: string;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	status?: number;
	durationMs?: number;
}

export class RequestLogger {
	private _stream: Undefinedable<WriteStream>;

	constructor( logFilePath: string ) {
		if( '' !== logFilePath ) {
			this._stream = createWriteStream( logFilePath, { flags: 'a' } );
		}
	}

	log( entry: ClfEntry ): void {
		const [ , day, month, year, time ] = entry.date.toUTCString().split( ' ' );
		const dateStr: string = `${ day }/${ month }/${ year }:${ time } +0000`;
		const bytesStr: string = 0 === entry.bytes ? '-' : String( entry.bytes );
		this._stream?.write( `${ entry.remoteHost } - - [${ dateStr }] "${ entry.method } ${ entry.path } ${ entry.protocol }" ${ entry.status } ${ bytesStr }\n` );
	}

	logConsole( entry: ConsoleEntry ): void {
		const parts: string[] = [ entry.date.toISOString(), entry.marker, entry.remoteHost, entry.httpMethod.padEnd( 7 ), entry.path ];
		if( entry.mcpMethod ) {
			parts.push( entry.mcpMethod );
			if( entry.toolName ) {
				parts.push( entry.toolName );
				if( entry.toolArgs && 'SEMRL' !== entry.marker ) {
					parts.push( JSON.stringify( entry.toolArgs ) );
				}
			}
		}
		if( entry.durationMs ) {
			parts.push( `${ entry.durationMs }ms` );
		}
		if( entry.status ) {
			parts.push( String( entry.status ) );
		}
		process.stdout.write( parts.join( ' ' ) + '\n' );
	}

	logConsoleLine( line: string ): void {
		process.stdout.write( line + '\n' );
	}

	shutdown( callback?: () => void ): void {
		if( undefined !== this._stream ) {
			this._stream.end( callback );
			this._stream = undefined;
		} else if( undefined !== callback ) {
			callback();
		}
	}
}
