export default function(d){let q,k;const r={REPEAT:{}},c=(a,c,e)=>{let z=a,y=c.split("/"),x=0,w,l=y.length,m=2&e;for(;x<l&&1!==z;){z="object"===typeof z&&null!==z&&void 0!==(w="function"===typeof z[y[x]]?z[y[x]](d,r):z[y[x]])&&w;x++;if(1&e&&(false===z||x==l&&m&&!b(z))){z=d;e=0;x=0}}return m?b(z):z},b=v=>!!v&&("object"!==typeof v||(Array.isArray(v)?0<v.length:0<Object.keys(v).length)),f=/[&<>"]/g,s={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"};return (`<div>
	<h1>jZimHTTP Library</h1>
	${c(r,"error",3)?`<div>
		<p class="err" role="alert">${((q=c(r,"error",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`Error`))}</p>
	</div>`:``}
	${!c(r,"error",3)?`<div>
		${c(r,"files",3)?`<div>
			<ul>
				${((q=c(r,"files",1))&&"object"==typeof q&&((Array.isArray(q)&&(k=q,q=true))||(k=Object.keys(q)))&&k.length?k.reduce((o,v,i)=>{r["file"]=(true===q)?v:q[v];r["REPEAT"]["file"]={index:(true===q)?i:v,number:i+1,length:k.length,even:1==i%2,odd:0==i%2,first:0==i,last:k.length==i+1};{let q,k;return o+`<li>
					<a${((q=c(r,"file/href",1),false!==q)&&((q&&"string"===typeof q)||("number"===typeof q&&!isNaN(q)))?` href="${q}"`:(true!==q?``:` href`))}>${((q=c(r,"file/title",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`Title`))}</a>
					<div class="meta">
						<span>${((q=c(r,"file/name",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`name`))}</span>
						${c(r,"file/date",3)?`<span>${((q=c(r,"file/dateLabel",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`date`))}</span>`:``}
						${c(r,"file/articleCount",3)?`<span>${((q=c(r,"file/articleCountLabel",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`count`))}</span>`:``}
						${c(r,"file/language",3)?`<span>${((q=c(r,"file/languageLabel",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`lang`))}</span>`:``}
					</div>
					${c(r,"file/description",3)?`<div class="meta">${((q=c(r,"file/description",1),false!==q)&&("string"===typeof q||("number"===typeof q&&!isNaN(q)))?String(q).replace(f,m=>s[m]):(true!==q?``:`desc`))}</div>`:``}
				</li>`;}},""):"")}${(delete r["REPEAT"]["file"],delete r["file"],"")}
			</ul>
		</div>`:``}
		${!c(r,"files",3)?`<div>
			<p>No ZIM files available.</p>
		</div>`:``}
	</div>`:``}
</div>`).trim()}