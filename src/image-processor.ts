import * as vscode from "vscode";
import sharp from "sharp";
import { logger } from "./logger";
import { MessageProvider } from "./message-provider";

export interface ImageProcessor {
    convertToWebP(buffer: Buffer, quality?: number): Promise<Buffer>;
    saveImage(buffer: Buffer, fileUri: vscode.Uri): Promise<void>;
    generateFileName(prefix?: string): string;
}

export class DefaultImageProcessor implements ImageProcessor {
    private messageProvider?: MessageProvider;

    constructor(messageProvider?: MessageProvider) {
        this.messageProvider = messageProvider;
    }
    async convertToWebP(buffer: Buffer, quality: number = 80): Promise<Buffer> {
        try {
            return await sharp(buffer)
                .webp({ quality })
                .toBuffer();
        } catch (error) {
            logger.error('ImageProcessor', 'Failed to convert image to WebP:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            const message = this.messageProvider
                ? this.messageProvider.t('pasteCommand.imageConvertError', errorMsg)
                : `Failed to convert image to WebP: ${errorMsg}`;
            throw new Error(message);
        }
    }

    async saveImage(buffer: Buffer, fileUri: vscode.Uri): Promise<void> {
        // Obj: Use VSCode FileSystem API for remote environment support (WSL, Remote SSH, etc.)
        const dirUri = vscode.Uri.joinPath(fileUri, '..');
        logger.debug('ImageProcessor', 'dirUri.toString():', dirUri.toString());
        logger.debug('ImageProcessor', 'dirUri.fsPath:', dirUri.fsPath);

        try {
            const stat = await vscode.workspace.fs.stat(dirUri);
            logger.debug('ImageProcessor', 'Directory exists, type:', stat.type);
        } catch (error) {
            logger.debug('ImageProcessor', 'Directory does not exist, creating...');
            try {
                await vscode.workspace.fs.createDirectory(dirUri);
                logger.debug('ImageProcessor', 'Directory created');
            } catch (createError) {
                logger.error('ImageProcessor', 'Failed to create directory:', createError);
                const errorMsg = createError instanceof Error ? createError.message : String(createError);
                const message = this.messageProvider
                    ? this.messageProvider.t('pasteCommand.directoryCreateError', errorMsg)
                    : `Failed to create directory: ${errorMsg}`;
                throw new Error(message);
            }
        }

        logger.debug('ImageProcessor', 'Writing file, buffer size:', buffer.length);
        try {
            await vscode.workspace.fs.writeFile(fileUri, buffer);
            logger.debug('ImageProcessor', 'File written successfully');
        } catch (writeError) {
            logger.error('ImageProcessor', 'Failed to write file:', writeError);
            const errorMsg = writeError instanceof Error ? writeError.message : String(writeError);
            const message = this.messageProvider
                ? this.messageProvider.t('pasteCommand.imageWriteError', errorMsg)
                : `Failed to write image file: ${errorMsg}`;
            throw new Error(message);
        }
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
