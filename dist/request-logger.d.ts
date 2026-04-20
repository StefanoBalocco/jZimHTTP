export interface ClfEntry {
    remoteHost: string;
    date: Date;
    method: string;
    path: string;
    protocol: string;
    status: number;
    bytes: number;
}
export interface ConsoleEntry {
    remoteHost: string;
    date: Date;
    httpMethod: string;
    path: string;
    marker: 'START' | 'SEMAC' | 'SEMRL';
    mcpMethod?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    status?: number;
    durationMs?: number;
}
export declare class RequestLogger {
    private _stream;
    constructor(logFilePath: string);
    log(entry: ClfEntry): void;
    logConsole(entry: ConsoleEntry): void;
    logConsoleLine(line: string): void;
    shutdown(callback?: () => void): void;
}
