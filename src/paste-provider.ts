import * as vscode from "vscode";
import { DefaultConfigProvider, ConfigUtils, ExtensionConfig } from "./config";
import { DefaultImageProcessor, ImageUtils } from "./image-processor";
import { DefaultFileUtils, PathValidator } from "./file-utils";
import { VSCodeMessageProvider } from "./message-provider";
import { UrlUtils } from "./url-utils";
import { logger } from "./logger";

export const pasteKind = vscode.DocumentDropOrPasteEditKind.Empty.append("vsc-webp-paster");
export const imageKind = pasteKind.append("image", "webp");
export const linkKind = pasteKind.append("link", "title");
const textKind = pasteKind.append("text");

type PasteSource = { image: Buffer } | { url: string };
interface WebpPasteEdit extends vscode.DocumentPasteEdit {
    source?: PasteSource;
    documentUri: vscode.Uri;
    config: ExtensionConfig;
}

export class WebpPasteProvider implements vscode.DocumentPasteEditProvider<WebpPasteEdit> {
    private readonly messages = new VSCodeMessageProvider();
    private readonly images = new DefaultImageProcessor(this.messages);
    private readonly files = new DefaultFileUtils();

    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        _ranges: readonly vscode.Range[],
        data: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken
    ): Promise<WebpPasteEdit[] | undefined> {
        logger.debug("PasteProvider", "Provide", { triggerKind: context.triggerKind, only: context.only?.value });
        const config = new DefaultConfigProvider(
            vscode.workspace.getConfiguration("vsc-webp-paster", document.uri), this.messages
        ).getConfig();
        const text = await data.get("text/plain")?.asString() ?? "";
        let image: Buffer | undefined;
        if (ImageUtils.isBase64Image(text)) {
            const base64 = ImageUtils.extractBase64Data(text);
            if (base64) {
                image = ImageUtils.bufferFromBase64(base64);
            }
        }
        if (!image) {
            for (const [mime, item] of data) {
                if (mime.startsWith("image/")) {
                    const file = item.asFile();
                    if (file) {
                        // DataTransfer files expire when provideDocumentPasteEdits returns.
                        image = Buffer.from(await file.data());
                        break;
                    }
                }
            }
        }
        logger.debug("PasteProvider", "Clipboard types", {
            hasImage: !!image, textLength: text.length, cancelled: token.isCancellationRequested
        });
        if (token.isCancellationRequested) {
            return;
        }
        const source: PasteSource | undefined = image ? { image }
            : config.convertUrlToLink && UrlUtils.isValidUrl(text.trim()) ? { url: text.trim() }
            : undefined;
        // Ordinary text belongs to VS Code; the explicit command also supports text.
        if (!source && !context.only?.intersects(pasteKind)) {
            return;
        }
        const kind = image ? imageKind : source ? linkKind : textKind;
        if (context.only && !context.only.contains(kind)) {
            return;
        }
        const edit = Object.assign(new vscode.DocumentPasteEdit(
            source ? "" : text,
            image ? "Paste as WebP" : source ? "Paste URL with page title" : "Paste as text",
            kind
        ), { source, config, documentUri: document.uri });
        // Paste As applies the returned edit without invoking resolveDocumentPasteEdit.
        if (context.triggerKind === vscode.DocumentPasteTriggerKind.PasteAs) {
            await this.resolveDocumentPasteEdit(edit, token);
        }
        logger.debug("PasteProvider", "Return", {
            triggerKind: context.triggerKind, kind: kind.value, cancelled: token.isCancellationRequested,
            textLength: typeof edit.insertText === "string" ? edit.insertText.length : edit.insertText.value.length
        });
        return token.isCancellationRequested ? undefined : [edit];
    }

    async resolveDocumentPasteEdit(edit: WebpPasteEdit, token: vscode.CancellationToken): Promise<WebpPasteEdit> {
        try {
            if (!edit.source || token.isCancellationRequested) {
                return edit;
            }
            const { config, documentUri } = edit;
            const configProvider = new DefaultConfigProvider(
                vscode.workspace.getConfiguration("vsc-webp-paster", documentUri), this.messages
            );
            const errors = configProvider.validateConfig(config);
            if (errors.length) {
                throw new Error(this.messages.t("pasteCommand.configError", errors.join(", ")));
            }
            if ("url" in edit.source) {
                const url = edit.source.url;
                const abort = new AbortController();
                const listener = token.onCancellationRequested(() => abort.abort());
                try {
                    const title = await this.withProgress(
                        () => UrlUtils.fetchPageTitle(url, config.urlFetchTimeout, abort.signal),
                        this.messages.t("pasteCommand.fetchingTitle"), config.progressDelay
                    );
                    if (!token.isCancellationRequested) {
                        edit.insertText = title ? UrlUtils.formatMarkdownLink(title, url) : url;
                    }
                } finally {
                    listener.dispose();
                }
                return edit;
            }
            const workspace = vscode.workspace.getWorkspaceFolder(documentUri);
            if (config.useWorkspaceRoot && !workspace) {
                throw new Error(this.messages.t("pasteCommand.noWorkspaceWithUseRoot"));
            }
            if (!PathValidator.isValidImagePath(config.imageDir)) {
                throw new Error(this.messages.t("pasteCommand.invalidImageDir"));
            }
            const base = config.useWorkspaceRoot && workspace ? workspace.uri : vscode.Uri.joinPath(documentUri, "..");
            const dir = this.files.generateImageUri(base, config.imageDir, "", documentUri, config.useWorkspaceRoot);
            const image = edit.source.image;
            const webp = await this.withProgress(
                () => this.images.convertToWebP(image, config.quality),
                this.messages.t("pasteCommand.processing"), config.progressDelay
            );
            const fileName = await ConfigUtils.generateUniqueFileName(config.namingConvention, dir);
            if (token.isCancellationRequested) {
                return edit;
            }
            const imageUri = vscode.Uri.joinPath(dir, fileName);
            const relative = this.files.getMarkdownRelativePathFromUri(documentUri, imageUri);
            edit.insertText = ConfigUtils.expandInsertPattern(config.insertPattern, fileName, relative);
            edit.additionalEdit = new vscode.WorkspaceEdit();
            edit.additionalEdit.createFile(imageUri, { contents: webp });
            logger.debug("PasteProvider", "Resolved image", { kind: edit.kind?.value, cancelled: token.isCancellationRequested });
            return edit;
        } catch (error) {
            logger.error("PasteProvider", "Paste failed", error);
            if (!token.isCancellationRequested) {
                void vscode.window.showErrorMessage(this.messages.t("extension.error", error instanceof Error ? error.message : String(error)));
            }
            throw error;
        }
    }

    private async withProgress<T>(task: () => Promise<T>, title: string, delay: number): Promise<T> {
        const promise = task();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const finished = await Promise.race([
                promise.then(() => true, () => true),
                new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), delay * 1000); })
            ]);
            if (!finished) {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, () => promise);
            }
            return await promise;
        } finally {
            clearTimeout(timer);
        }
    }
}

export const providedPasteKinds = [imageKind, linkKind, textKind];
