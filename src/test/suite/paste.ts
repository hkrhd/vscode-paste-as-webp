import * as assert from "assert";
import * as vscode from "vscode";

export async function waitForResult(predicate: () => boolean | Promise<boolean>, description: string, timeout = 10000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!await predicate()) {
        assert.ok(Date.now() < deadline, `Timed out: ${description}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

export async function pasteAndWait(document: vscode.TextDocument, command = "vsc-webp-paster.pasteAsWebpInMd"): Promise<void> {
    const before = document.getText();
    await vscode.commands.executeCommand(command);
    await waitForResult(() => document.getText() !== before, "paste changes the document");
}
