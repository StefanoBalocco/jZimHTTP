// Utility types
export type Nullable<T> = T | null;
export type Undefinedable<T> = T | undefined;

// --- Server configuration ---

export interface Listener {
	host: string;
	port: number;
}

export interface McpConfig {
	enabled: boolean;
	listeners: Listener[];
	maxConcurrentSearch: number;
	maxConcurrentArticle: number;
	searchResultsPerFile: number;
}

export interface WebConfig {
	enabled: boolean;
	listeners: Listener[];
	maxConcurrentPage: number;
	searchResultsPerPage: number;
}

export interface ServerConfig {
	zimPath: string;
	cacheMaxSize: number;
	cacheTtlMs: number;
	logFile: string;
	corsOrigins: string[];
	trustedProxies: string[];
	mcp: McpConfig;
	web: WebConfig;
}

// --- File listing / navigator types ---

export interface FileInfo {
	name: string;
	title: string;
	description: string;
	date: string;       // ISO date from ZIM `Date` metadata, or '' if absent
	language: string;
	creator: string;
	articleCount: number;
	mediaCount: number;
	mainPath: string;   // 'filename.zim/...' or '' if no main entry
}

export interface CachedPageHtml {
	html: string;
	mimetype: string;
	sizeBytes: number;
}

// --- Tool definitions (JSON Schema) ---

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: 'search',
		description: 'Full-text search in multiple files. Returns 2 results per file, ordered by relevance, with Markdown article sizes in bytes. Articles are prefetched and cached. Use page for pagination.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
				page: { type: 'integer', minimum: 1, description: 'Page number (default 1)' }
			},
			required: [ 'query' ]
		}
	},
	{
		name: 'article',
		description: 'Get the full article content as Markdown. Use the path from search results.',
		inputSchema: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Entry path from search results (e.g. wikipedia_en.zim/C/Article)' }
			},
			required: [ 'path' ]
		}
	}
];

// --- Result interfaces ---

export interface SearchResult {
	title: string;
	path: string;      // 'filename.zim/namespace/entry'
	snippet: string;   // libzim-provided or empty
}

export interface SearchPage {
	total: number;
	results: SearchResult[];
}

export interface WebSearchResponse {
	filename: string;
	query: string;
	page: number;
	pageSize: number;
	total: number;
	results: SearchResult[];
}

export interface SearchResultEntry {
	title: string;
	path: string;        // filename/namespace/entry
	sizeBytes: number;   // markdown content size in bytes
}

export interface SearchResponse {
	results: SearchResultEntry[];
	page: number;
	hasMore: boolean;
}

export interface ArticleResponse {
	content: string;
	sizeBytes: number;
}
