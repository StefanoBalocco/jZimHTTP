import type { Context, Hono } from 'hono';
import { RequestLogger } from './request-logger.js';
import type { ArticleResponse, McpConfig, SearchResponse } from './types.js';
import { Zim } from './zim.js';
export declare class Mcp {
    private static _turndown;
    private readonly _zim;
    private readonly _config;
    private readonly _searchSemaphore;
    private readonly _articleSemaphore;
    private readonly _mdCache;
    private _cleanupTimer;
    private readonly _logger;
    constructor(zim: Zim, config: McpConfig, cacheMaxSize: number, cacheTtlMs: number);
    private static _successResponse;
    private static _errorResponse;
    private static _convertHtmlToMarkdown;
    search(query: string, page?: number): Promise<SearchResponse>;
    article(entryPath: string): Promise<ArticleResponse>;
    registerRoutes(app: Hono, logger: RequestLogger, resolveRemoteHost: (c: Context) => string): void;
    shutdown(): void;
    private _getSearchResults;
    private _handleMethod;
    private _handleToolCall;
}
