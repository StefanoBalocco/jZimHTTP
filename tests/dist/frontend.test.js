import test from 'ava';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { promisify } from 'util';
import { classifyRoute, escapeAttrValue, resolveTemplateUrl, shouldInterceptPagerClick, snippetToSegments } from '../../frontend/dist/app.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const wwwDir = path.resolve(__dirname, '../../www');
const tsBuildCli = path.resolve(repoRoot, 'node_modules/@stefanobalocco/tsbuild/dist/tsBuild.js');
const execFileAsync = promisify(execFile);
const assets = ['style.css', 'app.min.js', 'home.min.mjs', 'search.min.mjs'];
const hashTokenPattern = /[A-Za-z0-9_-]{16}(?=["'])/;
async function appModuleExports() {
    return (await import('../../frontend/dist/app.js'));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
test('www contains exactly the generated static assets', async (t) => {
    const entries = (await fs.readdir(wwwDir)).sort();
    t.deepEqual(entries, ['app.min.js', 'home.min.mjs', 'index.html', 'search.min.mjs', 'style.css']);
});
test('frontend template sources use no STRING: expressions and no pipe fallbacks in data-tdal directives', async (t) => {
    const sources = ['frontend/src/home.tpl', 'frontend/src/search.tpl', 'frontend/index.html'];
    const directivePattern = /data-tdal-[a-z-]+=(?:"([^"]*)"|'([^']*)')/g;
    const cL1 = sources.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const source = await fs.readFile(path.resolve(repoRoot, sources[iL1]), 'utf8');
        t.false(source.includes('STRING:'), sources[iL1] + ' must not use STRING: expressions');
        for (const match of source.matchAll(directivePattern)) {
            const directive = match[1] ?? match[2] ?? '';
            t.false(directive.includes('|'), sources[iL1] + ' directive "' + directive + '" must not use a pipe fallback expression');
        }
    }
});
test('www/style.css .search-bar input[type=text] includes min-width:0 so the flex input shrinks before the Search button clips', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.search-bar input\[type=text\]\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.search-bar input[type=text] rule must exist in www/style.css');
    t.true((ruleMatch[0]).includes('min-width:0'), '.search-bar input[type=text] must include min-width:0');
});
test('www/style.css .filename rule includes overflow-wrap:anywhere so long ZIM filenames wrap inside the heading', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.filename\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.filename rule must exist in www/style.css');
    t.true((ruleMatch[0]).includes('overflow-wrap:anywhere'), '.filename must include overflow-wrap:anywhere');
});
test('search.tpl heading filename span carries the filename class for wrapping', async (t) => {
    const tpl = await fs.readFile(path.resolve(repoRoot, 'frontend/src/search.tpl'), 'utf8');
    t.true(tpl.includes('<span class="filename" data-tdal-content="filename">file</span>'));
});
test('www/style.css .search-bar button includes min-height:44px for a touch-friendly hit area', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.search-bar button\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.search-bar button rule must exist in www/style.css');
    t.true((ruleMatch[0]).includes('min-height:44px'), '.search-bar button must include min-height:44px');
});
test('www/style.css .search-bar input[type=text] includes min-height:44px and box-sizing:border-box for a touch-friendly hit area', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.search-bar input\[type=text\]\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.search-bar input[type=text] rule must exist in www/style.css');
    const rule = ruleMatch[0];
    t.true(rule.includes('min-height:44px'), '.search-bar input[type=text] must include min-height:44px');
    t.true(rule.includes('box-sizing:border-box'), '.search-bar input[type=text] must include box-sizing:border-box so min-height covers padding and border');
});
test('www/style.css .err keeps its light color and gains a dark-scheme error color meeting contrast', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const lightMatch = css.match(/\.err\s*\{[^}]*\}/);
    t.not(lightMatch, null, '.err rule must exist in www/style.css');
    t.true((lightMatch[0]).includes('color:#c33'), '.err must keep its light color:#c33');
    const darkMatch = css.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[^}]*\.err\s*\{[^}]*\}\s*\}/);
    t.not(darkMatch, null, 'a prefers-color-scheme:dark .err rule must exist in www/style.css');
    t.true((darkMatch[0]).includes('color:#ff6b6b'), 'dark .err must use color:#ff6b6b');
});
test('www/style.css .pager a is at least 44x44px with centered label text', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.pager a\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.pager a rule must exist in www/style.css');
    const rule = ruleMatch[0];
    t.true(rule.includes('min-width:44px'), '.pager a must include min-width:44px');
    t.true(rule.includes('min-height:44px'), '.pager a must include min-height:44px');
    t.true(rule.includes('box-sizing:border-box'), '.pager a must include box-sizing:border-box so min dimensions cover padding and border');
    t.true(rule.includes('display:flex'), '.pager a must include display:flex to center the label');
    t.true(rule.includes('align-items:center'), '.pager a must include align-items:center');
    t.true(rule.includes('justify-content:center'), '.pager a must include justify-content:center');
});
test('www/style.css li a is a block-level 44px tap target used by home and search result links', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/li a\s*\{[^}]*\}/);
    t.not(ruleMatch, null, 'li a rule must exist in www/style.css');
    const rule = ruleMatch[0];
    t.true(rule.includes('display:block'), 'li a must be block-level so the whole anchor is tappable');
    t.true(rule.includes('min-height:44px'), 'li a must include min-height:44px');
    t.true(rule.includes('box-sizing:border-box'), 'li a must include box-sizing:border-box so min-height covers padding and border');
    t.true(rule.includes('font-weight:600'), 'li a must keep font-weight:600');
    t.true(rule.includes('text-decoration:none'), 'li a must keep text-decoration:none');
    const homeUrl = pathToFileURL(path.join(wwwDir, 'home.min.mjs')).href + '?t=' + Date.now();
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const homeRender = (await import(homeUrl)).default;
    const searchRender = (await import(searchUrl)).default;
    const homeHtml = homeRender({
        error: '',
        files: [{ title: 'T', name: 'x.zim', date: '', articleCount: 0, language: '', dateLabel: '', articleCountLabel: '', languageLabel: '', description: '', href: 'z/x.zim' }]
    });
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: 'the',
        placeholder: 'Search in x.zim',
        value: 'the',
        error: '',
        total: 1,
        results: [{ title: 'T', path: 'x.zim/C/A', href: 'z/x.zim/C/A' }],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(/<li>\s*<a /.test(homeHtml), 'home file links must be anchors inside li elements');
    t.true(/<li>\s*<a /.test(searchHtml), 'search result links must be anchors inside li elements');
});
test('www/style.css .pager includes flex-wrap:wrap so 44px controls wrap within a 320px content width', async (t) => {
    const css = await fs.readFile(path.join(wwwDir, 'style.css'), 'utf8');
    const ruleMatch = css.match(/\.pager\s*\{[^}]*\}/);
    t.not(ruleMatch, null, '.pager rule must exist in www/style.css');
    t.true((ruleMatch[0]).includes('flex-wrap:wrap'), '.pager must include flex-wrap:wrap');
});
test('www/index.html has no data-tdal attributes and SHAKE256-96 content-hash query strings', async (t) => {
    const html = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    t.false(html.includes('data-tdal-'));
    for (const name of assets) {
        const match = html.match(new RegExp(escapeRegExp(name) + '\\?(' + hashTokenPattern.source + ')'));
        t.not(match, null, name + ' must carry a 16-char base64url SHAKE256-96 query token');
    }
    t.true(html.includes('<script type="module" src="/app.min.js?'));
});
test('www/index.html uses root-relative SHAKE256-96 content-hash URLs for deep-link delivery', async (t) => {
    const html = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    for (const name of assets) {
        const match = html.match(new RegExp('/' + escapeRegExp(name) + '\\?(' + hashTokenPattern.source + ')'));
        t.not(match, null, name + ' must be root-relative with a SHAKE256-96 content-hash query string');
    }
    t.true(html.includes('<script type="module" src="/app.min.js?'));
    t.true(html.includes('href="/home.min.mjs?'));
    t.true(html.includes('href="/search.min.mjs?'));
    t.true(html.includes('data-home-template="/home.min.mjs?'));
    t.true(html.includes('data-search-template="/search.min.mjs?'));
});
test('escapeRegExp escapes regex metacharacters so asset-name regexes match literally', (t) => {
    t.is('style\\.css', escapeRegExp('style.css'));
    t.is('a\\+b\\(c\\)\\[d\\]\\{e\\}\\?\\*\\^\\.\\$\\|', escapeRegExp('a+b(c)[d]{e}?*^.$|'));
    const pattern = new RegExp(escapeRegExp('style.css') + '\\?(' + hashTokenPattern.source + ')');
    t.not(null, pattern.exec('style.css?AAAAAAAAAAAAAAAA"'));
    t.is(pattern.exec('styleXcss?AAAAAAAAAAAAAAAA"'), null);
});
test('build:tests script rebuilds backend, frontend, and tests in dependency order', async (t) => {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../package.json'), 'utf8'));
    t.is('tsBuild backend frontend tests', packageJson.scripts['build:tests']);
});
test.serial('two successive frontend builds with unchanged inputs produce byte-identical www/index.html', async (t) => {
    const buildOnce = async () => {
        await execFileAsync(process.execPath, [tsBuildCli, 'frontend'], { cwd: repoRoot });
        return fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    };
    const first = await buildOnce();
    const second = await buildOnce();
    t.is(first, second);
});
test('www/index.html query tokens equal the SHAKE256-96 content hashes of the assets', async (t) => {
    const html = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    for (const name of assets) {
        const match = html.match(new RegExp('/' + escapeRegExp(name) + '\\?(' + hashTokenPattern.source + ')'));
        t.not(match, null, name + ' must carry a SHAKE256-96 query token');
        const token = match[1];
        t.is(16, token.length, name + ' query token must be a 16-character base64url SHAKE256-96 digest');
        const contents = await fs.readFile(path.join(wwwDir, name));
        const expected = createHash('shake256', { outputLength: 12 }).update(contents).digest('base64url');
        t.is(expected, token, name + ' query token must equal its SHAKE256-96 content hash');
    }
});
test('www/index.html body template URLs match their modulepreload URLs', async (t) => {
    const html = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
    t.is(2, preloads.length);
    const bodyHome = html.match(/data-home-template="([^"]+)"/)[1];
    const bodySearch = html.match(/data-search-template="([^"]+)"/)[1];
    t.is(bodyHome, preloads[0]);
    t.is(bodySearch, preloads[1]);
});
test('resolveTemplateUrl resolves a bare template URL against a base URL preserving the SHAKE256-96 query', (t) => {
    t.is('http://localhost/home.min.mjs?AAAAAAAAAAAAAAAA', resolveTemplateUrl('home.min.mjs?AAAAAAAAAAAAAAAA', 'http://localhost/'));
    t.is('https://cdn.example/search.min.mjs?BBBBBBBBBBBBBBBB', resolveTemplateUrl('search.min.mjs?BBBBBBBBBBBBBBBB', 'https://cdn.example/'));
    t.is('http://localhost/home.min.mjs?AAAAAAAAAAAAAAAA', resolveTemplateUrl('/home.min.mjs?AAAAAAAAAAAAAAAA', 'http://localhost/search/x.zim'));
    t.is('https://cdn.example/search.min.mjs?BBBBBBBBBBBBBBBB', resolveTemplateUrl('/search.min.mjs?BBBBBBBBBBBBBBBB', 'https://cdn.example/search/x.zim'));
});
test('classifyRoute treats / and /index.html as home and /search/ as search', (t) => {
    const homePaths = ['/', '/index.html'];
    const cL1 = homePaths.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        t.is('home', classifyRoute(homePaths[iL1]));
    }
    t.is('search', classifyRoute('/search/x.zim'));
    t.is('search', classifyRoute('/search/x.zim/results'));
    t.is('none', classifyRoute('/other'));
    t.is('none', classifyRoute('/search'));
});
test('escapeAttrValue escapes & < > " and single quote in safe order', (t) => {
    t.is('&amp;&lt;&gt;&quot;&#39;', escapeAttrValue('&<>"\''));
    t.is('x&quot; autofocus onfocus=&quot;alert(1).zim', escapeAttrValue('x" autofocus onfocus="alert(1).zim'));
});
test('shouldInterceptPagerClick intercepts only unmodified primary-button clicks', (t) => {
    t.true(shouldInterceptPagerClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), 'plain left click must keep SPA pagination');
    t.false(shouldInterceptPagerClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }), 'Cmd-click must keep native anchor behavior');
    t.false(shouldInterceptPagerClick({ button: 0, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }), 'Ctrl-click must keep native anchor behavior');
    t.false(shouldInterceptPagerClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }), 'Shift-click must keep native anchor behavior');
    t.false(shouldInterceptPagerClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: true }), 'Alt-click must keep native anchor behavior');
    t.false(shouldInterceptPagerClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), 'middle click must keep native anchor behavior');
    t.false(shouldInterceptPagerClick({ button: 2, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), 'right click must keep native anchor behavior');
});
test('app module exposes no model-builder helpers in its public API', async (t) => {
    const exports = await appModuleExports();
    t.false('homeFileModel' in exports, 'homeFileModel must not be part of the public module API');
    t.false('searchResultModel' in exports, 'searchResultModel must not be part of the public module API');
});
test('home renderer prints complete direct model data: link text, href, and metadata labels', async (t) => {
    const homeUrl = pathToFileURL(path.join(wwwDir, 'home.min.mjs')).href + '?t=' + Date.now();
    const homeRender = (await import(homeUrl)).default;
    const fallbackHtml = homeRender({
        error: '',
        files: [{
                title: 'x.zim',
                name: 'x.zim',
                date: '',
                articleCount: 0,
                language: '',
                dateLabel: '',
                articleCountLabel: ' · 0 articles',
                languageLabel: ' · ',
                description: '',
                href: 'z/x.zim'
            }]
    });
    t.true(fallbackHtml.includes('>x.zim</a>'), 'the file-link text must be the direct title value');
    t.true(fallbackHtml.includes('href="z/x.zim"'), 'the file link must use the direct href value');
    t.true(fallbackHtml.includes('<span>x.zim</span>'), 'the name span must render the direct name value');
    const populatedHtml = homeRender({
        error: '',
        files: [{
                title: 'T',
                name: 'x.zim',
                date: '2024-01-01',
                articleCount: 1234,
                language: 'eng',
                dateLabel: ' · 2024-01-01',
                articleCountLabel: ' · 1234 articles',
                languageLabel: ' · eng',
                description: '',
                href: 'z/x.zim'
            }]
    });
    t.true(populatedHtml.includes('>T</a>'), 'the file-link text must be the direct title value');
    t.true(populatedHtml.includes('<span> · 2024-01-01</span>'), 'the date label must render the direct dateLabel value');
    t.true(populatedHtml.includes('<span> · 1234 articles</span>'), 'the article count label must render the direct articleCountLabel value');
    t.true(populatedHtml.includes('<span> · eng</span>'), 'the language label must render the direct languageLabel value');
});
test('search renderer prints complete direct result model data: link text, direct href, and no snippet block without hasSnippet', async (t) => {
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const searchRender = (await import(searchUrl)).default;
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: 'the',
        placeholder: 'Search in x.zim',
        value: 'the',
        error: '',
        total: 1,
        results: [{
                title: 'x.zim/C/A',
                path: 'x.zim/C/A',
                href: '../z/x.zim/C/A',
                hasSnippet: false,
                snippetSegments: []
            }],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(searchHtml.includes('>x.zim/C/A</a>'), 'the result-link text must be the direct title value');
    t.true(searchHtml.includes('href="../z/x.zim/C/A"'), 'the result link must use the direct href value');
    t.false(searchHtml.includes('class="meta"'), 'no snippet block may render without hasSnippet');
});
test('home and search renderer modules export callable default renderers that escape data', async (t) => {
    const homeUrl = pathToFileURL(path.join(wwwDir, 'home.min.mjs')).href + '?t=' + Date.now();
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const homeMod = await import(homeUrl);
    const searchMod = await import(searchUrl);
    t.is('function', typeof homeMod.default);
    t.is('function', typeof searchMod.default);
    const homeRender = homeMod.default;
    const searchRender = searchMod.default;
    const homeHtml = homeRender({
        error: '',
        files: [{ title: '<script>alert(1)</script>', name: 'x.zim', date: '', articleCount: 0, language: '', dateLabel: '', articleCountLabel: '', languageLabel: '', description: '', href: 'z/x.zim' }]
    });
    t.true(homeHtml.includes('<h1>jZimHTTP Library</h1>'));
    t.true(homeHtml.includes('&lt;script&gt;'));
    t.false(homeHtml.includes('<script>alert(1)</script>'));
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: 'the',
        placeholder: 'Search in x.zim',
        value: 'the',
        error: '',
        total: 1,
        results: [{ title: '<script>alert(1)</script>', path: 'x.zim/C/A', snippet: '', href: 'z/x.zim/C/A' }],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(searchHtml.includes('<h1>Search in <span class="filename">x.zim</span></h1>'));
    t.true(searchHtml.includes('for="search-q"'));
    t.true(searchHtml.includes('id="search-q"'));
    t.true(searchHtml.includes('&lt;script&gt;'));
    t.false(searchHtml.includes('<script>alert(1)</script>'));
});
test('search renderer emits single safe quoted attributes for malicious filename and query', async (t) => {
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const searchMod = await import(searchUrl);
    const searchRender = searchMod.default;
    const maliciousFilename = 'x" autofocus onfocus="alert(1).zim';
    const maliciousQuery = '"><script>alert(1)</script>&\'';
    const searchHtml = searchRender({
        filename: maliciousFilename,
        query: maliciousQuery,
        placeholder: 'Search in ' + escapeAttrValue(maliciousFilename),
        value: escapeAttrValue(maliciousQuery),
        error: '',
        total: 1,
        results: [],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(searchHtml.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;"'));
    t.true(searchHtml.includes('placeholder="Search in x&quot; autofocus onfocus=&quot;alert(1).zim"'), 'the placeholder must be the full escaped model value');
    t.is(1, (searchHtml.match(/placeholder="/g) ?? []).length, 'exactly one placeholder attribute must be emitted');
    t.false(searchHtml.includes('onfocus="alert(1)'), 'no raw injected attribute may appear');
    t.false(searchHtml.includes('<script>alert(1)</script>'));
});
test('home renderer marks a nonempty error paragraph with class err, its text, and role=alert', async (t) => {
    const homeUrl = pathToFileURL(path.join(wwwDir, 'home.min.mjs')).href + '?t=' + Date.now();
    const homeRender = (await import(homeUrl)).default;
    const homeHtml = homeRender({ error: 'Failed to load files', files: [] });
    t.true(homeHtml.includes('<p class="err" role="alert">Failed to load files</p>'));
});
test('search renderer marks a nonempty error paragraph with class err, its text, and role=alert', async (t) => {
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const searchRender = (await import(searchUrl)).default;
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: 'the',
        placeholder: 'Search in x.zim',
        value: 'the',
        error: 'Search failed',
        total: 0,
        results: [],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(searchHtml.includes('<p class="err" role="alert">Search failed</p>'));
});
test('home and search renderers do not emit a second id="app"', async (t) => {
    const shell = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    t.true(shell.includes('<div id="app">'));
    const homeUrl = pathToFileURL(path.join(wwwDir, 'home.min.mjs')).href + '?t=' + Date.now();
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const homeRender = (await import(homeUrl)).default;
    const searchRender = (await import(searchUrl)).default;
    const homeHtml = homeRender({ error: '', files: [] });
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: '',
        placeholder: 'Search in x.zim',
        value: '',
        error: '',
        total: 0,
        results: [],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.false(homeHtml.includes('id="app"'));
    t.false(searchHtml.includes('id="app"'));
});
test('snippetToSegments returns a single literal segment for ordinary text', (t) => {
    t.deepEqual(snippetToSegments('plain text'), [{ text: 'plain text', highlighted: false }]);
});
test('snippetToSegments splits a valid <b> highlight into a highlighted segment', (t) => {
    t.deepEqual(snippetToSegments('a <b>the</b> b'), [
        { text: 'a ', highlighted: false },
        { text: 'the', highlighted: true },
        { text: ' b', highlighted: false }
    ]);
});
test('snippetToSegments does not accept whitespace in b tags', (t) => {
    t.deepEqual(snippetToSegments('<B >the</B >'), [{ text: '<B >the</B >', highlighted: false }]);
});
test('snippetToSegments treats a <b> tag with attributes as literal escaped text', (t) => {
    t.deepEqual(snippetToSegments('<b onclick="alert(1)">the</b>'), [{ text: '<b onclick="alert(1)">the</b>', highlighted: false }]);
});
test('snippetToSegments treats arbitrary markup as literal text', (t) => {
    const segments = snippetToSegments('<img src=x onerror=alert(1)><script>alert(2)</script>');
    t.deepEqual(segments, [{ text: '<img src=x onerror=alert(1)><script>alert(2)</script>', highlighted: false }]);
});
test('snippetToSegments handles unbalanced and adjacent b tags safely', (t) => {
    t.deepEqual(snippetToSegments('<b>open'), [{ text: 'open', highlighted: true }]);
    t.deepEqual(snippetToSegments('<b>a</b><b>b</b>'), [
        { text: 'a', highlighted: true },
        { text: 'b', highlighted: true }
    ]);
});
test('search renderer renders highlighted snippet segments as <strong> and escapes markup', async (t) => {
    const searchUrl = pathToFileURL(path.join(wwwDir, 'search.min.mjs')).href + '?t=' + Date.now();
    const searchRender = (await import(searchUrl)).default;
    const searchHtml = searchRender({
        filename: 'x.zim',
        query: 'the',
        placeholder: 'Search in x.zim',
        value: 'the',
        error: '',
        total: 1,
        results: [{
                title: 'Title',
                path: 'x.zim/C/A',
                href: 'z/x.zim/C/A',
                hasSnippet: true,
                snippetSegments: snippetToSegments('a <b>the</b> <img onerror=alert(1)>')
            }],
        pages: [],
        hasEllipsis: false,
        hasJump: false,
        jumpPage: 0,
        jumpHref: ''
    });
    t.true(searchHtml.includes('<strong>the</strong>'));
    t.true(searchHtml.includes('&lt;img onerror=alert(1)&gt;'));
    t.false(searchHtml.includes('<img onerror=alert(1)>'));
});
