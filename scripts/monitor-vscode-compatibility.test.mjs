import assert from "node:assert/strict";
import test from "node:test";
import { buildCompatibilityReport } from "./monitor-vscode-compatibility.mjs";

// 実際に確認したベースバージョンを含む、通知判断用の取得結果。
const editors = [
    { name: "VS Code", baseVersion: "1.143.1" },
    { name: "Cursor", baseVersion: "1.110.0" },
    { name: "Windsurf", baseVersion: "1.126.0" },
    { name: "Antigravity IDE", baseVersion: "1.107.0" },
];
const versions = ["1.99.0", "1.100.0", "1.106.0", "1.107.0", "1.107.1", "1.108.0", "1.140.0", "1.144.0-next.1"];

test("初回は、全製品で使える公開済みのAPI世代を通知する", () => {
    const report = buildCompatibilityReport({ editors, versions, currentVersion: "1.100.0", issues: [] });
    assert.equal(report.candidate, "1.107.0");
    assert.equal(report.shouldNotify, true);
});

test("一部製品だけの更新と型定義のパッチ更新では通知しない", () => {
    const updated = editors.map(editor => editor.name === "Cursor" ? { ...editor, baseVersion: "1.140.0" } : editor);
    const report = buildCompatibilityReport({ editors: updated, versions, currentVersion: "1.107.0", issues: [] });
    assert.equal(report.candidate, "1.107.0");
    assert.equal(report.shouldNotify, false);
});

test("全製品の最低値が次のAPI世代に進むと通知する", () => {
    const updated = editors.map(editor => editor.name === "Antigravity IDE" ? { ...editor, baseVersion: "1.108.2" } : editor);
    const report = buildCompatibilityReport({ editors: updated, versions, currentVersion: "1.107.0", issues: [] });
    assert.equal(report.candidate, "1.108.0");
    assert.equal(report.shouldNotify, true);
});

test("閉じたIssueの候補と、それ以下の候補を再通知しない", () => {
    for (const candidate of ["1.107.0", "1.108.0"]) {
        const report = buildCompatibilityReport({
            editors, versions, currentVersion: "1.100.0",
            issues: [{ state: "closed", body: `<!-- vscode-api-monitor candidate=${candidate} -->` }],
        });
        assert.equal(report.shouldNotify, false);
    }
});

test("npm未公開のAPI世代は候補にしない", () => {
    const report = buildCompatibilityReport({ editors, versions: versions.filter(version => version !== "1.107.0"), currentVersion: "1.100.0", issues: [] });
    assert.equal(report.candidate, "1.106.0");
});

test("取得失敗・製品欠落・不正なバージョンでは候補を提示しない", () => {
    for (const results of [
        editors.slice(1),
        editors.map(editor => editor.name === "Cursor" ? { name: editor.name, error: "HTTP 503" } : editor),
        editors.map(editor => editor.name === "Cursor" ? { ...editor, baseVersion: "不明" } : editor),
    ]) {
        assert.throws(() => buildCompatibilityReport({ editors: results, versions, currentVersion: "1.100.0", issues: [] }));
    }
});
