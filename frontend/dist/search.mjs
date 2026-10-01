export default function(d){let q,k;const r={REPEAT:{}},c=(a,c,e)=>{let z=a,y=c.split("/"),x=0,w,l=y.length,m=2&e;for(;x<l&&1!==z;){z="object"===typeof z&&null!==z&&void 0!==(w="function"===typeof z[y[x]]?z[y[x]](d,r):z[y[x]])&&w;x++;if(1&e&&(false===z||x==l&&m&&!b(z))){z=d;e=0;x=0}}return m?b(z):z},b=v=>!!v&&("object"!==typeof v||(Array.isArray(v)?0<v.length:0<Object.keys(v).length)),f=/[&<>"]/g,s={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"};return (`<div>
	<h1>Search in <span class="filename">${((q=c(r,"filename",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`file`))}</span></h1>
	<form class="search-bar" method="get" action="">
		<label for="search-q">Search</label>
		<input id="search-q" type="text" name="q"${((q=c(r,"value",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` value="${q}"`:(true!==q?``:` value`))}${((q=c(r,"placeholder",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` placeholder="${q}"`:(true!==q?``:` placeholder`))}/>
		<button type="submit">Search</button>
	</form>
	${!c(r,"query",3)?`<div>
		<p>Enter a query above to search.</p>
	</div>`:``}
	${c(r,"query",3)?`<div>
		${c(r,"error",3)?`<div>
			<p class="err" role="alert">${((q=c(r,"error",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`Error`))}</p>
		</div>`:``}
		${!c(r,"error",3)?`<div>
			${!c(r,"total",3)?`<div>
				<p>No results for <em>${((q=c(r,"query",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`query`))}</em>.</p>
			</div>`:``}
			${c(r,"total",3)?`<div>
				<p>Search results for <em>${((q=c(r,"query",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`query`))}</em> in <strong>${((q=c(r,"filename",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`file`))}</strong> — <span>${((q=c(r,"total",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`0`))}</span> matches.</p>
				<ul>
					${((q=c(r,"results",1))&&"object"==typeof q&&((Array.isArray(q)&&(k=q,q=true))||(k=Object.keys(q)))&&k.length?k.reduce((o,v,i)=>{r["result"]=(true===q)?v:q[v];r["REPEAT"]["result"]={index:(true===q)?i:v,number:i+1,length:k.length,even:1==i%2,odd:0==i%2,first:0==i,last:k.length==i+1};{let q,k;return o+`<li>
						<a${((q=c(r,"result/href",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` href="${q}"`:(true!==q?``:` href`))}>${((q=c(r,"result/title",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`Title`))}</a>
						${c(r,"result/hasSnippet",3)?`<div class="meta">
							${((q=c(r,"result/snippetSegments",1))&&"object"==typeof q&&((Array.isArray(q)&&(k=q,q=true))||(k=Object.keys(q)))&&k.length?k.reduce((o,v,i)=>{r["seg"]=(true===q)?v:q[v];r["REPEAT"]["seg"]={index:(true===q)?i:v,number:i+1,length:k.length,even:1==i%2,odd:0==i%2,first:0==i,last:k.length==i+1};{let q,k;return o+`<span>
								${c(r,"seg/highlighted",3)?`<strong>${((q=c(r,"seg/text",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`text`))}</strong>`:``}
								${!c(r,"seg/highlighted",3)?`<span>${((q=c(r,"seg/text",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`text`))}</span>`:``}
							</span>`;}},""):"")}${(delete r["REPEAT"]["seg"],delete r["seg"],"")}
						</div>`:``}
					</li>`;}},""):"")}${(delete r["REPEAT"]["result"],delete r["result"],"")}
				</ul>
				<div class="pager">
					${((q=c(r,"pages",1))&&"object"==typeof q&&((Array.isArray(q)&&(k=q,q=true))||(k=Object.keys(q)))&&k.length?k.reduce((o,v,i)=>{r["pg"]=(true===q)?v:q[v];r["REPEAT"]["pg"]={index:(true===q)?i:v,number:i+1,length:k.length,even:1==i%2,odd:0==i%2,first:0==i,last:k.length==i+1};{let q,k;return o+`<a${((q=c(r,"pg/href",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` href="${q}"`:(true!==q?``:` href`))}${((q=c(r,"pg/currentClass",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` class="${q}"`:(true!==q?``:` class`))}${((q=c(r,"pg/page",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` data-page="${q}"`:(true!==q?``:` data-page`))}>${((q=c(r,"pg/page",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`page`))}</a>`;}},""):"")}${(delete r["REPEAT"]["pg"],delete r["pg"],"")}
					${c(r,"hasEllipsis",3)?`<span class="ellipsis">&hellip;</span>`:``}
					${c(r,"hasJump",3)?`<a${((q=c(r,"jumpHref",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` href="${q}"`:(true!==q?``:` href`))}${((q=c(r,"jumpPage",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` data-page="${q}"`:(true!==q?``:` data-page`))}>${((q=c(r,"jumpPage",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`jump`))}</a>`:``}
				</div>
			</div>`:``}
		</div>`:``}
	</div>`:``}
</div>`).trim()}