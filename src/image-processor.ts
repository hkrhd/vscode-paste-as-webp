import * as vscode from "vscode";
import sharp from "sharp";

export interface ImageProcessor {
    convertToWebP(buffer: Buffer, quality?: number): Promise<Buffer>;
    saveImage(buffer: Buffer, fileUri: vscode.Uri): Promise<void>;
    generateFileName(prefix?: string): string;
}

export class DefaultImageProcessor implements ImageProcessor {
    async convertToWebP(buffer: Buffer, quality: number = 80): Promise<Buffer> {
        return sharp(buffer)
            .webp({ quality })
            .toBuffer();
    }

    async saveImage(buffer: Buffer, fileUri: vscode.Uri): Promise<void> {
        // Obj: Use VSCode FileSystem API for remote environment support (WSL, Remote SSH, etc.)
        const dirUri = vscode.Uri.joinPath(fileUri, '..');
        try {
            await vscode.workspace.fs.stat(dirUri);
        } catch {
            await vscode.workspace.fs.createDirectory(dirUri);
        }
        await vscode.workspace.fs.writeFile(fileUri, buffer);
    }

    generateFileName(prefix: string = "image"): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        return `${prefix}-${timestamp}.webp`;
    }
}

export class ImageUtils {
    static isBase64Image(data: string): boolean {
        return /^data:image\/.*;base64,(.*)$/.test(data);
    }

    static extractBase64Data(data: string): string | null {
        const match = data.match(/^data:image\/.*;base64,(.*)$/);
        return match ? match[1] : null;
    }

    static bufferFromBase64(base64: string): Buffer {
        return Buffer.from(base64, "base64");
    }
}
