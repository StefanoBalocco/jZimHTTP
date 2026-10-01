<div>
	<h1>Search in <span class="filename" data-tdal-content="filename">file</span></h1>
	<form class="search-bar" method="get" action="">
		<label for="search-q">Search</label>
		<input id="search-q" type="text" name="q" data-tdal-attributes="value value;;placeholder placeholder">
		<button type="submit">Search</button>
	</form>
	<div data-tdal-condition="!query">
		<p>Enter a query above to search.</p>
	</div>
	<div data-tdal-condition="query">
		<div data-tdal-condition="error">
			<p class="err" role="alert" data-tdal-content="error">Error</p>
		</div>
		<div data-tdal-condition="!error">
			<div data-tdal-condition="!total">
				<p>No results for <em data-tdal-content="query">query</em>.</p>
			</div>
			<div data-tdal-condition="total">
				<p>Search results for <em data-tdal-content="query">query</em> in <strong data-tdal-content="filename">file</strong> — <span data-tdal-content="total">0</span> matches.</p>
				<ul>
					<li data-tdal-repeat="result results">
						<a data-tdal-attributes="href result/href" data-tdal-content="result/title">Title</a>
						<div class="meta" data-tdal-condition="result/hasSnippet">
							<span data-tdal-repeat="seg result/snippetSegments">
								<strong data-tdal-condition="seg/highlighted" data-tdal-content="seg/text">text</strong>
								<span data-tdal-condition="!seg/highlighted" data-tdal-content="seg/text">text</span>
							</span>
						</div>
					</li>
				</ul>
				<div class="pager">
					<a data-tdal-repeat="pg pages" data-tdal-attributes="href pg/href;;class pg/currentClass;;data-page pg/page" data-tdal-content="pg/page">page</a>
					<span class="ellipsis" data-tdal-condition="hasEllipsis">&hellip;</span>
					<a data-tdal-condition="hasJump" data-tdal-attributes="href jumpHref;;data-page jumpPage" data-tdal-content="jumpPage">jump</a>
				</div>
			</div>
		</div>
	</div>
</div>