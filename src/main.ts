import { existsSync, readFileSync } from 'node:fs';
import { ZimHttpServer } from './server.js';
import type { Listener, McpConfig, ServerConfig, Undefinedable, WebConfig } from './types.js';

const helpText = `Usage: jZimHTTP [--config <path>] [--help]

Options:
  --config <path>  Path to configuration JSON file (default: ./config.json)
  --help           Show this help message

Required fields:
  zimPath                Directory containing .zim files
  mcp                    { enabled, listen, maxConcurrentSearch, maxConcurrentArticle, searchResultsPerFile }
  web                    { enabled, listen, maxConcurrentPage }

Optional:
  logFile                "" (disabled)
  corsOrigins            ["*"]
  trustedProxies         []
  cacheMaxSize           200
  cacheTtlMs             300000

Listen:
  mcp.listen and web.listen each declare where that module is exposed.
  Identical host:port entries across modules share one http.Server.
  Disabled modules ignore their listen array.
  IPv6 example: { "host": "::1", "port": 3000 }
`;

function _ParseListeners( listeners: unknown, fieldName: string ): { error?: string, listeners?: Listener[] } {
	let returnValue: { error?: string, results?: Listener[] } = {};
	if( undefined === listeners || Array.isArray( listeners ) ) {
		returnValue.results = [];
		if( listeners ) {
			( listeners as Array<unknown> ).every(
				( item: unknown, index: number ): boolean => {
					let valid: boolean = false;
					if( item && 'object' === typeof item ) {
						const obj: Record<string, unknown> = item as Record<string, unknown>;
						if( 'string' === typeof obj.host && 'number' === typeof obj.port ) {
							returnValue.results!.push( { host: obj.host, port: obj.port } );
							valid = true;
						} else {
							returnValue.error = `${ fieldName }[${ index }] must have { host: string, port: number }`;
						}
					} else {
						returnValue.error = `${ fieldName }[${ index }] must be an object`;
					}
					return valid;
				}
			);
		}
	} else {
		returnValue.error = `${ fieldName } must be an array`;
	}
	return returnValue;
}

interface LogEndpoint {
	entry: Listener;
	modules: string[];
}

const logMap: Map<string, LogEndpoint> = new Map<string, LogEndpoint>();

function _AddLogEntry( listen: Listener[], label: string ): void {
	const cL1: number = listen.length;
	for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
		const entry: Listener = listen[ iL1 ]!;
		const key: string = `${ entry.host }:${ entry.port }`;
		const existing: Undefinedable<LogEndpoint> = logMap.get( key );
		if( undefined === existing ) {
			logMap.set( key, { entry, modules: [ label ] } );
		} else {
			existing.modules.push( label );
		}
	}
}

const args: string[] = process.argv.slice( 2 );
let configPath: string = 'config.json';

const cL1: number = args.length;
for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
	if( '--help' === args[ iL1 ] ) {
		console.log( helpText );
		process.exit( 0 );
	}
	if( '--config' === args[ iL1 ] && iL1 + 1 < cL1 ) {
		configPath = args[ iL1 + 1 ]!;
		iL1++;
	}
}

let error;
if( existsSync( configPath ) ) {
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse( readFileSync( configPath, 'utf-8' ) ) as Record<string, unknown>;
		if( 'string' === typeof raw.zimPath ) {
			if( raw.mcp && 'object' === typeof raw.mcp ) {
				if( raw.web && 'object' === typeof raw.web ) {
					let mcp: Undefinedable<McpConfig>;
					const src: Record<string, unknown> = raw.mcp as Record<string, unknown>;
					const enabled: boolean = 'boolean' === typeof src.enabled ? src.enabled : false;
					let parsedListeners: { error?: string, results?: Listener[] } = _ParseListeners( src.listen, 'mcp.listen' );
					if( !parsedListeners.error && parsedListeners.results ) {
						if( !enabled || 0 < parsedListeners.results.length ) {
							mcp = {
								enabled,
								listeners: parsedListeners.results,
								maxConcurrentSearch: 'number' === typeof src.maxConcurrentSearch ? src.maxConcurrentSearch : 2,
								maxConcurrentArticle: 'number' === typeof src.maxConcurrentArticle ? src.maxConcurrentArticle : 3,
								searchResultsPerFile: 'number' === typeof src.searchResultsPerFile ? src.searchResultsPerFile : 2
							};
						}
						if( mcp ) {
							let web: Undefinedable<WebConfig>;
							const src: Record<string, unknown> = raw.web as Record<string, unknown>;
							const enabled: boolean = 'boolean' === typeof src.enabled ? src.enabled : false;
							parsedListeners = _ParseListeners( src.listen, 'mcp.listen' );
							if( !parsedListeners.error && parsedListeners.results ) {
								if( !enabled || 0 < parsedListeners.results.length ) {
									web = {
										enabled,
										listeners: parsedListeners.results,
										maxConcurrentPage: 'number' === typeof src.maxConcurrentPage ? src.maxConcurrentPage : 4,
										searchResultsPerPage: 'number' === typeof src.searchResultsPerPage && 0 < src.searchResultsPerPage ? src.searchResultsPerPage : 10
									};
								}
								if( web ) {
									const config: ServerConfig = {
										zimPath: raw.zimPath as string,
										cacheMaxSize: 'number' === typeof raw.cacheMaxSize ? raw.cacheMaxSize : 200,
										cacheTtlMs: 'number' === typeof raw.cacheTtlMs ? raw.cacheTtlMs : 300000,
										logFile: 'string' === typeof raw.logFile ? raw.logFile : '',
										corsOrigins: Array.isArray( raw.corsOrigins ) && ( raw.corsOrigins as unknown[] ).every( ( o: unknown ) => 'string' === typeof o ) ? raw.corsOrigins as string[] : [ '*' ],
										trustedProxies: Array.isArray( raw.trustedProxies ) && ( raw.trustedProxies as unknown[] ).every( ( o: unknown ) => 'string' === typeof o ) ? raw.trustedProxies as string[] : [],
										mcp: mcp,
										web: web
									};
									if(
										( config.mcp.enabled && 0 < config.mcp.listeners.length )
										||
										( config.web.enabled && 0 < config.web.listeners.length )
									) {
										const server: ZimHttpServer = new ZimHttpServer( config );

										if( config.mcp.enabled ) { _AddLogEntry( config.mcp.listeners, 'mcp' ); }
										if( config.web.enabled ) { _AddLogEntry( config.web.listeners, 'web' ); }

										console.log( `jZimHTTP listening:` );
										for( const info of logMap.values() ) {
											console.log( `http://${ info.entry.host }:${ info.entry.port } [${ info.modules.join( ',' ) }]` );
										}
										console.log( `ZIM directory: ${ config.zimPath }` );

										process.on( 'SIGINT', () => {
											server.shutdown();
											process.exit( 0 );
										} );

										process.on( 'SIGTERM', () => {
											server.shutdown();
											process.exit( 0 );
										} );
									} else {
										error = 'No active modules: both mcp and web are disabled or have empty listen';
									}
								} else {
									error = 'web.enabled is true but web.listen is missing or empty';
								}
							} else {
								error = 'mcp.enabled is true but mcp.listen is missing or empty';
							}
						} else {
							error = parsedListeners.error;
						}
					} else {
						error = parsedListeners.error;
					}
				} else {
					error = `Invalid configuration: missing or wrong type for web`;
				}
			} else {
				error = `Invalid configuration: missing or wrong type for mcp`;
			}
		} else {
			error = `Invalid configuration: missing or wrong type for zimPath`;
		}
	} catch( error: unknown ) {
		const message: string = error instanceof Error ? error.message : String( error );
		error = `Failed to read config file ${ configPath }: ${ message }`;
	}
} else {
	error = `Missing configuration. Provide config.json or use --config <path>. See --help.`;
}
if( error ) {
	console.error( error );
	process.exit( 1 );
}