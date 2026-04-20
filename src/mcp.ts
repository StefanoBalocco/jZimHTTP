import type { Context, Hono } from 'hono';
import type { HTMLElement } from 'node-html-parser';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import { LruTtlCache } from './cache.js';
import { Logger } from './logger.js';
import { RequestLogger } from './request-logger.js';
import { Semaphore } from './semaphore.js';
import type { ArticleResponse, CachedPageHtml, FileInfo, McpConfig, Nullable, SearchPage, SearchResponse, SearchResult, SearchResultEntry, ToolDefinition, Undefinedable } from './types.js';
import { TOOL_DEFINITIONS } from './types.js';
import { Zim } from './zim.js';

interface JsonRpcRequest {
	jsonrpc: string;
	id: Nullable<number | string>;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: Nullable<number | string>;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

const unwantedSelectors: string[] = [ 'script', 'style', 'meta', 'link', 'head', 'footer', 'noscript', 'img', 'figure', 'figcaption', 'picture', '.mw-parser-output .reflist', '.mw-editsection' ];

interface ToolSchemaProperty {
	type: string;
	minimum?: number;
	maximum?: number;
}

interface ToolSchema {
	properties: Record<string, Undefinedable<ToolSchemaProperty>>;
	required: string[];
}

export class Mcp {
	private static _turndown: Undefinedable<TurndownService>;
	private readonly _zim: Zim;
	private readonly _config: McpConfig;
	private readonly _searchSemaphore: Semaphore;
	private readonly _articleSemaphore: Semaphore;
	private readonly _mdCache: LruTtlCache<string>;
	private _cleanupTimer: Undefinedable<ReturnType<typeof setInterval>>;
	private readonly _logger: Logger;

	constructor( zim: Zim, config: McpConfig, cacheMaxSize: number, cacheTtlMs: number ) {
		this._zim = zim;
		this._config = config;
		this._searchSemaphore = new Semaphore( config.maxConcurrentSearch );
		this._articleSemaphore = new Semaphore( config.maxConcurrentArticle );
		this._mdCache = new LruTtlCache<string>( cacheMaxSize, cacheTtlMs );
		this._cleanupTimer = setInterval( () => this._mdCache.cleanup(), 60 * 1000 );
		this._logger = Logger.getInstance();
	}

	private static _successResponse( id: Nullable<number | string>, result: unknown ): JsonRpcResponse {
		return { jsonrpc: '2.0', id, result };
	}

	private static _errorResponse( id: Nullable<number | string>, code: number, message: string ): JsonRpcResponse {
		return { jsonrpc: '2.0', id, error: { code, message } };
	}

	private static _convertHtmlToMarkdown( html: string ): string {
		let returnValue: string = '';
		if( 0 < html.trim().length ) {
			const root: HTMLElement = parse( html );
			for( const selector of unwantedSelectors ) {
				root.querySelectorAll( selector ).forEach( ( el: HTMLElement ) => el.remove() );
			}
			const cleaned: string = root.querySelector( 'body' )?.innerHTML ?? root.innerHTML;
			if( undefined === Mcp._turndown ) {
				const td: TurndownService = new TurndownService( { codeBlockStyle: 'fenced', bulletListMarker: '-', headingStyle: 'atx' } );
				td.addRule( 'paragraph', {
					filter: 'p',
					replacement: ( content: string ) => '\n\n' + content + '\n\n'
				} );
				td.addRule( 'listItem', {
					filter: 'li',
					replacement: ( content: string ) => '- ' + content.trim() + '\n'
				} );
				Mcp._turndown = td;
			}
			returnValue = Mcp._turndown.turndown( cleaned ).trim();
		}
		return returnValue;
	}

	async search( query: string, page?: number ): Promise<SearchResponse> {
		this._logger.stdout( 'Mcp.search', 'ENTER', query );

		const limit: number = this._config.searchResultsPerFile;
		const resolvedPage: number = page ?? 1;
		const resolvedOffset: number = ( resolvedPage - 1 ) * limit;
		const files: FileInfo[] = await this._zim.listFiles();
		const perFile: SearchResultEntry[][] = [];
		let globalHasMore: boolean = false;

		const cL1: number = files.length;
		for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
			const filename: string = files[ iL1 ]!.name;
			const fileResults: { total: number; results: SearchResultEntry[] } = await this._getSearchResults( filename, query, resolvedOffset, limit );
			if( fileResults.total > resolvedOffset + limit ) {
				globalHasMore = true;
			}
			if( 0 < fileResults.results.length ) {
				perFile.push( fileResults.results );
			}
		}

		const interleaved: SearchResultEntry[] = [];
		let rowIndex: number = 0;
		let hasRow: boolean = true;
		while( hasRow ) {
			hasRow = false;
			const cL2: number = perFile.length;
			for( let iL2: number = 0; iL2 < cL2; iL2++ ) {
				const fileResults: SearchResultEntry[] = perFile[ iL2 ]!;
				if( rowIndex < fileResults.length ) {
					interleaved.push( fileResults[ rowIndex ]! );
					if( rowIndex + 1 < fileResults.length ) {
						hasRow = true;
					}
				}
			}
			rowIndex++;
		}

		const returnValue: SearchResponse = { results: interleaved, page: resolvedPage, hasMore: globalHasMore };
		return returnValue;
	}

	async article( entryPath: string ): Promise<ArticleResponse> {
		let returnValue: ArticleResponse;
		this._logger.stdout( 'Mcp.article', 'ENTER', entryPath );

		const cacheKey: string = `md:${ entryPath }`;
		const cachedRaw: Undefinedable<string> = this._mdCache.get( cacheKey );
		if( undefined !== cachedRaw ) {
			returnValue = JSON.parse( cachedRaw ) as ArticleResponse;
		} else {
			await this._articleSemaphore.acquire();
			try {
				const page: Undefinedable<CachedPageHtml> = await this._zim.getPageHtml( entryPath );
				if( undefined === page ) {
					throw new Error( `Entry not found or not HTML: ${ entryPath }` );
				}
				const content: string = Mcp._convertHtmlToMarkdown( page.html );
				const art: ArticleResponse = {
					content,
					sizeBytes: Buffer.byteLength( content, 'utf8' )
				};
				this._mdCache.set( cacheKey, JSON.stringify( art ) );
				returnValue = art;
			} finally {
				this._articleSemaphore.release();
			}
		}

		return returnValue;
	}

	registerRoutes( app: Hono, logger: RequestLogger, resolveRemoteHost: ( c: Context ) => string ): void {
		const self: Mcp = this;

		app.post( '/mcp', async( c: Context ) => {
			const requestTime: number = Date.now();
			const remoteHost: string = resolveRemoteHost( c );
			let returnValue!: Response;

			let body: unknown;
			let bodyParseOk: boolean = true;
			try {
				body = await c.req.json();
			} catch {
				bodyParseOk = false;
			}

			if( bodyParseOk ) {
				const request: JsonRpcRequest = body as JsonRpcRequest;
				if( '2.0' === request.jsonrpc ) {
					let logToolName: Undefinedable<string>;
					let logToolArgs: Undefinedable<Record<string, unknown>>;
					if( 'tools/call' === request.method && request.params ) {
						const nameVal: unknown = request.params.name;
						const argsVal: unknown = request.params.arguments;
						if( 'string' === typeof nameVal ) {
							logToolName = nameVal as string;
						}
						if( argsVal && 'object' === typeof argsVal ) {
							logToolArgs = argsVal as Record<string, unknown>;
						}
					}
					logger.logConsole( {
						remoteHost,
						date: new Date(),
						httpMethod: c.req.method,
						path: c.req.path,
						marker: 'START',
						mcpMethod: request.method,
						toolName: logToolName,
						toolArgs: logToolArgs
					} );
					const response: Undefinedable<JsonRpcResponse> = await self._handleMethod( request );
					logger.logConsole( {
						remoteHost,
						date: new Date(),
						httpMethod: c.req.method,
						path: c.req.path,
						marker: 'SEMRL',
						mcpMethod: request.method,
						toolName: logToolName,
						status: response ? 200 : 204,
						durationMs: Date.now() - requestTime
					} );
					if( response ) {
						returnValue = c.json( response );
					} else {
						returnValue = c.newResponse( null, 204 );
					}
				} else {
					const ts: string = new Date().toISOString();
					logger.logConsoleLine( `${ ts } POST    ${ remoteHost } /mcp 400` );
					returnValue = c.json( Mcp._errorResponse( ( body as JsonRpcRequest ).id ?? null, -32600, 'Invalid request' ) );
				}
			} else {
				const ts: string = new Date().toISOString();
				logger.logConsoleLine( `${ ts } POST    ${ remoteHost } /mcp 400` );
				returnValue = c.json( Mcp._errorResponse( null, -32700, 'Parse error' ) );
			}

			return returnValue;
		} );
	}

	shutdown(): void {
		if( undefined !== this._cleanupTimer ) {
			clearInterval( this._cleanupTimer );
			this._cleanupTimer = undefined;
		}
		this._mdCache.clear();
	}

	private async _getSearchResults( filename: string, query: string, offset: number, limit: number ): Promise<{ total: number; results: SearchResultEntry[] }> {
		let returnValue: { total: number; results: SearchResultEntry[] } = { total: 0, results: [] };
		await this._searchSemaphore.acquire();
		try {
			const page: SearchPage = await this._zim.search( filename, query, offset, limit );
			const results: SearchResultEntry[] = [];
			const cL1: number = page.results.length;
			for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
				const hit: SearchResult = page.results[ iL1 ]!;
				try {
					const art: ArticleResponse = await this.article( hit.path );
					if( 0 < art.sizeBytes ) {
						results.push( {
							title: hit.title,
							path: hit.path,
							sizeBytes: art.sizeBytes
						} );
					}
				} catch( error: unknown ) {
					const message: string = error instanceof Error ? error.message : String( error );
					this._logger.stdout( 'Mcp._getSearchResults', 'EXCEPTION', message );
				}
			}
			returnValue = { total: page.total, results };
		} finally {
			this._searchSemaphore.release();
		}
		return returnValue;
	}

	private async _handleMethod( request: JsonRpcRequest ): Promise<Undefinedable<JsonRpcResponse>> {
		let returnValue: Undefinedable<JsonRpcResponse>;
		switch( request.method ) {
			case 'initialize':
				returnValue = Mcp._successResponse( request.id, {
					protocolVersion: '2025-03-26',
					capabilities: { tools: {} },
					serverInfo: { name: 'jzimhttp', version: '1.0.0' }
				} );
				break;
			case 'notifications/initialized':
				break;
			case 'tools/list':
				returnValue = Mcp._successResponse( request.id, {
					tools: TOOL_DEFINITIONS.map( t => ( {
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema
					} ) )
				} );
				break;
			case 'tools/call':
				returnValue = await this._handleToolCall( request );
				break;
			default:
				returnValue = Mcp._errorResponse( request.id, -32601, `Method not found: ${ request.method }` );
				break;
		}
		return returnValue;
	}

	private async _handleToolCall( request: JsonRpcRequest ): Promise<JsonRpcResponse> {
		const params: Record<string, unknown> = ( request.params ?? {} ) as Record<string, unknown>;
		const toolName: Undefinedable<string> = params.name as Undefinedable<string>;
		const toolArgs: Record<string, unknown> = ( params.arguments ?? {} ) as Record<string, unknown>;
		let returnValue: JsonRpcResponse;

		if( toolName ) {
			const definition: Undefinedable<ToolDefinition> = TOOL_DEFINITIONS.find( ( t: ToolDefinition ) => t.name === toolName );
			if( undefined !== definition ) {
				const schema: ToolSchema = definition.inputSchema as unknown as ToolSchema;
				let validationError: Undefinedable<string>;

				schema.required.every( ( requiredField: string ) => {
					let continueChecking: boolean = true;
					if( !toolArgs[ requiredField ] ) {
						validationError = `Missing required parameter: ${ requiredField }`;
						continueChecking = false;
					}
					return continueChecking;
				} );

				if( undefined === validationError ) {
					Object.entries( toolArgs ).every( ( [ key, value ]: [ string, unknown ] ) => {
						let continueChecking: boolean = true;
						const propSchema: Undefinedable<ToolSchemaProperty> = schema.properties[ key ];
						if( undefined !== propSchema ) {
							if( 'string' === propSchema.type && 'string' !== typeof value ) {
								validationError = `Parameter ${ key } must be a string`;
								continueChecking = false;
							} else if( 'integer' === propSchema.type && ( 'number' !== typeof value || !Number.isInteger( value ) ) ) {
								validationError = `Parameter ${ key } must be an integer`;
								continueChecking = false;
							} else if( 'boolean' === propSchema.type && 'boolean' !== typeof value ) {
								validationError = `Parameter ${ key } must be a boolean`;
								continueChecking = false;
							} else if( 'integer' === propSchema.type && 'number' === typeof value && Number.isInteger( value ) ) {
								if( undefined !== propSchema.minimum && value < propSchema.minimum ) {
									validationError = `Parameter ${ key } must be >= ${ propSchema.minimum }`;
									continueChecking = false;
								} else if( undefined !== propSchema.maximum && value > propSchema.maximum ) {
									validationError = `Parameter ${ key } must be <= ${ propSchema.maximum }`;
									continueChecking = false;
								}
							}
						}
						return continueChecking;
					} );
				}

				if( undefined === validationError ) {
					try {
						let result: unknown;
						switch( toolName ) {
							case 'search':
								result = await this.search( toolArgs.query as string, toolArgs.page as Undefinedable<number> );
								break;
							case 'article': {
								const art: ArticleResponse = await this.article( toolArgs.path as string );
								result = art.content;
								break;
							}
							default:
								throw new Error( `Unknown tool: ${ toolName }` );
						}
						returnValue = Mcp._successResponse( request.id, {
							content: [ { type: 'text', text: JSON.stringify( result, null, 2 ) } ]
						} );
					} catch( error: unknown ) {
						const message: string = error instanceof Error ? error.message : String( error );
						returnValue = Mcp._successResponse( request.id, {
							content: [ { type: 'text', text: JSON.stringify( { error: message } ) } ],
							isError: true
						} );
					}
				} else {
					returnValue = Mcp._errorResponse( request.id, -32602, validationError );
				}
			} else {
				returnValue = Mcp._errorResponse( request.id, -32602, `Unknown tool: ${ toolName }` );
			}
		} else {
			returnValue = Mcp._errorResponse( request.id, -32602, 'Missing tool name' );
		}
		return returnValue;
	}

}
