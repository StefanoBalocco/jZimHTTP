import type { Hono } from 'hono';
import type { WebConfig } from './types.js';
import { Zim } from './zim.js';
export declare class Web {
    private readonly _zim;
    private readonly _config;
    private readonly _logger;
    private readonly _webStartTime;
    private readonly _cacheControl;
    private readonly _staticRoot;
    constructor(zim: Zim, config: WebConfig);
    registerRoutes(app: Hono): void;
    private _injectSearchBar;
    private _cacheHeaders;
    private _isNotModified;
    private _parseZimDate;
    private _encodeEntryPath;
}
