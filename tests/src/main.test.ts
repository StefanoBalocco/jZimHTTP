import test from 'ava';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __dirname: string = path.dirname( fileURLToPath( import.meta.url ) );
const repoRoot: string = path.resolve( __dirname, '../..' );
const mainJs: string = path.resolve( repoRoot, 'backend/dist/main.js' );
const execFileAsync: ( file: string, args: string[], options: { cwd: string } ) => Promise<{ stdout: string; stderr: string }> = promisify( execFile );

test( 'web.enabled with missing web.listen exits nonzero and reports web.listen, not mcp.listen', async( t ) => {
	const configPath: string = path.join( os.tmpdir(), `jzim-main-${ randomUUID() }.json` );
	const config: Record<string, unknown> = {
		zimPath: 'zim/',
		mcp: { enabled: false, listen: [ { host: '127.0.0.1', port: 8081 } ] },
		web: { enabled: true }
	};
	await fs.writeFile( configPath, JSON.stringify( config ), 'utf-8' );
	try {
		const error: Error & { code?: number } = await t.throwsAsync(
			execFileAsync( process.execPath, [ mainJs, '--config', configPath ], { cwd: repoRoot } )
		) as Error & { code?: number };
		t.truthy( error.code );
		t.is( 1, error.code! );
		t.true( error.message.includes( 'web.listen' ) );
		t.false( error.message.includes( 'mcp.listen' ) );
	} finally {
		await fs.unlink( configPath ).catch( () => {} );
	}
} );

test( 'web.enabled with malformed web.listen exits nonzero and reports web.listen, not mcp.listen', async( t ) => {
	const configPath: string = path.join( os.tmpdir(), `jzim-main-${ randomUUID() }.json` );
	const config: Record<string, unknown> = {
		zimPath: 'zim/',
		mcp: { enabled: true, listen: [ { host: '127.0.0.1', port: 8081 } ] },
		web: { enabled: true, listen: [ 42 ] }
	};
	await fs.writeFile( configPath, JSON.stringify( config ), 'utf-8' );
	try {
		const error: Error & { code?: number } = await t.throwsAsync(
			execFileAsync( process.execPath, [ mainJs, '--config', configPath ], { cwd: repoRoot } )
		) as Error & { code?: number };
		t.truthy( error.code );
		t.is( 1, error.code! );
		t.true( error.message.includes( 'web.listen[0] must be an object' ) );
		t.false( error.message.includes( 'mcp.listen' ) );
		t.false( error.message.includes( 'missing or empty' ) );
	} finally {
		await fs.unlink( configPath ).catch( () => {} );
	}
} );
