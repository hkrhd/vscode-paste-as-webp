import * as path from "path";
import * as fs from "fs";

export interface FileUtils {
    calculateRelativePath(from: string, to: string): string;
    ensureDirectoryExists(dirPath: string): Promise<void>;
    generateImagePath(workspacePath: string, imagePath: string, fileName: string): string;
    getMarkdownRelativePath(mdFilePath: string, imagePath: string): string;
}

export class DefaultFileUtils implements FileUtils {
    calculateRelativePath(from: string, to: string): string {
        return path.relative(from, to).replace(/\\/g, "/");
    }

    async ensureDirectoryExists(dirPath: string): Promise<void> {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    generateImagePath(workspacePath: string, imagePath: string, fileName: string): string {
        return path.join(workspacePath, imagePath, fileName);
    }

    getMarkdownRelativePath(mdFilePath: string, imagePath: string): string {
        const mdFileDir = path.dirname(mdFilePath);
        const relativePath = this.calculateRelativePath(mdFileDir, imagePath);
        return relativePath;
    }
}

export class PathValidator {
    static isValidImagePath(imagePath: string): boolean {
        if (!imagePath || imagePath.trim() === "") {
            return false;
        }

        // 絶対パスは無効
        if (path.isAbsolute(imagePath)) {
            return false;
        }

        // 危険なパス文字列をチェック
        const dangerousPatterns = ["..", "~", "$"];
        return !dangerousPatterns.some(pattern => imagePath.includes(pattern));
    }

    static normalizeImagePath(imagePath: string): string {
        return imagePath.replace(/\\/g, "/").replace(/\/+/g, "/");
    }
}
