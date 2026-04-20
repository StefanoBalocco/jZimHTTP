# jZimHTTP

An HTTP daemon that serves ZIM archives through two interfaces: a browser UI for humans and MCP tools for LLMs.

Drop `.zim` files in a directory, point `jZimHTTP` at it, and read them in any browser or query them from any MCP-capable client.

This project started as a simplified Node.js rewrite of [openzim-mcp](https://github.com/cameronrye/openzim-mcp) that replaced 18 specialized MCP tools with 2 focused ones; the I'll add a web UI for direct browsing.

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy and edit `config.json`:

```json
{
  "zimPath": "zim/",
  "cacheMaxSize": 200,
  "cacheTtlMs": 300000,
  "logFile": "",
  "corsOrigins": [ "*" ],
  "trustedProxies": [],
  "mcp": {
    "enabled": true,
    "listen": [ { "host": "127.0.0.1", "port": 8081 } ],
    "maxConcurrentSearch": 2,
    "maxConcurrentArticle": 3,
    "searchResultsPerFile": 2
  },
  "web": {
    "enabled": true,
    "listen": [ { "host": "127.0.0.1", "port": 8081 } ],
    "maxConcurrentPage": 4
  }
}
```

| Field | Description |
|-------|-------------|
| `zimPath` | Flat directory containing `.zim` files — symlinks skipped |
| `cacheMaxSize` | Maximum number of HTML pages held in the LRU cache |
| `cacheTtlMs` | Cache entry TTL in milliseconds |
| `logFile` | Path for CLF request log; empty string logs to stdout |
| `corsOrigins` | Allowed CORS origins — `["*"]` permits any origin |
| `trustedProxies` | IP addresses of trusted reverse proxies |
| `mcp.enabled` | Enable JSON-RPC 2.0 endpoint at `/mcp` |
| `mcp.listen` | Addresses this module listens on — array of `{ host, port }` |
| `mcp.maxConcurrentSearch` | Max concurrent search operations |
| `mcp.maxConcurrentArticle` | Max concurrent article reads |
| `mcp.searchResultsPerFile` | Results per ZIM file per query |
| `web.enabled` | Enable browser UI and file routes |
| `web.listen` | Addresses this module listens on — array of `{ host, port }` |
| `web.maxConcurrentPage` | Max concurrent page renders |
| `web.searchResultsPerPage` | Results per page on `/search/:filename` (default 10) |

## Listen configuration

`mcp.listen` and `web.listen` each declare where that module is exposed. If the same `host:port` appears in both arrays (and both modules are enabled), the server binds a single `http.Server` that serves both route sets. A disabled module ignores its `listen`. At least one enabled module must have a non-empty `listen`. IPv6: `{ "host": "::1", "port": 3000 }`.

## Running

```bash
node dist/main.js
# or with a custom config path
node dist/main.js --config /etc/jzimhttp/config.json
```

## HTTP Endpoints

| Method | Path | Gated by | Description |
|--------|------|----------|-------------|
| `POST` | `/mcp` | `mcp.enabled` | JSON-RPC 2.0 — MCP tool calls |
| `GET` | `/` | `web.enabled` | Static browser UI |
| `GET` | `/files` | `web.enabled` | JSON list of ZIM files with metadata |
| `GET` | `/z/:filename` | `web.enabled` | 302 redirect to the file's main entry |
| `GET` | `/z/:filename/*` | `web.enabled` | Browse entry (HTML cached, binaries passthrough) |
| `GET` | `/search/:filename` | `web.enabled` | HTML shell for search results |
| `GET` | `/search/:filename/results` | `web.enabled` | JSON search results, paginated via `p` |
| `OPTIONS` | `*` | always | CORS preflight |

## Browser caching

Entry pages and binaries receive cache headers:

- `ETag: "filename-date/entry"` — unique per file + entry
- `Last-Modified` — from ZIM `Date` metadata
- `Cache-Control: public, max-age=0, must-revalidate` — always revalidate
- `304 Not Modified` — on `If-None-Match` / `If-Modified-Since` match

## Search

Every ZIM page served at `/z/:filename/*` includes a search bar that submits to `/search/:filename?q=...`. The results page loads matches from `/search/:filename/results?q=&p=` and paginates according to `web.searchResultsPerPage`. Direct links stay shareable: `q` and `p` live in the URL and a server-side form fallback works without JavaScript.

Both the web routes and the MCP `search` tool share the same primitive — `Zim.Search( filename, query, offset, limit )` — so pagination, snippet extraction, and the libzim cursor behave identically across interfaces. The MCP layer additionally decorates each hit with `sizeBytes` by fetching the article through its markdown cache.

### Calling a tool

```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "query": "Albert Einstein"
      }
    }
  }'
```

## CORS

`corsOrigins` controls the `Access-Control-Allow-Origin` response header:

- If the request has an `Origin` header and `corsOrigins` contains `'*'` or that exact origin → responds with `Access-Control-Allow-Origin: <origin>`
- If the request has no `Origin` header and `corsOrigins` contains `'*'` → responds with `Access-Control-Allow-Origin: *`
- Otherwise the header is omitted.

To restrict access to specific clients:

```json
"corsOrigins": ["http://localhost:8080", "http://192.168.1.10:3001"]
```

## Tools

The server exposes 2 tools. Search returns paths in `filename/namespace/entry` format (e.g. `wikipedia_en_100.zim/C/Albert_Einstein`). Pass those paths to `article`.

| Tool | Description |
|------|-------------|
| `search` | Full-text search across all `.zim` files. Returns 2 results per file, ordered by relevance, with `sizeBytes`. Use `offset` for pagination. |
| `article` | Full article content as Markdown. Pass `entryPath` from `search`. |

### Path format

Search results include paths like `wikipedia_en_100.zim/C/Albert_Einstein`. The filename identifies the ZIM file; the rest is the internal entry path. Pass the full string to `article`.

### Pagination

`search` returns up to 2 results per file per call. If `hasMore` is `true`, call again with a higher `offset` (increments of 2). Results from multiple files are interleaved round-robin.

## ZIM Files

Download ZIM files from [library.kiwix.org](https://library.kiwix.org) or use the [Kiwix desktop app](https://kiwix.org). Place them in the flat directory specified by `zimPath` (no subdirectories).

## Development

```bash
# Build
npm run build

# Build + test
npm test

# TypeScript check only
npx tsc -p tsconfig.json --noEmit
```

### Project Structure

```
src/
├── main.ts            # CLI entry point — loads config, starts HTTP server
├── server.ts          # ZimHttpServer — middleware, routes, multi-listen
├── types.ts           # TypeScript types, config, tool definitions
├── zim.ts             # Zim class — ZIM archive access, HTML cache
├── mcp.ts             # Mcp class — MCP tool dispatch
├── web.ts             # Web — browser UI, file routes, HTML template rendering
├── cache.ts           # LruTtlCache — shared cache primitive
├── semaphore.ts       # Semaphore — concurrency control
├── logger.ts          # Logger — structured stdout logging
└── request-logger.ts  # CLF request logger
tests/
├── src/
│   ├── cache.test.ts
│   ├── mcp.test.ts
│   ├── request-logger.test.ts
│   ├── semaphore.test.ts
│   ├── web.test.ts
│   └── zim.test.ts
└── data/              # ZIM files for integration testing
```

### Adding a Tool

1. Add the tool definition to `TOOL_DEFINITIONS` in `src/types.ts`
2. Add the result interface to `src/types.ts`
3. Add the method to `Mcp` in `src/mcp.ts`
4. Add the dispatch case to `Mcp._handleToolCall()` in `src/mcp.ts`
5. Add tests to `tests/src/mcp.test.ts`

## Requirements

- Node.js 18+
- `@openzim/libzim` native bindings (included, pre-built for Linux/macOS/Windows)
