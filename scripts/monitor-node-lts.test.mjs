import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { buildLtsReport } from "./monitor-node-lts.mjs";

const releases = [
    { version: "v26.12.1", lts: false },
    { version: "v22.22.0", lts: "Jod" },
    { version: "v24.9.0", lts: "Krypton" },
    { version: "v24.22.1", lts: "Krypton" },
];
const notified = (version, state = "open") => ({ state, body: `<!-- node-lts-monitor version=${version} -->` });

test("初回はCurrent版を除いた最新LTSを通知する", () => {
    const report = buildLtsReport({ releases, issues: [] });
    assert.equal(report.candidate, "24.22.1");
    assert.equal(report.shouldNotify, true);
});

test("最新LTSのメジャー・マイナー・パッチ更新をすべて通知する", () => {
    for (const version of ["v26.0.0", "v24.23.0", "v24.22.2"]) {
        const report = buildLtsReport({
            releases: [...releases, { version, lts: "New LTS" }],
            issues: [notified("24.22.1")],
        });
        assert.equal(report.candidate, version.slice(1));
        assert.equal(report.shouldNotify, true);
    }
});

test("Current版や旧LTS系列だけの更新では再通知しない", () => {
    const report = buildLtsReport({
        releases: [...releases, { version: "v26.13.0", lts: false }, { version: "v22.23.0", lts: "Jod" }],
        issues: [notified("24.22.1")],
    });
    assert.equal(report.shouldNotify, false);
});

test("開閉済みIssueの通知済みバージョンと、それ以下は再通知しない", () => {
    for (const state of ["open", "closed"]) {
        for (const previous of ["24.22.1", "26.0.0"]) {
            const report = buildLtsReport({ releases, issues: [notified(previous, state), notified("24.9.0")] });
            assert.equal(report.shouldNotify, false);
        }
    }
});

test("他のIssueやPR本文は通知履歴として扱わない", () => {
    const report = buildLtsReport({ releases, issues: [
        { body: "<!-- vscode-api-monitor candidate=99.0.0 -->" },
        { ...notified("99.0.0"), pull_request: {} },
    ] });
    assert.equal(report.shouldNotify, true);
});

test("不正な取得結果やLTS欠落では通知候補を提示しない", () => {
    for (const data of [null, [], {}, [{ version: "v26.0.0", lts: false }],
        [{ version: "v24.0.0-rc.1", lts: "Krypton" }], [{ version: "v24.0.0" }],
        [{ version: "v24.0.0", lts: true }], [{ version: "v24.0.0", lts: "" }]]) {
        assert.throws(() => buildLtsReport({ releases: data, issues: [] }));
    }
});

test("公式データの取得失敗時はIssueを作成せず異常終了する", () => {
    const mockFetch = 'globalThis.fetch = async () => new Response("unavailable", { status: 503 });';
    assert.throws(() => execFileSync(process.execPath, [
        "--import", `data:text/javascript,${encodeURIComponent(mockFetch)}`,
        new URL("./monitor-node-lts.mjs", import.meta.url).pathname,
    ], { env: { ...process.env, GITHUB_REPOSITORY: "hkrhd/vscode-paste-as-webp", GITHUB_STEP_SUMMARY: "" }, stdio: "pipe" }), error => {
        assert.equal(error.status, 1);
        assert.match(error.stderr.toString(), /HTTP 503/u);
        assert.doesNotMatch(error.stdout.toString(), /Issueを作成しました/u);
        return true;
    });
});
