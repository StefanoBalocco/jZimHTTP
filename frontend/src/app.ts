import type { TemplateEngine } from '@stefanobalocco/jtdal';

type Nullable<T> = T | null;

export type RouteKind = 'home' | 'search' | 'none';

export function shouldInterceptPagerClick( event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> ): boolean {
	return ( 0 === event.button ) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function classifyRoute( pathname: string ): RouteKind {
	let returnValue: RouteKind = 'none';
	if( '/' === pathname || '/index.html' === pathname ) {
		returnValue = 'home';
	} else if( pathname.startsWith( '/search/' ) ) {
		returnValue = 'search';
	}
	return returnValue;
}

interface FileDto {
	name: string;
	title: string;
	date: string;
	articleCount: number;
	language: string;
	description: string;
}

interface SearchResultDto {
	title: string;
	path: string;
	snippet: string;
}

interface SearchResponseDto {
	filename: string;
	query: string;
	page: number;
	pageSize: number;
	total: number;
	results: SearchResultDto[];
}

interface HomeFileModel {
	title: string;
	name: string;
	date: string;
	articleCount: number;
	language: string;
	dateLabel: string;
	articleCountLabel: string;
	languageLabel: string;
	description: string;
	href: string;
}

interface HomeModel {
	error: string;
	files: HomeFileModel[];
}

interface SearchResultModel {
	title: string;
	path: string;
	href: string;
	hasSnippet: boolean;
	snippetSegments: SnippetSegment[];
}

export interface SnippetSegment {
	text: string;
	highlighted: boolean;
}

interface SearchPageItemModel {
	page: number;
	href: string;
	currentClass: string;
}

interface SearchModel {
	filename: string;
	query: string;
	placeholder: string;
	value: string;
	error: string;
	total: number;
	results: SearchResultModel[];
	pages: SearchPageItemModel[];
	hasEllipsis: boolean;
	hasJump: boolean;
	jumpPage: number;
	jumpHref: string;
}

const appEl: Nullable<HTMLElement> = ( 'undefined' !== typeof document ) ? document.getElementById( 'app' ) : null;

export function resolveTemplateUrl( templateUrl: string, baseUrl: string ): string {
	return new URL( templateUrl, baseUrl ).href;
}

export function escapeAttrValue( value: string ): string {
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

const bTagRegex: RegExp = /<b>|<\/b>/gi;

export function snippetToSegments( snippet: string ): SnippetSegment[] {
	const returnValue: SnippetSegment[] = [];
	let highlighted: boolean = false;
	let lastIndex: number = 0;
	let match: Nullable<RegExpExecArray>;
	while( null !== ( match = bTagRegex.exec( snippet ) ) ) {
		const isClosing: boolean = match[ 0 ].startsWith( '</' );
		if( !isClosing || highlighted ) {
			const text: string = snippet.substring( lastIndex, match.index );
			if( '' !== text ) {
				returnValue.push( { text, highlighted } );
			}
			highlighted = isClosing ? false : true;
			lastIndex = match.index + match[ 0 ].length;
		}
	}
	const tail: string = snippet.substring( lastIndex );
	if( '' !== tail ) {
		returnValue.push( { text: tail, highlighted } );
	}
	return returnValue;
}

function setError( message: string ): void {
	if( appEl ) {
		appEl.textContent = 'Failed to load: ' + message;
	}
}

async function loadTemplates(): Promise<{ home: TemplateEngine; search: TemplateEngine }> {
	const homeUrl: string = resolveTemplateUrl( document.body.dataset.homeTemplate ?? '', document.baseURI );
	const searchUrl: string = resolveTemplateUrl( document.body.dataset.searchTemplate ?? '', document.baseURI );
	if( '' === homeUrl || '' === searchUrl ) {
		throw new Error( 'Missing template module URLs' );
	}
	const homeMod: { default: unknown } = await import( homeUrl );
	const searchMod: { default: unknown } = await import( searchUrl );
	return {
		home: homeMod.default as TemplateEngine,
		search: searchMod.default as TemplateEngine
	};
}

class App {
	private readonly _home: TemplateEngine;
	private readonly _search: TemplateEngine;

	constructor( home: TemplateEngine, search: TemplateEngine ) {
		this._home = home;
		this._search = search;
	}

	async run(): Promise<void> {
		window.addEventListener( 'popstate', () => {
			void this._renderCurrent();
		} );
		await this._renderCurrent();
	}

	private async _renderCurrent(): Promise<void> {
		const pathname: string = location.pathname;
		const kind: RouteKind = classifyRoute( pathname );
		if( 'home' === kind ) {
			await this._renderHome();
		} else if( 'search' === kind ) {
			await this._renderSearch();
		}
	}

	private async _renderHome(): Promise<void> {
		let model: HomeModel;
		try {
			const r: Response = await fetch( 'files', { headers: { accept: 'application/json' } } );
			if( !r.ok ) {
				throw new Error( 'HTTP ' + r.status );
			}
			const files: FileDto[] = await r.json() as FileDto[];
			const fileModels: HomeFileModel[] = files.map( ( f: FileDto ): HomeFileModel => ( {
				title: f.title || f.name,
				name: f.name,
				date: f.date,
				articleCount: f.articleCount,
				language: f.language,
				dateLabel: f.date ? ' · ' + f.date : '',
				articleCountLabel: ' · ' + f.articleCount + ' articles',
				languageLabel: ' · ' + f.language,
				description: f.description,
				href: 'z/' + encodeURIComponent( f.name )
			} ) );
			model = { error: '', files: fileModels };
		} catch( e: unknown ) {
			model = { error: 'Failed to load file list: ' + ( e instanceof Error ? e.message : String( e ) ), files: [] };
		}
		if( appEl ) {
			appEl.innerHTML = this._home( model );
		}
	}

	private async _renderSearch(): Promise<void> {
		const pathname: string = location.pathname;
		let filename: string = '';
		let decodeError: boolean = false;
		const prefix: string = '/search/';
		if( pathname.startsWith( prefix ) ) {
			const rest: string = pathname.substring( prefix.length );
			const slashIndex: number = rest.indexOf( '/' );
			const segment: string = ( -1 === slashIndex ) ? rest : rest.substring( 0, slashIndex );
			try {
				filename = decodeURIComponent( segment );
			} catch( e: unknown ) {
				decodeError = true;
			}
		}
		if( !decodeError && '' !== filename ) {
			document.title = 'Search \u2014 ' + filename;
			const params: URLSearchParams = new URLSearchParams( location.search );
			const q: string = params.get( 'q' ) ?? '';
			const p: number = Math.max( 1, parseInt( params.get( 'p' ) ?? '1', 10 ) || 1 );
			if( '' !== q ) {
				try {
					const r: Response = await fetch( pathname + '/results?q=' + encodeURIComponent( q ) + '&p=' + p );
					if( !r.ok ) {
						throw new Error( 'HTTP ' + r.status );
					}
					const data: SearchResponseDto = await r.json() as SearchResponseDto;
					const model: SearchModel = this._buildSearchModel( filename, q, data );
					if( appEl ) {
						appEl.innerHTML = this._search( model );
					}
					this._attachPagerHandlers( q );
				} catch( e: unknown ) {
					const model: SearchModel = this._searchModel( filename, q, 'Search failed: ' + ( e instanceof Error ? e.message : String( e ) ), 0, [], [], false, false, 0, '' );
					if( appEl ) {
						appEl.innerHTML = this._search( model );
					}
				}
			} else {
				if( appEl ) {
					appEl.innerHTML = this._search( this._searchModel( filename, q, '', 0, [], [], false, false, 0, '' ) );
				}
			}
		} else {
			if( appEl ) {
				appEl.innerHTML = this._search( this._searchModel( '', '', 'Invalid search path.', 0, [], [], false, false, 0, '' ) );
			}
		}
	}

	private _resultHref( filename: string, path: string ): string {
		const entryOnly: string = path.substring( filename.length + 1 );
		const parts: string[] = entryOnly.split( '/' );
		const cL1: number = parts.length;
		for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
			parts[ iL1 ] = encodeURIComponent( parts[ iL1 ]! );
		}
		return '../z/' + encodeURIComponent( filename ) + '/' + parts.join( '/' );
	}

	private _buildSearchModel( filename: string, q: string, data: SearchResponseDto ): SearchModel {
		const resultModels: SearchResultModel[] = data.results.map( ( r: SearchResultDto ): SearchResultModel => {
			const segments: SnippetSegment[] = snippetToSegments( r.snippet );
			return {
				title: r.title || r.path,
				path: r.path,
				href: this._resultHref( filename, r.path ),
				hasSnippet: 0 < segments.length,
				snippetSegments: segments
			};
		} );
		const totalPages: number = Math.max( 1, Math.ceil( data.total / data.pageSize ) );
		const cur: number = data.page;
		const winEnd: number = Math.min( totalPages, cur + 3 );
		const pages: SearchPageItemModel[] = [];
		for( let iL1: number = Math.max( 1, cur - 3 ); iL1 <= winEnd; iL1++ ) {
			pages.push( {
				page: iL1,
				href: '?q=' + encodeURIComponent( q ) + '&p=' + iL1,
				currentClass: ( iL1 === cur ) ? 'current' : ''
			} );
		}
		const jumpPage: number = Math.min( cur + 10, totalPages );
		const hasEllipsis: boolean = jumpPage > winEnd + 1;
		const hasJump: boolean = jumpPage > winEnd;
		return this._searchModel( filename, q, '', data.total, resultModels, pages, hasEllipsis, hasJump, jumpPage, '?q=' + encodeURIComponent( q ) + '&p=' + jumpPage );
	}

	private _searchModel(
		filename: string,
		query: string,
		error: string,
		total: number,
		results: SearchResultModel[],
		pages: SearchPageItemModel[],
		hasEllipsis: boolean,
		hasJump: boolean,
		jumpPage: number,
		jumpHref: string
	): SearchModel {
		return {
			filename,
			query,
			placeholder: 'Search in ' + escapeAttrValue( filename ),
			value: escapeAttrValue( query ),
			error,
			total,
			results,
			pages,
			hasEllipsis,
			hasJump,
			jumpPage,
			jumpHref
		};
	}

	private _attachPagerHandlers( q: string ): void {
		if( appEl ) {
			const links: NodeListOf<HTMLAnchorElement> = appEl.querySelectorAll( 'a[data-page]' );
			const cL1: number = links.length;
			for( let iL1: number = 0; iL1 < cL1; iL1++ ) {
				const link: HTMLAnchorElement = links[ iL1 ]!;
				link.addEventListener( 'click', ( ev: MouseEvent ) => {
					if( shouldInterceptPagerClick( ev ) ) {
						ev.preventDefault();
						const page: string = link.getAttribute( 'data-page' ) ?? '';
						const url: string = location.pathname + '?q=' + encodeURIComponent( q ) + '&p=' + page;
						history.pushState( {}, '', url );
						void this._renderSearch();
					}
				} );
			}
		}
	}
}

async function main(): Promise<void> {
	try {
		const templates: { home: TemplateEngine; search: TemplateEngine } = await loadTemplates();
		const app: App = new App( templates.home, templates.search );
		await app.run();
	} catch( e: unknown ) {
		setError( e instanceof Error ? e.message : String( e ) );
	}
}

if( 'undefined' !== typeof document && 'undefined' !== typeof window ) {
	void main();
}