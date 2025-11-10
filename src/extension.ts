import * as vscode from "vscode";
import { DefaultClipboardProvider } from "./clipboard";
import { DefaultImageProcessor } from "./image-processor";
import { DefaultFileUtils } from "./file-utils";
import { DefaultConfigProvider } from "./config";
import { PasteCommand } from "./paste-command";
import { VSCodeMessageProvider } from "./message-provider";
import { logger } from "./logger";

// ファクトリ関数をエクスポートして、テストでオーバーライドできるようにする
export let createPasteCommand = (messageProvider: VSCodeMessageProvider) => {
    const clipboardProvider = new DefaultClipboardProvider();
    const imageProcessor = new DefaultImageProcessor(messageProvider);
    const fileUtils = new DefaultFileUtils();
    const vscodeConfig = vscode.workspace.getConfiguration("vsc-webp-paster");
    const configProvider = new DefaultConfigProvider(vscodeConfig, messageProvider);

    return new PasteCommand({
        clipboardProvider,
        imageProcessor,
        fileUtils,
        configProvider,
        messageProvider
    });
};

export function activate(context: vscode.ExtensionContext) {
    logger.debug('Extension', 'Extension "vsc-webp-paster" is now active!');

    // Obj: Show output panel when debug mode is enabled
    const config = vscode.workspace.getConfiguration('vsc-webp-paster');
    if (config.get<boolean>('debugMode')) {
        logger.show();
    }

    const messageProvider = new VSCodeMessageProvider();

    // 依存関係を初期化
    const clipboardProvider = new DefaultClipboardProvider();
    const imageProcessor = new DefaultImageProcessor(messageProvider);
    const fileUtils = new DefaultFileUtils();

    const disposable = vscode.commands.registerCommand(
        "vsc-webp-paster.pasteAsWebpInMd",
        async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage(messageProvider.t('extension.noActiveEditor'));
                    return;
                }

                // 設定プロバイダーを初期化
                const vscodeConfig = vscode.workspace.getConfiguration("vsc-webp-paster");
                const configProvider = new DefaultConfigProvider(vscodeConfig, messageProvider);

                // コマンドを実行
                const command = new PasteCommand({
                    clipboardProvider,
                    imageProcessor,
                    fileUtils,
                    configProvider,
                    messageProvider
                });

                await command.execute(editor);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const fullError = error instanceof Error ? error.stack : String(error);
                logger.error('Extension', "Error occurred:", fullError);

                // Obj: Show output panel only when debug mode is enabled
                const config = vscode.workspace.getConfiguration('vsc-webp-paster');
                if (config.get<boolean>('debugMode')) {
                    logger.show();
                }

                // Obj: Show error message with "Show Details" button
                const showDetailsButton = messageProvider.t('extension.showDetails');
                vscode.window.showErrorMessage(
                    messageProvider.t('extension.error', errorMessage),
                    showDetailsButton
                ).then(selection => {
                    if (selection === showDetailsButton) {
                        logger.show();
                    }
                });
            }
        }
    );

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
