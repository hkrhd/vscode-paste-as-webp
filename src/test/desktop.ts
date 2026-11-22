import { _electron as electron, ElectronApplication } from "playwright";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { SshFixture } from "./ssh/podman";

// Decoding with sharp inside Electron's Linux extension host can segfault
// (https://sharp.pixelplumbing.com/install#electron-and-linux), so image
// assertions run in this Node.js process instead.
async function meanPixelDifference(expected: Buffer, actual: Buffer): Promise<{ format?: string; width: number; height: number; expectedWidth: number; expectedHeight: number; difference: number }> {
    const decode = (image: Buffer) => sharp(image).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const [original, decoded] = await Promise.all([decode(expected), decode(actual)]);
    let difference = 0;
    for (let i = 0; i < Math.min(original.data.length, decoded.data.length); i++) {
        difference += Math.abs(decoded.data[i] - original.data[i]);
    }
    return {
        format: (await sharp(actual).metadata()).format,
        width: decoded.info.width, height: decoded.info.height,
        expectedWidth: original.info.width, expectedHeight: original.info.height,
        difference: difference / decoded.data.length,
    };
}

// The bridge operates only the isolated test window and its OS clipboard.
export async function runDesktopTests(executablePath: string, args: string[], fixture?: SshFixture, scenario?: (application: ElectronApplication, bridge: string) => Promise<void>): Promise<void> {
    let application: ElectronApplication | undefined;
    let launchedProcess: ReturnType<ElectronApplication["process"]> | undefined;
    const secret = randomUUID();
    let capturedPng: Buffer | undefined;
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
                capturedPng = Buffer.from(png, "base64");
                response.end("{}");
            } else if (action === "paste") {
                const page = await application.firstWindow();
                await page.bringToFront();
                await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v");
                response.end("{}");
            } else if (action === "notifications") {
                const page = await application.firstWindow();
                response.end(JSON.stringify({ notifications: await page.locator(".notification-list-item-message").allTextContents() }));
            } else if (action === "compare" && fixture && capturedPng) {
                const saved = await fixture.readFile(url.searchParams.get("path") ?? "");
                response.end(JSON.stringify(await meanPixelDifference(capturedPng, saved)));
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
        launchedProcess = child;
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
        if (scenario) {
            try {
                await scenario(application, bridge);
            } catch (error) {
                console.error("Desktop scenario failed:", error);
                throw error;
            }
            return;
        }
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
        try {
            if (application && launchedProcess) {
                let closeTimedOut = false;
                const running = launchedProcess;
                const deadline = setTimeout(() => {
                    closeTimedOut = true;
                    running.kill("SIGKILL");
                }, 30000);
                try {
                    await application.close().catch(() => {});
                } finally {
                    clearTimeout(deadline);
                }
                if (closeTimedOut) {
                    throw new Error("VS Code test window did not close within 30 seconds");
                }
            }
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    }
}
