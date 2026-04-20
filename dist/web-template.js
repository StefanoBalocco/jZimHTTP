function _EscapeHtml(value) {
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
const _sharedStyle = `
 :root{color-scheme:light dark;font-family:system-ui,sans-serif}
 body{max-width:780px;margin:2rem auto;padding:0 1rem;line-height:1.5}
 h1{font-size:1.4rem;margin:0 0 1rem}
 ul{list-style:none;padding:0}
 li{padding:.6rem .8rem;border:1px solid #8884;border-radius:.4rem;margin:.4rem 0}
 li a{font-weight:600;text-decoration:none}
 .meta{font-size:.85rem;opacity:.75;margin-top:.2rem}
 .err{color:#c33}
 .search-bar{display:flex;gap:.4rem;margin:0 0 1rem}
 .search-bar input[type=text]{flex:1;padding:.5rem .6rem;border:1px solid #8884;border-radius:.4rem;font:inherit}
 .search-bar button{padding:.5rem 1rem;border:1px solid #8884;background:#8881;border-radius:.4rem;cursor:pointer;font:inherit}
 .pager{display:flex;gap:.4rem;justify-content:center;margin:1rem 0}
 .pager a{padding:.3rem .6rem;border:1px solid #8884;border-radius:.3rem;text-decoration:none}
 .pager a.current{font-weight:600;border-color:currentColor}
`;
const _tmplSource = `
const tmpl = ( () => {
	const cache = {};
	const compile = s => obj => {
		const k = Object.keys( obj ),
			v = Object.values( obj );
		return Function( ...k, "let out=\\\`" + s
			.replace( /\\\`/g, "\\\\\\\`" )
			.replace( /[\\r\\t\\n]/g, " " )
			.replace( /<%=([\\s\\S]+?)%>/g, "\\\${$1}" )
			.replace( /<%([ \\s\\S]+?)%>/g, "\\\`; $1 out+=\\\`" ) +
			"\\\`;return out"
		)( ...v );
	};
	return ( s, d ) => {
		const fn = cache[ s ] ||= compile( s );
		return d ? fn( d ) : fn;
	};
} )();
`;
export function RenderPage(vars) {
    const titleHtml = _EscapeHtml(vars.title);
    let searchBarHtml = '';
    if (undefined !== vars.searchBar) {
        searchBarHtml = `<form class="search-bar" method="get" action="/search/${encodeURIComponent(vars.searchBar.filename)}">
<input type="text" name="q" value="${_EscapeHtml(vars.searchBar.initialQuery)}" placeholder="Search in ${_EscapeHtml(vars.searchBar.filename)}">
<button type="submit">Search</button>
</form>`;
    }
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titleHtml}</title>
<style>${_sharedStyle}</style>
</head>
<body>
<h1>${titleHtml}</h1>
${searchBarHtml}<div id="app">Loading\u2026</div>
<script>
${_tmplSource}
${vars.scriptInit}
</script>
</body>
</html>
`;
}
