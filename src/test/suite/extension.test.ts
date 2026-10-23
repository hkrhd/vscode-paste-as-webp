import * as assert from "assert";
import { readFile } from "node:fs/promises";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import * as path from "path";
import * as vscode from "vscode";
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
        await vscode.commands.executeCommand(COMMAND_ID);
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

    test("keeps extensionDevelopmentPath pointed at the extension root", async () => {
        const launchConfigText = await readFile(path.resolve(REPO_ROOT, ".vscode/launch.json"), "utf8");
        const launchConfig = JSON.parse(launchConfigText) as {
            configurations?: Array<{ name?: string; args?: string[] }>;
        };
        const runExtensionConfig = launchConfig.configurations?.find(
            (configuration) => configuration.name === "Run Extension"
        );
        const runTestsConfig = launchConfig.configurations?.find(
            (configuration) => configuration.name === "Run Extension Tests"
        );

        assert.ok(runExtensionConfig, "Run Extension config should exist");
        assert.ok(runExtensionConfig.args?.includes("--extensionDevelopmentPath=${workspaceFolder}"));
        assert.ok(runTestsConfig, "Run Extension Tests config should exist");
        assert.ok(runTestsConfig.args?.includes("--extensionDevelopmentPath=${workspaceFolder}"));

        const cliRunner = await readFile(path.resolve(REPO_ROOT, "scripts/run-code-tests.mjs"), "utf8");
        assert.ok(cliRunner.includes("`--extensionDevelopmentPath=${workspaceRoot}`"));

        const electronRunner = await readFile(path.resolve(REPO_ROOT, "src/test/runTest.ts"), "utf8");
        assert.ok(electronRunner.includes('const extensionDevelopmentPath = path.resolve(__dirname, "../../");'));

        const perfRunner = await readFile(path.resolve(REPO_ROOT, "src/test/runPerfTest.ts"), "utf8");
        assert.ok(perfRunner.includes('const extensionDevelopmentPath = path.resolve(__dirname, "../../");'));
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
            await vscode.commands.executeCommand(COMMAND_ID);
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
            await vscode.commands.executeCommand(COMMAND_ID);
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
                if (registration) {
                    fileSystem.statError = {
                        uri: vscode.Uri.joinPath(imageDir, existingImages[0]),
                        error: vscode.FileSystemError.NoPermissions(imageDir),
                    };
                    await vscode.commands.executeCommand(COMMAND_ID);
                    fileSystem.statError = undefined;
                    assert.strictEqual(document.getText(), "", "A failed existence check must stop the paste");
                    assert.strictEqual((await vscode.workspace.fs.readDirectory(imageDir)).length, 2);
                }
                await vscode.commands.executeCommand(COMMAND_ID);
                await document.save();

                assert.strictEqual(document.getText(), "![e2e-image-2.webp](e2e-images/e2e-image-2.webp)");
                for (const name of existingImages) {
                    const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, name));
                    assert.strictEqual(Buffer.from(content).toString(), name, "Existing image must not be overwritten");
                }
                const image = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(imageDir, "e2e-image-2.webp"));
                assert.strictEqual(Buffer.from(image.subarray(8, 12)).toString("ascii"), "WEBP");
            } finally {
                fileSystem.statError = undefined;
                await cleanupScratchDir(scratchDir, document.uri);
                registration?.dispose();
                fileSystem.dispose();
            }
        });
    }
});
