import { _electron as electron, ElectronApplication } from "playwright";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { SshFixture } from "./ssh/podman";

// The bridge operates only the isolated test window and its OS clipboard.
export async function runDesktopTests(executablePath: string, args: string[], fixture?: SshFixture): Promise<void> {
    let application: ElectronApplication | undefined;
    const secret = randomUUID();
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? "/", "http://localhost");
            if (!url.pathname.startsWith(`/${secret}/`) || !application) {
                response.writeHead(403).end();
                return;
            }
            const action = url.pathname.slice(secret.length + 2);
            if (action === "capture") {
                const png = await application.evaluate(async ({ BrowserWindow, clipboard }) => {
                    const window = BrowserWindow.getAllWindows().find((win: { isVisible(): boolean; isDestroyed(): boolean }) => win.isVisible() && !win.isDestroyed());
                    if (!window) {
                        throw new Error("No visible test window");
                    }
                    const image = await window.webContents.capturePage();
                    clipboard.clear();
                    clipboard.writeImage(image);
                    return image.toPNG().toString("base64");
                });
                response.end(JSON.stringify({ png }));
            } else if (action === "paste") {
                const page = await application.firstWindow();
                await page.bringToFront();
                await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v");
                response.end("{}");
            } else if (action === "read" && fixture) {
                const bytes = await fixture.readFile(url.searchParams.get("path") ?? "");
                response.end(JSON.stringify({ bytes: bytes.toString("base64") }));
            } else {
                response.writeHead(404).end();
            }
        } catch (error) {
            response.writeHead(500).end(String(error));
        }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const bridge = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${secret}`;
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    delete env.ELECTRON_RUN_AS_NODE;
    try {
        application = await electron.launch({
            executablePath, args,
            env: { ...env, VSC_WEBP_TEST_BRIDGE: bridge, VSC_WEBP_CLIENT_PLATFORM: process.platform },
            timeout: 120000,
        });
        const child = application.process();
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
        await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(() => reject(new Error("VS Code test run exceeded 10 minutes")), 600000);
            child.once("exit", code => {
                clearTimeout(deadline);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`VS Code tests exited with ${code}`));
                }
            });
            if (child.exitCode !== null) {
                clearTimeout(deadline);
                reject(new Error(`VS Code exited before the test harness attached: ${child.exitCode}`));
            }
        });
    } finally {
        await application?.close().catch(() => {});
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}
