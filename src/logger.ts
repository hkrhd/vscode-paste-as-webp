import * as vscode from 'vscode';

// Obj: Logger utility that outputs to VSCode Output panel
class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('WebP Paster');
    }

    private isDebugEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('vsc-webp-paster');
        return config.get<boolean>('debugMode') ?? false;
    }

    private formatMessage(prefix: string, ...args: any[]): string {
        return `[${prefix}] ${args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ')}`;
    }

    debug(prefix: string, ...args: any[]): void {
        if (this.isDebugEnabled()) {
            const message = this.formatMessage(prefix, ...args);
            this.outputChannel.appendLine(message);
            console.log(`[webpPaster:${prefix}]`, ...args);
        }
    }

    error(prefix: string, ...args: any[]): void {
        const message = this.formatMessage(prefix, ...args);
        this.outputChannel.appendLine(`ERROR: ${message}`);
        console.error(`[webpPaster:${prefix}]`, ...args);
    }

    show(): void {
        this.outputChannel.show();
    }
}

export const logger = new Logger();
