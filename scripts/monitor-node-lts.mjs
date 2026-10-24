import { execFile as execFileCallback } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const source = "https://nodejs.org/dist/index.json";
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const markerPattern = /<!-- node-lts-monitor version=(\d+\.\d+\.\d+) -->/u;
const commandOptions = { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };

function compareVersions(a, b) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
}

/** 最新LTSと通知履歴から、新しく検討するバージョンを決める。 */
export function buildLtsReport({ releases, issues }) {
    if (!Array.isArray(releases) || !releases.length) throw new Error("Node.jsのリリース一覧が不正です。");
    for (const release of releases) {
        if (!release || typeof release.version !== "string" || !release.version.startsWith("v") ||
            !versionPattern.test(release.version.slice(1)) ||
            !(release.lts === false || (typeof release.lts === "string" && release.lts.trim()))) {
            throw new Error("Node.jsのリリース情報が不正です。");
        }
    }
    const candidate = releases.filter(release => release.lts !== false)
        .map(release => release.version.slice(1)).sort(compareVersions).at(-1);
    if (!candidate) throw new Error("LTSリリースが見つかりません。");
    const previous = issues.filter(issue => !issue.pull_request)
        .map(issue => markerPattern.exec(issue.body ?? "")?.[1]).filter(Boolean)
        .sort(compareVersions).at(-1);
    return { candidate, previous, shouldNotify: !previous || compareVersions(candidate, previous) > 0 };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--dry-run")) throw new Error("指定できる引数は --dry-run のみです。");
    const dryRun = args.includes("--dry-run");
    const repository = process.env.GITHUB_REPOSITORY;
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "")) throw new Error("GITHUB_REPOSITORYを指定してください。");
    let summary = `## Node.js LTSの監視\n\n実行: ${dryRun ? "dry-run" : "通知有効"}\n\n`;
    const directory = await mkdtemp(join(tmpdir(), "node-lts-monitor-"));
    try {
        const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
        const nodeVersion = (await readFile(new URL("../.nvmrc", import.meta.url), "utf8")).trim();
        const response = await fetch(source, {
            signal: AbortSignal.timeout(30_000),
            headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
        const releases = await response.json();
        const { stdout } = await execFile("gh", ["api", "--paginate", "--slurp", `repos/${repository}/issues?state=all&per_page=100`], commandOptions);
        const report = buildLtsReport({ releases, issues: JSON.parse(stdout).flat() });
        summary += `最新LTS: ${report.candidate}\n\n通知済み: ${report.previous ?? "なし"}\n\n`;
        if (report.shouldNotify) {
            const body = [
                `<!-- node-lts-monitor version=${report.candidate} -->`, "",
                `最新LTS: **${report.candidate}**（[リリースノート](https://nodejs.org/en/blog/release/v${report.candidate})）`, "",
                `現在: \`.nvmrc: ${nodeVersion}\` / \`@types/node: ${packageJson.devDependencies["@types/node"]}\``, "",
                "@hkrhd 開発・CIのNode更新と、対応VS Codeに合う型定義を確認する。",
            ].join("\n");
            if (dryRun) {
                console.log(`作成予定のIssue:\nNode.js LTS ${report.candidate} への更新を検討\n\n${body}`);
                summary += "判定: 更新検討が必要です（dry-runのためIssueを作成しません）。\n";
            } else {
                const bodyPath = join(directory, "issue.md");
                await writeFile(bodyPath, body, "utf8");
                const { stdout: issueUrl } = await execFile("gh", ["issue", "create", "--repo", repository,
                    "--title", `Node.js LTS ${report.candidate} への更新を検討`,
                    "--body-file", bodyPath, "--label", "自動チェック"], commandOptions);
                summary += `判定: Issueを作成しました。${issueUrl.trim()}\n`;
            }
        } else {
            summary += "判定: 新しい通知対象はありません。\n";
        }
    } catch (error) {
        summary += `監視失敗: ${error.message}\n`;
        throw error;
    } finally {
        console.log(summary);
        await rm(directory, { recursive: true, force: true });
        if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
