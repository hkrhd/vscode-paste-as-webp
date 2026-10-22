import { execFile as execFileCallback, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const sources = {
    vscode: "https://update.code.visualstudio.com/api/update/linux-x64/stable/latest",
    cursor: "https://cursor.com/download",
    windsurf: "https://windsurf-stable.codeium.com/api/update/linux-x64/stable/latest",
    antigravity: "https://antigravity.google/download",
};
const editorNames = ["VS Code", "Cursor", "Windsurf", "Antigravity IDE"];
const markerPattern = /<!-- vscode-api-monitor candidate=(\d+\.\d+\.0) -->/u;
const commandOptions = { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };

function compareVersions(a, b) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
}

function requireVersion(value, context) {
    if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) {
        throw new Error(`${context}: 安定版のバージョンを取得できませんでした。`);
    }
    return value;
}

/** 取得結果と通知履歴から、利用者に提示する更新候補を決める。 */
export function buildCompatibilityReport({ editors, versions, currentVersion, issues }) {
    requireVersion(currentVersion, "現在の設定");
    if (editors.length !== editorNames.length || editorNames.some(name => editors.filter(editor => editor.name === name).length !== 1)) {
        throw new Error("4製品すべての取得結果が必要です。");
    }
    for (const editor of editors) {
        if (editor.error) throw new Error(`${editor.name}: ${editor.error}`);
        requireVersion(editor.baseVersion, editor.name);
    }
    const minimum = editors.map(editor => editor.baseVersion).sort(compareVersions)[0];
    const candidate = versions.filter(version => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/u.test(version))
        .filter(version => compareVersions(version, minimum) <= 0).sort(compareVersions).at(-1);
    if (!candidate) throw new Error("全製品に対応する公開済みの @types/vscode が見つかりません。");

    const previous = issues.filter(issue => !issue.pull_request)
        .map(issue => markerPattern.exec(issue.body ?? "")?.[1]).filter(Boolean)
        .sort(compareVersions).at(-1);
    const shouldNotify = compareVersions(candidate, currentVersion) > 0 &&
        (!previous || compareVersions(candidate, previous) > 0);
    return { minimum, candidate, previous, shouldNotify };
}

async function fetchDocument(url, format) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: format === "json" ? "application/json" : "text/html" },
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return format === "json" ? response.json() : response.text();
}

async function download(url, destination) {
    const signal = AbortSignal.timeout(8 * 60_000);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination), { signal });
    return response.url;
}

async function readArchiveMetadata(archivePath, deb, directory) {
    let tarPath = archivePath;
    if (deb) {
        const { stdout } = await execFile("ar", ["t", archivePath], commandOptions);
        const members = stdout.trim().split(/\r?\n/u).filter(name => /^data\.tar\.(?:xz|gz|zst)$/u.test(name));
        if (members.length !== 1) throw new Error("deb内のデータアーカイブを特定できません。");
        tarPath = join(directory, members[0]);
        const child = spawn("ar", ["p", archivePath, members[0]], { timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr.setEncoding("utf8").on("data", data => { stderr += data; });
        const completed = new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("close", code => code === 0 ? resolve() : reject(new Error(`ar: ${stderr || code}`)));
        });
        await Promise.all([pipeline(child.stdout, createWriteStream(tarPath)), completed]);
    }
    const { stdout: listing } = await execFile("tar", ["-tf", tarPath], commandOptions);
    const paths = listing.split(/\r?\n/u).filter(path => path.endsWith("/resources/app/package.json"));
    if (paths.length !== 1) throw new Error("配布物内のVS Codeメタデータを特定できません。");
    const { stdout } = await execFile("tar", ["-xOf", tarPath, paths[0]], commandOptions);
    return JSON.parse(stdout);
}

async function collectEditors(directory) {
    const tasks = [
        async () => {
            const data = await fetchDocument(sources.vscode, "json");
            return { name: "VS Code", baseVersion: requireVersion(data.productVersion, "VS Code"), productVersion: data.productVersion, source: sources.vscode };
        },
        async () => {
            const html = await fetchDocument(sources.cursor, "html");
            const links = [...html.matchAll(/href="(https:\/\/api2\.cursor\.sh\/updates\/download\/golden\/linux-x64-deb\/cursor\/\d+\.\d+(?:\.\d+)?)"/gu)]
                .map(match => match[1]);
            if (!links.length) throw new Error("公式ページにLinux x64安定版debのリンクがありません。");
            const archive = join(directory, "cursor.deb");
            const resolvedUrl = await download(links[0], archive);
            const data = await readArchiveMetadata(archive, true, directory);
            const productVersion = /\/cursor_(\d+\.\d+\.\d+)_amd64\.deb$/u.exec(new URL(resolvedUrl).pathname)?.[1];
            return { name: "Cursor", baseVersion: requireVersion(data.version, "Cursor"), productVersion: requireVersion(productVersion, "Cursor製品版"), source: resolvedUrl };
        },
        async () => {
            const data = await fetchDocument(sources.windsurf, "json");
            return { name: "Windsurf", baseVersion: requireVersion(data.productVersion, "Windsurf"), productVersion: requireVersion(data.windsurfVersion, "Windsurf製品版"), source: sources.windsurf };
        },
        async () => {
            const html = await fetchDocument(sources.antigravity, "html");
            const links = [...new Set([...html.matchAll(/href="(https:\/\/edgedl\.me\.gvt1\.com\/edgedl\/release2\/[^"\s]+\/antigravity\/stable\/[^"\s]+\/linux-x64\/Antigravity%20IDE\.tar\.gz)"/gu)].map(match => match[1]))];
            if (links.length !== 1) throw new Error("Antigravity IDEのLinux x64安定版を一意に特定できません。");
            const archive = join(directory, "antigravity.tar.gz");
            const resolvedUrl = await download(links[0], archive);
            const data = await readArchiveMetadata(archive, false, directory);
            if (data.name !== "Antigravity IDE") throw new Error("配布物がAntigravity IDEではありません。");
            const productVersion = /\/stable\/(\d+\.\d+\.\d+)-/u.exec(links[0])?.[1];
            return { name: "Antigravity IDE", baseVersion: requireVersion(data.version, "Antigravity IDE"), productVersion: requireVersion(productVersion, "Antigravity IDE製品版"), source: resolvedUrl };
        },
    ];
    const results = await Promise.allSettled(tasks.map(async (task, index) => {
        console.log(`${editorNames[index]}: 公式安定版を確認しています。`);
        const editor = await task();
        console.log(`${editor.name}: 製品 ${editor.productVersion} / VS Code ${editor.baseVersion}`);
        return editor;
    }));
    return results.map((result, index) => result.status === "fulfilled" ? result.value : { name: editorNames[index], error: result.reason.message });
}

function editorTable(editors) {
    return ["| Editor | Product version | VS Code base | Source |", "| --- | --- | --- | --- |",
        ...editors.map(editor => `| ${editor.name} | ${editor.productVersion ?? "—"} | ${editor.baseVersion ?? "取得失敗"} | ${editor.source ? `[配布元](${editor.source})` : "—"} |`)].join("\n");
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--dry-run")) throw new Error("指定できる引数は --dry-run のみです。");
    const dryRun = args.includes("--dry-run");
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const currentVersion = packageJson.devDependencies["@types/vscode"];
    const engineVersion = packageJson.engines.vscode.replace(/^[~^]/u, "");
    // 既存チェックと同じ基準で、監視単体の実行時も不整合を検出する。
    if (currentVersion !== engineVersion) throw new Error("engines.vscode と @types/vscode が一致しません。");
    requireVersion(currentVersion, "現在の設定");
    const repository = process.env.GITHUB_REPOSITORY ?? /^https:\/\/github\.com\/(.+)\.git$/u.exec(packageJson.repository.url)?.[1];
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "")) throw new Error("対象のGitHubリポジトリを特定できません。");
    const directory = await mkdtemp(join(tmpdir(), "vscode-api-monitor-"));
    let summary = `## VS Code API互換性の監視\n\n確認日時: ${new Date().toISOString()}\n\n実行: ${dryRun ? "dry-run" : "通知有効"}\n\n`;
    try {
        const editors = await collectEditors(directory);
        summary += `${editorTable(editors)}\n\n`;
        const failed = editors.filter(editor => editor.error);
        if (failed.length) throw new Error(failed.map(editor => `${editor.name}: ${editor.error}`).join("\n"));
        const registry = await fetchDocument("https://registry.npmjs.org/@types%2Fvscode", "json");
        if (!registry.versions || typeof registry.versions !== "object") throw new Error("npmの公開バージョン一覧が不正です。");
        const { stdout } = await execFile("gh", ["api", "--paginate", "--slurp", `repos/${repository}/issues?state=all&per_page=100`], commandOptions);
        const issues = JSON.parse(stdout).flat();
        const report = buildCompatibilityReport({ editors, versions: Object.keys(registry.versions), currentVersion, issues });
        summary += `現在の設定: ${currentVersion}\n\n全製品の最低値: ${report.minimum}\n\n公開済みの更新候補: ${report.candidate}\n\n通知済みの最大候補: ${report.previous ?? "なし"}\n\n`;
        if (report.shouldNotify) {
            const runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
            const body = [`<!-- vscode-api-monitor candidate=${report.candidate} -->`, "", "@hkrhd", "",
                `4製品の最新安定版で、VS Code API ${report.candidate} への引き上げを検討できます。`, "",
                `現在: \`engines.vscode: ${packageJson.engines.vscode}\` / \`@types/vscode: ${currentVersion}\``, "",
                `候補: \`engines.vscode: ^${report.candidate}\` / \`@types/vscode: ${report.candidate}\``, "",
                editorTable(editors), "", `確認日時: ${new Date().toISOString()}`,
                ...(runUrl ? ["", `[Actionsの実行結果](${runUrl})`] : []), "",
                "Linux x64の公式安定版を基準にした更新候補です。設定の引き上げ前に拡張の動作を確認してください。", "",
                "設定・依存関係の自動更新は行っていません。"].join("\n");
            if (dryRun) {
                summary += "判定: Issueを作成する候補があります（dry-runのため作成しません）。\n\n";
                console.log(`作成予定のIssue本文:\n${body}`);
            } else {
                const bodyPath = join(directory, "issue.md");
                await writeFile(bodyPath, body, "utf8");
                const { stdout: issueUrl } = await execFile("gh", ["issue", "create", "--repo", repository, "--title", `VS Code API ${report.candidate} への引き上げ候補`, "--body-file", bodyPath], commandOptions);
                summary += `判定: Issueを作成しました。${issueUrl.trim()}\n`;
            }
        } else {
            summary += "判定: 新しい通知対象はありません。\n";
        }
    } catch (error) {
        summary += `監視失敗: ${error.message}\n\nIssueは作成しません。\n`;
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
