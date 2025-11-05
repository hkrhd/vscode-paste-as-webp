import * as path from "path";
import * as vscode from "vscode";
import { logger } from "./logger";

export interface FileUtils {
    calculateRelativePath(from: string, to: string): string;
    generateImagePath(workspacePath: string, imageDir: string, fileName: string, mdFilePath?: string, useWorkspaceRoot?: boolean): string;
    getMarkdownRelativePath(mdFilePath: string, imagePath: string): string;
    generateImageUri(workspaceUri: vscode.Uri, imageDir: string, fileName: string, mdFileUri: vscode.Uri, useWorkspaceRoot?: boolean): vscode.Uri;
    getMarkdownRelativePathFromUri(mdFileUri: vscode.Uri, imageUri: vscode.Uri): string;
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

    generateImageUri(workspaceUri: vscode.Uri, imageDir: string, fileName: string, mdFileUri: vscode.Uri, useWorkspaceRoot?: boolean): vscode.Uri {
        // Obj: Use Uri-based path operations for cross-platform compatibility
        const baseUri = useWorkspaceRoot
            ? workspaceUri
            : vscode.Uri.joinPath(mdFileUri, '..');

        logger.debug('FileUtils', 'generateImageUri - baseUri:', baseUri.toString());
        logger.debug('FileUtils', 'generateImageUri - imageDir:', imageDir);
        logger.debug('FileUtils', 'generateImageUri - fileName:', fileName);

        // Obj: Split imageDir by '/' to handle nested paths
        const pathSegments = imageDir.split('/').filter(s => s.length > 0);
        let resultUri = baseUri;
        for (const segment of pathSegments) {
            resultUri = vscode.Uri.joinPath(resultUri, segment);
        }

        if (fileName) {
            resultUri = vscode.Uri.joinPath(resultUri, fileName);
        }

        logger.debug('FileUtils', 'generateImageUri - result:', resultUri.toString());
        return resultUri;
    }

    getMarkdownRelativePathFromUri(mdFileUri: vscode.Uri, imageUri: vscode.Uri): string {
        // Obj: Calculate relative path using fsPath for compatibility
        const mdFileDir = path.dirname(mdFileUri.fsPath);
        const imagePath = imageUri.fsPath;
        const relativePath = path.relative(mdFileDir, imagePath).replace(/\\/g, "/");
        logger.debug('FileUtils', 'getMarkdownRelativePathFromUri - mdFileDir:', mdFileDir);
        logger.debug('FileUtils', 'getMarkdownRelativePathFromUri - imagePath:', imagePath);
        logger.debug('FileUtils', 'getMarkdownRelativePathFromUri - relativePath:', relativePath);
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
