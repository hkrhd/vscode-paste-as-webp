import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestedUrl = process.argv[2] ?? "https://example.com/";

let liveUrl;
try {
    liveUrl = new URL(requestedUrl);
} catch {
    throw new Error(`Invalid live test URL: ${requestedUrl}`);
}

if (liveUrl.protocol !== "http:" && liveUrl.protocol !== "https:") {
    throw new Error(`Live test URL must use HTTP or HTTPS: ${requestedUrl}`);
}

console.log(`Running one live URL E2E request against ${liveUrl.href}`);

const child = spawn(process.execPath, [resolve(workspaceRoot, "out/test/runTest.js")], {
    cwd: workspaceRoot,
    env: {
        ...process.env,
        VSC_WEBP_LIVE_TEST_URL: liveUrl.href,
    },
    stdio: "inherit",
});

child.once("error", (error) => {
    throw error;
});

child.once("exit", (code, signal) => {
    if (signal) {
        console.error(`Live URL E2E terminated with signal ${signal}`);
        process.exitCode = 1;
        return;
    }

    process.exitCode = code ?? 1;
});
