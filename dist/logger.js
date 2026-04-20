export class Logger {
    static _instance;
    static getInstance() {
        if (undefined === Logger._instance) {
            Logger._instance = new Logger();
        }
        return Logger._instance;
    }
    stdout(functionName, command, params) {
        const ts = new Date().toISOString();
        process.stdout.write(`${ts} ${functionName} ${command} ${params}\n`);
    }
}
