import sharp from "sharp";
import { logger } from "./logger";
import { MessageProvider } from "./message-provider";

export class DefaultImageProcessor {
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
