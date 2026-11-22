import * as vscode from "vscode";
import { WebpPasteProvider, providedPasteKinds } from "./paste-provider";
import { logger } from "./logger";

const RETIRED_COMMAND = "vsc-webp-paster.pasteAsWebpInMd";

export function activate(context: vscode.ExtensionContext) {
    if (vscode.workspace.getConfiguration("vsc-webp-paster").get<boolean>("debugMode")) {
        logger.show();
    }
    context.subscriptions.push(
        vscode.languages.registerDocumentPasteEditProvider(
            { language: "markdown" }, new WebpPasteProvider(),
            { providedPasteEditKinds: providedPasteKinds, pasteMimeTypes: ["image/*", "text/plain"] }
        ),
        // Newer VS Code drops the requested kind of a command-triggered Paste As,
        // so the retired command only guides users to the standard paste.
        vscode.commands.registerCommand(RETIRED_COMMAND, async () => {
            const openShortcut = vscode.l10n.t("Open Shortcut");
            const choice = await vscode.window.showWarningMessage(vscode.l10n.t(
                "“Paste as WebP in MD” was retired due to a VS Code change. Press {0} to paste images as WebP, and remove the shortcut assigned to this command.",
                process.platform === "darwin" ? "Cmd+V" : "Ctrl+V"
            ), openShortcut);
            if (choice === openShortcut) {
                await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", RETIRED_COMMAND);
            }
        })
    );
}
