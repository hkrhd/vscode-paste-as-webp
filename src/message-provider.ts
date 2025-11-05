import * as vscode from "vscode";

export interface MessageProvider {
    t(key: string, ...args: any[]): string;
}

export class VSCodeMessageProvider implements MessageProvider {
    t(key: string, ...args: any[]): string {
        return vscode.l10n.t(key, ...args);
    }
}
