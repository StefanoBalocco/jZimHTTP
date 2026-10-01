<div>
	<h1>jZimHTTP Library</h1>
	<div data-tdal-condition="error">
		<p class="err" role="alert" data-tdal-content="error">Error</p>
	</div>
	<div data-tdal-condition="!error">
		<div data-tdal-condition="files">
			<ul>
				<li data-tdal-repeat="file files">
					<a data-tdal-attributes="href file/href" data-tdal-content="file/title">Title</a>
					<div class="meta">
						<span data-tdal-content="file/name">name</span>
						<span data-tdal-condition="file/date" data-tdal-content="file/dateLabel">date</span>
						<span data-tdal-condition="file/articleCount" data-tdal-content="file/articleCountLabel">count</span>
						<span data-tdal-condition="file/language" data-tdal-content="file/languageLabel">lang</span>
					</div>
					<div class="meta" data-tdal-condition="file/description" data-tdal-content="file/description">desc</div>
				</li>
			</ul>
		</div>
		<div data-tdal-condition="!files">
			<p>No ZIM files available.</p>
		</div>
	</div>
</div>