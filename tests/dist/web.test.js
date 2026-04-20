import test from 'ava';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { Zim } from '../../dist/zim.js';
import { Web } from '../../dist/web.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../tests/data');
function buildApp() {
    const zim = new Zim(dataDir, 4, 200, 300000);
    const app = new Hono();
    const webConfig = { enabled: true, listeners: [], maxConcurrentPage: 4, searchResultsPerPage: 10 };
    const web = new Web(zim, webConfig);
    web.registerRoutes(app);
    return { app, zim };
}
test('GET / serves embedded HTML with ETag', async (t) => {
    const { app, zim } = buildApp();
    const res = await app.request('/');
    t.is(200, res.status);
    t.true((res.headers.get('content-type') ?? '').includes('text/html'));
    t.true(null !== res.headers.get('etag'));
    t.true(null !== res.headers.get('last-modified'));
    const body = await res.text();
    t.true(body.includes('<title>jZimHTTP Library</title>'));
    zim.shutdown();
});
test('GET / with matching If-None-Match returns 304', async (t) => {
    const { app, zim } = buildApp();
    const first = await app.request('/');
    const etag = first.headers.get('etag');
    const res = await app.request('/', { headers: { 'if-none-match': etag } });
    t.is(304, res.status);
    zim.shutdown();
});
test('GET /files returns JSON array of file info', async (t) => {
    const { app, zim } = buildApp();
    const res = await app.request('/files');
    t.is(200, res.status);
    t.true((res.headers.get('content-type') ?? '').includes('application/json'));
    const body = await res.json();
    t.true(Array.isArray(body));
    t.true(0 < body.length);
    t.true(body[0].name.endsWith('.zim'));
    zim.shutdown();
});
test('GET /z/<filename> redirects to main entry', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const res = await app.request('/z/' + encodeURIComponent(files[0].name));
    t.is(302, res.status);
    const location = res.headers.get('location');
    t.true(location.startsWith('/z/' + encodeURIComponent(files[0].name) + '/'));
    zim.shutdown();
});
test('GET /z/<filename>/<main entry> serves HTML with caching headers', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const main = (await zim.getFileMetadata(files[0].name)).mainPath;
    const entryOnly = main.substring(files[0].name.length + 1);
    const url = '/z/' + encodeURIComponent(files[0].name) + '/' + entryOnly;
    const res = await app.request(url);
    t.is(200, res.status);
    t.true((res.headers.get('content-type') ?? '').includes('html'));
    t.true(null !== res.headers.get('etag'));
    t.true(null !== res.headers.get('last-modified'));
    t.true((res.headers.get('cache-control') ?? '').includes('must-revalidate'));
    zim.shutdown();
});
test('GET /z/... with matching If-None-Match returns 304', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const main = (await zim.getFileMetadata(files[0].name)).mainPath;
    const entryOnly = main.substring(files[0].name.length + 1);
    const url = '/z/' + encodeURIComponent(files[0].name) + '/' + entryOnly;
    const first = await app.request(url);
    const etag = first.headers.get('etag');
    const res = await app.request(url, { headers: { 'if-none-match': etag } });
    t.is(304, res.status);
    zim.shutdown();
});
test('GET /z/unknown.zim returns 404', async (t) => {
    const { app, zim } = buildApp();
    const res = await app.request('/z/does_not_exist.zim');
    t.is(404, res.status);
    zim.shutdown();
});
test('GET /search/<filename>/results returns JSON with pagination metadata', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const url = '/search/' + encodeURIComponent(files[0].name) + '/results?q=the&p=1';
    const res = await app.request(url);
    t.is(200, res.status);
    const body = await res.json();
    t.is(files[0].name, body.filename);
    t.is('the', body.query);
    t.is(1, body.page);
    t.is(10, body.pageSize);
    t.true(Array.isArray(body.results));
    t.true(body.results.length <= 10);
    zim.shutdown();
});
test('GET /search/<filename>/results with empty q returns zero results', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const url = '/search/' + encodeURIComponent(files[0].name) + '/results?q=';
    const res = await app.request(url);
    t.is(200, res.status);
    const body = await res.json();
    t.is(0, body.total);
    t.is(0, body.results.length);
    zim.shutdown();
});
test('GET /search/unknown.zim/results returns 404', async (t) => {
    const { app, zim } = buildApp();
    const res = await app.request('/search/does_not_exist.zim/results?q=foo');
    t.is(404, res.status);
    zim.shutdown();
});
test('GET /search/<filename> serves HTML shell with search bar', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const url = '/search/' + encodeURIComponent(files[0].name);
    const res = await app.request(url);
    t.is(200, res.status);
    t.true((res.headers.get('content-type') ?? '').includes('text/html'));
    const body = await res.text();
    t.true(body.includes('<title>Search — ' + files[0].name));
    t.true(body.includes('action=""'));
    t.true(body.includes('name="q"'));
    zim.shutdown();
});
test('GET /search/unknown.zim returns 404', async (t) => {
    const { app, zim } = buildApp();
    const res = await app.request('/search/does_not_exist.zim');
    t.is(404, res.status);
    zim.shutdown();
});
test('GET /z/<filename>/<main entry> injects search bar form', async (t) => {
    const { app, zim } = buildApp();
    const files = await zim.listFiles();
    const main = (await zim.getFileMetadata(files[0].name)).mainPath;
    const entryOnly = main.substring(files[0].name.length + 1);
    const url = '/z/' + encodeURIComponent(files[0].name) + '/' + entryOnly;
    const res = await app.request(url);
    t.is(200, res.status);
    const body = await res.text();
    t.true(body.includes('jzimhttp-search-bar'));
    t.true(body.includes('action=""'));
    zim.shutdown();
});
