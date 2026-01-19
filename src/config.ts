export interface ExtensionConfig {
    imageDir: string;
    quality: number;
    namingConvention: string;
    insertPattern: string;
    useWorkspaceRoot: boolean;
    debugMode: boolean;
    progressDelay: number;
    convertUrlToLink: boolean;
    urlFetchTimeout: number;
}

export interface ConfigProvider {
    getConfig(): ExtensionConfig;
    validateConfig(config: ExtensionConfig): string[];
}

import * as vscode from 'vscode';
import * as path from 'path';
import { MessageProvider, VSCodeMessageProvider } from './message-provider';

export class DefaultConfigProvider implements ConfigProvider {
    private vscodeConfig: any;
    private messageProvider: MessageProvider;

    constructor(vscodeConfig: any, messageProvider?: MessageProvider) {
        this.vscodeConfig = vscodeConfig;
        this.messageProvider = messageProvider || new VSCodeMessageProvider();
    }

    getConfig(): ExtensionConfig {
        return {
            imageDir: this.vscodeConfig.get("imageDir") || "img",
            quality: this.vscodeConfig.get("quality") || 80,
            namingConvention: this.vscodeConfig.get("namingConvention") || "image-${timestamp}",
            insertPattern: this.vscodeConfig.get("insertPattern") || "![${fileName}](${relativePath})",
            useWorkspaceRoot: this.vscodeConfig.get("useWorkspaceRoot") ?? false,
            debugMode: this.vscodeConfig.get("debugMode") ?? false,
            progressDelay: this.vscodeConfig.get("progressDelay") ?? 0.3,
            convertUrlToLink: this.vscodeConfig.get("convertUrlToLink") ?? false,
            urlFetchTimeout: this.vscodeConfig.get("urlFetchTimeout") ?? 300
        };
    }

    validateConfig(config: ExtensionConfig): string[] {
        const errors: string[] = [];

        // imageDir validation
        if (!config.imageDir || config.imageDir.trim() === "") {
            errors.push(this.messageProvider.t('config.invalidImageDir'));
        }

        // quality validation
        if (config.quality < 0 || config.quality > 100) {
            errors.push(this.messageProvider.t('config.invalidQuality'));
        }

        // namingConvention validation
        if (!config.namingConvention || config.namingConvention.trim() === "") {
            errors.push(this.messageProvider.t('config.invalidNamingConvention'));
        }

        // insertPattern validation
        if (!config.insertPattern || config.insertPattern.trim() === "") {
            errors.push(this.messageProvider.t('config.invalidInsertPattern'));
        }

        return errors;
    }
}

export class ConfigUtils {
    static expandNamingConvention(pattern: string, seq?: number): string {
        const now = new Date();
        // Obj: Generate yyyymmddThhmmss format timestamp (e.g., 20250104T123456)
        const timestamp =
            String(now.getFullYear()) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + 'T' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        let result = pattern.replace(/\$\{timestamp\}/g, timestamp);

        // Obj: Replace ${seq} placeholder or append -seq if duplicate detected
        if (seq !== undefined) {
            if (result.includes('${seq}')) {
                result = result.replace(/\$\{seq\}/g, String(seq));
            } else {
                result = `${result}-${seq}`;
            }
        }

        return result;
    }

    static expandInsertPattern(pattern: string, fileName: string, relativePath: string): string {
        // Obj: Replace placeholders in insert pattern with actual values
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

        return pattern
            .replace(/\$\{fileName\}/g, fileName)
            .replace(/\$\{fileNameWithoutExt\}/g, fileNameWithoutExt)
            .replace(/\$\{relativePath\}/g, relativePath);
    }

    static async generateUniqueFileName(pattern: string, targetDir: string): Promise<string> {
        // Obj: Generate unique filename by checking filesystem and incrementing seq if needed
        let seq: number | undefined = pattern.includes('${seq}') ? 1 : undefined;
        let fileName: string;

        while (true) {
            fileName = this.expandNamingConvention(pattern, seq) + ".webp";
            const fullPath = path.join(targetDir, fileName);
            const fileUri = vscode.Uri.file(fullPath);

            // Obj: Use VSCode FileSystem API for remote environment support
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch {
                return fileName;
            }

            // Obj: Start seq from 1 on first collision, then increment
            seq = seq === undefined ? 1 : seq + 1;
        }
    }

    static getDefaultConfig(): ExtensionConfig {
        return {
            imageDir: "img",
            quality: 80,
            namingConvention: "image-${timestamp}",
            insertPattern: "![${fileName}](${relativePath})",
            useWorkspaceRoot: false,
            debugMode: false,
            progressDelay: 0.3,
            convertUrlToLink: false,
            urlFetchTimeout: 300
        };
    }
}
