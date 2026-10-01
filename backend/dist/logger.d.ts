export declare class Logger {
    private static _instance;
    static getInstance(): Logger;
    stdout(functionName: string, command: string, params: string): void;
}
