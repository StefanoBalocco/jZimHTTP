import type { ServerConfig } from './types.js';
export declare class ZimHttpServer {
    private readonly _zim;
    private readonly _mcp;
    private readonly _web;
    private readonly _config;
    private readonly _logger;
    private readonly _servers;
    constructor(config: ServerConfig);
    get config(): ServerConfig;
    shutdown(): void;
    private _startServers;
    private _resolveRemoteHost;
}
