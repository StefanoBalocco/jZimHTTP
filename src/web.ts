import type { Context, Hono } from 'hono';
import type { HTMLElement } from 'node-html-parser';
import { parse } from 'node-html-parser';
import { Logger } from './logger.js';
import type { CachedPageHtml, FileInfo, Nullable, SearchPage, Undefinedable, WebConfig, WebSearchResponse } from './types.js';
import { Zim } from './zim.js';

interface PageVars {
	title: string;
	scriptInit: string;
	searchBar?: { filename: string; initialQuery: string };
}

export class Web {
	private static readonly _homeScript: string = `
const listTpl =
	'<ul>' +
		'<% for( const f of files ) { %>' +
			'<li>' +
				'<a href="z/<%= encodeURIComponent( f.name ) %>"><%= f.title || f.name %></a>' +
				'<div class="meta">' +
					'<%= f.name %>' +
					'<% if( f.date ) { %> &middot; <%= f.date %><% } %>' +
					'<% if( f.articleCount ) { %> &middot; <%= f.articleCount %> articles<% } %>' +
					'<% if( f.language ) { %> &middot; <%= f.language %><% } %>' +
				'</div>' +
				'<% if( f.description ) { %><div class="meta"><%= f.description %></div><% } %>' +
			'</li>' +
		'<% } %>' +
	'</ul>';

( async () => {
	const el = document.getElementById( 'app' );
	try {
		const r = await fetch( 'files', { headers: { accept: 'application/json' } } );
		if( !r.ok ) throw new Error( 'HTTP ' + r.status );
		const files = await r.json();
		if( !Array.isArray( files ) || 0 === files.length ) {
			el.innerHTML = '<p>No ZIM files available.</p>';
			return;
		}
		el.innerHTML = tmpl( listTpl, { files } );
	} catch( e ) {
		el.innerHTML = '<p class="err">Failed to load file list: ' + ( e && e.message ? e.message : e ) + '</p>';
	}
} )();
`;

	private static readonly _searchScript: string = `
const resultTpl =
	'<% if( 0 === data.total ) { %>' +
		'<p>No results for <em><%= data.query %></em>.</p>' +
	'<% } else { %>' +
		'<p>Search results for <em><%= data.query %></em> in <strong><%= data.filename %></strong> ? <%= data.total %> matches.</p>' +
		'<ul>' +
			'<% for( const r of data.results ) { %>' +
				'<li>' +
					'<a href="../z/<%= encodeURIComponent( data.filename ) %>/<%= r.path.substring( data.filename.length + 1 ).split( "/" ).map( encodeURIComponent ).join( "/" ) %>">' +
						'<%= r.title || r.path %>' +
					'</a>' +
					'<% if( r.snippet ) { %><div class="meta"><%= r.snippet %></div><% } %>' +
				'</li>' +
			'<% } %>' +
		'</ul>' +
		'<div class="pager" id="pager"></div>' +
	'<% } %>';

const pagerTpl =
	'<% for( const pg of pages ) { %>' +
		'<a href="?q=<%= q %>&p=<%= pg %>" class="<%= pg === current ? \\'current\\' : \\'\\' %>" data-page="<%= pg %>"><%= pg %></a>' +
	'<% } %>' +
	'<% if( hasEllipsis ) { %><span class="ellipsis">&hellip;</span><% } %>' +
	'<% if( hasJump ) { %>' +
		'<a href="?q=<%= q %>&p=<%= jumpPage %>" data-page="<%= jumpPage %>"><%= jumpPage %></a>' +
	'<% } %>';

function getParams() {
	const p = new URLSearchParams( location.search );
	return { q: p.get( 'q' ) || '', p: Math.max( 1, parseInt( p.get( 'p' ) || '1', 10 ) || 1 ) };
}

async function load() {
	const el = document.getElementById( 'app' );
	const params = getParams();
	if( '' === params.q ) {
		el.innerHTML = '<p>Enter a query above to search.</p>';
		return;
	}
	try {
		const r = await fetch( location.pathname + '/results?q=' + encodeURIComponent( params.q ) + '&p=' + params.p );
		if( !r.ok ) throw new Error( 'HTTP ' + r.status );
		const data = await r.json();
		el.innerHTML = tmpl( resultTpl, { data } );
		const pagerEl = document.getElementById( 'pager' );
		if( pagerEl ) {
			const totalPages = Math.max( 1, Math.ceil( data.total / data.pageSize ) );
			const cur = data.page;
			const winEnd = Math.min( totalPages, cur + 3 );
			const pages = [];
			for( let iL1 = Math.max( 1, cur - 3 ); iL1 <= winEnd; iL1++ ) { pages.push( iL1 ); }
			const jumpPage = Math.min( cur + 10, totalPages );
			const hasEllipsis = jumpPage > winEnd + 1;
			const hasJump = jumpPage > winEnd;
			pagerEl.innerHTML = tmpl( pagerTpl, { pages, current: cur, q: encodeURIComponent( params.q ), hasEllipsis, jumpPage, hasJump } );
			pagerEl.querySelectorAll( 'a' ).forEach( a => {
				a.addEventListener( 'click', ev => {
					ev.preventDefault();
					const p = a.getAttribute( 'data-page' );
					const url = location.pathname + '?q=' + encodeURIComponent( params.q ) + '&p=' + p;
					history.pushState( {}, '', url );
					load();
				} );
			} );
		}
	} catch( e ) {
		el.innerHTML = '<p class="err">Search failed: ' + ( e && e.message ? e.message : e ) + '</p>';
	}
}

window.addEventListener( 'popstate', load );
load();
`;
	private static readonly _sharedStyle: string = `
 :root{color-scheme:light dark;font-family:system-ui,sans-serif}
 body{max-width:780px;margin:2rem auto;padding:0 1rem;line-height:1.5}
 h1{font-size:1.4rem;margin:0 0 1rem}
 ul{list-style:none;padding:0}
 li{padding:.6rem .8rem;border:1px solid #8884;border-radius:.4rem;margin:.4rem 0}
 li a{font-weight:600;text-decoration:none}
 .meta{font-size:.85rem;opacity:.75;margin-top:.2rem}
 .err{color:#c33}
 .search-bar{display:flex;gap:.4rem;margin:0 0 1rem}
 .search-bar input[type=text]{flex:1;padding:.5rem .6rem;border:1px solid #8884;border-radius:.4rem;font:inherit}
 .search-bar button{padding:.5rem 1rem;border:1px solid #8884;background:#8881;border-radius:.4rem;cursor:pointer;font:inherit}
 .pager{display:flex;gap:.4rem;justify-content:center;margin:1rem 0}
 .pager a{padding:.3rem .6rem;border:1px solid #8884;border-radius:.3rem;text-decoration:none}
 .pager a.current{font-weight:600;border-color:currentColor}
 .pager .ellipsis{padding:.3rem .4rem;opacity:.5}
`;
	private static readonly _tmplSource: string = `
const tmpl = ( () => {
	const cache = {};
	const compile = s => obj => {
		const k = Object.keys( obj ),
			v = Object.values( obj );
		return Function( ...k, "let out=\\\`" + s
			.replace( /\\\`/g, "\\\\\\\`" )
			.replace( /[\\r\\t\\n]/g, " " )
			.replace( /<%=([\\s\\S]+?)%>/g, "\\\${$1}" )
			.replace( /<%([ \\s\\S]+?)%>/g, "\\\`; $1 out+=\\\`" ) +
			"\\\`;return out"
		)( ...v );
	};
	return ( s, d ) => {
		const fn = cache[ s ] ||= compile( s );
		return d ? fn( d ) : fn;
	};
} )();
`;
	private readonly _zim: Zim;
	private readonly _config: WebConfig;
	private readonly _logger: Logger;
	private readonly _webVersion: string = '1';
	private readonly _webStartTime: Date = new Date();
	private readonly _cacheControl: string = 'public, max-age=0, must-revalidate';

	constructor( zim: Zim, config: WebConfig ) {
		this._zim = zim;
		this._config = config;
		this._logger = Logger.getInstance();
	}

	private static _escapeHtml( value: string ): string {
		let returnValue: string = '';
		const cL1: number = value.length;
		for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
			const ch: string = value.charAt( iL1 );
			if( '&' === ch ) {
				returnValue += '&amp;';
			} else if( '<' === ch ) {
				returnValue += '&lt;';
			} else if( '>' === ch ) {
				returnValue += '&gt;';
			} else if( '"' === ch ) {
				returnValue += '&quot;';
			} else if( "'" === ch ) {
				returnValue += '&#39;';
			} else {
				returnValue += ch;
			}
		}
		return returnValue;
	}

	private static _renderPage( vars: PageVars ): string {
		const titleHtml: string = Web._escapeHtml( vars.title );
		let searchBarHtml: string = '';
		if( undefined !== vars.searchBar ) {
			searchBarHtml = `<form class="search-bar" method="get" action="">
<input type="text" name="q" value="${ Web._escapeHtml( vars.searchBar.initialQuery ) }" placeholder="Search in ${ Web._escapeHtml( vars.searchBar.filename ) }">
<button type="submit">Search</button>
</form>`;
		}
		return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ titleHtml }</title>
<style>${ Web._sharedStyle }</style>
</head>
<body>
<h1>${ titleHtml }</h1>
${ searchBarHtml }<div id="app">Loading\u2026</div>
<script>
${ Web._tmplSource }
${ vars.scriptInit }
</script>
</body>
</html>
`;
	}

	registerRoutes( app: Hono ): void {
		const homeEtag: string = `"${ this._webVersion }"`;
		const homeLastModified: string = this._webStartTime.toUTCString();

		app.get( '/', ( c: Context ) => {
			let returnValue: Response;
			if( this._isNotModified( c, homeEtag, this._webStartTime ) ) {
				returnValue = c.newResponse( null, { status: 304, headers: this._cacheHeaders( homeEtag, homeLastModified ) } );
			} else {
				const html: string = Web._renderPage( {
					title: 'jZimHTTP Library',
					scriptInit: Web._homeScript
				} );
				returnValue = c.newResponse( html, {
					status: 200,
					headers: {
						'content-type': 'text/html; charset=utf-8',
						...this._cacheHeaders( homeEtag, homeLastModified )
					}
				} );
			}
			return returnValue;
		} );

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

		app.get( '/search/:filename', async( c: Context ) => {
			let returnValue: Response;
			const filename: string = c.req.param( 'filename' )!;
			const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
			if( undefined === info ) {
				returnValue = c.newResponse( 'Not Found', 404 );
			} else {
				const query: string = ( c.req.query( 'q' ) ?? '' ).trim();
				const html: string = this._renderSearchPage( filename, query );
				returnValue = c.newResponse( html, {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				} );
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
			const prefix: string = '/z/' + filename + '/';
			const rawPath: string = c.req.path;
			let entryOnly: string = '';
			if( rawPath.startsWith( prefix ) ) {
				entryOnly = decodeURIComponent( rawPath.substring( prefix.length ) );
			}
			const searchQuery: Undefinedable<string> = c.req.query( 'q' );
			if( undefined !== searchQuery ) {
				returnValue = c.redirect( '/search/' + encodeURIComponent( filename ) + '?q=' + encodeURIComponent( searchQuery ), 302 );
			} else if( '' === entryOnly ) {
				returnValue = c.newResponse( 'Not Found', 404 );
			} else {
				const info: Undefinedable<FileInfo> = await this._zim.getFileMetadata( filename );
				if( undefined === info ) {
					returnValue = c.newResponse( 'Not Found', 404 );
				} else {
					const fullEntryPath: string = filename + '/' + entryOnly;
					const lastModified: Date = this._parseZimDate( info.date );
					const etag: string = `"${ filename }-${ info.date || '0' }/${ entryOnly }"`;
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
	}

	private _renderSearchPage( filename: string, initialQuery: string ): string {
		return Web._renderPage( {
			title: 'Search \u2014 ' + filename,
			scriptInit: Web._searchScript,
			searchBar: { filename, initialQuery }
		} );
	}

	private _injectSearchBar( html: string, filename: string ): string {
		let returnValue: string = html;
		try {
			const root: HTMLElement = parse( html );
			const body: Nullable<HTMLElement> = root.querySelector( 'body' );
			if( body ) {
				const barHtml: string = `<form class="jzimhttp-search-bar" method="get" action="" style="display:flex;gap:.4rem;padding:.5rem 1rem;border-bottom:1px solid #8884;background:#fff4;">
<input type="text" name="q" placeholder="Search in ${ filename }" style="flex:1;padding:.4rem .6rem;border:1px solid #8884;border-radius:.3rem;">
<button type="submit" style="padding:.4rem 1rem;border:1px solid #8884;background:#8881;border-radius:.3rem;cursor:pointer;">Search</button>
</form>`;
				body.insertAdjacentHTML( 'afterbegin', barHtml );
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
		if( undefined !== ifNoneMatch && ifNoneMatch === etag ) {
			returnValue = true;
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
			returnValue = this._webStartTime;
		} else {
			returnValue = new Date( parsed );
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
