import { exec, execSync } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import { logger } from "./logger";

export interface ClipboardProvider {
    getImageBuffer(): Promise<Buffer | null>;
    getTextContent(): Promise<string>;
}

export class DefaultClipboardProvider implements ClipboardProvider {
    async getImageBuffer(): Promise<Buffer | null> {
        const platform = process.platform;
        const remoteName = vscode.env.remoteName; // 'wsl' | 'ssh-remote' | undefined

        logger.debug('Clipboard', 'platform:', platform, 'remoteName:', remoteName);

        // Remote環境（WSL/SSH）でLinux上で動作している場合
        if (remoteName && platform === "linux") {
            // WSLの場合は確実にWindowsクライアント
            if (remoteName === 'wsl') {
                logger.debug('Clipboard', 'WSL detected, using Windows clipboard');
                return this.getWindowsImageBuffer();
            }

            // SSH環境の場合、PowerShell存在チェックでクライアントOSを判定
            if (remoteName === 'ssh-remote') {
                const hasPowerShell = await this.checkPowerShellExists();
                logger.debug('Clipboard', 'SSH detected, PowerShell exists:', hasPowerShell);

                if (!hasPowerShell) {
                    // PowerShellが存在しない = 非Windowsクライアント
                    // UI側で実行されているため、process.platformはクライアントOSを返す
                    const clientPlatform = process.platform;
                    logger.debug('Clipboard', 'Non-Windows SSH client (no PowerShell), client platform:', clientPlatform);

                    if (clientPlatform === 'darwin') {
                        logger.debug('Clipboard', 'Using macOS clipboard');
                        return this.getMacOSImageBuffer();
                    } else if (clientPlatform === 'linux') {
                        logger.debug('Clipboard', 'Using Linux clipboard');
                        return this.getLinuxImageBuffer();
                    }

                    return null;
                }

                // PowerShellが存在する = Windowsクライアント
                logger.debug('Clipboard', 'Windows SSH client (PowerShell found), using Windows clipboard');
                return this.getWindowsImageBuffer();
            }

            // その他のリモート環境（念のため）
            return this.getWindowsImageBuffer();
        }

        // ローカル環境
        if (platform === "darwin") {
            return this.getMacOSImageBuffer();
        } else if (platform === "win32") {
            return this.getWindowsImageBuffer();
        } else if (platform === "linux") {
            return this.getLinuxImageBuffer();
        } else {
            return null;
        }
    }

    async getTextContent(): Promise<string> {
        // VSCode APIを使用する場合は、呼び出し元で処理
        return "";
    }

    // Obj: powershell.exeの存在をチェックしてWindowsクライアントかどうか判定
    private async checkPowerShellExists(): Promise<boolean> {
        return new Promise((resolve) => {
            exec('command -v powershell.exe', (error, stdout) => {
                if (error || !stdout.trim()) {
                    logger.debug('Clipboard', 'powershell.exe not found');
                    resolve(false);
                } else {
                    logger.debug('Clipboard', 'powershell.exe found at:', stdout.trim());
                    resolve(true);
                }
            });
        });
    }

    private async getMacOSImageBuffer(): Promise<Buffer | null> {
        try {
            const tempFilePath = "/tmp/clipboard_image.png";
            const script = `
                set theImage to the clipboard as «class PNGf»
                set theFile to open for access POSIX file "${tempFilePath}" with write permission
                write theImage to theFile
                close access theFile
            `;
            execSync(`osascript -e '${script}'`);

            const exists = await fs.promises
                .access(tempFilePath)
                .then(() => true)
                .catch(() => false);

            if (exists) {
                const imageBuffer = await fs.promises.readFile(tempFilePath);
                await fs.promises.unlink(tempFilePath);
                return imageBuffer;
            }
        } catch (error) {
            logger.error('Clipboard', "Failed to get image from clipboard on macOS:", error);
        }
        return null;
    }

    private async getWindowsImageBuffer(): Promise<Buffer | null> {
        try {
            const powerShellScript = `
              $ProgressPreference = 'SilentlyContinue';
              Add-Type -AssemblyName System.Windows.Forms;
              if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
                $image = [System.Windows.Forms.Clipboard]::GetImage();
                $ms = New-Object System.IO.MemoryStream;
                $image.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
                [Convert]::ToBase64String($ms.ToArray());
                $ms.Close();
              }
            `;

            const result = await this.execPowerShell(powerShellScript);
            return result ? Buffer.from(result, "base64") : null;
        } catch (error) {
            logger.error('Clipboard', "クリップボード取得エラー:", error);
            return null;
        }
    }

    // Obj: Linux環境でクリップボードから画像を取得（xclip/wl-clipboard対応）
    private async getLinuxImageBuffer(): Promise<Buffer | null> {
        try {
            // Wayland (wl-paste) を優先的に試す
            const hasWlPaste = await this.checkCommandExists('wl-paste');
            if (hasWlPaste) {
                logger.debug('Clipboard', 'Using wl-paste for Wayland');
                return await this.execLinuxClipboardCommand('wl-paste -t image/png');
            }

            // X11 (xclip) を試す
            const hasXclip = await this.checkCommandExists('xclip');
            if (hasXclip) {
                logger.debug('Clipboard', 'Using xclip for X11');
                return await this.execLinuxClipboardCommand('xclip -selection clipboard -t image/png -o');
            }

            logger.error('Clipboard', 'No clipboard tool found (wl-paste or xclip required)');
            return null;
        } catch (error) {
            logger.error('Clipboard', "Failed to get image from clipboard on Linux:", error);
            return null;
        }
    }

    // Obj: コマンドの存在確認
    private async checkCommandExists(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`command -v ${command}`, (error, stdout) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });
    }

    // Obj: Linuxクリップボードコマンドを実行してバイナリデータを取得
    private async execLinuxClipboardCommand(command: string): Promise<Buffer | null> {
        return new Promise((resolve) => {
            exec(command, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
                if (error) {
                    // クリップボードに画像がない場合もエラーになるため、詳細ログは出さない
                    logger.debug('Clipboard', 'Linux clipboard command failed (no image?):', error.message);
                    resolve(null);
                } else if (stdout && stdout.length > 0) {
                    logger.debug('Clipboard', 'Linux clipboard image retrieved, size:', stdout.length);
                    resolve(stdout);
                } else {
                    logger.debug('Clipboard', 'Linux clipboard returned empty data');
                    resolve(null);
                }
            });
        });
    }

    private async execPowerShell(script: string): Promise<string | null> {
        return new Promise((resolve) => {
            // WSL環境では powershell.exe を使用、Windows環境では powershell を使用
            const remoteName = vscode.env.remoteName;
            const psCommand = remoteName ? "powershell.exe" : "powershell";

            // スクリプトを整形：各行をトリムしてスペースで結合
            const normalizedScript = script
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join(' ');

            // PowerShellスクリプトをUTF-16 LEでBase64エンコード
            // これにより、bashによる$変数展開を回避できる
            const scriptBuffer = Buffer.from(normalizedScript, 'utf16le');
            const encodedScript = scriptBuffer.toString('base64');

            // -NoProfile: プロファイル読み込みをスキップ（高速化・余計な出力防止）
            // -EncodedCommand: Base64エンコードされたスクリプトを実行
            const command = `${psCommand} -NoProfile -EncodedCommand ${encodedScript}`;

            exec(command, { encoding: "utf-8" }, (error, stdout, stderr) => {
                if (error || stderr) {
                    logger.error('Clipboard', "実行エラー:", stderr || error);
                    resolve(null);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }
}
