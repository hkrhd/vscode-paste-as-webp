import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const versionIndex = args.indexOf("--version");
const version = args[versionIndex + 1];
const dryRun = args.includes("--dry-run");
const validArgs = args.length === (dryRun ? 3 : 2) && versionIndex !== -1;
if (!validArgs || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version ?? "")) {
    console.error("使い方: npm run publish:pre-release -- --version MAJOR.MINOR.PATCH [--dry-run]");
    process.exit(1);
}

const current = manifest.version.split(".").map(BigInt);
const next = version.split(".").map(BigInt);
const firstDifference = next.findIndex((part, index) => part !== current[index]);
if (firstDifference === -1 || next[firstDifference] < current[firstDifference]) {
    console.error(`プレリリースのバージョンは ${manifest.version} より大きくしてください。`);
    process.exit(1);
}

const target = `${process.platform}-${process.arch}`;
if (!["darwin-arm64", "win32-x64", "linux-x64", "linux-arm64"].includes(target)) {
    console.error(`未対応の実行環境です: ${target}`);
    process.exit(1);
}

const outputDir = join(root, "dist", "pre-release");
mkdirSync(outputDir, { recursive: true });
const vsix = join(outputDir, `${manifest.name}-${version}-${target}.vsix`);
const vsce = join(root, "node_modules", "@vscode", "vsce", "vsce");
const run = (commandArgs) => {
    const result = spawnSync(process.execPath, [vsce, ...commandArgs], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["package", version, "--no-update-package-json", "--pre-release", "--target", target, "--out", vsix, "--no-yarn"]);
if (dryRun) {
    console.log(`公開せずにVSIXを作成しました: ${vsix}`);
} else {
    run(["publish", "--packagePath", vsix, "--pre-release"]);
}
