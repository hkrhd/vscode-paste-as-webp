import * as vscode from 'vscode';

// Obj: Logger utility that respects debugMode configuration
class Logger {
    private isDebugEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('vsc-webp-paster');
        return config.get<boolean>('debugMode') ?? false;
    }

    debug(prefix: string, ...args: any[]): void {
        if (this.isDebugEnabled()) {
            console.log(`[webpPaster:${prefix}]`, ...args);
        }
    }

    error(prefix: string, ...args: any[]): void {
        console.error(`[webpPaster:${prefix}]`, ...args);
    }
}

export const logger = new Logger();
