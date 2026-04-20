export type Nullable<T> = T | null;
export type Undefinedable<T> = T | undefined;
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
export interface FileInfo {
    name: string;
    title: string;
    description: string;
    date: string;
    language: string;
    creator: string;
    articleCount: number;
    mediaCount: number;
    mainPath: string;
}
export interface CachedPageHtml {
    html: string;
    mimetype: string;
    sizeBytes: number;
}
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export declare const TOOL_DEFINITIONS: ToolDefinition[];
export interface SearchResult {
    title: string;
    path: string;
    snippet: string;
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
    path: string;
    sizeBytes: number;
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
