export function shouldInterceptPagerClick(event) {
    return (0 === event.button) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
export function classifyRoute(pathname) {
    let returnValue = 'none';
    if ('/' === pathname || '/index.html' === pathname) {
        returnValue = 'home';
    }
    else if (pathname.startsWith('/search/')) {
        returnValue = 'search';
    }
    return returnValue;
}
const appEl = ('undefined' !== typeof document) ? document.getElementById('app') : null;
export function resolveTemplateUrl(templateUrl, baseUrl) {
    return new URL(templateUrl, baseUrl).href;
}
export function escapeAttrValue(value) {
    let returnValue = '';
    const cL1 = value.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const ch = value.charAt(iL1);
        if ('&' === ch) {
            returnValue += '&amp;';
        }
        else if ('<' === ch) {
            returnValue += '&lt;';
        }
        else if ('>' === ch) {
            returnValue += '&gt;';
        }
        else if ('"' === ch) {
            returnValue += '&quot;';
        }
        else if ("'" === ch) {
            returnValue += '&#39;';
        }
        else {
            returnValue += ch;
        }
    }
    return returnValue;
}
const bTagRegex = /<b>|<\/b>/gi;
export function snippetToSegments(snippet) {
    const returnValue = [];
    let highlighted = false;
    let lastIndex = 0;
    let match;
    while (null !== (match = bTagRegex.exec(snippet))) {
        const isClosing = match[0].startsWith('</');
        if (!isClosing || highlighted) {
            const text = snippet.substring(lastIndex, match.index);
            if ('' !== text) {
                returnValue.push({ text, highlighted });
            }
            highlighted = isClosing ? false : true;
            lastIndex = match.index + match[0].length;
        }
    }
    const tail = snippet.substring(lastIndex);
    if ('' !== tail) {
        returnValue.push({ text: tail, highlighted });
    }
    return returnValue;
}
function setError(message) {
    if (appEl) {
        appEl.textContent = 'Failed to load: ' + message;
    }
}
async function loadTemplates() {
    const homeUrl = resolveTemplateUrl(document.body.dataset.homeTemplate ?? '', document.baseURI);
    const searchUrl = resolveTemplateUrl(document.body.dataset.searchTemplate ?? '', document.baseURI);
    if ('' === homeUrl || '' === searchUrl) {
        throw new Error('Missing template module URLs');
    }
    const homeMod = await import(homeUrl);
    const searchMod = await import(searchUrl);
    return {
        home: homeMod.default,
        search: searchMod.default
    };
}
class App {
    _home;
    _search;
    constructor(home, search) {
        this._home = home;
        this._search = search;
    }
    async run() {
        window.addEventListener('popstate', () => {
            void this._renderCurrent();
        });
        await this._renderCurrent();
    }
    async _renderCurrent() {
        const pathname = location.pathname;
        const kind = classifyRoute(pathname);
        if ('home' === kind) {
            await this._renderHome();
        }
        else if ('search' === kind) {
            await this._renderSearch();
        }
    }
    async _renderHome() {
        let model;
        try {
            const r = await fetch('files', { headers: { accept: 'application/json' } });
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            const files = await r.json();
            const fileModels = files.map((f) => ({
                title: f.title || f.name,
                name: f.name,
                date: f.date,
                articleCount: f.articleCount,
                language: f.language,
                dateLabel: f.date ? ' · ' + f.date : '',
                articleCountLabel: ' · ' + f.articleCount + ' articles',
                languageLabel: ' · ' + f.language,
                description: f.description,
                href: 'z/' + encodeURIComponent(f.name)
            }));
            model = { error: '', files: fileModels };
        }
        catch (e) {
            model = { error: 'Failed to load file list: ' + (e instanceof Error ? e.message : String(e)), files: [] };
        }
        if (appEl) {
            appEl.innerHTML = this._home(model);
        }
    }
    async _renderSearch() {
        const pathname = location.pathname;
        let filename = '';
        let decodeError = false;
        const prefix = '/search/';
        if (pathname.startsWith(prefix)) {
            const rest = pathname.substring(prefix.length);
            const slashIndex = rest.indexOf('/');
            const segment = (-1 === slashIndex) ? rest : rest.substring(0, slashIndex);
            try {
                filename = decodeURIComponent(segment);
            }
            catch (e) {
                decodeError = true;
            }
        }
        if (!decodeError && '' !== filename) {
            document.title = 'Search \u2014 ' + filename;
            const params = new URLSearchParams(location.search);
            const q = params.get('q') ?? '';
            const p = Math.max(1, parseInt(params.get('p') ?? '1', 10) || 1);
            if ('' !== q) {
                try {
                    const r = await fetch(pathname + '/results?q=' + encodeURIComponent(q) + '&p=' + p);
                    if (!r.ok) {
                        throw new Error('HTTP ' + r.status);
                    }
                    const data = await r.json();
                    const model = this._buildSearchModel(filename, q, data);
                    if (appEl) {
                        appEl.innerHTML = this._search(model);
                    }
                    this._attachPagerHandlers(q);
                }
                catch (e) {
                    const model = this._searchModel(filename, q, 'Search failed: ' + (e instanceof Error ? e.message : String(e)), 0, [], [], false, false, 0, '');
                    if (appEl) {
                        appEl.innerHTML = this._search(model);
                    }
                }
            }
            else {
                if (appEl) {
                    appEl.innerHTML = this._search(this._searchModel(filename, q, '', 0, [], [], false, false, 0, ''));
                }
            }
        }
        else {
            if (appEl) {
                appEl.innerHTML = this._search(this._searchModel('', '', 'Invalid search path.', 0, [], [], false, false, 0, ''));
            }
        }
    }
    _resultHref(filename, path) {
        const entryOnly = path.substring(filename.length + 1);
        const parts = entryOnly.split('/');
        const cL1 = parts.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            parts[iL1] = encodeURIComponent(parts[iL1]);
        }
        return '../z/' + encodeURIComponent(filename) + '/' + parts.join('/');
    }
    _buildSearchModel(filename, q, data) {
        const resultModels = data.results.map((r) => {
            const segments = snippetToSegments(r.snippet);
            return {
                title: r.title || r.path,
                path: r.path,
                href: this._resultHref(filename, r.path),
                hasSnippet: 0 < segments.length,
                snippetSegments: segments
            };
        });
        const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
        const cur = data.page;
        const winEnd = Math.min(totalPages, cur + 3);
        const pages = [];
        for (let iL1 = Math.max(1, cur - 3); iL1 <= winEnd; iL1++) {
            pages.push({
                page: iL1,
                href: '?q=' + encodeURIComponent(q) + '&p=' + iL1,
                currentClass: (iL1 === cur) ? 'current' : ''
            });
        }
        const jumpPage = Math.min(cur + 10, totalPages);
        const hasEllipsis = jumpPage > winEnd + 1;
        const hasJump = jumpPage > winEnd;
        return this._searchModel(filename, q, '', data.total, resultModels, pages, hasEllipsis, hasJump, jumpPage, '?q=' + encodeURIComponent(q) + '&p=' + jumpPage);
    }
    _searchModel(filename, query, error, total, results, pages, hasEllipsis, hasJump, jumpPage, jumpHref) {
        return {
            filename,
            query,
            placeholder: 'Search in ' + escapeAttrValue(filename),
            value: escapeAttrValue(query),
            error,
            total,
            results,
            pages,
            hasEllipsis,
            hasJump,
            jumpPage,
            jumpHref
        };
    }
    _attachPagerHandlers(q) {
        if (appEl) {
            const links = appEl.querySelectorAll('a[data-page]');
            const cL1 = links.length;
            for (let iL1 = 0; iL1 < cL1; iL1++) {
                const link = links[iL1];
                link.addEventListener('click', (ev) => {
                    if (shouldInterceptPagerClick(ev)) {
                        ev.preventDefault();
                        const page = link.getAttribute('data-page') ?? '';
                        const url = location.pathname + '?q=' + encodeURIComponent(q) + '&p=' + page;
                        history.pushState({}, '', url);
                        void this._renderSearch();
                    }
                });
            }
        }
    }
}
async function main() {
    try {
        const templates = await loadTemplates();
        const app = new App(templates.home, templates.search);
        await app.run();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
}
if ('undefined' !== typeof document && 'undefined' !== typeof window) {
    void main();
}
//# sourceMappingURL=app.js.map