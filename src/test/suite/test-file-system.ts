import * as vscode from "vscode";

// 実際の FileSystem API を通して、ローカル以外の保存先への貼り付けを検証する。
export class TestFileSystem implements vscode.FileSystemProvider, vscode.Disposable {
    private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.changes.event;
    private readonly entries = new Map<string, { type: vscode.FileType; data: Uint8Array; mtime: number }>();

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const entry = this.entries.get(uri.toString());
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return { type: entry.type, ctime: entry.mtime, mtime: entry.mtime, size: entry.data.length };
    }

    readFile(uri: vscode.Uri): Uint8Array {
        this.stat(uri);
        return this.entries.get(uri.toString())!.data.slice();
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
        const exists = this.entries.has(uri.toString());
        if (exists && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }
        if (!exists && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        this.entries.set(uri.toString(), { type: vscode.FileType.File, data: content.slice(), mtime: Date.now() });
        this.changes.fire([{ type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
    }

    createDirectory(uri: vscode.Uri): void {
        this.entries.set(uri.toString(), { type: vscode.FileType.Directory, data: new Uint8Array(), mtime: Date.now() });
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        this.stat(uri);
        return [...this.entries].flatMap(([key, entry]) => {
            const child = vscode.Uri.parse(key);
            return vscode.Uri.joinPath(child, "..").toString() === uri.toString()
                ? [[child.path.slice(child.path.lastIndexOf("/") + 1), entry.type] as [string, vscode.FileType]]
                : [];
        });
    }

    delete(uri: vscode.Uri): void {
        const key = uri.toString();
        for (const candidate of this.entries.keys()) {
            if (candidate === key || candidate.startsWith(`${key}/`)) {
                this.entries.delete(candidate);
            }
        }
        this.changes.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    }

    rename(): never {
        throw vscode.FileSystemError.NoPermissions("Rename is not used by these tests");
    }

    dispose(): void {
        this.changes.dispose();
    }
}
