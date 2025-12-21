import * as vscode from "vscode";
import { ClipboardProvider } from "./clipboard";
import { ImageProcessor, ImageUtils } from "./image-processor";
import { FileUtils, PathValidator } from "./file-utils";
import { ConfigProvider, ConfigUtils } from "./config";
import { logger } from "./logger";
import { MessageProvider, VSCodeMessageProvider } from "./message-provider";

export interface PasteCommandDependencies {
    clipboardProvider: ClipboardProvider;
    imageProcessor: ImageProcessor;
    fileUtils: FileUtils;
    configProvider: ConfigProvider;
    messageProvider?: MessageProvider;
}

export class PasteCommand {
    private deps: PasteCommandDependencies;
    private messageProvider: MessageProvider;

    constructor(deps: PasteCommandDependencies) {
        this.deps = deps;
        this.messageProvider = deps.messageProvider || new VSCodeMessageProvider();
    }

    async execute(editor: vscode.TextEditor): Promise<void> {
        // 設定を取得・検証
        const config = this.deps.configProvider.getConfig();
        const configErrors = this.deps.configProvider.validateConfig(config);
        if (configErrors.length > 0) {
            throw new Error(this.messageProvider.t('pasteCommand.configError', configErrors.join(", ")));
        }

        // ワークスペースの確認
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder && config.useWorkspaceRoot) {
            throw new Error(this.messageProvider.t('pasteCommand.noWorkspaceWithUseRoot'));
        }

        // パスの検証
        if (!PathValidator.isValidImagePath(config.imageDir)) {
            throw new Error(this.messageProvider.t('pasteCommand.invalidImageDir'));
        }

        // クリップボードからデータを取得
        const textData = await vscode.env.clipboard.readText();
        let imageBuffer: Buffer | null = null;

        logger.debug('PasteCommand', 'textData length:', textData.length);

        // Base64画像データかチェック
        if (ImageUtils.isBase64Image(textData)) {
            logger.debug('PasteCommand', 'Base64 image detected in clipboard');
            const base64Data = ImageUtils.extractBase64Data(textData);
            if (base64Data) {
                imageBuffer = ImageUtils.bufferFromBase64(base64Data);
                logger.debug('PasteCommand', 'Base64 image buffer created, size:', imageBuffer.length);
            }
        }

        // 進行状況の遅延表示用関数
        const runWithProgress = async (task: () => Promise<void>) => {
            let isDone = false;
            const progressPromise = (async () => {
                await new Promise(resolve => setTimeout(resolve, config.progressDelay * 1000));
                if (!isDone) {
                    return vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: this.messageProvider.t("pasteCommand.processing"),
                            cancellable: false,
                        },
                        async () => {
                            // タスクが終わるまで待機
                            while (!isDone) {
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                    );
                }
            })();

            try {
                await task();
            } finally {
                isDone = true;
            }
            await progressPromise;
        };

        // プラットフォーム固有のクリップボード処理
        if (!imageBuffer && textData.length === 0) {
            logger.debug('PasteCommand', 'Attempting platform-specific clipboard access');
            // Obj: show progress for slow clipboard access on remote/WSL
            await runWithProgress(async () => {
                imageBuffer = await this.deps.clipboardProvider.getImageBuffer();
                logger.debug('PasteCommand', 'Platform clipboard result:', imageBuffer ? `buffer size: ${imageBuffer.length}` : 'null');

                if (imageBuffer) {
                    await this.pasteAsImage(editor, imageBuffer, config, workspaceFolder || undefined);
                } else {
                    await this.pasteAsText(editor, textData);
                }
            });
            return;
        }

        // 画像データがない場合はテキストとして処理
        if (!imageBuffer) {
            logger.debug('PasteCommand', 'No image data, pasting as text');
            await this.pasteAsText(editor, textData);
            return;
        }

        logger.debug('PasteCommand', 'Processing as image, buffer size:', imageBuffer.length);

        // 画像として処理 (Base64経由などの場合)
        await runWithProgress(async () => {
            await this.pasteAsImage(editor, imageBuffer!, config, workspaceFolder || undefined);
        });
    }

    private async pasteAsText(editor: vscode.TextEditor, text: string): Promise<void> {
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, text);
        });
        logger.debug('PasteCommand', 'Text pasted successfully');
    }

    private async pasteAsImage(
        editor: vscode.TextEditor,
        imageBuffer: Buffer,
        config: any,
        workspaceFolder?: vscode.WorkspaceFolder
    ): Promise<void> {
        const mdFileUri = editor.document.uri;
        // Obj: useWorkspaceRoot=false ignores workspace; always use file's directory
        const baseUri = config.useWorkspaceRoot && workspaceFolder
            ? workspaceFolder.uri
            : vscode.Uri.joinPath(mdFileUri, '..');

        logger.debug('PasteCommand', 'mdFileUri.toString():', mdFileUri.toString());
        logger.debug('PasteCommand', 'mdFileUri.fsPath:', mdFileUri.fsPath);
        logger.debug('PasteCommand', 'baseUri.toString():', baseUri.toString());
        logger.debug('PasteCommand', 'baseUri.fsPath:', baseUri.fsPath);
        logger.debug('PasteCommand', 'config.useWorkspaceRoot:', config.useWorkspaceRoot);

        // Obj: Generate unique filename first (without full path)
        const targetDirUri = this.deps.fileUtils.generateImageUri(
            baseUri,
            config.imageDir,
            "",
            mdFileUri,
            config.useWorkspaceRoot
        );
        logger.debug('PasteCommand', 'targetDirUri:', targetDirUri.toString());

        // Obj: Convert Uri to fsPath for generateUniqueFileName
        const fileName = await ConfigUtils.generateUniqueFileName(
            config.namingConvention,
            targetDirUri.fsPath
        );
        logger.debug('PasteCommand', 'fileName:', fileName);

        // Obj: Use Uri-based path generation for cross-platform compatibility
        const imageUri = this.deps.fileUtils.generateImageUri(
            baseUri,
            config.imageDir,
            fileName,
            mdFileUri,
            config.useWorkspaceRoot
        );
        logger.debug('PasteCommand', 'imageUri.toString():', imageUri.toString());
        logger.debug('PasteCommand', 'imageUri.fsPath:', imageUri.fsPath);
        logger.debug('PasteCommand', 'imageUri.scheme:', imageUri.scheme);

        // WebPに変換
        const webpBuffer = await this.deps.imageProcessor.convertToWebP(imageBuffer, config.quality);

        // 画像を保存 (errors are already localized by ImageProcessor)
        await this.deps.imageProcessor.saveImage(webpBuffer, imageUri);
        logger.debug('PasteCommand', 'Image saved successfully');

        // Obj: Verify file exists after save to detect save failures
        try {
            const stat = await vscode.workspace.fs.stat(imageUri);
            logger.debug('PasteCommand', 'File stat check passed, size:', stat.size);
        } catch (error) {
            logger.error('PasteCommand', 'File stat check failed:', error);
            throw new Error(this.messageProvider.t('pasteCommand.imageSaveError', imageUri.fsPath));
        }

        // Obj: Use Uri-based relative path calculation
        const relativePath = this.deps.fileUtils.getMarkdownRelativePathFromUri(
            mdFileUri,
            imageUri
        );
        logger.debug('PasteCommand', 'relativePath:', relativePath);

        // 挿入パターンを展開
        const imageMarkdown = ConfigUtils.expandInsertPattern(
            config.insertPattern,
            fileName,
            relativePath
        );
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, imageMarkdown);
        });

        logger.debug('PasteCommand', 'Image saved and inserted:', relativePath);
    }
}
