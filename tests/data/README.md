# Test Data Files

Real ZIM files used for testing the jZimHTTP server.

## Available Files

| File | Size | Description |
|------|------|-------------|
| `wikipedia_en_100_mini_2026-01.zim` | 4.4 MB | 100 Wikipedia articles — used by default in unit tests |
| `wikipedia_en_100_2026-01.zim` | 320 MB | Same 100 articles, full size |
| `wikipedia_en_ray-charles_maxi_2026-02.zim` | 2.7 MB | Wikipedia article on Ray Charles |
| `wikipedia_en_knots_maxi_2026-01.zim` | 18 MB | Wikipedia article on Knots |
| `wikipedia_en_nollywood_maxi_2026-01.zim` | 19 MB | Wikipedia article on Nollywood |

## Test Structure

```
tests/
├── html-processor.test.ts   # Unit tests for html-processor functions (no ZIM needed)
├── zim-operations.test.ts   # Unit tests for ZimOperations (skips if libzim unavailable)
└── data/
    └── *.zim
```

## Running Tests

```bash
# Build and run all tests
npm test

# Run only compiled tests
npx ava 'dist/tests/**/*.test.js'
```

Tests that require a real ZIM file skip gracefully when libzim native bindings are unavailable or the file is absent.

## Adding a ZIM File for Testing

1. Place the `.zim` file in this directory
2. Reference it in the test using `path.join( process.cwd(), 'tests/data/filename.zim' )`
3. Wrap ZIM-dependent tests with a skip guard:

```typescript
const zimPath = path.join( process.cwd(), 'tests/data/filename.zim' );
const zimAvailable = existsSync( zimPath );

test( 'some test', async t => {
    if( !zimAvailable ) {
        t.pass( 'ZIM file not available, skipping' );
        return;
    }
    // ...
} );
```
