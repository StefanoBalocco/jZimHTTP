import test from 'ava';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Zim } from '../../dist/zim.js';

const __dirname: string = path.dirname( fileURLToPath( import.meta.url ) );
const dataDir: string = path.resolve( __dirname, '../../tests/data' );

test( 'ListFiles returns zim files with metadata', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	t.true( 0 < files.length );
	const first = files[ 0 ]!;
	t.true( first.name.endsWith( '.zim' ) );
	t.true( 'string' === typeof first.title );
	t.true( 'string' === typeof first.date );
	t.true( 'number' === typeof first.articleCount );
	zim.shutdown();
} );

test( 'GetFileMetadata returns a valid mainPath', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	t.true( 0 < main.length );
	t.true( main.startsWith( files[ 0 ]!.name + '/' ) );
	zim.shutdown();
} );

test( 'GetPageHtml returns HTML for the main entry and caches it', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
	const page1 = await zim.getPageHtml( main );
	t.not( page1, undefined );
	t.true( page1!.mimetype.includes( 'html' ) );
	t.true( 0 < page1!.html.length );
	const page2 = await zim.getPageHtml( main );
	t.is( page1!.html, page2!.html );
	zim.shutdown();
} );

test( 'GetPageHtml returns null for an unknown entry', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	const result = await zim.getPageHtml( files[ 0 ]!.name + '/C/__does_not_exist__' );
	t.is( result, undefined );
	zim.shutdown();
} );

test( 'GetBinary returns raw bytes for a non-HTML entry if one exists', async( t ) => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	if( 0 < files.length ) {
		const main: string = ( await zim.getFileMetadata( files[ 0 ]!.name ) )!.mainPath;
		const html = ( await zim.getPageHtml( main ) )!.html;
		const assetMatch: RegExpMatchArray | null = html.match( /(?:src|href)="([^"]+\.(?:png|jpg|jpeg|svg|css|js))"/i );
		if( null !== assetMatch ) {
			const parts = main.split( '/' );
			parts.pop();
			const candidate: string = parts.join( '/' ) + '/' + assetMatch[ 1 ]!.replace( /^\.\//, '' );
			const normalized: string = candidate.replace( /\/[^/]+\/\.\.\//g, '/' );
			const bin = await zim.getBinary( normalized );
			if( undefined !== bin ) {
				t.true( 0 < bin.data.length );
				t.true( 0 < bin.mimetype.length );
			} else {
				t.pass();
			}
		} else {
			t.pass();
		}
	} else {
		t.pass();
	}
	zim.shutdown();
} );

test( 'Search returns total and paginated results with snippets', async t => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	const first = files[ 0 ]!;
	const page1 = await zim.search( first.name, 'the', 0, 2 );
	t.true( 0 <= page1.total );
	t.true( page1.results.length <= 2 );
	if( 0 < page1.results.length ) {
		const entry = page1.results[ 0 ]!;
		t.is( 'string', typeof entry.title );
		t.is( 'string', typeof entry.path );
		t.is( 'string', typeof entry.snippet );
		t.true( entry.path.startsWith( first.name + '/' ) );
	}
	zim.shutdown();
} );

test( 'Search paginates via offset', async t => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const files = await zim.listFiles();
	const first = files[ 0 ]!;
	const page1 = await zim.search( first.name, 'the', 0, 2 );
	const page2 = await zim.search( first.name, 'the', 2, 2 );
	if( 2 === page1.results.length && 0 < page2.results.length ) {
		t.not( page1.results[ 0 ]!.path, page2.results[ 0 ]!.path );
	} else {
		t.pass();
	}
	zim.shutdown();
} );

test( 'Search returns empty for unknown filename', async t => {
	const zim: Zim = new Zim( dataDir, 4, 200, 300000 );
	const result = await zim.search( 'does_not_exist.zim', 'anything', 0, 10 );
	t.is( 0, result.total );
	t.is( 0, result.results.length );
	zim.shutdown();
} );
