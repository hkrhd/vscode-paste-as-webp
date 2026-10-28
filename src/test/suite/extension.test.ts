import * as assert from "assert";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import * as path from "path";
import * as vscode from "vscode";
import { pasteAndWait, waitForResult } from "./paste";
import { TestFileSystem } from "./test-file-system";

const EXTENSION_ID = "hkrhd.vsc-webp-paster";
const COMMAND_ID = "vsc-webp-paster.pasteAsWebpInMd";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DIST_ENTRY = path.resolve(REPO_ROOT, "dist/extension.js");
const LIVE_URL = process.env.VSC_WEBP_LIVE_TEST_URL;
const BASE64_PNG_DATA_URL = [
    "data:image/png;base64,",
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
].join("");
let titleServer: Server;
let titleServerBaseUrl: string;

function getNonBuiltinExtensions(): vscode.Extension<unknown>[] {
    return vscode.extensions.all
        .filter((extension) => extension.packageJSON.isBuiltin !== true)
        .sort((left, right) => left.id.localeCompare(right.id));
}

function getExtensionOrFail(): vscode.Extension<unknown> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, "Extension should be discoverable by VS Code");

    return extension;
}

async function waitForActivation(
    extension: vscode.Extension<unknown>,
    timeoutMs = 5_000
): Promise<void> {
    const startedAt = Date.now();

    while (!extension.isActive) {
        if (Date.now() - startedAt >= timeoutMs) {
            assert.fail(`Extension did not activate within ${timeoutMs}ms`);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

async function openScratchMarkdown(baseUri?: vscode.Uri): Promise<{
    document: vscode.TextDocument;
    editor: vscode.TextEditor;
    scratchDir: vscode.Uri;
}> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "Workspace folder should be available for E2E tests");

    const scratchDir = vscode.Uri.joinPath(
        baseUri ?? workspaceFolder.uri,
        ".tmp-e2e",
        `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await vscode.workspace.fs.createDirectory(scratchDir);

    const markdownUri = vscode.Uri.joinPath(scratchDir, "note.md");
    await vscode.workspace.fs.writeFile(markdownUri, Buffer.from("", "utf8"));

    const document = await vscode.workspace.openTextDocument(markdownUri);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    return { document, editor, scratchDir };
}

async function cleanupScratchDir(scratchDir: vscode.Uri, documentUri: vscode.Uri): Promise<void> {
    if (vscode.window.activeTextEditor?.document.uri.toString() === documentUri.toString()) {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await vscode.workspace.fs.delete(scratchDir, { recursive: true, useTrash: false });
}

async function configureExtension(): Promise<void> {
    const config = vscode.workspace.getConfiguration("vsc-webp-paster");
    await config.update("imageDir", "e2e-images", vscode.ConfigurationTarget.Global);
    await config.update("namingConvention", "e2e-image", vscode.ConfigurationTarget.Global);
    await config.update("insertPattern", "![${fileName}](${relativePath})", vscode.ConfigurationTarget.Global);
    await config.update("useWorkspaceRoot", false, vscode.ConfigurationTarget.Global);
    await config.update("progressDelay", 0.3, vscode.ConfigurationTarget.Global);
    await config.update("convertUrlToLink", true, vscode.ConfigurationTarget.Global);
    await config.update("urlFetchTimeout", 1500, vscode.ConfigurationTarget.Global);
}

async function startTitleServer(): Promise<void> {
    titleServer = createServer((request, response) => {
        response.setHeader("Content-Type", "text/html; charset=utf-8");

        if (request.url === "/title") {
            response.end("<!doctype html><title> Example &amp; Docs [2026] </title><p>Body</p>");
            return;
        }

        if (request.url === "/delayed") {
            const timer = setTimeout(() => {
                response.end("<!doctype html><title>Delayed Title</title>");
            }, 450);
            response.on("close", () => clearTimeout(timer));
            return;
        }

        if (request.url === "/stream") {
            response.write("<!doctype html><head><title>Streaming Title</title></head><body>");
            const timer = setTimeout(() => response.end("late body</body>"), 5000);
            response.on("close", () => clearTimeout(timer));
            return;
        }

        if (request.url === "/missing") {
            response.end("<!doctype html><p>No title</p>");
            return;
        }

        if (request.url === "/slow") {
            const timer = setTimeout(() => {
                response.end("<!doctype html><title>Too Late</title>");
            }, 3000);
            response.on("close", () => clearTimeout(timer));
            return;
        }

        response.statusCode = 500;
        response.end("<!doctype html><title>Error page</title>");
    });

    await new Promise<void>((resolve, reject) => {
        titleServer.once("error", reject);
        titleServer.listen(0, "127.0.0.1", () => {
            titleServer.off("error", reject);
            const address = titleServer.address() as AddressInfo;
            titleServerBaseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });
}

async function pasteTextIntoScratch(text: string): Promise<string> {
    const { document, scratchDir } = await openScratchMarkdown();

    try {
        await vscode.env.clipboard.writeText(text);
        await pasteAndWait(document);
        await document.save();
        return document.getText();
    } finally {
        await cleanupScratchDir(scratchDir, document.uri);
    }
}

suiteSetup(async () => {
    await startTitleServer();
    await configureExtension();

    console.log("Non-builtin extensions visible to the test host:");
    for (const visibleExtension of getNonBuiltinExtensions()) {
        console.log(
            `- ${visibleExtension.id}@${visibleExtension.packageJSON.version} path=${visibleExtension.extensionPath}`
        );
    }
});

suiteTeardown(async () => {
    titleServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
        titleServer.close((error) => error ? reject(error) : resolve());
    });
});

suite("Extension Test Suite", () => {
    test("loads only the development copy from the repository root", async () => {
        const extension = getExtensionOrFail();
        const nonBuiltinExtensions = getNonBuiltinExtensions();
        assert.deepStrictEqual(
            nonBuiltinExtensions.map((extension) => extension.id),
            [EXTENSION_ID]
        );

        assert.strictEqual(extension.isActive, false, "Extension should start inactive before markdown is opened");
        assert.strictEqual(path.resolve(extension.extensionPath), REPO_ROOT);
        assert.strictEqual(path.resolve(extension.extensionPath, extension.packageJSON.main), DIST_ENTRY);
        assert.strictEqual(path.resolve(nonBuiltinExtensions[0].extensionPath), REPO_ROOT);
    });

    test("activates when a markdown file is opened and registers the markdown paste command", async () => {
        const extension = getExtensionOrFail();
        assert.strictEqual(extension.isActive, false, "Extension should still be inactive before markdown is opened");

        const { document, scratchDir } = await openScratchMarkdown();

        try {
            assert.strictEqual(document.languageId, "markdown");
            await waitForActivation(extension);
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(COMMAND_ID));
    });

    test("pastes plain text into the active markdown editor", async () => {
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText("plain clipboard text");
            await pasteAndWait(document, "editor.action.clipboardPasteAction");
            await document.save();

            assert.strictEqual(document.getText(), "plain clipboard text");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("pastes a single URL with its HTML title as a Markdown link", async () => {
        const url = `${titleServerBaseUrl}/title`;
        const markdown = await pasteTextIntoScratch(`\n  ${url}\t`);

        assert.strictEqual(markdown, `[Example & Docs \\[2026\\]](<${url}>)`);
    });

    test("fetches a title that arrives after the progress delay but before the timeout", async () => {
        const url = `${titleServerBaseUrl}/delayed`;

        assert.strictEqual(await pasteTextIntoScratch(url), `[Delayed Title](<${url}>)`);
    });

    test("stops reading the response as soon as the closing title tag arrives", async () => {
        const url = `${titleServerBaseUrl}/stream`;
        const startedAt = Date.now();
        const markdown = await pasteTextIntoScratch(url);
        const elapsedMs = Date.now() - startedAt;

        assert.strictEqual(markdown, `[Streaming Title](<${url}>)`);
        assert.ok(elapsedMs < 1200, `Paste should finish before the timeout, actual: ${elapsedMs}ms`);
    });

    test("pastes the original URL when a page title cannot be fetched", async () => {
        for (const pathName of ["/missing", "/error", "/slow"]) {
            const url = `${titleServerBaseUrl}${pathName}`;
            assert.strictEqual(await pasteTextIntoScratch(` ${url}\n`), url);
        }
    });

    test("does not convert a URL contained in ordinary text", async () => {
        const text = `See ${titleServerBaseUrl}/title for details.`;

        assert.strictEqual(await pasteTextIntoScratch(text), text);
    });

    if (LIVE_URL) {
        test("pastes a live website URL with its page title", async () => {
            const normalizedUrl = new URL(LIVE_URL).href;
            const markdown = await pasteTextIntoScratch(normalizedUrl);

            assert.ok(markdown.startsWith("["), "Live page title should be used as the link label");
            assert.ok(
                markdown.endsWith(`](<${normalizedUrl}>)`),
                "Markdown should link to the live URL"
            );
            assert.notStrictEqual(markdown, normalizedUrl, "Live URL should not fall back to plain text");
        });
    }

    test("converts base64 clipboard data into a webp file and markdown image link", async () => {
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");
            await document.save();

            const markdown = document.getText();
            assert.match(
                markdown,
                /^!\[e2e-image(?:-\d+)?\.webp\]\(e2e-images\/e2e-image(?:-\d+)?\.webp\)$/
            );

            const fileNameMatch = markdown.match(/\((?<relativePath>[^)]+)\)$/);
            assert.ok(fileNameMatch?.groups?.relativePath, "Markdown should contain a relative image path");

            const imageUri = vscode.Uri.joinPath(scratchDir, fileNameMatch.groups.relativePath);
            const imageStat = await vscode.workspace.fs.stat(imageUri);
            assert.ok(imageStat.size > 0, "Generated WebP file should not be empty");

            assert.strictEqual(path.extname(imageUri.fsPath), ".webp");

            const imageData = await vscode.workspace.fs.readFile(imageUri);
            assert.strictEqual(Buffer.from(imageData.subarray(0, 4)).toString("ascii"), "RIFF");
            assert.strictEqual(Buffer.from(imageData.subarray(8, 12)).toString("ascii"), "WEBP");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("replaces selected text with a WebP image and undo restores text and removes the image", async () => {
        const { document, editor, scratchDir } = await openScratchMarkdown();
        const originalText = "before after";

        try {
            await editor.edit(edit => edit.insert(new vscode.Position(0, 0), originalText));
            editor.selection = new vscode.Selection(0, 7, 0, 12);
            await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            const link = document.getText().slice("before ".length);
            assert.match(link, /^!\[e2e-image(?:-\d+)?\.webp\]\(e2e-images\/e2e-image(?:-\d+)?\.webp\)$/);
            const relativePath = link.match(/\((?<path>[^)]+)\)$/)?.groups?.path;
            assert.ok(relativePath, "Pasted Markdown should contain the generated image path");
            const imageUri = vscode.Uri.joinPath(scratchDir, relativePath);
            assert.ok((await vscode.workspace.fs.stat(imageUri)).size > 0);

            await vscode.commands.executeCommand("undo");
            await waitForResult(() => document.getText() === originalText, "undo restores selected text");
            await waitForResult(async () => {
                try {
                    await vscode.workspace.fs.stat(imageUri);
                    return false;
                } catch {
                    return true;
                }
            }, "undo removes generated image");
            assert.strictEqual(document.getText(), originalText);
            await document.save();
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("inserts one shared image link at multiple cursors on standard paste", async () => {
        const { document, editor, scratchDir } = await openScratchMarkdown();

        try {
            await editor.edit(edit => edit.insert(new vscode.Position(0, 0), "alpha\nbeta"));
            editor.selections = [new vscode.Selection(0, 5, 0, 5), new vscode.Selection(1, 4, 1, 4)];
            await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            const links = [...document.getText().matchAll(/!\[[^\]]+\]\([^)]+\)/g)].map(match => match[0]);
            assert.strictEqual(links.length, 2, "Each cursor should receive an image link");
            assert.strictEqual(links[0], links[1], "Both cursors should reference the same image file");
            assert.strictEqual(document.getText(), `alpha${links[0]}\nbeta${links[1]}`);

            const relativePath = links[0].match(/\((?<path>[^)]+)\)$/)?.groups?.path;
            assert.ok(relativePath, "Pasted Markdown should contain the generated image path");
            const imageDir = vscode.Uri.joinPath(scratchDir, "e2e-images");
            const files = await vscode.workspace.fs.readDirectory(imageDir);
            assert.deepStrictEqual(files.map(([name]) => name), [path.posix.basename(relativePath)]);
            assert.ok((await vscode.workspace.fs.stat(vscode.Uri.joinPath(scratchDir, relativePath))).size > 0);
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("text preference keeps Base64 text on standard paste while the dedicated command creates WebP", async () => {
        const { document, editor, scratchDir } = await openScratchMarkdown();
        const editorConfig = vscode.workspace.getConfiguration("editor");
        const previousPreferences = editorConfig.inspect<string[]>("pasteAs.preferences")?.globalValue;

        try {
            await editorConfig.update("pasteAs.preferences", ["text"], vscode.ConfigurationTarget.Global);
            await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");
            assert.strictEqual(document.getText(), BASE64_PNG_DATA_URL);

            editor.selection = new vscode.Selection(0, document.lineAt(0).text.length, 0, document.lineAt(0).text.length);
            await pasteAndWait(document, COMMAND_ID);
            await waitForResult(() => document.getText().includes("e2e-image"), "dedicated command inserts WebP Markdown");

            const markdown = document.getText().slice(BASE64_PNG_DATA_URL.length);
            assert.match(markdown, /^!\[e2e-image(?:-\d+)?\.webp\]\(e2e-images\/e2e-image(?:-\d+)?\.webp\)$/);
            const relativePath = markdown.match(/\((?<path>[^)]+)\)$/)?.groups?.path;
            assert.ok(relativePath, "Dedicated command should add an image path");
            assert.ok((await vscode.workspace.fs.stat(vscode.Uri.joinPath(scratchDir, relativePath))).size > 0);
        } finally {
            await editorConfig.update("pasteAs.preferences", previousPreferences, vscode.ConfigurationTarget.Global);
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("replaces the selected text on a standard paste", async () => {
        const { document, editor, scratchDir } = await openScratchMarkdown();

        try {
            await editor.edit(edit => edit.insert(new vscode.Position(0, 0), "before after"));
            editor.selection = new vscode.Selection(0, 7, 0, 12);
            await vscode.env.clipboard.writeText("inserted");
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            assert.strictEqual(document.getText(), "before inserted");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("pastes text at every cursor in a standard paste", async () => {
        const { document, editor, scratchDir } = await openScratchMarkdown();

        try {
            await editor.edit(edit => edit.insert(new vscode.Position(0, 0), "alpha\nbeta"));
            editor.selections = [new vscode.Selection(0, 5, 0, 5), new vscode.Selection(1, 4, 1, 4)];
            await vscode.env.clipboard.writeText("!");
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            assert.strictEqual(document.getText(), "alpha!\nbeta!");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("undo reverses the result of a standard paste", async () => {
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText("pasted text");
            await pasteAndWait(document, "editor.action.clipboardPasteAction");
            assert.strictEqual(document.getText(), "pasted text");

            await vscode.commands.executeCommand("undo");
            await waitForResult(() => document.getText() === "", "undo reverts pasted text");
            assert.strictEqual(document.getText(), "");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("standard paste converts a URL into a titled Markdown link", async () => {
        const url = `${titleServerBaseUrl}/title`;
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText(url);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");
            await waitForResult(() => document.getText().includes("Example"), "URL title resolves");

            assert.strictEqual(document.getText(), `[Example & Docs \\[2026\\]](<${url}>)`);
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("standard paste keeps a URL unchanged when URL conversion is disabled", async () => {
        const url = `${titleServerBaseUrl}/title`;
        const { document, scratchDir } = await openScratchMarkdown();
        const config = vscode.workspace.getConfiguration("vsc-webp-paster");
        const previousValue = config.get<boolean>("convertUrlToLink", true);

        try {
            await config.update("convertUrlToLink", false, vscode.ConfigurationTarget.Global);
            await vscode.env.clipboard.writeText(url);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            assert.strictEqual(document.getText(), url);
        } finally {
            await config.update("convertUrlToLink", previousValue, vscode.ConfigurationTarget.Global);
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("does not convert a URL pasted into a plaintext document", async () => {
        const url = `${titleServerBaseUrl}/title`;
        const document = await vscode.workspace.openTextDocument({ language: "plaintext", content: "" });
        const editor = await vscode.window.showTextDocument(document);

        try {
            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await vscode.env.clipboard.writeText(url);
            await pasteAndWait(document, "editor.action.clipboardPasteAction");

            assert.strictEqual(document.getText(), url);
        } finally {
            await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        }
    });

    for (const scheme of ["file", "webp-e2e"]) {
        test(`preserves existing images and inserts a unique image link on ${scheme} storage`, async () => {
            const fileSystem = new TestFileSystem();
            const registration = scheme === "file" ? undefined : vscode.workspace.registerFileSystemProvider(
                scheme, fileSystem, { isCaseSensitive: true }
            );
            const baseUri = registration ? vscode.Uri.parse(`${scheme}://remote-host/workspace`) : undefined;
            const { document, scratchDir } = await openScratchMarkdown(baseUri);

            try {
                const imageDir = vscode.Uri.joinPath(scratchDir, "e2e-images");
                await vscode.workspace.fs.createDirectory(imageDir);
                const existingImages = ["e2e-image.webp", "e2e-image-1.webp"];
                for (const name of existingImages) {
                    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(imageDir, name), Buffer.from(name));
                }

                await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
                await pasteAndWait(document, "editor.action.clipboardPasteAction");
                await document.save();

                assert.strictEqual(document.getText(), "![e2e-image-2.webp](e2e-images/e2e-image-2.webp)");
                for (const name of existingImages) {
                    const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, name));
                    assert.strictEqual(Buffer.from(content).toString(), name, "Existing image must not be overwritten");
                }
                const image = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, "e2e-image-2.webp"));
                assert.strictEqual(Buffer.from(image.subarray(8, 12)).toString("ascii"), "WEBP");
            } finally {
                await cleanupScratchDir(scratchDir, document.uri);
                registration?.dispose();
                fileSystem.dispose();
            }
        });
    }
});
