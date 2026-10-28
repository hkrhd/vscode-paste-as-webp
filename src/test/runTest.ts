import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import { runDesktopTests } from "./desktop";
import { startSshFixture } from "./ssh/podman";
import { runShortcutMigrationTests } from "./migration";

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const root = await mkdtemp(path.join(tmpdir(), "webp-paste-tests-"));
    try {
        const executable = await downloadAndUnzipVSCode({ version: process.env.VSCODE_TEST_VERSION ?? "stable" });
        const baseArgs = [
            "--no-sandbox", "--disable-gpu-sandbox", "--disable-updates", "--skip-welcome", "--skip-release-notes",
            "--disable-workspace-trust", `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
            "--extensionDevelopmentKind=ui",
        ];
        await runDesktopTests(executable, [
            ...baseArgs, "--disable-extensions",
            `--user-data-dir=${path.join(root, "local-user")}`,
            `--extensions-dir=${path.join(root, "local-extensions")}`,
            `--extensionTestsPath=${path.resolve(__dirname, "suite/index.js")}`,
            path.resolve(extensionDevelopmentPath, "src/test/fixtures/workspace"),
        ]);
        await runShortcutMigrationTests(executable, baseArgs, root);
        const fixture = await startSshFixture();
        try {
            const user = path.join(root, "ssh-user");
            const extensions = path.join(root, "ssh-extensions");
            await mkdir(path.join(user, "User"), { recursive: true });
            await writeFile(path.join(user, "User", "settings.json"), JSON.stringify({
                "remote.SSH.configFile": fixture.sshConfigPath,
                "remote.SSH.showLoginTerminal": false,
                "remote.SSH.useLocalServer": false,
                "remote.SSH.remotePlatform": { [new URL(fixture.folderUri).hostname.split("+")[1]]: "linux" },
                "remote.SSH.defaultExtensions": [],
                "security.workspace.trust.enabled": false,
                "update.mode": "none",
                "extensions.autoUpdate": false,
            }));
            const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
            execFileSync(cli, [...cliArgs,
                `--user-data-dir=${user}`, `--extensions-dir=${extensions}`,
                "--install-extension", "ms-vscode-remote.remote-ssh", "--force"
            ], { stdio: "inherit", timeout: 180000 });
            await runDesktopTests(executable, [
                ...baseArgs,
                `--user-data-dir=${user}`, `--extensions-dir=${extensions}`,
                `--extensionTestsPath=${path.resolve(__dirname, "ssh/index.js")}`,
                `--folder-uri=${fixture.folderUri}`,
            ], fixture);
        } finally {
            await fixture.dispose();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
