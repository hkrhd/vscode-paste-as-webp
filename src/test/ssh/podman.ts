import { ChildProcess, execFile as execFileCallback, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback) as (
    command: string,
    args: string[],
    options?: { encoding?: BufferEncoding; timeout?: number; maxBuffer?: number; windowsHide?: boolean }
) => Promise<{ stdout: string; stderr: string }>;

interface Machine { Name: string; Default?: boolean; Running: boolean }
interface SystemConnection { Name: string }
interface Result { stdout: Buffer; stderr: Buffer }

async function run(command: string, args: string[], options: { cwd?: string; input?: Buffer; timeout?: number; inheritOutput?: boolean } = {}): Promise<Result> {
    return new Promise((resolve, reject) => {
        const child: ChildProcess = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: ["pipe", options.inheritOutput ? "inherit" : "pipe", options.inheritOutput ? "inherit" : "pipe"] });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let size = 0;
        const timer = setTimeout(() => child.kill("SIGKILL"), options.timeout ?? 30_000);
        child.stdout?.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 32 * 1024 * 1024) {
                child.kill("SIGKILL");
                return;
            }
            stdout.push(chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.once("error", error => {
            clearTimeout(timer);
            reject(error);
        });
        child.once("close", (code, signal) => {
            clearTimeout(timer);
            const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
            if (code === 0) {
                resolve(result);
            } else {
                reject(new Error(`${command} ${args[0] ?? ""} failed (${signal ?? code}): ${result.stderr.toString("utf8")}`));
            }
        });
        if (options.input) {
            child.stdin!.end(options.input);
        } else {
            child.stdin!.end();
        }
    });
}

async function cleanup(machineToStop: string | undefined, container: string | undefined, image: string | undefined, directory: string | undefined): Promise<void> {
    const errors: string[] = [];
    if (container) {
        try { await run("podman", ["rm", "--force", container], { timeout: 30_000 }); }
        catch (error) { errors.push(`container cleanup: ${String(error)}`); }
    }
    if (image) {
        try { await run("podman", ["image", "rm", "--force", image], { timeout: 30_000 }); }
        catch (error) { errors.push(`image cleanup: ${String(error)}`); }
    }
    if (directory) {
        try { await rm(directory, { recursive: true, force: true }); }
        catch (error) { errors.push(`temporary files cleanup: ${String(error)}`); }
    }
    if (machineToStop) {
        try { await run("podman", ["machine", "stop", machineToStop], { timeout: 120_000, inheritOutput: true }); }
        catch (error) { errors.push(`Podman VM cleanup: ${String(error)}`); }
    }
    if (errors.length) {
        throw new Error(errors.join("\n"));
    }
}



export type SshFixture = Awaited<ReturnType<typeof startSshFixture>>;
export async function startSshFixture(): Promise<{
    folderUri: string;
    sshConfigPath: string;
    readFile(relativePath: string): Promise<Buffer>;
    dispose(): Promise<void>;
}> {
    let directory: string | undefined;
    let machineToStop: string | undefined;
    let container: string | undefined;
    let image: string | undefined;
    try {
        await run("podman", ["--version"], { timeout: 10_000 });
        if (process.platform === "darwin" || process.platform === "win32") {
            const { stdout } = await execFile("podman", ["machine", "list", "--format", "json"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
            const machines = JSON.parse(stdout) as Machine[];
            let selectedMachine: Machine | undefined;
            const requestedConnection = process.env.CONTAINER_CONNECTION;
            if (requestedConnection) {
                const { stdout: connectionsOutput } = await execFile(
                    "podman", ["system", "connection", "list", "--format", "json"],
                    { encoding: "utf8", timeout: 15_000, windowsHide: true }
                );
                const connections = JSON.parse(connectionsOutput) as SystemConnection[];
                if (!connections.some(connection => connection.Name === requestedConnection)) {
                    throw new Error(`CONTAINER_CONNECTION '${requestedConnection}' is not in Podman's configured system connections.`);
                }
                selectedMachine = machines.find(machine =>
                    requestedConnection === machine.Name || requestedConnection === `${machine.Name}-root`
                );
                if (!selectedMachine) {
                    throw new Error(`CONTAINER_CONNECTION '${requestedConnection}' does not match a configured Podman machine.`);
                }
            } else {
                selectedMachine = machines.find(candidate => candidate.Default);
            }
            if (selectedMachine && !selectedMachine.Running) {
                // Record ownership before starting so a partial start is stopped on failure.
                machineToStop = selectedMachine.Name;
                await run("podman", ["machine", "start", selectedMachine.Name], { timeout: 120_000 });
            }
        }
        directory = await mkdtemp(path.join(os.tmpdir(), "webp-paster-ssh-e2e-"));
        await chmod(directory, 0o700);
        const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        const alias = `webp-e2e-${id}`;
        container = `webp-e2e-${id}`;
        image = `localhost/webp-paster-ssh-e2e:${id}`;
        const privateFile = path.join(directory, "id_ed25519");
        const publicFile = path.join(directory, "id_ed25519.pub");
        const knownHostsFile = path.join(directory, "known_hosts");
        const sshConfigPath = path.join(directory, "ssh_config");
        await run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", alias, "-f", privateFile], { timeout: 15_000 });
        const sshPublic = await readFile(publicFile, "utf8");
        await chmod(privateFile, 0o600);
        await chmod(publicFile, 0o600);

        const context = path.resolve(__dirname, "../../../src/test/ssh");
        await run("podman", ["build", "--tag", image, "--file", path.join(context, "Containerfile"), context], { timeout: 300_000 });
        await run("podman", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::22", image], { timeout: 60_000 });
        const { stdout: portOutput } = await run("podman", ["port", container, "22/tcp"], { timeout: 15_000 });
        const portMatch = portOutput.toString("utf8").match(/:(\d+)\s*$/m);
        if (!portMatch) {
            throw new Error(`Podman did not report the forwarded SSH port: ${portOutput.toString("utf8")}`);
        }
        const port = Number(portMatch[1]);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(`Podman reported an invalid forwarded SSH port: ${port}`);
        }
        await run("podman", ["exec", "--interactive", container, "tee", "/home/e2e/.ssh/authorized_keys"], { input: Buffer.from(sshPublic), timeout: 10_000 });
        await run("podman", ["exec", container, "chown", "e2e:e2e", "/home/e2e/.ssh/authorized_keys"], { timeout: 10_000 });
        await run("podman", ["exec", container, "chmod", "600", "/home/e2e/.ssh/authorized_keys"], { timeout: 10_000 });
        const { stdout: hostPublicKey } = await run("podman", ["exec", container, "cat", "/etc/ssh/ssh_host_ed25519_key.pub"], { timeout: 10_000 });
        const hostKeyFields = hostPublicKey.toString("utf8").trim().split(/\s+/);
        if (hostKeyFields.length < 2 || hostKeyFields[0] !== "ssh-ed25519") {
            throw new Error("The isolated SSH container did not provide an Ed25519 host key.");
        }
        await writeFile(knownHostsFile, `[127.0.0.1]:${port} ${hostKeyFields[0]} ${hostKeyFields[1]}\n`, { mode: 0o600 });
        await chmod(knownHostsFile, 0o600);
        const configPath = (filePath: string): string => `"${filePath.replace(/\\/g, "/").replace(/"/g, String.fromCharCode(92, 34))}"`;
        await writeFile(sshConfigPath, [
            `Host ${alias}`,
            "    HostName 127.0.0.1",
            `    Port ${port}`,
            "    User e2e",
            `    IdentityFile ${configPath(privateFile)}`,
            "    IdentitiesOnly yes",
            "    IdentityAgent none",
            `    UserKnownHostsFile ${configPath(knownHostsFile)}`,
            "    GlobalKnownHostsFile none",
            "    StrictHostKeyChecking yes",
            "    BatchMode yes",
            "    ConnectTimeout 5",
            "    LogLevel ERROR",
            ""
        ].join("\n"), { mode: 0o600 });
        await chmod(sshConfigPath, 0o600);

        let connected = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < 30 && !connected; attempt++) {
            try {
                await run("ssh", ["-F", sshConfigPath, alias, "true"], { timeout: 10_000 });
                connected = true;
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        if (!connected) {
            throw new Error(`Could not authenticate to the isolated SSH container: ${String(lastError)}`);
        }

        const folderUri = `vscode-remote://ssh-remote+${alias}/home/e2e/workspace`;
        return {
            folderUri,
            sshConfigPath,
            async readFile(relativePath: string): Promise<Buffer> {
                if (!relativePath || relativePath.includes("\\") || path.posix.isAbsolute(relativePath)
                    || relativePath.split("/").some(segment => !segment || segment === "." || segment === "..")) {
                    throw new Error(`Expected a safe container-relative file path, got ${JSON.stringify(relativePath)}`);
                }
                const absolutePath = `/home/e2e/workspace/${relativePath}`;
                const { stdout } = await run("podman", ["exec", container!, "cat", absolutePath], { timeout: 15_000 });
                return stdout;
            },
            async dispose(): Promise<void> {
                const currentContainer = container;
                const currentImage = image;
                const currentDirectory = directory;
                const currentMachine = machineToStop;
                container = image = directory = machineToStop = undefined;
                await cleanup(currentMachine, currentContainer, currentImage, currentDirectory);
            }
        };
    } catch (error) {
        try {
            await cleanup(machineToStop, container, image, directory);
        } catch (cleanupError) {
            throw new Error(`${String(error)}\n${String(cleanupError)}`);
        }
        throw error;
    }
}
