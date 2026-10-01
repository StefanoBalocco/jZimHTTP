import type { CachedPageHtml, FileInfo, SearchPage, Undefinedable } from './types.js';
export declare class Zim {
    private readonly _baseDirectory;
    private readonly _archives;
    private readonly _searchers;
    private readonly _metadata;
    private readonly _htmlCache;
    private readonly _pageSemaphore;
    private _cleanupTimer;
    private readonly _logger;
    constructor(baseDirectory: string, maxConcurrentPage: number, cacheMaxSize: number, cacheTtlMs: number);
    get baseDirectory(): string;
    listFiles(): Promise<FileInfo[]>;
    getFileMetadata(filename: string): Promise<Undefinedable<FileInfo>>;
    getPageHtml(entryPath: string): Promise<Undefinedable<CachedPageHtml>>;
    search(filename: string, query: string, offset: number, limit: number): Promise<SearchPage>;
    shutdown(): void;
    getBinary(fullPath: string): Promise<Undefinedable<{
        data: Buffer;
        mimetype: string;
    }>>;
    parseEntryPath(fullPath: string): Undefinedable<{
        filename: string;
        entryPath: string;
    }>;
    resolveArchivePath(filename: string): Undefinedable<string>;
    private _getArchive;
    private _readMetadata;
}
