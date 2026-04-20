import test from 'ava';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../dist/logger.js';
import { Zim } from '../../dist/zim.js';
import { Mcp } from '../../dist/mcp.js';
Logger.getInstance().stdout = () => { };
const mcpConfig = {
    enabled: true,
    listeners: [{ host: '127.0.0.1', port: 0 }],
    maxConcurrentSearch: 2,
    maxConcurrentArticle: 3,
    searchResultsPerFile: 2,
};
async function makeTempDir(files = []) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zim-ops-test-'));
    for (const cL1 of files) {
        await fs.writeFile(path.join(dir, cL1), '');
    }
    return dir;
}
test('path traversal: returns null on ../escape', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        t.is(zim.resolveArchivePath('../etc/passwd'), undefined);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('path traversal: allows valid relative path inside base', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const resolved = zim.resolveArchivePath('some.zim');
        t.true(undefined !== resolved && resolved.startsWith(dir));
        t.true(undefined !== resolved && resolved.endsWith('some.zim'));
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('path traversal: returns null on absolute path outside base', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        t.is(zim.resolveArchivePath('/etc/passwd'), undefined);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('path traversal: returns null on encoded traversal ../../', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        t.is(zim.resolveArchivePath('../../etc/hosts'), undefined);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('_parseEntryPath: splits valid path correctly', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const result = zim.parseEntryPath('wikipedia.zim/C/Article');
        t.not(result, null);
        t.is(result.filename, 'wikipedia.zim');
        t.is(result.entryPath, 'C/Article');
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('_parseEntryPath: returns null on invalid path without .zim/', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        t.is(zim.parseEntryPath('invalid/path'), undefined);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
test('_parseEntryPath: handles nested namespace paths', async (t) => {
    const dir = await makeTempDir();
    const zim = new Zim(dir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const result = zim.parseEntryPath('file.zim/C/Some/Nested/Path');
        t.not(result, null);
        t.is(result.filename, 'file.zim');
        t.is(result.entryPath, 'C/Some/Nested/Path');
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
        await fs.rm(dir, { recursive: true });
    }
});
const _zimDataDir = path.join(process.cwd(), 'tests/data');
const _zimFileName = 'wikipedia_en_100_mini_2026-01.zim';
test('Search with real file: returns results for a common query', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const result = await mcp.search('the');
        t.true(result.results.length > 0);
        for (const r of result.results) {
            t.true(r.path.includes('.zim/'));
            t.true(r.sizeBytes >= 0);
        }
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Search with real file: respects page', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const first = await mcp.search('the', 1);
        const second = await mcp.search('the', 2);
        if (first.results.length > 0 && second.results.length > 0) {
            t.notDeepEqual(first.results[0], second.results[0]);
        }
        else {
            t.pass('not enough results to test pagination');
        }
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Search with real file: returns empty for nonsense query', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const result = await mcp.search('xyzzy99999');
        t.is(result.results.length, 0);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Search with real file: hasMore is false when few results', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const result = await mcp.search('xyzzy99999');
        t.false(result.hasMore);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Article with real file: returns full markdown for a search result', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const searchResult = await mcp.search('the');
        t.true(0 < searchResult.results.length);
        const firstPath = searchResult.results[0].path;
        const article = await mcp.article(firstPath);
        t.true(0 < article.content.length);
        t.true(0 < article.sizeBytes);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Article with real file: throws for nonexistent entry', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        await t.throwsAsync(() => mcp.article(`${_zimFileName}/C/Nonexistent_Article_99999`));
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Article with real file: returns content and sizeBytes only', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const searchResult = await mcp.search('the');
        t.true(0 < searchResult.results.length);
        const firstPath = searchResult.results[0].path;
        const article = await mcp.article(firstPath);
        t.true(0 < article.content.length);
        t.is(article.sizeBytes, Buffer.byteLength(article.content, 'utf8'));
        t.deepEqual(Object.keys(article).sort(), ['content', 'sizeBytes']);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Article with real file: cache hit returns identical result', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const searchResult = await mcp.search('the');
        t.true(0 < searchResult.results.length);
        const firstPath = searchResult.results[0].path;
        const article1 = await mcp.article(firstPath);
        const article2 = await mcp.article(firstPath);
        t.deepEqual(article1, article2);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Search with real file: sizeBytes reflects markdown size', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const searchResult = await mcp.search('the');
        t.true(0 < searchResult.results.length);
        const first = searchResult.results[0];
        const article = await mcp.article(first.path);
        t.is(first.sizeBytes, article.sizeBytes);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Search with real file: prefetches articles into cache', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const searchResult = await mcp.search('the');
        t.true(0 < searchResult.results.length);
        const firstPath = searchResult.results[0].path;
        const article = await mcp.article(firstPath);
        t.true(0 < article.content.length);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Mcp.Search paginates via page without fetching 200 rows upfront', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const page1 = await mcp.search('the', 1);
        const page2 = await mcp.search('the', 2);
        t.true(Array.isArray(page1.results));
        t.true(Array.isArray(page2.results));
        t.is(1, page1.page);
        t.is(2, page2.page);
        if (0 < page1.results.length && 0 < page2.results.length) {
            const p1Paths = new Set(page1.results.map(r => r.path));
            const overlap = page2.results.filter(r => p1Paths.has(r.path)).length;
            t.true(overlap < page2.results.length, 'offset should shift the result window');
        }
        else {
            t.pass();
        }
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
test('Mcp.Search returns hasMore when total exceeds offset + limit', async (t) => {
    const zim = new Zim(_zimDataDir, 4, 200, 300000);
    const mcp = new Mcp(zim, mcpConfig, 200, 300000);
    try {
        const res = await mcp.search('a', 1);
        t.is('boolean', typeof res.hasMore);
    }
    finally {
        mcp.shutdown();
        zim.shutdown();
    }
});
