import * as assert from "assert";
import { readFile } from "node:fs/promises";
import * as path from "path";
import * as vscode from "vscode";

const EXTENSION_ID = "hkrhd.vsc-webp-paster";
const COMMAND_ID = "vsc-webp-paster.pasteAsWebpInMd";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DIST_ENTRY = path.resolve(REPO_ROOT, "dist/extension.js");
const BASE64_PNG_DATA_URL = [
    "data:image/png;base64,",
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
].join("");

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

async function openScratchMarkdown(): Promise<{
    document: vscode.TextDocument;
    editor: vscode.TextEditor;
    scratchDir: vscode.Uri;
}> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "Workspace folder should be available for E2E tests");

    const scratchDir = vscode.Uri.joinPath(
        workspaceFolder.uri,
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
    await config.update("progressDelay", 0, vscode.ConfigurationTarget.Global);
}

suiteSetup(async () => {
    await configureExtension();

    console.log("Non-builtin extensions visible to the test host:");
    for (const visibleExtension of getNonBuiltinExtensions()) {
        console.log(
            `- ${visibleExtension.id}@${visibleExtension.packageJSON.version} path=${visibleExtension.extensionPath}`
        );
    }
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
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });
});
