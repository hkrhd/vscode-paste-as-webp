import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspacePath = resolve(workspaceRoot, "src/test/fixtures/workspace");
const userDataDir = mkdtempSync(join(tmpdir(), "vsc-webp-paster-user-data-"));
const extensionsDir = mkdtempSync(join(tmpdir(), "vsc-webp-paster-extensions-"));
const extensionTestsPath = process.argv[2]
    ? resolve(workspaceRoot, process.argv[2])
    : resolve(workspaceRoot, "out/test/suite/index.js");

const args = [
    "--new-window",
    "--wait",
    "--disable-extensions",
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    `--extensionDevelopmentPath=${workspaceRoot}`,
    `--extensionTestsPath=${extensionTestsPath}`,
    workspacePath,
];

console.log("Launching VS Code CLI extension tests");
console.log(`Workspace: ${workspacePath}`);
console.log(`User data dir: ${userDataDir}`);
console.log(`Extensions dir: ${extensionsDir}`);
console.log(`Extension tests path: ${extensionTestsPath}`);

const child = spawn("code", args, {
    cwd: workspaceRoot,
    stdio: "inherit",
});

child.on("error", (error) => {
    console.error("Failed to launch VS Code CLI for extension tests.");
    console.error(error);
    process.exit(1);
});

child.on("exit", (code, signal) => {
    if (signal) {
        console.error(`VS Code CLI test run was terminated by signal: ${signal}`);
        process.exit(1);
    }

    process.exit(code ?? 1);
});
