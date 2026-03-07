import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

const EXTENSION_ID = "hkrhd.vsc-webp-paster";
const COMMAND_ID = "vsc-webp-paster.pasteAsWebpInMd";
const BASE64_PNG_DATA_URL = [
    "data:image/png;base64,",
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
].join("");

interface PerfMetric {
    scenario: "activate-cold" | "paste-plain-text" | "paste-base64-image";
    durationMs: number;
    rssBeforeBytes: number;
    rssAfterBytes: number;
    rssDeltaBytes: number;
    heapUsedBeforeBytes: number;
    heapUsedAfterBytes: number;
    heapUsedDeltaBytes: number;
}

function emitMetric(metric: PerfMetric): void {
    console.log(`[perf] ${JSON.stringify(metric)}`);
}

function captureMemory(): { rssBytes: number; heapUsedBytes: number } {
    const usage = process.memoryUsage();

    return {
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
    };
}

async function measureScenario<T>(scenario: PerfMetric["scenario"], task: () => Promise<T>): Promise<T> {
    const before = captureMemory();
    const startedAt = performance.now();
    const result = await task();
    const after = captureMemory();

    emitMetric({
        scenario,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        rssBeforeBytes: before.rssBytes,
        rssAfterBytes: after.rssBytes,
        rssDeltaBytes: after.rssBytes - before.rssBytes,
        heapUsedBeforeBytes: before.heapUsedBytes,
        heapUsedAfterBytes: after.heapUsedBytes,
        heapUsedDeltaBytes: after.heapUsedBytes - before.heapUsedBytes,
    });

    return result;
}

async function openScratchMarkdown(): Promise<{
    document: vscode.TextDocument;
    scratchDir: vscode.Uri;
}> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "Workspace folder should be available for perf tests");

    const scratchDir = vscode.Uri.joinPath(
        workspaceFolder.uri,
        ".tmp-perf",
        `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await vscode.workspace.fs.createDirectory(scratchDir);

    const markdownUri = vscode.Uri.joinPath(scratchDir, "note.md");
    await vscode.workspace.fs.writeFile(markdownUri, Buffer.from("", "utf8"));

    const document = await vscode.workspace.openTextDocument(markdownUri);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    return { document, scratchDir };
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
    await config.update("imageDir", "perf-images", vscode.ConfigurationTarget.Global);
    await config.update("namingConvention", "perf-image", vscode.ConfigurationTarget.Global);
    await config.update("insertPattern", "![${fileName}](${relativePath})", vscode.ConfigurationTarget.Global);
    await config.update("useWorkspaceRoot", false, vscode.ConfigurationTarget.Global);
    await config.update("progressDelay", 0, vscode.ConfigurationTarget.Global);
    await config.update("convertUrlToLink", false, vscode.ConfigurationTarget.Global);
}

suiteSetup(async () => {
    await configureExtension();
});

suite("Performance Test Suite", () => {
    test("measures cold activation duration and memory delta", async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, "Extension should be discoverable by VS Code");
        assert.strictEqual(extension!.isActive, false, "Extension should start inactive for cold activation measurement");

        await measureScenario("activate-cold", async () => {
            await extension!.activate();
        });

        assert.strictEqual(extension!.isActive, true);
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(COMMAND_ID));
    });

    test("measures plain text paste duration and memory delta", async () => {
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText("plain clipboard text");
            await measureScenario("paste-plain-text", async () => {
                await vscode.commands.executeCommand(COMMAND_ID);
                await document.save();
            });

            assert.strictEqual(document.getText(), "plain clipboard text");
        } finally {
            await cleanupScratchDir(scratchDir, document.uri);
        }
    });

    test("measures base64 image paste duration and memory delta", async () => {
        const { document, scratchDir } = await openScratchMarkdown();

        try {
            await vscode.env.clipboard.writeText(BASE64_PNG_DATA_URL);
            await measureScenario("paste-base64-image", async () => {
                await vscode.commands.executeCommand(COMMAND_ID);
                await document.save();
            });

            const markdown = document.getText();
            assert.match(
                markdown,
                /^!\[perf-image(?:-\d+)?\.webp\]\(perf-images\/perf-image(?:-\d+)?\.webp\)$/
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
