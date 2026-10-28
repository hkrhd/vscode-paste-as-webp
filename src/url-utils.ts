import { TextDecoder } from "node:util";
import { logger } from "./logger";

const MAX_HTML_BYTES = 256 * 1024;
const ENCODING_SNIFF_BYTES = 1024;

export class UrlUtils {
    static isValidUrl(text: string): boolean {
        const candidate = text.trim();
        if (candidate.length === 0 || /\s/u.test(candidate)) {
            return false;
        }

        try {
            const url = new URL(candidate);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch {
            return false;
        }
    }

    static formatMarkdownLink(title: string, url: string): string {
        const escapedTitle = title
            .replace(/\\/g, "\\\\")
            .replace(/\[/g, "\\[")
            .replace(/\]/g, "\\]");
        const normalizedUrl = new URL(url.trim()).href.replace(/>/g, "%3E");

        return `[${escapedTitle}](<${normalizedUrl}>)`;
    }

    static async fetchPageTitle(url: string, timeoutMs = 1500, signal?: AbortSignal): Promise<string | null> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method: "GET",
                redirect: "follow",
                signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
                headers: {
                    Accept: "text/html,application/xhtml+xml",
                    "User-Agent": "Mozilla/5.0 (compatible; VSCode-WebP-Paster/1.0)",
                },
            });

            if (!response.ok) {
                logger.debug("UrlUtils", `Fetch failed: ${response.status} ${response.statusText}`);
                return null;
            }

            const contentType = response.headers.get("content-type");
            if (contentType && !this.isHtmlContentType(contentType)) {
                logger.debug("UrlUtils", `Not an HTML response: ${contentType}`);
                return null;
            }

            if (!response.body) {
                return null;
            }

            return await this.readTitleFromStream(response.body, contentType);
        } catch (error) {
            logger.debug("UrlUtils", "Error fetching page title:", error);
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private static isHtmlContentType(contentType: string): boolean {
        const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
        return mediaType === "text/html" || mediaType === "application/xhtml+xml";
    }

    private static async readTitleFromStream(
        body: ReadableStream<Uint8Array>,
        contentType: string | null
    ): Promise<string | null> {
        const { Parser } = await import("htmlparser2");
        const reader = body.getReader();
        const titleParts: string[] = [];
        let inTitle = false;
        let titleClosed = false;

        const parser = new Parser(
            {
                onopentag(name) {
                    if (name === "title") {
                        inTitle = true;
                        titleParts.length = 0;
                    }
                },
                ontext(text) {
                    if (inTitle) {
                        titleParts.push(text);
                    }
                },
                onclosetag(name) {
                    if (name === "title" && inTitle) {
                        inTitle = false;
                        titleClosed = true;
                    }
                },
            },
            { decodeEntities: true }
        );

        const bufferedChunks: Uint8Array[] = [];
        let bufferedLength = 0;
        let totalBytes = 0;
        let decoder: TextDecoder | null = this.decoderFromContentType(contentType);

        const writeBufferedChunks = (): void => {
            if (!decoder) {
                const prelude = this.joinChunks(bufferedChunks, bufferedLength);
                decoder = this.createDecoder(this.sniffEncoding(prelude));
            }

            for (const chunk of bufferedChunks) {
                parser.write(decoder.decode(chunk, { stream: true }));
            }
            bufferedChunks.length = 0;
            bufferedLength = 0;
        };

        try {
            while (totalBytes < MAX_HTML_BYTES && !titleClosed) {
                const { done, value } = await reader.read();
                if (done) {
                    if (bufferedLength > 0) {
                        writeBufferedChunks();
                    }
                    if (decoder) {
                        parser.write(decoder.decode());
                    }
                    parser.end();
                    break;
                }

                const remaining = MAX_HTML_BYTES - totalBytes;
                const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
                totalBytes += chunk.byteLength;

                if (decoder) {
                    parser.write(decoder.decode(chunk, { stream: true }));
                } else {
                    bufferedChunks.push(chunk);
                    bufferedLength += chunk.byteLength;

                    const prelude = this.joinChunks(bufferedChunks, bufferedLength);
                    const preview = Buffer.from(prelude).toString("latin1");
                    if (
                        bufferedLength >= ENCODING_SNIFF_BYTES ||
                        /<\/title\s*>|<\/head\s*>/iu.test(preview) ||
                        this.findDeclaredEncoding(preview)
                    ) {
                        writeBufferedChunks();
                    }
                }
            }

            if (titleClosed || totalBytes >= MAX_HTML_BYTES) {
                try {
                    await reader.cancel();
                } catch (error) {
                    logger.debug("UrlUtils", "Failed to cancel the response stream:", error);
                }
            }

            if (!titleClosed) {
                return null;
            }

            const title = titleParts.join("").trim().replace(/\s+/gu, " ");
            return title.length > 0 ? title : null;
        } finally {
            reader.releaseLock();
        }
    }

    private static decoderFromContentType(contentType: string | null): TextDecoder | null {
        if (!contentType) {
            return null;
        }

        const match = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/iu);
        return match?.[1] ? this.createDecoder(match[1]) : null;
    }

    private static sniffEncoding(bytes: Uint8Array): string {
        if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
            return "utf-8";
        }
        if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
            return "utf-16le";
        }
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
            return "utf-16be";
        }

        const preview = Buffer.from(bytes).toString("latin1");
        return this.findDeclaredEncoding(preview) ?? "utf-8";
    }

    private static findDeclaredEncoding(preview: string): string | null {
        const match = preview.match(/<meta\b[^>]*\bcharset\s*=\s*["']?\s*([^\s"'/>;]+)/iu);
        return match?.[1] ?? null;
    }

    private static createDecoder(encoding: string): TextDecoder {
        try {
            return new TextDecoder(encoding);
        } catch {
            logger.debug("UrlUtils", `Unsupported character encoding: ${encoding}`);
            return new TextDecoder("utf-8");
        }
    }

    private static joinChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
        const joined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return joined;
    }
}
