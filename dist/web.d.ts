import type { Hono } from 'hono';
import type { WebConfig } from './types.js';
import { Zim } from './zim.js';
export declare class Web {
    private static readonly _homeScript;
    private static readonly _searchScript;
    private static readonly _sharedStyle;
    private static readonly _tmplSource;
    private readonly _zim;
    private readonly _config;
    private readonly _logger;
    private readonly _webVersion;
    private readonly _webStartTime;
    private readonly _cacheControl;
    constructor(zim: Zim, config: WebConfig);
    private static _escapeHtml;
    private static _renderPage;
    registerRoutes(app: Hono): void;
    private _renderSearchPage;
    private _injectSearchBar;
    private _cacheHeaders;
    private _isNotModified;
    private _parseZimDate;
    private _encodeEntryPath;
}
