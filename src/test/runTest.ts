import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");
        const extensionTestsPath = path.resolve(__dirname, "./suite/index.js");
        const userDataDir = mkdtempSync(path.join(tmpdir(), "vsc-webp-paster-test-user-data-"));
        const extensionsDir = mkdtempSync(path.join(tmpdir(), "vsc-webp-paster-test-extensions-"));

        await runTests({
            version: process.env.VSCODE_TEST_VERSION ?? "stable",
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                path.resolve(extensionDevelopmentPath, "src/test/fixtures/workspace"),
                `--user-data-dir=${userDataDir}`,
                `--extensions-dir=${extensionsDir}`,
                "--profile-temp",
                "--disable-extensions",
            ],
        });
    } catch (error) {
        console.error("Failed to run extension tests");
        console.error(error);
        process.exit(1);
    }
}

void main();
