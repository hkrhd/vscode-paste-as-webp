import * as vscode from "vscode";
import { WebpPasteProvider, pasteKind, providedPasteKinds } from "./paste-provider";
import { VSCodeMessageProvider } from "./message-provider";
import { logger } from "./logger";

export function activate(context: vscode.ExtensionContext) {
    let migrationNoticeShown = false;
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
                void vscode.window.showInformationMessage(vscode.l10n.t(
                    "This extension now uses VS Code’s built-in paste API. Please remove the shortcut for “Paste as WebP in MD” and use normal paste."
                ));
            }
        })
    );
}
