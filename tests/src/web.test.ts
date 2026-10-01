import test from 'ava';
import { createHash } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import { Zim } from '../../backend/dist/zim.js';
import { Web } from '../../backend/dist/web.js';
import type { CachedPageHtml, FileInfo, Undefinedable, WebConfig, WebSearchResponse } from '../../backend/dist/types.js';

const __dirname: string = path.dirname( fileURLToPath( import.meta.url ) );
const dataDir: string = path.resolve( __dirname, '../../tests/data' );

function buildApp(): { app: Hono; zim: Zim } {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const app: Hono = new Hono();
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	web.registerRoutes( app );
	return { app, zim };
}

interface FakeArchive {
	name: string;
	entry: string;
	marker: string;
	html: string;
	date?: string;
}

function buildFakeZim( archives: FakeArchive[] ): Zim {
	const metadata: Map<string, FileInfo> = new Map<string, FileInfo>();
	const pages: Map<string, CachedPageHtml> = new Map<string, CachedPageHtml>();
	for( const archive of archives ) {
		const mainPath: string = archive.name + '/' + archive.entry;
		metadata.set( archive.name, {
			name: archive.name,
			title: archive.name,
			description: '',
			date: archive.date ?? '2026-01-01',
			language: 'en',
			creator: '',
			articleCount: 1,
			mediaCount: 0,
			mainPath
		} );
		pages.set( mainPath, {
			html: archive.html,
			mimetype: 'text/html',
			sizeBytes: Buffer.byteLength( archive.html, 'utf8' )
		} );
	}
	const fake: {
		getFileMetadata: ( filename: string ) => Promise<Undefinedable<FileInfo>>;
		getPageHtml: ( entryPath: string ) => Promise<Undefinedable<CachedPageHtml>>;
		shutdown: () => void;
	} = {
		getFileMetadata: async( filename: string ): Promise<Undefinedable<FileInfo>> => metadata.get( filename ),
		getPageHtml: async( entryPath: string ): Promise<Undefinedable<CachedPageHtml>> => pages.get( entryPath ),
		shutdown: (): void => {}
	};
	return fake as unknown as Zim;
}

test( 'GET / serves the generated static shell', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/' );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'content-type' ) ?? '' ).includes( 'text/html' ) );
	t.is( 'no-cache', res.headers.get( 'cache-control' ) ?? '' );
	const body: string = await res.text();
	t.true( body.includes( '<script type="module" src="/app.min.js?' ) );
	t.true( body.includes( 'data-home-template="/home.min.mjs?' ) );
	zim.shutdown();
} );

test( 'GET /app.min.js serves the static app bundle', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/app.min.js' );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'cache-control' ) ?? '' ).includes( 'immutable' ) );
	zim.shutdown();
} );

test( 'GET /app.min.js with Range returns 206 with immutable cache headers', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/app.min.js', { headers: { 'range': 'bytes=0-15' } } );
	t.is( 206, res.status );
	t.is( 'public, max-age=31536000, immutable', res.headers.get( 'cache-control' ) ?? '' );
	zim.shutdown();
} );

test( 'GET /home.min.mjs serves the static template module', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/home.min.mjs' );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'cache-control' ) ?? '' ).includes( 'immutable' ) );
	zim.shutdown();
} );

test( 'GET /missing.js returns 404 without immutable cache headers', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/missing.js' );
	t.is( 404, res.status );
	t.false( ( res.headers.get( 'cache-control' ) ?? '' ).includes( 'immutable' ) );
	zim.shutdown();
} );

test( 'GET /files returns JSON array of file info', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/files' );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'content-type' ) ?? '' ).includes( 'application/json' ) );
	const body = await res.json() as Array<{ name: string }>;
	t.true( Array.isArray( body ) );
	t.true( 0 < body.length );
	t.true( body[ 0 ]!.name.endsWith( '.zim' ) );
	zim.shutdown();
} );

test( 'GET /z/<filename> redirects to main entry', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const res: Response = await app.request( '/z/' + encodeURIComponent( files[ 0 ]!.name ) );
	t.is( 302, res.status );
	const location: string = res.headers.get( 'location' ) as string;
	t.true( location.startsWith( '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/' ) );
	zim.shutdown();
} );

test( 'GET /z/<filename>/<main entry> serves HTML with caching headers', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	const entryOnly: string = main.substring( files[ 0 ]!.name.length + 1 );
	const url: string = '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/' + entryOnly;
	const res: Response = await app.request( url );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'content-type' ) ?? '' ).includes( 'html' ) );
	t.true( null !== res.headers.get( 'etag' ) );
	t.true( null !== res.headers.get( 'last-modified' ) );
	t.true( ( res.headers.get( 'cache-control' ) ?? '' ).includes( 'must-revalidate' ) );
	zim.shutdown();
} );

test( 'GET /z/... with matching If-None-Match returns 304', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	const entryOnly: string = main.substring( files[ 0 ]!.name.length + 1 );
	const url: string = '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/' + entryOnly;
	const first: Response = await app.request( url );
	const etag: string = first.headers.get( 'etag' ) as string;
	const res: Response = await app.request( url, { headers: { 'if-none-match': etag } } );
	t.is( 304, res.status );
	zim.shutdown();
} );

test( 'GET /z/... with nonmatching If-None-Match plus matching If-Modified-Since returns 200', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	const entryOnly: string = main.substring( files[ 0 ]!.name.length + 1 );
	const url: string = '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/' + entryOnly;
	const first: Response = await app.request( url );
	const etag: string = first.headers.get( 'etag' ) as string;
	const lastModified: string = first.headers.get( 'last-modified' ) as string;
	const nonMatchingEtag: string = '"' + 'x'.repeat( 22 ) + '"';
	t.not( nonMatchingEtag, etag );
	const res: Response = await app.request( url, { headers: { 'if-none-match': nonMatchingEtag, 'if-modified-since': lastModified } } );
	t.is( 200, res.status );
	zim.shutdown();
} );

test( 'GET /z/unknown.zim returns 404', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/z/does_not_exist.zim' );
	t.is( 404, res.status );
	zim.shutdown();
} );

test( 'GET /z/<filename>/<malformed percent escape> returns 404 not 500', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const url: string = '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/%';
	const res: Response = await app.request( url );
	t.is( 404, res.status );
	zim.shutdown();
} );

test( 'GET /z/<encoded filename>/<entry> serves entries for archives whose names contain percent-encoded reserved characters', async( t ) => {
	const archives: FakeArchive[] = [
		{ name: 'a%b.zim', entry: 'A/foo.html', marker: 'percent-archive', html: '<html><body><p>percent-archive</p></body></html>' },
		{ name: 'a?b.zim', entry: 'A/foo.html', marker: 'question-archive', html: '<html><body><p>question-archive</p></body></html>' },
		{ name: 'a#b.zim', entry: 'A/foo.html', marker: 'hash-archive', html: '<html><body><p>hash-archive</p></body></html>' }
	];
	const zim: Zim = buildFakeZim( archives );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	const app: Hono = new Hono();
	web.registerRoutes( app );
	for( const archive of archives ) {
		const url: string = '/z/' + encodeURIComponent( archive.name ) + '/' + archive.entry;
		const res: Response = await app.request( url );
		t.is( 200, res.status, archive.name + ' must reach its entry instead of the empty-entry 404' );
		const body: string = await res.text();
		t.true( body.includes( '<p>' + archive.marker + '</p>' ), archive.name + ' must serve the archive entry HTML' );
	}
	for( const archive of archives ) {
		const url: string = '/z/' + encodeURIComponent( archive.name ).toLowerCase() + '/' + archive.entry;
		const res: Response = await app.request( url );
		t.is( 200, res.status, archive.name + ' must reach its entry with lowercase percent escapes instead of the empty-entry 404' );
		const body: string = await res.text();
		t.true( body.includes( '<p>' + archive.marker + '</p>' ), archive.name + ' must serve the archive entry HTML with lowercase percent escapes' );
	}
} );

test( 'GET /z/<filename>/<entry> with Unicode or quote in entry path serves 200 with opaque MD5 ETag and 304', async( t ) => {
	const archives: FakeArchive[] = [
		{ name: 'unicode.zim', entry: 'A/☃', marker: 'unicode-entry', html: '<html><body><p>unicode-entry</p></body></html>' },
		{ name: 'quote.zim', entry: 'A/test"quote', marker: 'quote-entry', html: '<html><body><p>quote-entry</p></body></html>' }
	];
	const zim: Zim = buildFakeZim( archives );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	const app: Hono = new Hono();
	web.registerRoutes( app );
	const etagPattern: RegExp = /^"[A-Za-z0-9_-]{22}"$/;
	for( const archive of archives ) {
		const encodedEntry: string = archive.entry.split( '/' ).map( ( segment: string ) => encodeURIComponent( segment ) ).join( '/' );
		const url: string = '/z/' + encodeURIComponent( archive.name ) + '/' + encodedEntry;
		const first: Response = await app.request( url );
		t.is( 200, first.status, archive.name + ' must serve the entry instead of 500' );
		const etag: string = first.headers.get( 'etag' ) ?? '';
		t.regex( etag, etagPattern, archive.name + ' ETag must be a quoted opaque MD5 base64url token' );
		const info: Undefinedable<FileInfo> = await zim.getFileMetadata( archive.name );
		const expectedEtag: string = '"' + createHash( 'md5' ).update( archive.name + '\0' + ( info?.date || '0' ) + '\0' + archive.entry ).digest( 'base64url' ) + '"';
		t.is( expectedEtag, etag, archive.name + ' ETag must equal the MD5 of filename, date, and entry path' );
		const second: Response = await app.request( url, { headers: { 'if-none-match': etag } } );
		t.is( 304, second.status, archive.name + ' must return 304 for a matching If-None-Match' );
	}
} );

test( 'GET /z/<filename>/<entry> with invalid ZIM date returns 304 when If-Modified-Since replays the emitted Last-Modified', async( t ) => {
	const archives: FakeArchive[] = [
		{ name: 'nodate.zim', entry: 'A/foo.html', marker: 'no-date', html: '<html><body><p>no-date</p></body></html>', date: '' }
	];
	const zim: Zim = buildFakeZim( archives );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	( web as unknown as { _webStartTime: Date } )._webStartTime = new Date( '2026-01-01T00:00:00.123Z' );
	const app: Hono = new Hono();
	web.registerRoutes( app );
	const url: string = '/z/' + encodeURIComponent( archives[ 0 ]!.name ) + '/' + archives[ 0 ]!.entry;
	const first: Response = await app.request( url );
	t.is( 200, first.status );
	const lastModified: string = first.headers.get( 'last-modified' ) as string;
	t.is( 'Thu, 01 Jan 2026 00:00:00 GMT', lastModified );
	const second: Response = await app.request( url, { headers: { 'if-modified-since': lastModified } } );
	t.is( 304, second.status );
} );

test( 'GET /search/<filename>/results returns JSON with pagination metadata', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const url: string = '/search/' + encodeURIComponent( files[ 0 ]!.name ) + '/results?q=the&p=1';
	const res: Response = await app.request( url );
	t.is( 200, res.status );
	const body = await res.json() as WebSearchResponse;
	t.is( files[ 0 ]!.name, body.filename );
	t.is( 'the', body.query );
	t.is( 1, body.page );
	t.is( 10, body.pageSize );
	t.true( Array.isArray( body.results ) );
	t.true( body.results.length <= 10 );
	zim.shutdown();
} );

test( 'GET /search/<filename>/results with empty q returns zero results', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const url: string = '/search/' + encodeURIComponent( files[ 0 ]!.name ) + '/results?q=';
	const res: Response = await app.request( url );
	t.is( 200, res.status );
	const body = await res.json() as WebSearchResponse;
	t.is( 0, body.total );
	t.is( 0, body.results.length );
	zim.shutdown();
} );

test( 'GET /search/unknown.zim/results returns 404', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/search/does_not_exist.zim/results?q=foo' );
	t.is( 404, res.status );
	zim.shutdown();
} );

test( 'GET /search/<filename>?q=... serves the generated static shell with root-relative assets', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const url: string = '/search/' + encodeURIComponent( files[ 0 ]!.name ) + '?q=the';
	const res: Response = await app.request( url );
	t.is( 200, res.status );
	t.true( ( res.headers.get( 'content-type' ) ?? '' ).includes( 'text/html' ) );
	const body: string = await res.text();
	t.true( body.includes( '<script type="module" src="/app.min.js?' ) );
	t.true( body.includes( 'href="/home.min.mjs?' ) );
	t.true( body.includes( 'href="/search.min.mjs?' ) );
	t.true( body.includes( 'data-home-template="/home.min.mjs?' ) );
	t.true( body.includes( 'data-search-template="/search.min.mjs?' ) );
	zim.shutdown();
} );

test( 'GET /search/unknown.zim returns 404', async( t ) => {
	const { app, zim } = buildApp();
	const res: Response = await app.request( '/search/does_not_exist.zim' );
	t.is( 404, res.status );
	zim.shutdown();
} );

test( 'GET /z/<filename>/<main entry> injects search bar form', async( t ) => {
	const { app, zim } = buildApp();
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	const entryOnly: string = main.substring( files[ 0 ]!.name.length + 1 );
	const url: string = '/z/' + encodeURIComponent( files[ 0 ]!.name ) + '/' + entryOnly;
	const res: Response = await app.request( url );
	t.is( 200, res.status );
	const body: string = await res.text();
	t.true( body.includes( 'jzimhttp-search-bar' ) );
	t.true( body.includes( 'action=""' ) );
	zim.shutdown();
} );

test( 'search bar injection escapes a malicious ZIM filename in the placeholder', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	const inject: ( html: string, filename: string ) => string = ( web as unknown as { _injectSearchBar: ( html: string, filename: string ) => string } )._injectSearchBar;
	const malicious: string = 'x" autofocus onfocus="alert(1)"><script>alert(2)</script>&\'.zim';
	const source: string = '<html><head><title>t</title></head><body><p>Hello</p></body></html>';
	const out: string = inject( source, malicious );
	const root: HTMLElement = parse( out );
	const input: HTMLElement | null = root.querySelector( 'input[name="q"]' );
	t.not( input, null );
	t.is( 'Search in ' + malicious, input!.getAttribute( 'placeholder' ) ?? '' );
	t.falsy( input!.getAttribute( 'aria-label' ) );
	t.falsy( input!.getAttribute( 'autofocus' ) );
	t.falsy( input!.getAttribute( 'onfocus' ) );
	t.falsy( root.querySelector( 'script' ) );
	t.true( out.includes( 'jzimhttp-search-bar' ) );
	t.true( out.includes( '<p>Hello</p>' ) );
	zim.shutdown();
} );

test( 'injected search bar restores the original simple inline document-flow layout', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	const inject: ( html: string, filename: string ) => string = ( web as unknown as { _injectSearchBar: ( html: string, filename: string ) => string } )._injectSearchBar;
	const source: string = '<html><head><title>t</title></head><body><p>Hello</p></body></html>';
	const out: string = inject( source, 'x.zim' );
	const root: HTMLElement = parse( out );
	const form: HTMLElement | null = root.querySelector( 'form.jzimhttp-search-bar' );
	const input: HTMLElement | null = root.querySelector( 'input[name="q"]' );
	const button: HTMLElement | null = root.querySelector( 'button[type="submit"]' );
	t.not( form, null );
	t.not( input, null );
	t.not( button, null );
	const formStyle: string = form!.getAttribute( 'style' ) ?? '';
	const inputStyle: string = input!.getAttribute( 'style' ) ?? '';
	const buttonStyle: string = button!.getAttribute( 'style' ) ?? '';
	t.true( formStyle.includes( 'display:flex' ), 'form must keep the original inline flex row' );
	t.true( formStyle.includes( 'gap:.4rem' ), 'form must keep the original gap' );
	t.true( formStyle.includes( 'padding:.5rem 1rem' ), 'form must keep the original padding' );
	t.true( formStyle.includes( 'border-bottom:1px solid #8884' ), 'form must keep the original border-bottom' );
	t.true( formStyle.includes( 'background:#fff4' ), 'form must keep the original background' );
	t.true( inputStyle.includes( 'flex:1' ), 'input must keep the original flex' );
	t.true( inputStyle.includes( 'padding:.4rem .6rem' ), 'input must keep the original padding' );
	t.true( inputStyle.includes( 'border:1px solid #8884' ), 'input must keep the original border' );
	t.true( inputStyle.includes( 'border-radius:.3rem' ), 'input must keep the original radius' );
	t.true( buttonStyle.includes( 'padding:.4rem 1rem' ), 'button must keep the original padding' );
	t.true( buttonStyle.includes( 'border:1px solid #8884' ), 'button must keep the original border' );
	t.true( buttonStyle.includes( 'background:#8881' ), 'button must keep the original background' );
	t.true( buttonStyle.includes( 'border-radius:.3rem' ), 'button must keep the original radius' );
	t.true( buttonStyle.includes( 'cursor:pointer' ), 'button must keep the original cursor' );
	t.falsy( formStyle.includes( 'all:initial' ), 'form must not carry the rolled-back all:initial reset' );
	t.falsy( formStyle.includes( 'position:fixed' ), 'form must stay in normal document flow' );
	t.falsy( formStyle.includes( 'z-index' ), 'form must not carry a z-index' );
	t.falsy( inputStyle.includes( 'min-height:44px' ), 'input must not carry the rolled-back touch-target override' );
	t.falsy( input!.getAttribute( 'aria-label' ), 'input must not carry the rolled-back aria-label' );
	zim.shutdown();
} );

test( 'injected search bar leaves the host body style untouched', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const webConfig: WebConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
	const web: Web = new Web( zim, webConfig );
	const inject: ( html: string, filename: string ) => string = ( web as unknown as { _injectSearchBar: ( html: string, filename: string ) => string } )._injectSearchBar;
	const source: string = '<html><head><title>t</title></head><body style="color:red"><p>Hello</p></body></html>';
	const out: string = inject( source, 'x.zim' );
	const root: HTMLElement = parse( out );
	const body: HTMLElement | null = root.querySelector( 'body' );
	t.not( body, null );
	t.is( 'color:red', body!.getAttribute( 'style' ) ?? '', 'existing inline body style must survive injection unchanged' );
	const plain: string = inject( '<html><head><title>t</title></head><body><p>Hello</p></body></html>', 'x.zim' );
	const plainRoot: HTMLElement = parse( plain );
	const plainBody: HTMLElement | null = plainRoot.querySelector( 'body' );
	t.not( plainBody, null );
	t.falsy( plainBody!.getAttribute( 'style' ), 'body without an inline style must not gain one' );
	t.falsy( plain.includes( 'padding-top' ), 'injection must not reserve body top padding' );
	zim.shutdown();
} );
