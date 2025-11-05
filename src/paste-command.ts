import * as vscode from "vscode";
import { ClipboardProvider } from "./clipboard";
import { ImageProcessor, ImageUtils } from "./image-processor";
import { FileUtils, PathValidator } from "./file-utils";
import { ConfigProvider, ConfigUtils } from "./config";
import { logger } from "./logger";

export interface MessageProvider {
    t(key: string, ...args: any[]): string;
}

export class VSCodeMessageProvider implements MessageProvider {
    t(key: string, ...args: any[]): string {
        return vscode.l10n.t(key, ...args);
    }
}

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
        if (!workspaceFolder) {
            throw new Error(this.messageProvider.t('pasteCommand.noWorkspace'));
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

        // プラットフォーム固有のクリップボード処理
        if (!imageBuffer && textData.length === 0) {
            logger.debug('PasteCommand', 'Attempting platform-specific clipboard access');
            imageBuffer = await this.deps.clipboardProvider.getImageBuffer();
            logger.debug('PasteCommand', 'Platform clipboard result:', imageBuffer ? `buffer size: ${imageBuffer.length}` : 'null');
        }

        // 画像データがない場合はテキストとして処理
        if (!imageBuffer) {
            logger.debug('PasteCommand', 'No image data, pasting as text');
            await this.pasteAsText(editor, textData);
            return;
        }

        logger.debug('PasteCommand', 'Processing as image, buffer size:', imageBuffer.length);

        // 画像として処理
        await this.pasteAsImage(editor, imageBuffer, config, workspaceFolder);
    }

    private async pasteAsText(editor: vscode.TextEditor, text: string): Promise<void> {
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, text);
        });
        vscode.window.showInformationMessage(this.messageProvider.t('pasteCommand.textPasted'));
    }

    private async pasteAsImage(
        editor: vscode.TextEditor,
        imageBuffer: Buffer,
        config: any,
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<void> {
        const mdFilePath = editor.document.uri.fsPath;

        // 画像フォルダのパスを取得
        const targetDir = this.deps.fileUtils.generateImagePath(
            workspaceFolder.uri.fsPath,
            config.imageDir,
            "",
            mdFilePath,
            config.useWorkspaceRoot
        );

        // 重複を避けてファイル名を生成
        const fileName = await ConfigUtils.generateUniqueFileName(
            config.namingConvention,
            targetDir
        );

        // 画像を保存するパスを生成
        const imagePath = this.deps.fileUtils.generateImagePath(
            workspaceFolder.uri.fsPath,
            config.imageDir,
            fileName,
            mdFilePath,
            config.useWorkspaceRoot
        );

        // WebPに変換
        const webpBuffer = await this.deps.imageProcessor.convertToWebP(imageBuffer, config.quality);

        // 画像を保存 (Obj: Convert path to Uri for remote environment support)
        const imageUri = vscode.Uri.file(imagePath);
        await this.deps.imageProcessor.saveImage(webpBuffer, imageUri);

        // Obj: Verify file exists after save to detect save failures
        try {
            await vscode.workspace.fs.stat(imageUri);
        } catch (error) {
            throw new Error(this.messageProvider.t('pasteCommand.imageSaveError', imagePath));
        }

        // マークダウンファイルからの相対パスを取得
        const relativePath = this.deps.fileUtils.getMarkdownRelativePath(
            editor.document.uri.fsPath,
            imagePath
        );

        // 挿入パターンを展開
        const imageMarkdown = ConfigUtils.expandInsertPattern(
            config.insertPattern,
            fileName,
            relativePath
        );
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, imageMarkdown);
        });

        vscode.window.showInformationMessage(this.messageProvider.t('pasteCommand.imageSaved', relativePath));
    }
}
