export const TOOL_DEFINITIONS = [
    {
        name: 'search',
        description: 'Full-text search in multiple files. Returns 2 results per file, ordered by relevance, with Markdown article sizes in bytes. Articles are prefetched and cached. Use page for pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                page: { type: 'integer', minimum: 1, description: 'Page number (default 1)' }
            },
            required: ['query']
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
            required: ['path']
        }
    }
];
