import { Archive, Searcher } from '@openzim/libzim';
import { Entry, Item } from '@openzim/libzim/dist';
import * as fs from 'fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'path';
import { LruTtlCache } from './cache.js';
import { Logger } from './logger.js';
import { Semaphore } from './semaphore.js';
import type { CachedPageHtml, FileInfo, SearchPage, Undefinedable } from './types.js';

export class Zim {
	private readonly _baseDirectory: string;
	private readonly _archives: Map<string, Archive> = new Map<string, Archive>();
	private readonly _searchers: Map<string, Searcher> = new Map<string, Searcher>();
	private readonly _metadata: Map<string, FileInfo> = new Map<string, FileInfo>();
	private readonly _htmlCache: LruTtlCache<string>;
	private readonly _pageSemaphore: Semaphore;
	private _cleanupTimer: Undefinedable<ReturnType<typeof setInterval>>;
	private readonly _logger: Logger;

	constructor( baseDirectory: string, maxConcurrentPage: number, cacheMaxSize: number, cacheTtlMs: number ) {
		this._baseDirectory = path.resolve( baseDirectory );
		this._pageSemaphore = new Semaphore( maxConcurrentPage );
		this._htmlCache = new LruTtlCache<string>( cacheMaxSize, cacheTtlMs );
		this._cleanupTimer = setInterval( () => this._htmlCache.cleanup(), 60 * 1000 );
		this._logger = Logger.getInstance();
	}

	get baseDirectory(): string {
		return this._baseDirectory;
	}

	async listFiles(): Promise<FileInfo[]> {
		const returnValue: FileInfo[] = [];

		const entries: Dirent[] = await fs.readdir( this._baseDirectory, { withFileTypes: true } ) as Dirent[];
		const filenames: string[] = entries.filter(
			( entry: Dirent ): boolean => !entry.isSymbolicLink() && entry.isFile() && entry.name.endsWith( '.zim' )
		).map(
			( entry: Dirent ): string => entry.name
		).sort();

		const currentSet: Set<string> = new Set<string>( filenames );

		for( const absolutePath of this._archives.keys() ) {
			const filename: string = path.basename( absolutePath );
			if( !currentSet.has( filename ) ) {
				this._htmlCache.deleteByPrefix( filename );
				this._archives.delete( absolutePath );
				this._searchers.delete( absolutePath );
				this._metadata.delete( filename );
			}
		}

		for( const filename of filenames ) {
			const info: Undefinedable<FileInfo> = await this.getFileMetadata( filename );
			if( undefined !== info ) {
				returnValue.push( info );
			}
		}
		return returnValue;
	}

	async getFileMetadata( filename: string ): Promise<Undefinedable<FileInfo>> {
		let returnValue: Undefinedable<FileInfo> = this._metadata.get( filename );
		if( undefined === returnValue ) {
			const archive: Undefinedable<Archive> = await this._getArchive( filename );
			if( undefined !== archive ) {
				let mainPath: string = '';
				try {
					if( archive.hasMainEntry() ) {
						const mainEntry = archive.mainEntry;
						const item = mainEntry.getItem( true );
						mainPath = filename + '/' + item.path;
					}
				} catch( _e ) {
					mainPath = '';
				}
				returnValue = {
					name: filename,
					title: this._readMetadata( archive, 'Title' ),
					description: this._readMetadata( archive, 'Description' ),
					date: this._readMetadata( archive, 'Date' ),
					language: this._readMetadata( archive, 'Language' ),
					creator: this._readMetadata( archive, 'Creator' ),
					articleCount: Number( archive.articleCount ),
					mediaCount: Number( archive.mediaCount ),
					mainPath
				};
				this._metadata.set( filename, returnValue );
			}
		}
		return returnValue;
	}

	async getPageHtml( entryPath: string ): Promise<Undefinedable<CachedPageHtml>> {
		let returnValue: Undefinedable<CachedPageHtml>;
		this._logger.stdout( 'Zim.getPageHtml', 'ENTER', entryPath );
		const cacheKey: string = `html:${ entryPath }`;
		const cachedRaw: Undefinedable<string> = this._htmlCache.get( cacheKey );
		if( undefined !== cachedRaw ) {
			returnValue = JSON.parse( cachedRaw ) as CachedPageHtml;
		} else {
			await this._pageSemaphore.acquire();
			try {
				const raw: Undefinedable<{ data: Buffer; mimetype: string }> = await this.getBinary( entryPath );
				if( ( undefined !== raw ) && raw.mimetype.includes( 'html' ) ) {
					const html: string = raw.data.toString( 'utf8' );
					const page: CachedPageHtml = {
						html,
						mimetype: raw.mimetype,
						sizeBytes: Buffer.byteLength( html, 'utf8' )
					};
					this._htmlCache.set( cacheKey, JSON.stringify( page ) );
					returnValue = page;
				}
			} finally {
				this._pageSemaphore.release();
			}
		}
		return returnValue;
	}

	async search( filename: string, query: string, offset: number, limit: number ): Promise<SearchPage> {
		let returnValue: SearchPage = { total: 0, results: [] };
		const absolutePath: Undefinedable<string> = this.resolveArchivePath( filename );
		if( undefined !== absolutePath ) {
			let searcher: Undefinedable<Searcher> = this._searchers.get( absolutePath );
			if( undefined === searcher ) {
				const archive: Undefinedable<Archive> = await this._getArchive( filename );
				if( undefined !== archive ) {
					searcher = new Searcher( archive );
					this._searchers.set( absolutePath, searcher );
				}
			}
			if( undefined !== searcher ) {
				try {
					const search = searcher.search( query );
					const results = search.getResults( offset, limit );
					for( const result of results ) {
						returnValue.results.push( {
							title: result.title,
							path: filename + '/' + result.path,
							snippet: result.snippet
						} );
					}
					returnValue.total = Number( search.estimatedMatches );
				} catch( error: unknown ) {
					//returnValue.results = [];
					const message: string = error instanceof Error ? error.message : String( error );
					this._logger.stdout( 'Zim.search', 'EXCEPTION', message );
				}
			}
		}
		return returnValue;
	}

	shutdown(): void {
		if( undefined !== this._cleanupTimer ) {
			clearInterval( this._cleanupTimer );
			this._cleanupTimer = undefined;
		}
		this._htmlCache.clear();
		this._archives.clear();
		this._searchers.clear();
		this._metadata.clear();
	}

	async getBinary( fullPath: string ): Promise<Undefinedable<{ data: Buffer; mimetype: string }>> {
		let returnValue: Undefinedable<{ data: Buffer; mimetype: string }>;
		const zimExtIdx: number = fullPath.indexOf( '.zim/' );
		if( -1 !== zimExtIdx ) {
			const filename: string = fullPath.substring( 0, zimExtIdx + 4 );
			const entryPath: string = fullPath.substring( zimExtIdx + 5 );
			const archive: Undefinedable<Archive> = await this._getArchive( filename );
			if( undefined !== archive ) {
				try {
					if( archive.hasEntryByPath( entryPath ) ) {
						const entry: Entry = archive.getEntryByPath( entryPath );
						const item: Item = entry.getItem( true );
						returnValue = {
							data: item.data.data,
							mimetype: item.mimetype
						};
					}
				} catch( _e ) {
					returnValue = undefined;
				}
			}
		}
		return returnValue;
	}

	parseEntryPath( fullPath: string ): Undefinedable<{ filename: string; entryPath: string }> {
		let returnValue: Undefinedable<{ filename: string; entryPath: string }>;
		const zimExtIdx: number = fullPath.indexOf( '.zim/' );
		if( -1 !== zimExtIdx ) {
			returnValue = {
				filename: fullPath.substring( 0, zimExtIdx + 4 ),
				entryPath: fullPath.substring( zimExtIdx + 5 )
			};
		}
		return returnValue;
	}

	resolveArchivePath( filename: string ): Undefinedable<string> {
		let returnValue: Undefinedable<string>;
		const absolutePath: string = path.resolve( this._baseDirectory, filename );
		if( ( absolutePath.startsWith( this._baseDirectory + path.sep ) || ( absolutePath === this._baseDirectory ) ) && absolutePath.endsWith( '.zim' ) ) {
			returnValue = absolutePath;
		}
		return returnValue;
	}

	private async _getArchive( filename: string ): Promise<Undefinedable<Archive>> {
		let returnValue: Undefinedable<Archive>;
		const absolutePath: Undefinedable<string> = this.resolveArchivePath( filename );
		if( undefined !== absolutePath ) {
			let archive: Undefinedable<Archive> = this._archives.get( absolutePath );
			if( undefined === archive ) {
				try {
					archive = new Archive( absolutePath );
					this._archives.set( absolutePath, archive );
				} catch( _e ) {
					archive = undefined;
				}
			}
			returnValue = archive;
		}
		return returnValue;
	}

	private _readMetadata( archive: Archive, key: string ): string {
		let returnValue: string = '';
		try {
			returnValue = archive.getMetadata( key );
		} catch( _e ) {
			returnValue = '';
		}
		return returnValue;
	}
}
