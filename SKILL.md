---
name: using-jzimhttp
description: Use when tools named `search` and `article` are available for querying offline knowledge bases
---
# Using jZimHTTP
Two tools: `search` and `article`.
## Tools
### search
Full-text search across all files. Returns **2 results per file**, ordered by relevance, interleaved.
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search terms |
| `page` | integer | no | Page number (default 1) |
Returns `results[]` with `title`, `path`, `snippet`, `sizeBytes`. `hasMore` true when any file has further results.
`path` format: `filename/namespace/entry` — pass directly to `article`.
### article
Full article as Markdown.
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | `path` from search results |
Returns `title`, `path`, `content`, `mimeType`, `sizeBytes`.
## Workflow
1. **Search** for topic.
2. **Select**: results arrive 2 per file, interleaved by relevance. Pick the **2 with largest `sizeBytes`** from different files — longer = more detail.
3. **Read** selected articles with `article`.
4. **Paginate** when `hasMore` true and need more coverage: call `search` again with `page + 1`. Repeat selection.
## Example
Search `"Atlantropa"`:
```json
{
  "results": [
    { "title": "Atlantropa", "path": "wikipedia_en.zim/Atlantropa", "sizeBytes": 64695 },
    { "title": "Atlantropa", "path": "wikipedia_de.zim/Atlantropa", "sizeBytes": 37272 },
    { "title": "Atlantropa", "path": "wikipedia_it.zim/Atlantropa", "sizeBytes": 104449 },
    { "title": "Herman Sörgel", "path": "wikipedia_en.zim/Herman_Sörgel", "sizeBytes": 47919 },
    { "title": "Herman Sörgel", "path": "wikipedia_de.zim/Herman_Sörgel", "sizeBytes": 29127 }
  ],
  "page": 1,
  "hasMore": true
}
```
Largest two from different files: `wikipedia_it.zim/Atlantropa` (104 KB) and `wikipedia_en.zim/Atlantropa` (65 KB). Read both:
```
article(path: "wikipedia_it.zim/Atlantropa")
article(path: "wikipedia_en.zim/Atlantropa")
```
Not enough? Read German (37 KB) or Herman Sörgel entries. Still need more? Call `search` with `page: 2`.
## Key behaviors
- 2 results per file per call, interleaved by relevance across files.
- `sizeBytes` shows article size before fetch — use it to prioritize.
- `hasMore` true while any file has results beyond current page.
- Increment `page` by 1 to get the next page.
