import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { Mcp } from './mcp.js';
import type { ClfEntry } from './request-logger.js';
import { RequestLogger } from './request-logger.js';
import type { Listener, ServerConfig, Undefinedable } from './types.js';
import { Web } from './web.js';
import { Zim } from './zim.js';

export class ZimHttpServer {
	private readonly _zim: Zim;
	private readonly _mcp: Undefinedable<Mcp>;
	private readonly _web: Undefinedable<Web>;
	private readonly _config: ServerConfig;
	private readonly _logger: RequestLogger;
	private readonly _servers: ServerType[] = [];

	constructor( config: ServerConfig ) {
		this._config = config;
		this._zim = new Zim(
			config.zimPath,
			Math.max( config.web.maxConcurrentPage, config.mcp.maxConcurrentArticle ),
			config.cacheMaxSize,
			config.cacheTtlMs
		);
		if( config.mcp.enabled ) {
			this._mcp = new Mcp( this._zim, config.mcp, config.cacheMaxSize, config.cacheTtlMs );
		}
		if( config.web.enabled ) {
			this._web = new Web( this._zim, config.web );
		}
		this._logger = new RequestLogger( config.logFile );
		this._startServers();
	}

	get config(): ServerConfig {
		return this._config;
	}

	shutdown(): void {
		if( this._mcp ) {
			this._mcp.shutdown();
		}
		this._zim.shutdown();
		this._logger.shutdown();
		const cL1: number = this._servers.length;
		for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
			this._servers[ iL1 ]!.close();
		}
	}

	private _startServers(): void {
		interface EndpointInfo {
			entry: Listener;
			hasMcp: boolean;
			hasWeb: boolean;
		}

		const endpoints: Map<string, EndpointInfo> = new Map<string, EndpointInfo>();

		const sources: [ boolean, Listener[], 'hasMcp' | 'hasWeb' ][] = [
			[ this._config.mcp.enabled, this._config.mcp.listeners, 'hasMcp' ],
			[ this._config.web.enabled, this._config.web.listeners, 'hasWeb' ]
		];

		for( const [ isEnabled, listeners, property ] of sources ) {
			if( isEnabled ) {
				for( const entry of listeners ) {
					const key: string = `${ entry.host.replace( /^\[|\]$/g, '' ) }:${ entry.port }`;
					const existing: EndpointInfo = endpoints.get( key ) ?? { entry, hasMcp: false, hasWeb: false };
					existing[ property ] = true;
					endpoints.set( key, existing );
				}
			}
		}

		for( const info of endpoints.values() ) {
			const app: Hono = new Hono();

			app.use( '/^\/{2,}/', async( c: Context, _next: Next ): Promise<Response> => {
				const normalizedPath = c.req.path.replace( /^\/+/, '/' );
				const url = new URL( c.req.url );
				url.pathname = normalizedPath;
				return app.fetch( new Request( url.toString(), c.req.raw ), c.env );
			} );

			app.use( '*', async( c: Context, next: Next ): Promise<void> => {
				await next();

				const remoteHost: string = this._resolveRemoteHost( c );
				const now: Date = new Date();

				if( !( c.req.method === 'POST' && c.req.path === '/mcp' ) ) {
					this._logger.logConsoleLine(
						`${ now.toISOString() } ${ c.req.method.padEnd( 7 ) } ${ remoteHost } ${ c.req.path } ${ c.res.status }`
					);
				}

				// CLF log
				const entry: ClfEntry = {
					remoteHost,
					date: now,
					method: c.req.method,
					path: c.req.path,
					protocol: 'HTTP/1.1',
					status: c.res.status,
					bytes: parseInt( c.res.headers.get( 'content-length' ) ?? '0', 10 )
				};
				this._logger.log( entry );

				// CORS
				const origin: string = c.req.header( 'origin' ) ?? '';
				if(
					this._config.corsOrigins.includes( '*' ) ||
					( origin && this._config.corsOrigins.includes( origin ) )
				) {
					c.header( 'Access-Control-Allow-Origin', origin || '*' );
				}
			} );

			app.options( '*', ( c: Context ): Response => {
				const methods: Set<string> = new Set<string>();
				for( const route of app.routes ) {
					if( route.path === c.req.path && 'ALL' !== route.method && 'OPTIONS' !== route.method ) {
						methods.add( route.method.toUpperCase() );
					}
				}
				let returnValue: Response;
				if( 0 === methods.size ) {
					returnValue = c.json( { error: 'Not Found' }, 404 );
				} else {
					methods.add( 'OPTIONS' );
					const allowedMethods: string = [ ...methods ].join( ', ' );
					returnValue = c.newResponse( null, {
						status: 204, headers: {
							'Allow': allowedMethods,
							'Access-Control-Allow-Methods': allowedMethods,
							'Access-Control-Allow-Headers': 'Content-Type'
						}
					} );
				}
				return returnValue;
			} );

			if( info.hasMcp && this._mcp ) {
				this._mcp.registerRoutes( app, this._logger, ( c: Context ): string => this._resolveRemoteHost( c ) );
			}
			if( info.hasWeb && this._web ) {
				this._web.registerRoutes( app );
			}
			const server: ServerType = serve( {
				fetch: app.fetch,
				hostname: info.entry.host,
				port: info.entry.port
			} );
			this._servers.push( server );
		}
	}

	private _resolveRemoteHost( c: Context ): string {
		const connectionIp: string = getConnInfo( c ).remote.address!;
		let returnValue: string = connectionIp;
		if( this._config.trustedProxies.includes( connectionIp ) ) {
			const xForwardedFor: Undefinedable<string> = c.req.header( 'x-forwarded-for' );
			if( undefined !== xForwardedFor ) {
				returnValue = xForwardedFor.split( ',' )[ 0 ]!.trim();
			} else {
				const xRealIp: Undefinedable<string> = c.req.header( 'x-real-ip' );
				if( undefined !== xRealIp ) {
					returnValue = xRealIp;
				}
			}
		}
		return returnValue;
	}
}
