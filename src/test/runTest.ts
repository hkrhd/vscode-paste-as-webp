import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");
        const extensionTestsPath = path.resolve(__dirname, "./suite/index.js");

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                path.resolve(extensionDevelopmentPath, "src/test/fixtures/workspace"),
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
