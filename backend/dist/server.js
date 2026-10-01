import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Mcp } from './mcp.js';
import { RequestLogger } from './request-logger.js';
import { Web } from './web.js';
import { Zim } from './zim.js';
export class ZimHttpServer {
    _zim;
    _mcp;
    _web;
    _config;
    _logger;
    _servers = [];
    constructor(config) {
        this._config = config;
        this._zim = new Zim(config.zimPath, Math.max(config.web.maxConcurrentPage, config.mcp.maxConcurrentArticle), config.cacheMaxSize, config.cacheTtlMs);
        if (config.mcp.enabled) {
            this._mcp = new Mcp(this._zim, config.mcp, config.cacheMaxSize, config.cacheTtlMs);
        }
        if (config.web.enabled) {
            this._web = new Web(this._zim, config.web);
        }
        this._logger = new RequestLogger(config.logFile);
        this._startServers();
    }
    get config() {
        return this._config;
    }
    shutdown() {
        if (this._mcp) {
            this._mcp.shutdown();
        }
        this._zim.shutdown();
        this._logger.shutdown();
        const cL1 = this._servers.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            this._servers[iL1].close();
        }
    }
    _startServers() {
        const endpoints = new Map();
        const sources = [
            [this._config.mcp.enabled, this._config.mcp.listeners, 'hasMcp'],
            [this._config.web.enabled, this._config.web.listeners, 'hasWeb']
        ];
        for (const [isEnabled, listeners, property] of sources) {
            if (isEnabled) {
                for (const entry of listeners) {
                    const key = `${entry.host.replace(/^\[|\]$/g, '')}:${entry.port}`;
                    const existing = endpoints.get(key) ?? { entry, hasMcp: false, hasWeb: false };
                    existing[property] = true;
                    endpoints.set(key, existing);
                }
            }
        }
        for (const info of endpoints.values()) {
            const app = new Hono({
                getPath: (request) => {
                    const url = new URL(request.url);
                    return url.pathname.replace(/^\/+/, '/');
                }
            });
            app.use('*', async (c, next) => {
                await next();
                const remoteHost = this._resolveRemoteHost(c);
                const now = new Date();
                if (!(c.req.method === 'POST' && c.req.path === '/mcp')) {
                    this._logger.logConsoleLine(`${now.toISOString()} ${c.req.method.padEnd(7)} ${remoteHost} ${c.req.path} ${c.res.status}`);
                }
                const entry = {
                    remoteHost,
                    date: now,
                    method: c.req.method,
                    path: c.req.path,
                    protocol: 'HTTP/1.1',
                    status: c.res.status,
                    bytes: parseInt(c.res.headers.get('content-length') ?? '0', 10)
                };
                this._logger.log(entry);
            });
            const methods = [];
            if (info.hasWeb) {
                methods.push('GET');
            }
            if (info.hasMcp) {
                methods.push('POST');
            }
            methods.push('OPTIONS');
            const originCallback = (origin) => {
                let returnValue;
                if (this._config.corsOrigins.includes('*')) {
                    returnValue = origin || '*';
                }
                else if (origin && this._config.corsOrigins.includes(origin)) {
                    returnValue = origin;
                }
                return returnValue;
            };
            app.use('*', cors({
                origin: originCallback,
                allowMethods: methods,
                allowHeaders: ['Content-Type']
            }));
            if (info.hasMcp && this._mcp) {
                this._mcp.registerRoutes(app, this._logger, (c) => this._resolveRemoteHost(c));
            }
            if (info.hasWeb && this._web) {
                this._web.registerRoutes(app);
            }
            const server = serve({
                fetch: app.fetch,
                hostname: info.entry.host,
                port: info.entry.port
            });
            this._servers.push(server);
        }
    }
    _resolveRemoteHost(c) {
        const connectionIp = getConnInfo(c).remote.address;
        let returnValue = connectionIp;
        if (this._config.trustedProxies.includes(connectionIp)) {
            const xForwardedFor = c.req.header('x-forwarded-for');
            if (undefined !== xForwardedFor) {
                returnValue = xForwardedFor.split(',')[0].trim();
            }
            else {
                const xRealIp = c.req.header('x-real-ip');
                if (undefined !== xRealIp) {
                    returnValue = xRealIp;
                }
            }
        }
        return returnValue;
    }
}
//# sourceMappingURL=server.js.map