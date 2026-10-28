import * as vscode from "vscode";
import { WebpPasteProvider, pasteKind, providedPasteKinds } from "./paste-provider";
import { VSCodeMessageProvider } from "./message-provider";
import { logger } from "./logger";

export function activate(context: vscode.ExtensionContext) {
    let migrationNoticeShown = context.globalState.get<boolean>("nativePasteMigrationNoticeShown", false);
    if (vscode.workspace.getConfiguration("vsc-webp-paster").get<boolean>("debugMode")) {
        logger.show();
    }
    context.subscriptions.push(
        vscode.languages.registerDocumentPasteEditProvider(
            { language: "markdown" }, new WebpPasteProvider(),
            { providedPasteEditKinds: providedPasteKinds, pasteMimeTypes: ["image/*", "text/plain"] }
        ),
        vscode.commands.registerCommand("vsc-webp-paster.pasteAsWebpInMd", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== "markdown") {
                void vscode.window.showErrorMessage(new VSCodeMessageProvider().t("extension.noActiveEditor"));
                return;
            }
            await vscode.commands.executeCommand("editor.action.pasteAs", { kind: pasteKind.value });
            if (!migrationNoticeShown) {
                migrationNoticeShown = true;
                await context.globalState.update("nativePasteMigrationNoticeShown", true);
                void vscode.window.showInformationMessage(vscode.l10n.t(
                    "You can now save WebP images with normal paste. Your existing shortcut still works."
                ));
            }
        })
    );
}
