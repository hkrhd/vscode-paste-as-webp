import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import Mocha from "mocha";
import { waitForResult } from "../suite/paste";

interface Comparison { format?: string; width: number; height: number; expectedWidth: number; expectedHeight: number; difference: number }

async function request(action: string): Promise<{ bytes?: string; notifications?: string[] } & Partial<Comparison>> {
    assert.ok(process.env.VSC_WEBP_TEST_BRIDGE);
    const response = await fetch(`${process.env.VSC_WEBP_TEST_BRIDGE}/${action}`);
    const body = await response.text();
    assert.ok(response.ok, body);
    return JSON.parse(body);
}

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: "tdd", color: true, timeout: 120000 });
    mocha.suite.emit("pre-require", globalThis, __filename, mocha);
    suite("Native screenshot over Remote SSH", () => {
        test("Cmd/Ctrl+V saves a local screenshot on SSH", async () => {
            assert.equal(vscode.env.remoteName, "ssh-remote");
            assert.equal(process.platform, process.env.VSC_WEBP_CLIENT_PLATFORM);
            const extension = vscode.extensions.getExtension("hkrhd.vsc-webp-paster");
            assert.ok(extension);
            assert.equal(extension.extensionKind, vscode.ExtensionKind.UI);
            const workspace = vscode.workspace.workspaceFolders?.[0];
            assert.ok(workspace);
            assert.equal(workspace.uri.scheme, "vscode-remote");
            const stem = "standard";
            const config = vscode.workspace.getConfiguration("vsc-webp-paster", workspace.uri);
            await config.update("imageDir", "images/nested", vscode.ConfigurationTarget.Workspace);
            await config.update("namingConvention", stem, vscode.ConfigurationTarget.Workspace);
            const uri = vscode.Uri.joinPath(workspace.uri, `${stem}.md`);
            await vscode.workspace.fs.writeFile(uri, Buffer.from("Screenshot via actual SSH\n"));
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            await extension.activate();
            const position = document.positionAt(document.getText().length);
            editor.selection = new vscode.Selection(position, position);
            await request("capture");
            await request("paste");
            await waitForResult(() => document.getText().includes(".webp)"), "screenshot image link");
            const relative = `images/nested/${stem}.webp`;
            assert.ok(document.getText().includes(`![${stem}.webp](${relative})`), document.getText());
            const imageUri = vscode.Uri.joinPath(workspace.uri, relative);
            // The text change is observable before the additional file edit finishes.
            await waitForResult(async () => {
                try {
                    return (await vscode.workspace.fs.stat(imageUri)).size > 0;
                } catch (error) {
                    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
                        return false;
                    }
                    throw error;
                }
            }, "remote WebP file creation completes");
            await document.save();
            const saved = await request(`compare?path=${encodeURIComponent(relative)}`);
            assert.equal(saved.format, "webp");
            assert.equal(saved.width, saved.expectedWidth);
            assert.equal(saved.height, saved.expectedHeight);
            assert.ok(saved.difference !== undefined && saved.difference < 15, "Saved WebP must depict the captured screenshot");
            const markdown = await request(`read?path=${stem}.md`);
            assert.ok(markdown.bytes);
            assert.equal(Buffer.from(markdown.bytes, "base64").toString("utf8"), document.getText());
            const retiredNotice = "“Paste as WebP in MD” was retired due to a VS Code change.";
            for (let attempt = 0; attempt < 10; attempt++) {
                const { notifications } = await request("notifications");
                assert.ok(notifications);
                assert.ok(!notifications.some(message => message.includes(retiredNotice)),
                    "Standard paste in a fresh profile must not show the retired command notice");
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });
    });
    await new Promise<void>((resolve, reject) => mocha.run(failures => failures ? reject(new Error(`${failures} SSH test(s) failed`)) : resolve()));
}
