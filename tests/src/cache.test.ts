import test from 'ava';
import { LruTtlCache } from '../../dist/cache.js';

test( 'Get returns undefined for missing key', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	t.is( cache.get( 'missing' ), undefined );
} );

test( 'Set and Get round-trip', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	cache.set( 'key', 'value' );
	t.is( cache.get( 'key' ), 'value' );
} );

test( 'TTL expiry', async t => {
	const cache = new LruTtlCache<string>( 10, 50 );
	cache.set( 'key', 'value' );
	await new Promise( resolve => setTimeout( resolve, 100 ) );
	t.is( cache.get( 'key' ), undefined );
} );

test( 'LRU eviction removes oldest entry', t => {
	const cache = new LruTtlCache<string>( 3, 60000 );
	cache.set( 'a', '1' );
	cache.set( 'b', '2' );
	cache.set( 'c', '3' );
	cache.set( 'd', '4' );
	t.is( cache.get( 'a' ), undefined );
	t.is( cache.get( 'b' ), '2' );
	t.is( cache.get( 'd' ), '4' );
} );

test( 'Get refreshes LRU position', t => {
	const cache = new LruTtlCache<string>( 3, 60000 );
	cache.set( 'a', '1' );
	cache.set( 'b', '2' );
	cache.set( 'c', '3' );
	cache.get( 'a' );
	cache.set( 'd', '4' );
	t.is( cache.get( 'a' ), '1' );
	t.is( cache.get( 'b' ), undefined );
} );

test( 'Has returns false for expired entry', async t => {
	const cache = new LruTtlCache<string>( 10, 50 );
	cache.set( 'key', 'value' );
	await new Promise( resolve => setTimeout( resolve, 100 ) );
	t.false( cache.has( 'key' ) );
} );

test( 'Delete removes entry', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	cache.set( 'key', 'value' );
	t.true( cache.delete( 'key' ) );
	t.is( cache.get( 'key' ), undefined );
} );

test( 'Cleanup removes expired entries', async t => {
	const cache = new LruTtlCache<string>( 10, 50 );
	cache.set( 'a', '1' );
	cache.set( 'b', '2' );
	cache.set( 'c', '3' );
	await new Promise( resolve => setTimeout( resolve, 100 ) );
	cache.set( 'd', '4' );
	const removed = cache.cleanup();
	t.is( removed, 3 );
	t.is( cache.size, 1 );
	t.is( cache.get( 'd' ), '4' );
} );

test( 'Clear empties cache', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	cache.set( 'a', '1' );
	cache.set( 'b', '2' );
	cache.clear();
	t.is( cache.size, 0 );
} );

test( 'size reflects current count', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	t.is( cache.size, 0 );
	cache.set( 'a', '1' );
	t.is( cache.size, 1 );
	cache.set( 'b', '2' );
	t.is( cache.size, 2 );
} );

test( 'overwriting same key does not increase size', t => {
	const cache = new LruTtlCache<string>( 10, 60000 );
	cache.set( 'a', '1' );
	cache.set( 'a', '2' );
	t.is( cache.size, 1 );
	t.is( cache.get( 'a' ), '2' );
} );

test( 'DeleteByPrefix removes matching entries and returns count', t => {
	const cache = new LruTtlCache<string>( 100, 60000 );
	cache.set( 'search:wiki_en.zim:foo', 'a' );
	cache.set( 'search:wiki_en.zim:bar', 'b' );
	cache.set( 'search:wiki_it.zim:foo', 'c' );
	cache.set( 'article:wiki_en.zim/C/X', 'd' );
	const deleted: number = cache.deleteByPrefix( 'search:wiki_en.zim:' );
	t.is( deleted, 2 );
	t.is( cache.size, 2 );
	t.false( cache.has( 'search:wiki_en.zim:foo' ) );
	t.false( cache.has( 'search:wiki_en.zim:bar' ) );
	t.true( cache.has( 'search:wiki_it.zim:foo' ) );
	t.true( cache.has( 'article:wiki_en.zim/C/X' ) );
} );

test( 'DeleteByPrefix with filename prefix removes all entry types for that file', t => {
	const cache = new LruTtlCache<string>( 100, 60000 );
	cache.set( 'search:wiki_en.zim:query1', 'a' );
	cache.set( 'summary:wiki_en.zim/C/X:200', 'b' );
	cache.set( 'article:wiki_en.zim/C/X', 'c' );
	cache.set( 'search:wiki_it.zim:query1', 'd' );
	const deleted: number = cache.deleteByPrefix( 'wiki_en.zim' );
	t.is( deleted, 3 );
	t.is( cache.size, 1 );
	t.true( cache.has( 'search:wiki_it.zim:query1' ) );
} );
