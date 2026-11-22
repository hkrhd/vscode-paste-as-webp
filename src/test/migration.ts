import * as assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { runDesktopTests } from "./desktop";

const PASTE_KEY = process.platform === "darwin" ? "Cmd+V" : "Ctrl+V";
const NOTICE = `“Paste as WebP in MD” was retired due to a VS Code change. Press ${PASTE_KEY} to paste images as WebP, and remove the shortcut assigned to this command.`;

export async function runShortcutMigrationTests(executable: string, baseArgs: string[], root: string): Promise<void> {
    const user = path.join(root, "migration-user");
    const workspace = path.join(root, "migration-workspace");
    const note = path.join(workspace, "note.md");
    await mkdir(path.join(user, "User"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(note, "");
    await writeFile(path.join(user, "User", "keybindings.json"), JSON.stringify([{
        key: process.platform === "darwin" ? "cmd+v" : "ctrl+v",
        command: "vsc-webp-paster.pasteAsWebpInMd",
        when: "editorTextFocus && editorLangId == markdown",
    }]));
    await writeFile(path.join(user, "User", "settings.json"), JSON.stringify({
        "update.mode": "none",
        "extensions.autoUpdate": false,
    }));
    await runDesktopTests(executable, [
        ...baseArgs, "--locale=en",
        `--user-data-dir=${user}`, `--extensions-dir=${path.join(root, "migration-extensions")}`,
        workspace, note,
    ], undefined, async (application, bridge) => {
        const page = await application.firstWindow();
        page.setDefaultTimeout(20000);
        const editor = page.locator('.monaco-editor[data-uri$="/note.md"]');
        await editor.waitFor();
        await page.locator('[id="status.editor.mode"]').filter({ hasText: "Markdown" }).waitFor();
        await editor.locator(".view-lines").click();
        const capture = await fetch(`${bridge}/capture`);
        assert.ok(capture.ok, await capture.text());
        const paste = await fetch(`${bridge}/paste`);
        assert.ok(paste.ok, await paste.text());

        const notice = page.locator(".notification-list-item").filter({ hasText: NOTICE });
        await notice.waitFor();
        assert.equal((await editor.locator(".view-lines").textContent())?.trim(), "", "The retired command must not paste");
        console.log("  ✔ Existing shortcut explains the retired command");

        await notice.getByRole("button", { name: "Open Shortcut" }).click();
        const rows = page.locator(".keybindings-editor .monaco-list-row");
        await rows.filter({ hasText: "Paste as WebP in MD" }).waitFor();
        assert.equal(await rows.count(), 1, "Keyboard Shortcuts must show only the retired command");
        console.log("  ✔ Notice button opens the shortcut to remove");
    });
}
