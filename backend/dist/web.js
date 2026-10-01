import { serveStatic } from '@hono/node-server/serve-static';
import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from './logger.js';
export class Web {
    _zim;
    _config;
    _logger;
    _webStartTime = new Date();
    _cacheControl = 'public, max-age=0, must-revalidate';
    _staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../www');
    constructor(zim, config) {
        this._zim = zim;
        this._config = config;
        this._logger = Logger.getInstance();
    }
    registerRoutes(app) {
        app.get('/files', async (c) => {
            const files = await this._zim.listFiles();
            return c.json(files);
        });
        app.get('/z/:filename', async (c) => {
            let returnValue;
            const filename = c.req.param('filename');
            const info = await this._zim.getFileMetadata(filename);
            if (undefined !== info && '' !== info.mainPath) {
                const entryOnly = info.mainPath.substring(filename.length + 1);
                const target = '/z/' + encodeURIComponent(filename) + '/' + this._encodeEntryPath(entryOnly);
                returnValue = c.redirect(target, 302);
            }
            else {
                returnValue = c.newResponse('Not Found', 404);
            }
            return returnValue;
        });
        app.get('/search/:filename', async (c, next) => {
            let returnValue;
            const filename = c.req.param('filename');
            const info = await this._zim.getFileMetadata(filename);
            if (undefined !== info) {
                await next();
            }
            else {
                returnValue = c.newResponse('Not Found', 404);
            }
            return returnValue;
        });
        app.get('/search/:filename/results', async (c) => {
            let returnValue;
            const filename = c.req.param('filename');
            const query = (c.req.query('q') ?? '').trim();
            const pageParam = c.req.query('p') ?? '1';
            const page = Math.max(1, parseInt(pageParam, 10) || 1);
            const pageSize = this._config.searchResultsPerPage;
            if ('' === query) {
                returnValue = c.json({ filename, query, page, pageSize, total: 0, results: [] });
            }
            else {
                const info = await this._zim.getFileMetadata(filename);
                if (undefined === info) {
                    returnValue = c.json({ error: 'Not Found' }, 404);
                }
                else {
                    const offset = (page - 1) * pageSize;
                    const data = await this._zim.search(filename, query, offset, pageSize);
                    const response = {
                        filename,
                        query,
                        page,
                        pageSize,
                        total: data.total,
                        results: data.results
                    };
                    returnValue = c.json(response);
                }
            }
            return returnValue;
        });
        app.get('/z/:filename/*', async (c) => {
            let returnValue;
            const filename = c.req.param('filename');
            const prefix = '/z/';
            const rawPath = c.req.path;
            let entryOnly = '';
            if (rawPath.startsWith(prefix)) {
                const tailStart = rawPath.indexOf('/', prefix.length);
                if (-1 !== tailStart) {
                    try {
                        entryOnly = decodeURIComponent(rawPath.substring(tailStart + 1));
                    }
                    catch (error) {
                        entryOnly = '';
                    }
                }
            }
            const searchQuery = c.req.query('q');
            if (undefined !== searchQuery) {
                returnValue = c.redirect('/search/' + encodeURIComponent(filename) + '?q=' + encodeURIComponent(searchQuery), 302);
            }
            else if (!entryOnly) {
                returnValue = c.newResponse('Not Found', 404);
            }
            else {
                const info = await this._zim.getFileMetadata(filename);
                if (undefined === info) {
                    returnValue = c.newResponse('Not Found', 404);
                }
                else {
                    const fullEntryPath = filename + '/' + entryOnly;
                    const lastModified = this._parseZimDate(info.date);
                    const etagSource = filename + '\0' + (info.date || '0') + '\0' + entryOnly;
                    const etag = '"' + createHash('md5').update(etagSource).digest('base64url') + '"';
                    if (this._isNotModified(c, etag, lastModified)) {
                        returnValue = c.newResponse(null, {
                            status: 304,
                            headers: this._cacheHeaders(etag, lastModified.toUTCString())
                        });
                    }
                    else {
                        const page = await this._zim.getPageHtml(fullEntryPath);
                        if (undefined !== page) {
                            returnValue = c.newResponse(this._injectSearchBar(page.html, filename), {
                                status: 200,
                                headers: {
                                    'content-type': page.mimetype,
                                    ...this._cacheHeaders(etag, lastModified.toUTCString())
                                }
                            });
                        }
                        else {
                            const binary = await this._zim.getBinary(fullEntryPath);
                            if (undefined !== binary) {
                                const body = binary.data.buffer.slice(binary.data.byteOffset, binary.data.byteOffset + binary.data.byteLength);
                                returnValue = c.newResponse(body, {
                                    status: 200,
                                    headers: {
                                        'content-type': binary.mimetype,
                                        'content-length': String(binary.data.byteLength),
                                        ...this._cacheHeaders(etag, lastModified.toUTCString())
                                    }
                                });
                            }
                            else {
                                returnValue = c.newResponse('Not Found', 404);
                            }
                        }
                    }
                }
            }
            return returnValue;
        });
        app.get('*', async (c, next) => {
            const staticHandler = serveStatic({
                root: this._staticRoot,
                rewriteRequestPath: (requestPath) => {
                    let returnValue = requestPath;
                    if ('/' === requestPath) {
                        returnValue = '/index.html';
                    }
                    else if (null !== requestPath.match(/^\/search\/[^/]+$/)) {
                        returnValue = '/index.html';
                    }
                    return returnValue;
                }
            });
            const res = await staticHandler(c, next);
            if (undefined !== res && (200 === res.status || 206 === res.status)) {
                const requestPath = c.req.path;
                let cacheControl = '';
                if ('/' === requestPath || '/index.html' === requestPath || null !== requestPath.match(/^\/search\/[^/]+$/)) {
                    cacheControl = 'no-cache';
                }
                else if (requestPath.endsWith('.css') || requestPath.endsWith('.js') || requestPath.endsWith('.mjs')) {
                    cacheControl = 'public, max-age=31536000, immutable';
                }
                if ('' !== cacheControl) {
                    const headers = new Headers(res.headers);
                    headers.set('Cache-Control', cacheControl);
                    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
                }
            }
            return res;
        });
    }
    _injectSearchBar(html, filename) {
        let returnValue = html;
        try {
            const root = parse(html);
            const body = root.querySelector('body');
            if (null !== body) {
                const barHtml = `<form class="jzimhttp-search-bar" method="get" action="" style="display:flex;gap:.4rem;padding:.5rem 1rem;border-bottom:1px solid #8884;background:#fff4;">
<input type="text" name="q" placeholder="" style="flex:1;padding:.4rem .6rem;border:1px solid #8884;border-radius:.3rem;">
<button type="submit" style="padding:.4rem 1rem;border:1px solid #8884;background:#8881;border-radius:.3rem;cursor:pointer;">Search</button>
</form>`;
                const barRoot = parse(barHtml);
                const input = barRoot.querySelector('input[name="q"]');
                if (null !== input) {
                    input.setAttribute('placeholder', 'Search in ' + filename);
                }
                body.insertAdjacentHTML('afterbegin', barRoot.toString());
                returnValue = root.toString();
            }
        }
        catch (error) {
            returnValue = html;
            const message = error instanceof Error ? error.message : String(error);
            this._logger.stdout('Web._InjectSearchBar', 'EXCEPTION', message);
        }
        return returnValue;
    }
    _cacheHeaders(etag, lastModified) {
        return {
            'etag': etag,
            'last-modified': lastModified,
            'cache-control': this._cacheControl,
            'vary': 'Accept-Encoding'
        };
    }
    _isNotModified(c, etag, lastModified) {
        let returnValue = false;
        const ifNoneMatch = c.req.header('if-none-match');
        if (undefined !== ifNoneMatch) {
            if (ifNoneMatch === etag) {
                returnValue = true;
            }
        }
        else {
            const ifModifiedSince = c.req.header('if-modified-since');
            if (undefined !== ifModifiedSince) {
                const since = Date.parse(ifModifiedSince);
                if (!Number.isNaN(since) && lastModified.getTime() <= since) {
                    returnValue = true;
                }
            }
        }
        return returnValue;
    }
    _parseZimDate(date) {
        let returnValue;
        const parsed = Date.parse(date);
        if (Number.isNaN(parsed)) {
            returnValue = new Date(Math.floor(this._webStartTime.getTime() / 1000) * 1000);
        }
        else {
            returnValue = new Date(Math.floor(parsed / 1000) * 1000);
        }
        return returnValue;
    }
    _encodeEntryPath(entryPath) {
        const parts = entryPath.split('/');
        const cL1 = parts.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            parts[iL1] = encodeURIComponent(parts[iL1]);
        }
        return parts.join('/');
    }
}
//# sourceMappingURL=web.js.map