import * as vscode from 'vscode';

// Obj: Logger utility that outputs to VSCode Output panel
class Logger {
    private outputChannel?: vscode.OutputChannel;

    private isDebugEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('vsc-webp-paster');
        return config.get<boolean>('debugMode') ?? false;
    }

    private getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('WebP Paster');
        }

        return this.outputChannel;
    }

    private formatMessage(prefix: string, ...args: any[]): string {
        return `[${prefix}] ${args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ')}`;
    }

    debug(prefix: string, ...args: any[]): void {
        if (this.isDebugEnabled()) {
            const message = this.formatMessage(prefix, ...args);
            this.getOutputChannel().appendLine(message);
            console.log(`[webpPaster:${prefix}]`, ...args);
        }
    }

    error(prefix: string, ...args: any[]): void {
        const message = this.formatMessage(prefix, ...args);
        this.getOutputChannel().appendLine(`ERROR: ${message}`);
        console.error(`[webpPaster:${prefix}]`, ...args);
    }

    show(): void {
        this.getOutputChannel().show();
    }
}

export const logger = new Logger();
