import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import { LruTtlCache } from './cache.js';
import { Logger } from './logger.js';
import { Semaphore } from './semaphore.js';
import { TOOL_DEFINITIONS } from './types.js';
const unwantedSelectors = ['script', 'style', 'meta', 'link', 'head', 'footer', 'noscript', 'img', 'figure', 'figcaption', 'picture', '.mw-parser-output .reflist', '.mw-editsection'];
export class Mcp {
    static _turndown;
    _zim;
    _config;
    _searchSemaphore;
    _articleSemaphore;
    _mdCache;
    _cleanupTimer;
    _logger;
    constructor(zim, config, cacheMaxSize, cacheTtlMs) {
        this._zim = zim;
        this._config = config;
        this._searchSemaphore = new Semaphore(config.maxConcurrentSearch);
        this._articleSemaphore = new Semaphore(config.maxConcurrentArticle);
        this._mdCache = new LruTtlCache(cacheMaxSize, cacheTtlMs);
        this._cleanupTimer = setInterval(() => this._mdCache.cleanup(), 60 * 1000);
        this._logger = Logger.getInstance();
    }
    static _successResponse(id, result) {
        return { jsonrpc: '2.0', id, result };
    }
    static _errorResponse(id, code, message) {
        return { jsonrpc: '2.0', id, error: { code, message } };
    }
    static _convertHtmlToMarkdown(html) {
        let returnValue = '';
        if (0 < html.trim().length) {
            const root = parse(html);
            for (const selector of unwantedSelectors) {
                root.querySelectorAll(selector).forEach((el) => el.remove());
            }
            const cleaned = root.querySelector('body')?.innerHTML ?? root.innerHTML;
            if (undefined === Mcp._turndown) {
                const td = new TurndownService({ codeBlockStyle: 'fenced', bulletListMarker: '-', headingStyle: 'atx' });
                td.addRule('paragraph', {
                    filter: 'p',
                    replacement: (content) => '\n\n' + content + '\n\n'
                });
                td.addRule('listItem', {
                    filter: 'li',
                    replacement: (content) => '- ' + content.trim() + '\n'
                });
                Mcp._turndown = td;
            }
            returnValue = Mcp._turndown.turndown(cleaned).trim();
        }
        return returnValue;
    }
    async search(query, page) {
        this._logger.stdout('Mcp.search', 'ENTER', query);
        const limit = this._config.searchResultsPerFile;
        const resolvedPage = page ?? 1;
        const resolvedOffset = (resolvedPage - 1) * limit;
        const files = await this._zim.listFiles();
        const perFile = [];
        let globalHasMore = false;
        const cL1 = files.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            const filename = files[iL1].name;
            const fileResults = await this._getSearchResults(filename, query, resolvedOffset, limit);
            if (fileResults.total > resolvedOffset + limit) {
                globalHasMore = true;
            }
            if (0 < fileResults.results.length) {
                perFile.push(fileResults.results);
            }
        }
        const interleaved = [];
        let rowIndex = 0;
        let hasRow = true;
        while (hasRow) {
            hasRow = false;
            const cL2 = perFile.length;
            for (let iL2 = 0; iL2 < cL2; iL2++) {
                const fileResults = perFile[iL2];
                if (rowIndex < fileResults.length) {
                    interleaved.push(fileResults[rowIndex]);
                    if (rowIndex + 1 < fileResults.length) {
                        hasRow = true;
                    }
                }
            }
            rowIndex++;
        }
        const returnValue = { results: interleaved, page: resolvedPage, hasMore: globalHasMore };
        return returnValue;
    }
    async article(entryPath) {
        let returnValue;
        this._logger.stdout('Mcp.article', 'ENTER', entryPath);
        const cacheKey = `md:${entryPath}`;
        const cachedRaw = this._mdCache.get(cacheKey);
        if (undefined !== cachedRaw) {
            returnValue = JSON.parse(cachedRaw);
        }
        else {
            await this._articleSemaphore.acquire();
            try {
                const page = await this._zim.getPageHtml(entryPath);
                if (undefined === page) {
                    throw new Error(`Entry not found or not HTML: ${entryPath}`);
                }
                const content = Mcp._convertHtmlToMarkdown(page.html);
                const art = {
                    content,
                    sizeBytes: Buffer.byteLength(content, 'utf8')
                };
                this._mdCache.set(cacheKey, JSON.stringify(art));
                returnValue = art;
            }
            finally {
                this._articleSemaphore.release();
            }
        }
        return returnValue;
    }
    registerRoutes(app, logger, resolveRemoteHost) {
        const self = this;
        app.post('/mcp', async (c) => {
            const requestTime = Date.now();
            const remoteHost = resolveRemoteHost(c);
            let returnValue;
            let body;
            let bodyParseOk = true;
            try {
                body = await c.req.json();
            }
            catch {
                bodyParseOk = false;
            }
            if (bodyParseOk) {
                const request = body;
                if ('2.0' === request.jsonrpc) {
                    let logToolName;
                    let logToolArgs;
                    if ('tools/call' === request.method && request.params) {
                        const nameVal = request.params.name;
                        const argsVal = request.params.arguments;
                        if ('string' === typeof nameVal) {
                            logToolName = nameVal;
                        }
                        if (argsVal && 'object' === typeof argsVal) {
                            logToolArgs = argsVal;
                        }
                    }
                    logger.logConsole({
                        remoteHost,
                        date: new Date(),
                        httpMethod: c.req.method,
                        path: c.req.path,
                        marker: 'START',
                        mcpMethod: request.method,
                        toolName: logToolName,
                        toolArgs: logToolArgs
                    });
                    const response = await self._handleMethod(request);
                    logger.logConsole({
                        remoteHost,
                        date: new Date(),
                        httpMethod: c.req.method,
                        path: c.req.path,
                        marker: 'SEMRL',
                        mcpMethod: request.method,
                        toolName: logToolName,
                        status: response ? 200 : 204,
                        durationMs: Date.now() - requestTime
                    });
                    if (response) {
                        returnValue = c.json(response);
                    }
                    else {
                        returnValue = c.newResponse(null, 204);
                    }
                }
                else {
                    const ts = new Date().toISOString();
                    logger.logConsoleLine(`${ts} POST    ${remoteHost} /mcp 400`);
                    returnValue = c.json(Mcp._errorResponse(body.id ?? null, -32600, 'Invalid request'));
                }
            }
            else {
                const ts = new Date().toISOString();
                logger.logConsoleLine(`${ts} POST    ${remoteHost} /mcp 400`);
                returnValue = c.json(Mcp._errorResponse(null, -32700, 'Parse error'));
            }
            return returnValue;
        });
    }
    shutdown() {
        if (undefined !== this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = undefined;
        }
        this._mdCache.clear();
    }
    async _getSearchResults(filename, query, offset, limit) {
        let returnValue = { total: 0, results: [] };
        await this._searchSemaphore.acquire();
        try {
            const page = await this._zim.search(filename, query, offset, limit);
            const results = [];
            const cL1 = page.results.length;
            for (let iL1 = 0; iL1 < cL1; iL1++) {
                const hit = page.results[iL1];
                try {
                    const art = await this.article(hit.path);
                    if (0 < art.sizeBytes) {
                        results.push({
                            title: hit.title,
                            path: hit.path,
                            sizeBytes: art.sizeBytes
                        });
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this._logger.stdout('Mcp._getSearchResults', 'EXCEPTION', message);
                }
            }
            returnValue = { total: page.total, results };
        }
        finally {
            this._searchSemaphore.release();
        }
        return returnValue;
    }
    async _handleMethod(request) {
        let returnValue;
        switch (request.method) {
            case 'initialize':
                returnValue = Mcp._successResponse(request.id, {
                    protocolVersion: '2025-03-26',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'jzimhttp', version: '1.0.0' }
                });
                break;
            case 'notifications/initialized':
                break;
            case 'tools/list':
                returnValue = Mcp._successResponse(request.id, {
                    tools: TOOL_DEFINITIONS.map(t => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema
                    }))
                });
                break;
            case 'tools/call':
                returnValue = await this._handleToolCall(request);
                break;
            default:
                returnValue = Mcp._errorResponse(request.id, -32601, `Method not found: ${request.method}`);
                break;
        }
        return returnValue;
    }
    async _handleToolCall(request) {
        const params = (request.params ?? {});
        const toolName = params.name;
        const toolArgs = (params.arguments ?? {});
        let returnValue;
        if (toolName) {
            const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
            if (undefined !== definition) {
                const schema = definition.inputSchema;
                let validationError;
                schema.required.every((requiredField) => {
                    let continueChecking = true;
                    if (!toolArgs[requiredField]) {
                        validationError = `Missing required parameter: ${requiredField}`;
                        continueChecking = false;
                    }
                    return continueChecking;
                });
                if (undefined === validationError) {
                    Object.entries(toolArgs).every(([key, value]) => {
                        let continueChecking = true;
                        const propSchema = schema.properties[key];
                        if (undefined !== propSchema) {
                            if ('string' === propSchema.type && 'string' !== typeof value) {
                                validationError = `Parameter ${key} must be a string`;
                                continueChecking = false;
                            }
                            else if ('integer' === propSchema.type && ('number' !== typeof value || !Number.isInteger(value))) {
                                validationError = `Parameter ${key} must be an integer`;
                                continueChecking = false;
                            }
                            else if ('boolean' === propSchema.type && 'boolean' !== typeof value) {
                                validationError = `Parameter ${key} must be a boolean`;
                                continueChecking = false;
                            }
                            else if ('integer' === propSchema.type && 'number' === typeof value && Number.isInteger(value)) {
                                if (undefined !== propSchema.minimum && value < propSchema.minimum) {
                                    validationError = `Parameter ${key} must be >= ${propSchema.minimum}`;
                                    continueChecking = false;
                                }
                                else if (undefined !== propSchema.maximum && value > propSchema.maximum) {
                                    validationError = `Parameter ${key} must be <= ${propSchema.maximum}`;
                                    continueChecking = false;
                                }
                            }
                        }
                        return continueChecking;
                    });
                }
                if (undefined === validationError) {
                    try {
                        let result;
                        switch (toolName) {
                            case 'search':
                                result = await this.search(toolArgs.query, toolArgs.page);
                                break;
                            case 'article': {
                                const art = await this.article(toolArgs.path);
                                result = art.content;
                                break;
                            }
                            default:
                                throw new Error(`Unknown tool: ${toolName}`);
                        }
                        returnValue = Mcp._successResponse(request.id, {
                            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                        });
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        returnValue = Mcp._successResponse(request.id, {
                            content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
                            isError: true
                        });
                    }
                }
                else {
                    returnValue = Mcp._errorResponse(request.id, -32602, validationError);
                }
            }
            else {
                returnValue = Mcp._errorResponse(request.id, -32602, `Unknown tool: ${toolName}`);
            }
        }
        else {
            returnValue = Mcp._errorResponse(request.id, -32602, 'Missing tool name');
        }
        return returnValue;
    }
}
