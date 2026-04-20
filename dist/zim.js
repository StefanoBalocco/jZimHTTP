import { Archive, Searcher } from '@openzim/libzim';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LruTtlCache } from './cache.js';
import { Logger } from './logger.js';
import { Semaphore } from './semaphore.js';
export class Zim {
    _baseDirectory;
    _archives = new Map();
    _searchers = new Map();
    _metadata = new Map();
    _htmlCache;
    _pageSemaphore;
    _cleanupTimer;
    _logger;
    constructor(baseDirectory, maxConcurrentPage, cacheMaxSize, cacheTtlMs) {
        this._baseDirectory = path.resolve(baseDirectory);
        this._pageSemaphore = new Semaphore(maxConcurrentPage);
        this._htmlCache = new LruTtlCache(cacheMaxSize, cacheTtlMs);
        this._cleanupTimer = setInterval(() => this._htmlCache.cleanup(), 60 * 1000);
        this._logger = Logger.getInstance();
    }
    get baseDirectory() {
        return this._baseDirectory;
    }
    async listFiles() {
        const returnValue = [];
        const entries = await fs.readdir(this._baseDirectory, { withFileTypes: true });
        const filenames = entries.filter((entry) => !entry.isSymbolicLink() && entry.isFile() && entry.name.endsWith('.zim')).map((entry) => entry.name).sort();
        const currentSet = new Set(filenames);
        for (const absolutePath of this._archives.keys()) {
            const filename = path.basename(absolutePath);
            if (!currentSet.has(filename)) {
                this._htmlCache.deleteByPrefix(filename);
                this._archives.delete(absolutePath);
                this._searchers.delete(absolutePath);
                this._metadata.delete(filename);
            }
        }
        for (const filename of filenames) {
            const info = await this.getFileMetadata(filename);
            if (undefined !== info) {
                returnValue.push(info);
            }
        }
        return returnValue;
    }
    async getFileMetadata(filename) {
        let returnValue = this._metadata.get(filename);
        if (undefined === returnValue) {
            const archive = await this._getArchive(filename);
            if (undefined !== archive) {
                let mainPath = '';
                try {
                    if (archive.hasMainEntry()) {
                        const mainEntry = archive.mainEntry;
                        const item = mainEntry.getItem(true);
                        mainPath = filename + '/' + item.path;
                    }
                }
                catch (_e) {
                    mainPath = '';
                }
                returnValue = {
                    name: filename,
                    title: this._readMetadata(archive, 'Title'),
                    description: this._readMetadata(archive, 'Description'),
                    date: this._readMetadata(archive, 'Date'),
                    language: this._readMetadata(archive, 'Language'),
                    creator: this._readMetadata(archive, 'Creator'),
                    articleCount: Number(archive.articleCount),
                    mediaCount: Number(archive.mediaCount),
                    mainPath
                };
                this._metadata.set(filename, returnValue);
            }
        }
        return returnValue;
    }
    async getPageHtml(entryPath) {
        let returnValue;
        this._logger.stdout('Zim.getPageHtml', 'ENTER', entryPath);
        const cacheKey = `html:${entryPath}`;
        const cachedRaw = this._htmlCache.get(cacheKey);
        if (undefined !== cachedRaw) {
            returnValue = JSON.parse(cachedRaw);
        }
        else {
            await this._pageSemaphore.acquire();
            try {
                const raw = await this.getBinary(entryPath);
                if ((undefined !== raw) && raw.mimetype.includes('html')) {
                    const html = raw.data.toString('utf8');
                    const page = {
                        html,
                        mimetype: raw.mimetype,
                        sizeBytes: Buffer.byteLength(html, 'utf8')
                    };
                    this._htmlCache.set(cacheKey, JSON.stringify(page));
                    returnValue = page;
                }
            }
            finally {
                this._pageSemaphore.release();
            }
        }
        return returnValue;
    }
    async search(filename, query, offset, limit) {
        let returnValue = { total: 0, results: [] };
        const absolutePath = this.resolveArchivePath(filename);
        if (undefined !== absolutePath) {
            let searcher = this._searchers.get(absolutePath);
            if (undefined === searcher) {
                const archive = await this._getArchive(filename);
                if (undefined !== archive) {
                    searcher = new Searcher(archive);
                    this._searchers.set(absolutePath, searcher);
                }
            }
            if (undefined !== searcher) {
                try {
                    const search = searcher.search(query);
                    const results = search.getResults(offset, limit);
                    for (const result of results) {
                        returnValue.results.push({
                            title: result.title,
                            path: filename + '/' + result.path,
                            snippet: result.snippet
                        });
                    }
                    returnValue.total = Number(search.estimatedMatches);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this._logger.stdout('Zim.search', 'EXCEPTION', message);
                }
            }
        }
        return returnValue;
    }
    shutdown() {
        if (undefined !== this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = undefined;
        }
        this._htmlCache.clear();
        this._archives.clear();
        this._searchers.clear();
        this._metadata.clear();
    }
    async getBinary(fullPath) {
        let returnValue;
        const zimExtIdx = fullPath.indexOf('.zim/');
        if (-1 !== zimExtIdx) {
            const filename = fullPath.substring(0, zimExtIdx + 4);
            const entryPath = fullPath.substring(zimExtIdx + 5);
            const archive = await this._getArchive(filename);
            if (undefined !== archive) {
                try {
                    if (archive.hasEntryByPath(entryPath)) {
                        const entry = archive.getEntryByPath(entryPath);
                        const item = entry.getItem(true);
                        returnValue = {
                            data: item.data.data,
                            mimetype: item.mimetype
                        };
                    }
                }
                catch (_e) {
                    returnValue = undefined;
                }
            }
        }
        return returnValue;
    }
    parseEntryPath(fullPath) {
        let returnValue;
        const zimExtIdx = fullPath.indexOf('.zim/');
        if (-1 !== zimExtIdx) {
            returnValue = {
                filename: fullPath.substring(0, zimExtIdx + 4),
                entryPath: fullPath.substring(zimExtIdx + 5)
            };
        }
        return returnValue;
    }
    resolveArchivePath(filename) {
        let returnValue;
        const absolutePath = path.resolve(this._baseDirectory, filename);
        if ((absolutePath.startsWith(this._baseDirectory + path.sep) || (absolutePath === this._baseDirectory)) && absolutePath.endsWith('.zim')) {
            returnValue = absolutePath;
        }
        return returnValue;
    }
    async _getArchive(filename) {
        let returnValue;
        const absolutePath = this.resolveArchivePath(filename);
        if (undefined !== absolutePath) {
            let archive = this._archives.get(absolutePath);
            if (undefined === archive) {
                try {
                    archive = new Archive(absolutePath);
                    this._archives.set(absolutePath, archive);
                }
                catch (_e) {
                    archive = undefined;
                }
            }
            returnValue = archive;
        }
        return returnValue;
    }
    _readMetadata(archive, key) {
        let returnValue = '';
        try {
            returnValue = archive.getMetadata(key);
        }
        catch (_e) {
            returnValue = '';
        }
        return returnValue;
    }
}
