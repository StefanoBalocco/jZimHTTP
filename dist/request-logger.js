import { createWriteStream } from 'node:fs';
export class RequestLogger {
    _stream;
    constructor(logFilePath) {
        if ('' !== logFilePath) {
            this._stream = createWriteStream(logFilePath, { flags: 'a' });
        }
    }
    log(entry) {
        const [, day, month, year, time] = entry.date.toUTCString().split(' ');
        const dateStr = `${day}/${month}/${year}:${time} +0000`;
        const bytesStr = 0 === entry.bytes ? '-' : String(entry.bytes);
        this._stream?.write(`${entry.remoteHost} - - [${dateStr}] "${entry.method} ${entry.path} ${entry.protocol}" ${entry.status} ${bytesStr}\n`);
    }
    logConsole(entry) {
        const parts = [entry.date.toISOString(), entry.marker, entry.remoteHost, entry.httpMethod.padEnd(7), entry.path];
        if (entry.mcpMethod) {
            parts.push(entry.mcpMethod);
            if (entry.toolName) {
                parts.push(entry.toolName);
                if (entry.toolArgs && 'SEMRL' !== entry.marker) {
                    parts.push(JSON.stringify(entry.toolArgs));
                }
            }
        }
        if (entry.durationMs) {
            parts.push(`${entry.durationMs}ms`);
        }
        if (entry.status) {
            parts.push(String(entry.status));
        }
        process.stdout.write(parts.join(' ') + '\n');
    }
    logConsoleLine(line) {
        process.stdout.write(line + '\n');
    }
    shutdown(callback) {
        if (undefined !== this._stream) {
            this._stream.end(callback);
            this._stream = undefined;
        }
        else if (undefined !== callback) {
            callback();
        }
    }
}
