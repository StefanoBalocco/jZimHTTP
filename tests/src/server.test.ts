import test from 'ava';
import * as fs from 'fs/promises';
import * as http from 'node:http';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'url';
import type { ServerType } from '@hono/node-server';
import type { RequestLogger } from '../../backend/dist/request-logger.js';
import { ZimHttpServer } from '../../backend/dist/server.js';
import type { ServerConfig } from '../../backend/dist/types.js';

const __dirname: string = path.dirname( fileURLToPath( import.meta.url ) );
const dataDir: string = path.resolve( __dirname, '../../tests/data' );
const zimFileName: string = 'wikipedia_en_100_mini_2026-01.zim';

interface ServerHandle {
	server: ZimHttpServer;
	servers: ServerType[];
	ports: number[];
	logPath: string;
}

function buildConfig( overrides: Partial<ServerConfig> = {} ): { config: ServerConfig; logPath: string } {
	const logPath: string = path.join( os.tmpdir(), `jzim-server-${ randomUUID() }.log` );
	const base: ServerConfig = {
		zimPath: dataDir,
		cacheMaxSize: 200,
		cacheTtlMs: 300000,
		logFile: logPath,
		corsOrigins: [ '*' ],
		trustedProxies: [],
		mcp: {
			enabled: true,
			listeners: [ { host: '127.0.0.1', port: 0 } ],
			maxConcurrentSearch: 2,
			maxConcurrentArticle: 3,
			searchResultsPerFile: 2
		},
		web: {
			enabled: true,
			listeners: [ { host: '127.0.0.1', port: 0 } ],
			maxConcurrentPage: 4,
			searchResultsPerPage: 10
		}
	};
	return { config: { ...base, ...overrides }, logPath };
}

function waitForListening( server: ServerType ): Promise<number> {
	if( server.listening ) {
		return Promise.resolve( ( server.address() as AddressInfo ).port );
	}
	return new Promise<number>( ( resolve ) => {
		server.once( 'listening', () => {
			resolve( ( server.address() as AddressInfo ).port );
		} );
	} );
}

async function startServer( overrides: Partial<ServerConfig> = {} ): Promise<ServerHandle> {
	const { config, logPath } = buildConfig( overrides );
	const server: ZimHttpServer = new ZimHttpServer( config );
	const servers: ServerType[] = ( server as unknown as { _servers: ServerType[] } )._servers;
	const ports: number[] = [];
	for( const s of servers ) {
		ports.push( await waitForListening( s ) );
	}
	return { server, servers, ports, logPath };
}

async function stopServer( handle: ServerHandle ): Promise<string> {
	const logger: RequestLogger = ( handle.server as unknown as { _logger: RequestLogger } )._logger;
	await new Promise<void>( ( resolve ) => logger.shutdown( resolve ) );
	handle.server.shutdown();
	for( const s of handle.servers ) {
		( s as HttpServer ).closeAllConnections();
		await new Promise<void>( ( resolve ) => {
			if( s.listening ) {
				s.once( 'close', () => resolve() );
			} else {
				resolve();
			}
		} );
	}
	const content: string = await fs.readFile( handle.logPath, 'utf-8' ).catch( () => '' );
	await fs.unlink( handle.logPath ).catch( () => {} );
	return content;
}

function baseUrl( port: number ): string {
	return `http://127.0.0.1:${ port }`;
}

interface RawResponse {
	statusCode: number;
	contentType: string;
	body: string;
}

function requestPath( port: number, rawPath: string ): Promise<RawResponse> {
	return new Promise<RawResponse>( ( resolve, reject ) => {
		const req: http.ClientRequest = http.request( {
			host: '127.0.0.1',
			port,
			path: rawPath,
			method: 'GET',
			headers: { 'Connection': 'close' }
		}, ( res: http.IncomingMessage ) => {
			const chunks: Buffer[] = [];
			res.on( 'data', ( chunk: Buffer ) => {
				chunks.push( chunk );
			} );
			res.on( 'end', () => {
				resolve( {
					statusCode: res.statusCode ?? 0,
					contentType: res.headers[ 'content-type' ] ?? '',
					body: Buffer.concat( chunks ).toString( 'utf-8' )
				} );
			} );
		} );
		req.on( 'error', reject );
		req.end();
	} );
}

test( 'combined listener: preflight on search results echoes origin and advertises GET,POST,OPTIONS', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/search/${ encodeURIComponent( zimFileName ) }/results`, {
			method: 'OPTIONS',
			headers: {
				'Origin': 'http://example.com',
				'Access-Control-Request-Method': 'GET',
				'Access-Control-Request-Headers': 'Content-Type',
				'Connection': 'close'
			}
		} );
		t.is( 204, res.status );
		t.is( 'http://example.com', res.headers.get( 'access-control-allow-origin' ) ?? '' );
		t.is( 'GET,POST,OPTIONS', res.headers.get( 'access-control-allow-methods' ) ?? '' );
		t.is( 'Content-Type', res.headers.get( 'access-control-allow-headers' ) ?? '' );
		t.falsy( res.headers.get( 'allow' ) );
		// 204 has no content, so no content-type header (node-server v2 omits it)
		t.falsy( res.headers.get( 'content-type' ) );
	} finally {
		await stopServer( handle );
	}
} );

test( 'combined listener: preflight on parameterized z path returns 204', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/z/${ encodeURIComponent( zimFileName ) }/A/foo.html`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'GET', 'Connection': 'close' }
		} );
		t.is( 204, res.status );
		t.is( 'http://example.com', res.headers.get( 'access-control-allow-origin' ) ?? '' );
	} finally {
		await stopServer( handle );
	}
} );

test( 'combined listener: preflight on /mcp returns 204', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/mcp`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'POST', 'Connection': 'close' }
		} );
		t.is( 204, res.status );
		t.is( 'http://example.com', res.headers.get( 'access-control-allow-origin' ) ?? '' );
	} finally {
		await stopServer( handle );
	}
} );

test( 'preflight requesting X-Custom header still advertises only Content-Type', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: {
				'Origin': 'http://example.com',
				'Access-Control-Request-Method': 'GET',
				'Access-Control-Request-Headers': 'X-Custom',
				'Connection': 'close'
			}
		} );
		t.is( 204, res.status );
		t.is( 'Content-Type', res.headers.get( 'access-control-allow-headers' ) ?? '' );
	} finally {
		await stopServer( handle );
	}
} );

test( 'wildcard origins: absent origin yields access-control-allow-origin *', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Connection': 'close' }
		} );
		t.is( 204, res.status );
		t.is( '*', res.headers.get( 'access-control-allow-origin' ) ?? '' );
	} finally {
		await stopServer( handle );
	}
} );

test( 'explicit origins: allowed origin echoes, rejected and absent origins omit header', async( t ) => {
	const handle: ServerHandle = await startServer( { corsOrigins: [ 'http://allowed.example' ] } );
	try {
		const allowed: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://allowed.example', 'Connection': 'close' }
		} );
		t.is( 204, allowed.status );
		t.is( 'http://allowed.example', allowed.headers.get( 'access-control-allow-origin' ) ?? '' );

		const rejected: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://rejected.example', 'Connection': 'close' }
		} );
		t.is( 204, rejected.status );
		t.falsy( rejected.headers.get( 'access-control-allow-origin' ) );

		const absent: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Connection': 'close' }
		} );
		t.is( 204, absent.status );
		t.falsy( absent.headers.get( 'access-control-allow-origin' ) );
	} finally {
		await stopServer( handle );
	}
} );

test( 'mcp-only listener advertises POST,OPTIONS and answers unknown preflights with 204', async( t ) => {
	const handle: ServerHandle = await startServer( {
		web: { enabled: false, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 }
	} );
	try {
		const mcp: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/mcp`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'POST', 'Connection': 'close' }
		} );
		t.is( 204, mcp.status );
		t.is( 'POST,OPTIONS', mcp.headers.get( 'access-control-allow-methods' ) ?? '' );

		const unknown: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'POST', 'Connection': 'close' }
		} );
		t.is( 204, unknown.status );
	} finally {
		await stopServer( handle );
	}
} );

test( 'web-only listener advertises GET,OPTIONS and answers unknown preflights with 204', async( t ) => {
	const handle: ServerHandle = await startServer( {
		mcp: { enabled: false, listeners: [], maxConcurrentSearch: 2, maxConcurrentArticle: 3, searchResultsPerFile: 2 }
	} );
	try {
		const files: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'GET', 'Connection': 'close' }
		} );
		t.is( 204, files.status );
		t.is( 'GET,OPTIONS', files.headers.get( 'access-control-allow-methods' ) ?? '' );

		const unknown: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/does_not_exist`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'GET', 'Connection': 'close' }
		} );
		t.is( 204, unknown.status );
	} finally {
		await stopServer( handle );
	}
} );

test( 'actual GET /files and POST /mcp retain access-control-allow-origin', async( t ) => {
	const handle: ServerHandle = await startServer();
	try {
		const getRes: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			headers: { 'Origin': 'http://example.com', 'Connection': 'close' }
		} );
		t.is( 200, getRes.status );
		t.is( 'http://example.com', getRes.headers.get( 'access-control-allow-origin' ) ?? '' );

		const postRes: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/mcp`, {
			method: 'POST',
			headers: { 'Origin': 'http://example.com', 'Content-Type': 'application/json', 'Connection': 'close' },
			body: JSON.stringify( { jsonrpc: '2.0', id: 1, method: 'tools/list' } )
		} );
		t.is( 200, postRes.status );
		t.is( 'http://example.com', postRes.headers.get( 'access-control-allow-origin' ) ?? '' );
	} finally {
		await stopServer( handle );
	}
} );

test( 'preflight is logged as status 204 in the CLF log', async( t ) => {
	const handle: ServerHandle = await startServer();
	let content: string = '';
	try {
		const res: Response = await fetch( `${ baseUrl( handle.ports[ 0 ]! ) }/files`, {
			method: 'OPTIONS',
			headers: { 'Origin': 'http://example.com', 'Access-Control-Request-Method': 'GET', 'Connection': 'close' }
		} );
		t.is( 204, res.status );
	} finally {
		content = await stopServer( handle );
	}
	t.true( content.includes( '"OPTIONS /files HTTP/1.1" 204' ) );
} );

test( 'web listener: GET //files is normalized to /files and returns the files JSON', async( t ) => {
	const handle: ServerHandle = await startServer( {
		mcp: { enabled: false, listeners: [], maxConcurrentSearch: 2, maxConcurrentArticle: 3, searchResultsPerFile: 2 }
	} );
	try {
		const res: RawResponse = await requestPath( handle.ports[ 0 ]!, '//files' );
		t.is( 200, res.statusCode );
		t.true( res.contentType.includes( 'application/json' ) );
		const body: Array<{ name: string }> = JSON.parse( res.body ) as Array<{ name: string }>;
		t.true( Array.isArray( body ) );
		t.true( 0 < body.length );
		t.true( body[ 0 ]!.name.endsWith( '.zim' ) );
	} finally {
		await stopServer( handle );
	}
} );

test( 'web listener: GET ///files is normalized to /files and returns the files JSON', async( t ) => {
	const handle: ServerHandle = await startServer( {
		mcp: { enabled: false, listeners: [], maxConcurrentSearch: 2, maxConcurrentArticle: 3, searchResultsPerFile: 2 }
	} );
	try {
		const res: RawResponse = await requestPath( handle.ports[ 0 ]!, '///files' );
		t.is( 200, res.statusCode );
		t.true( res.contentType.includes( 'application/json' ) );
		const body: Array<{ name: string }> = JSON.parse( res.body ) as Array<{ name: string }>;
		t.true( Array.isArray( body ) );
		t.true( 0 < body.length );
		t.true( body[ 0 ]!.name.endsWith( '.zim' ) );
	} finally {
		await stopServer( handle );
	}
} );
