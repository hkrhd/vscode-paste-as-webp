import * as path from "path";
import * as vscode from "vscode";

export interface FileUtils {
    calculateRelativePath(from: string, to: string): string;
    generateImagePath(workspacePath: string, imageDir: string, fileName: string, mdFilePath?: string, useWorkspaceRoot?: boolean): string;
    getMarkdownRelativePath(mdFilePath: string, imagePath: string): string;
}

export class DefaultFileUtils implements FileUtils {
    calculateRelativePath(from: string, to: string): string {
        return path.relative(from, to).replace(/\\/g, "/");
    }

    generateImagePath(workspacePath: string, imageDir: string, fileName: string, mdFilePath?: string, useWorkspaceRoot?: boolean): string {
        // Obj: Calculate base path based on useWorkspaceRoot setting
        const basePath = (useWorkspaceRoot || !mdFilePath)
            ? workspacePath
            : path.dirname(mdFilePath);
        return path.join(basePath, imageDir, fileName);
    }

    getMarkdownRelativePath(mdFilePath: string, imagePath: string): string {
        const mdFileDir = path.dirname(mdFilePath);
        const relativePath = this.calculateRelativePath(mdFileDir, imagePath);
        return relativePath;
    }
}

export class PathValidator {
    static isValidImagePath(imageDir: string): boolean {
        if (!imageDir || imageDir.trim() === "") {
            return false;
        }

        // 絶対パスは無効
        if (path.isAbsolute(imageDir)) {
            return false;
        }

        // 危険なパス文字列をチェック
        const dangerousPatterns = ["..", "~", "$"];
        return !dangerousPatterns.some(pattern => imageDir.includes(pattern));
    }

    static normalizeImagePath(imageDir: string): string {
        return imageDir.replace(/\\/g, "/").replace(/\/+/g, "/");
    }
}
