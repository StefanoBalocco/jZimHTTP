import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, Hono, Next } from 'hono';
import type { HTMLElement } from 'node-html-parser';
import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from './logger.js';
import type { CachedPageHtml, FileInfo, Nullable, SearchPage, Undefinedable, WebConfig, WebSearchResponse } from './types.js';
import { Zim } from './zim.js';

export class Web {
	private readonly _zim: Zim;
	private readonly _config: WebConfig;
	private readonly _logger: Logger;
	private readonly _webStartTime: Date = new Date();
	private readonly _cacheControl: string = 'public, max-age=0, must-revalidate';
	private readonly _staticRoot: string = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../../www' );

	constructor( zim: Zim, config: WebConfig ) {
		this._zim = zim;
		this._config = config;
		this._logger = Logger.getInstance();
	}

	registerRoutes( app: Hono ): void {
		app.get( '/files', async( c: Context ) => {
			const files: FileInfo[] = await this._zim.listFiles();
			return c.json( files );
		} );

		app.get( '/z/:filename', async( c: Context ) => {
			let returnValue: Response;
			const filename: string = c.req.param( 'filename' )!;
			const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
			if( undefined !== info && '' !== info.mainPath ) {
				const entryOnly: string = info.mainPath.substring( filename.length + 1 );
				const target: string = '/z/' + encodeURIComponent( filename ) + '/' + this._encodeEntryPath( entryOnly );
				returnValue = c.redirect( target, 302 );
			} else {
				returnValue = c.newResponse( 'Not Found', 404 );
			}
			return returnValue;
		} );

		app.get( '/search/:filename', async( c: Context, next: Next ): Promise<Response | undefined> => {
			let returnValue: Undefinedable<Response>;
			const filename: string = c.req.param( 'filename' )!;
			const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
			if( undefined !== info ) {
				await next();
			} else {
				returnValue = c.newResponse( 'Not Found', 404 );
			}
			return returnValue;
		} );

		app.get( '/search/:filename/results', async( c: Context ) => {
			let returnValue: Response;
			const filename: string = c.req.param( 'filename' )!;
			const query: string = ( c.req.query( 'q' ) ?? '' ).trim();
			const pageParam: string = c.req.query( 'p' ) ?? '1';
			const page: number = Math.max( 1, parseInt( pageParam, 10 ) || 1 );
			const pageSize: number = this._config.searchResultsPerPage;
			if( '' === query ) {
				returnValue = c.json( { filename, query, page, pageSize, total: 0, results: [] } );
			} else {
				const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
				if( undefined === info ) {
					returnValue = c.json( { error: 'Not Found' }, 404 );
				} else {
					const offset: number = ( page - 1 ) * pageSize;
					const data: SearchPage = await this._zim.search( filename, query, offset, pageSize );
					const response: WebSearchResponse = {
						filename,
						query,
						page,
						pageSize,
						total: data.total,
						results: data.results
					};
					returnValue = c.json( response );
				}
			}
			return returnValue;
		} );

		app.get( '/z/:filename/*', async( c: Context ) => {
			let returnValue: Response;
			const filename: string = c.req.param( 'filename' )!;
			const prefix: string = '/z/';
			const rawPath: string = c.req.path;
			let entryOnly: string = '';
			if( rawPath.startsWith( prefix ) ) {
				const tailStart: number = rawPath.indexOf( '/', prefix.length );
				if( -1 !== tailStart ) {
					try {
						entryOnly = decodeURIComponent( rawPath.substring( tailStart + 1 ) );
					} catch( error: unknown ) {
						entryOnly = '';
					}
				}
			}
			const searchQuery: Undefinedable<string> = c.req.query( 'q' );
			if( undefined !== searchQuery ) {
				returnValue = c.redirect( '/search/' + encodeURIComponent( filename ) + '?q=' + encodeURIComponent( searchQuery ), 302 );
			} else if( !entryOnly ) {
				returnValue = c.newResponse( 'Not Found', 404 );
			} else {
				const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
				if( undefined === info ) {
					returnValue = c.newResponse( 'Not Found', 404 );
				} else {
					const fullEntryPath: string = filename + '/' + entryOnly;
					const lastModified: Date = this._parseZimDate( info.date );
					const etagSource: string = filename + '\0' + ( info.date || '0' ) + '\0' + entryOnly;
					const etag: string = '"' + createHash( 'md5' ).update( etagSource ).digest( 'base64url' ) + '"';
					if( this._isNotModified( c, etag, lastModified ) ) {
						returnValue = c.newResponse( null, {
							status: 304,
							headers: this._cacheHeaders( etag, lastModified.toUTCString() )
						} );
					} else {
						const page: Undefinedable<CachedPageHtml> = await this._zim.getPageHtml( fullEntryPath );
						if( undefined !== page ) {
							returnValue = c.newResponse( this._injectSearchBar( page.html, filename ), {
								status: 200,
								headers: {
									'content-type': page.mimetype,
									...this._cacheHeaders( etag, lastModified.toUTCString() )
								}
							} );
						} else {
							const binary: Undefinedable<{ data: Buffer; mimetype: string }> = await this._zim.getBinary( fullEntryPath );
							if( undefined !== binary ) {
								const body: ArrayBuffer = binary.data.buffer.slice(
									binary.data.byteOffset,
									binary.data.byteOffset + binary.data.byteLength
								) as ArrayBuffer;
								returnValue = c.newResponse( body, {
									status: 200,
									headers: {
										'content-type': binary.mimetype,
										'content-length': String( binary.data.byteLength ),
										...this._cacheHeaders( etag, lastModified.toUTCString() )
									}
								} );
							} else {
								returnValue = c.newResponse( 'Not Found', 404 );
							}
						}
					}
				}
			}
			return returnValue;
		} );

		app.get( '*', async( c: Context, next: Next ) => {
			const staticHandler = serveStatic( {
				root: this._staticRoot,
				rewriteRequestPath: ( requestPath: string ) => {
					let returnValue: string = requestPath;
					if( '/' === requestPath ) {
						returnValue = '/index.html';
					} else if( null !== requestPath.match( /^\/search\/[^/]+$/ ) ) {
						returnValue = '/index.html';
					}
					return returnValue;
				}
			} );
			const res: Response | void = await staticHandler( c, next );
			if( undefined !== res && ( 200 === res.status || 206 === res.status ) ) {
				const requestPath: string = c.req.path;
				let cacheControl: string = '';
				if( '/' === requestPath || '/index.html' === requestPath || null !== requestPath.match( /^\/search\/[^/]+$/ ) ) {
					cacheControl = 'no-cache';
				} else if( requestPath.endsWith( '.css' ) || requestPath.endsWith( '.js' ) || requestPath.endsWith( '.mjs' ) ) {
					cacheControl = 'public, max-age=31536000, immutable';
				}
				if( '' !== cacheControl ) {
					const headers: Headers = new Headers( res.headers );
					headers.set( 'Cache-Control', cacheControl );
					return new Response( res.body, { status: res.status, statusText: res.statusText, headers } );
				}
			}
			return res;
		} );
	}

	private _injectSearchBar( html: string, filename: string ): string {
		let returnValue: string = html;
		try {
			const root: HTMLElement = parse( html );
			const body: Nullable<HTMLElement> = root.querySelector( 'body' );
			if( null !== body ) {
				const barHtml: string = `<form class="jzimhttp-search-bar" method="get" action="" style="display:flex;gap:.4rem;padding:.5rem 1rem;border-bottom:1px solid #8884;background:#fff4;">
<input type="text" name="q" placeholder="" style="flex:1;padding:.4rem .6rem;border:1px solid #8884;border-radius:.3rem;">
<button type="submit" style="padding:.4rem 1rem;border:1px solid #8884;background:#8881;border-radius:.3rem;cursor:pointer;">Search</button>
</form>`;
				const barRoot: HTMLElement = parse( barHtml );
				const input: Nullable<HTMLElement> = barRoot.querySelector( 'input[name="q"]' );
				if( null !== input ) {
					input.setAttribute( 'placeholder', 'Search in ' + filename );
				}
				body.insertAdjacentHTML( 'afterbegin', barRoot.toString() );
				returnValue = root.toString();
			}
		} catch( error: unknown ) {
			returnValue = html;
			const message: string = error instanceof Error ? error.message : String( error );
			this._logger.stdout( 'Web._InjectSearchBar', 'EXCEPTION', message );
		}
		return returnValue;
	}

	private _cacheHeaders( etag: string, lastModified: string ): Record<string, string> {
		return {
			'etag': etag,
			'last-modified': lastModified,
			'cache-control': this._cacheControl,
			'vary': 'Accept-Encoding'
		};
	}

	private _isNotModified( c: Context, etag: string, lastModified: Date ): boolean {
		let returnValue: boolean = false;
		const ifNoneMatch: Undefinedable<string> = c.req.header( 'if-none-match' );
		if( undefined !== ifNoneMatch ) {
			if( ifNoneMatch === etag ) {
				returnValue = true;
			}
		} else {
			const ifModifiedSince: Undefinedable<string> = c.req.header( 'if-modified-since' );
			if( undefined !== ifModifiedSince ) {
				const since: number = Date.parse( ifModifiedSince );
				if( !Number.isNaN( since ) && lastModified.getTime() <= since ) {
					returnValue = true;
				}
			}
		}
		return returnValue;
	}

	private _parseZimDate( date: string ): Date {
		let returnValue: Date;
		const parsed: number = Date.parse( date );
		if( Number.isNaN( parsed ) ) {
			returnValue = new Date( Math.floor( this._webStartTime.getTime() / 1000 ) * 1000 );
		} else {
			returnValue = new Date( Math.floor( parsed / 1000 ) * 1000 );
		}
		return returnValue;
	}

	private _encodeEntryPath( entryPath: string ): string {
		const parts: string[] = entryPath.split( '/' );
		const cL1: number = parts.length;
		for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
			parts[ iL1 ] = encodeURIComponent( parts[ iL1 ]! );
		}
		return parts.join( '/' );
	}
}