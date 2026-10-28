import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import sharp from "sharp";
import Mocha from "mocha";
import { waitForResult, pasteAndWait } from "../suite/paste";

async function request(action: string): Promise<{ png?: string; bytes?: string }> {
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
        for (const explicit of [false, true]) {
            test(explicit ? "dedicated command saves a local screenshot on SSH" : "Cmd/Ctrl+V saves a local screenshot on SSH", async () => {
                assert.equal(vscode.env.remoteName, "ssh-remote");
                assert.equal(process.platform, process.env.VSC_WEBP_CLIENT_PLATFORM);
                const extension = vscode.extensions.getExtension("hkrhd.vsc-webp-paster");
                assert.ok(extension);
                assert.equal(extension.extensionKind, vscode.ExtensionKind.UI);
                const workspace = vscode.workspace.workspaceFolders?.[0];
                assert.ok(workspace);
                assert.equal(workspace.uri.scheme, "vscode-remote");
                const stem = explicit ? "command" : "keyboard";
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
                const source = await request("capture");
                assert.ok(source.png);
                if (explicit) {
                    await pasteAndWait(document);
                } else {
                    await request("paste");
                    await waitForResult(() => document.getText().includes(".webp)"), "screenshot image link");
                }
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
                const saved = await request(`read?path=${encodeURIComponent(relative)}`);
                assert.ok(saved.bytes);
                const bytes = Buffer.from(saved.bytes, "base64");
                assert.equal((await sharp(bytes).metadata()).format, "webp");
                const original = await sharp(Buffer.from(source.png, "base64")).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
                const decoded = await sharp(bytes).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
                assert.equal(decoded.info.width, original.info.width);
                assert.equal(decoded.info.height, original.info.height);
                assert.equal(decoded.data.length, original.data.length);
                let difference = 0;
                for (let i = 0; i < decoded.data.length; i++) {
                    difference += Math.abs(decoded.data[i] - original.data[i]);
                }
                assert.ok(difference / decoded.data.length < 15, "Saved WebP must depict the captured screenshot");
                const markdown = await request(`read?path=${stem}.md`);
                assert.ok(markdown.bytes);
                assert.equal(Buffer.from(markdown.bytes, "base64").toString("utf8"), document.getText());
            });
        }
    });
    await new Promise<void>((resolve, reject) => mocha.run(failures => failures ? reject(new Error(`${failures} SSH test(s) failed`)) : resolve()));
}
