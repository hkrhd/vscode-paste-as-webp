import * as assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";
import { runDesktopTests } from "./desktop";

const NOTICE = "You can now save WebP images with normal paste. Your existing shortcut still works.";

export async function runShortcutMigrationTests(executable: string, baseArgs: string[], root: string): Promise<void> {
    const user = path.join(root, "migration-user");
    const workspace = path.join(root, "migration-workspace");
    const note = path.join(workspace, "note.md");
    await mkdir(path.join(user, "User"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(note, "");
    await writeFile(path.join(user, "User", "keybindings.json"), JSON.stringify([{
        key: process.platform === "darwin" ? "cmd+alt+shift+v" : "ctrl+alt+shift+v",
        command: "vsc-webp-paster.pasteAsWebpInMd",
        when: "editorTextFocus && editorLangId == markdown",
    }]));
    await writeFile(path.join(user, "User", "settings.json"), JSON.stringify({
        "vsc-webp-paster.imageDir": "images",
        "vsc-webp-paster.namingConvention": "image-${seq}",
        "update.mode": "none",
        "extensions.autoUpdate": false,
    }));
    let imageCount = 0;
    for (const restarted of [false, true]) {
        // --extensionTestsPath makes VS Code use in-memory storage. Launch normally
        // so this scenario verifies the real profile survives a full app restart.
        await runDesktopTests(executable, [
            ...baseArgs, "--disable-extensions", "--locale=en",
            `--user-data-dir=${user}`, `--extensions-dir=${path.join(root, "migration-extensions")}`,
            workspace, note,
        ], undefined, async (application, bridge) => {
            const page = await application.firstWindow();
            page.setDefaultTimeout(20000);
            const editor = page.locator('.monaco-editor[data-uri$="/note.md"]');
            await editor.waitFor();
            const modifier = process.platform === "darwin" ? "Meta" : "Control";
            const notifications = () => page.locator(".notification-list-item-message").allTextContents();
            async function assertNoNotice(): Promise<void> {
                const deadline = Date.now() + 500;
                do {
                    assert.ok(!(await notifications()).includes(NOTICE), "Migration notice must not be shown");
                    await page.waitForTimeout(50);
                } while (Date.now() < deadline);
            }
            async function pasteImage(action: "paste" | "legacy-paste"): Promise<void> {
                await editor.locator(".view-lines").click();
                await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
                const capture = await fetch(`${bridge}/capture`);
                assert.ok(capture.ok, await capture.text());
                const paste = await fetch(`${bridge}/${action}`);
                assert.ok(paste.ok, await paste.text());
                imageCount++;
                await page.waitForFunction(({ count }) => {
                    const text = document.querySelector('.monaco-editor[data-uri$="/note.md"] .view-lines')?.textContent ?? "";
                    return (text.match(/\.webp\)/g) ?? []).length === count;
                }, { count: imageCount });
                await page.keyboard.press(`${modifier}+s`);
                await page.waitForFunction(() => !document.querySelector(".tab.active.dirty"));
                const markdown = await readFile(note, "utf8");
                const links = [...markdown.matchAll(/!\[[^\]]+\]\(images\/([^)]+\.webp)\)/g)];
                assert.equal(links.length, imageCount, "Markdown must contain all pasted image links");
                for (const [, name] of links) {
                    const bytes = await readFile(path.join(workspace, "images", name));
                    assert.equal((await sharp(bytes).metadata()).format, "webp");
                }
                assert.equal((await readdir(path.join(workspace, "images"))).length, imageCount);
            }
            if (!restarted) {
                await pasteImage("paste");
                await assertNoNotice();
                console.log("  ✔ Standard paste saves WebP without a migration notice");
            }
            await pasteImage("legacy-paste");
            if (restarted) {
                await assertNoNotice();
                console.log("  ✔ Existing shortcut saves WebP without repeating the notice after app restart");
            } else {
                await page.locator(".notification-list-item-message").filter({ hasText: NOTICE }).waitFor();
                assert.equal((await notifications()).filter(message => message === NOTICE).length, 1);
                console.log("  ✔ Existing shortcut saves WebP and shows the migration notice once");
                await page.keyboard.press("F1");
                await page.locator(".quick-input-widget input").fill(">Notifications: Clear All Notifications");
                await page.keyboard.press("Enter");
                await page.locator(".quick-input-widget").waitFor({ state: "hidden" });
                await page.locator(".notification-list-item-message").filter({ hasText: NOTICE }).waitFor({ state: "hidden" });
            }
            await editor.locator(".view-lines").click();
            await application.evaluate(({ clipboard }) => clipboard.writeText("existing shortcut still works"));
            await page.keyboard.press(`${modifier}+Alt+Shift+v`);
            await editor.locator(".view-lines").filter({ hasText: "existing shortcut still works" }).waitFor();
            await assertNoNotice();
            await page.keyboard.press(`${modifier}+s`);
            console.log(`  ✔ Repeated shortcut use pastes text without another notice${restarted ? " after restart" : ""}`);
        });
    }
}
