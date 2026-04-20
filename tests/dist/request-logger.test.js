import test from 'ava';
import { RequestLogger } from '../../dist/request-logger.js';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
async function writeLog(entry) {
    const logPath = join(tmpdir(), `test-clf-${randomUUID()}.log`);
    const logger = new RequestLogger(logPath);
    logger.log(entry);
    await new Promise(resolve => { logger.shutdown(resolve); });
    const content = readFileSync(logPath, 'utf-8').trimEnd();
    unlinkSync(logPath);
    return content;
}
test('log produces valid CLF line', async (t) => {
    const line = await writeLog({
        remoteHost: '192.168.1.10',
        date: new Date('2026-03-19T14:30:00.000Z'),
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        status: 200,
        bytes: 1234,
    });
    t.regex(line, /^192\.168\.1\.10 - - \[\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} [+\-]\d{4}\] "POST \/mcp HTTP\/1\.1" 200 1234$/);
});
test('log uses dash for zero bytes', async (t) => {
    const line = await writeLog({
        remoteHost: '127.0.0.1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        status: 204,
        bytes: 0,
    });
    t.true(line.includes('204 -'));
});
test('log date format matches CLF dd/Mon/yyyy:HH:mm:ss +0000', async (t) => {
    const line = await writeLog({
        remoteHost: '10.0.0.1',
        date: new Date('2026-07-04T08:15:30.000Z'),
        method: 'GET',
        path: '/',
        protocol: 'HTTP/1.1',
        status: 404,
        bytes: 0,
    });
    t.true(line.includes('04/Jul/2026:08:15:30 +0000'));
});
test('RequestLogger writes CLF lines to file', async (t) => {
    const logPath = join(tmpdir(), `test-access-${Date.now()}.log`);
    const logger = new RequestLogger(logPath);
    logger.log({
        remoteHost: '10.0.0.1',
        date: new Date('2026-03-19T12:00:00.000Z'),
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        status: 200,
        bytes: 512,
    });
    await new Promise(resolve => { logger.shutdown(resolve); });
    const content = readFileSync(logPath, 'utf-8');
    t.true(content.includes('10.0.0.1'));
    t.true(content.includes('"POST /mcp HTTP/1.1" 200 512'));
    unlinkSync(logPath);
});
